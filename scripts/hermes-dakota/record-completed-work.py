#!/usr/bin/env python3
"""Idempotently record verified Dakota work as a completed Notion To-Do."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator, Mapping, Optional, TextIO


NOTION_API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"
MAX_RICH_TEXT_LENGTH = 1800
SEOUL_TIMEZONE = timezone(timedelta(hours=9))
DEFAULT_LOCK_PATH = Path.home() / ".hermes" / "state" / "completed-work-recorder.lock"
SCHEMA_PROPERTIES: dict[str, dict[str, object]] = {
    "Origin": {"select": {}},
    "Agent": {"select": {}},
    "Requested At": {"date": {}},
    "Result": {"rich_text": {}},
    "Source Ref": {"rich_text": {}},
    "Record Key": {"rich_text": {}},
}


class RecorderError(RuntimeError):
    """A safe-to-display, credential-free recorder failure."""


@dataclass(frozen=True, repr=False)
class Config:
    token: str
    database_id: str

    def __repr__(self) -> str:
        return f"Config(token=<redacted>, database_id={self.database_id!r})"


@dataclass(frozen=True)
class RecordInput:
    name: str
    result: str
    page_id: Optional[str] = None
    source_ref: Optional[str] = None
    origin: Optional[str] = None
    agent: Optional[str] = None
    requested_at: Optional[str] = None
    completed_at: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    record_key: Optional[str] = None


def _parse_env_file(path: Path) -> dict[str, str]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise RecorderError(f"Cannot read env file: {path}") from exc

    values: dict[str, str] = {}
    for line_number, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            raise RecorderError(f"Invalid env file line {line_number}: expected KEY=VALUE")
        key, value = line.split("=", 1)
        key = key.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            raise RecorderError(f"Invalid env file key on line {line_number}")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    return values


def load_config(environ: Mapping[str, str], env_file: Optional[Path] = None) -> Config:
    """Load credentials with process environment taking precedence over an env file."""
    file_values = _parse_env_file(env_file) if env_file else {}
    token = (environ.get("NOTION_TOKEN") or file_values.get("NOTION_TOKEN") or "").strip()
    database_id = (environ.get("NOTION_TODO_DB_ID") or file_values.get("NOTION_TODO_DB_ID") or "").strip()
    missing = [name for name, value in (("NOTION_TOKEN", token), ("NOTION_TODO_DB_ID", database_id)) if not value]
    if missing:
        raise RecorderError(f"Missing required configuration: {', '.join(missing)}")
    return Config(token=token, database_id=database_id)


def _normalize_key_part(value: Optional[str]) -> str:
    normalized = unicodedata.normalize("NFKC", value or "")
    return " ".join(normalized.split()).casefold()


def _normalize_notion_id(value: Optional[str]) -> str:
    return re.sub(r"[^0-9a-f]", "", (value or "").casefold())


@contextmanager
def exclusive_lock(path: Path) -> Iterator[None]:
    """Fail closed when another local recorder process is already running."""
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    handle = path.open("a+", encoding="utf-8")
    os.chmod(path, 0o600)
    try:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RecorderError("Another completed-work recorder process is already running") from exc
        yield
    finally:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()


def compute_record_key(name: str, source_ref: Optional[str]) -> str:
    """Return the stable key for a logical name/source pair."""
    material = f"{_normalize_key_part(name)}\n{_normalize_key_part(source_ref)}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def normalize_iso_datetime(value: Optional[str], field_name: str) -> str:
    """Return a timezone-aware, full ISO datetime (seconds precision)."""
    if value is None:
        return datetime.now(SEOUL_TIMEZONE).isoformat(timespec="seconds")
    candidate = value.strip()
    if candidate.endswith(("Z", "z")):
        candidate = candidate[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError as exc:
        raise RecorderError(f"{field_name} must be a valid ISO 8601 datetime") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise RecorderError(f"{field_name} must include a timezone offset")
    return parsed.isoformat(timespec="seconds")


def _clean_required(value: str, field_name: str) -> str:
    cleaned = " ".join(value.split())
    if not cleaned:
        raise RecorderError(f"{field_name} is required")
    return cleaned


def _clean_optional(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = " ".join(value.split())
    return cleaned or None


def _rich_text(content: str) -> list[dict[str, dict[str, str]]]:
    concise = " ".join(content.split())[:MAX_RICH_TEXT_LENGTH]
    return [{"text": {"content": concise}}] if concise else []


def _property_text(prop: Optional[dict[str, Any]]) -> str:
    if not prop:
        return ""
    values = prop.get("title") if prop.get("type") == "title" else prop.get("rich_text", [])
    parts: list[str] = []
    for value in values or []:
        plain = value.get("plain_text")
        if plain is None:
            plain = value.get("text", {}).get("content", "")
        parts.append(str(plain or ""))
    return "".join(parts).strip()


def _page_name(page: dict[str, Any]) -> str:
    return _property_text(page.get("properties", {}).get("Name"))


def _page_record_key(page: dict[str, Any]) -> str:
    return _property_text(page.get("properties", {}).get("Record Key"))


def _page_select(page: dict[str, Any], name: str) -> str:
    return str(page.get("properties", {}).get(name, {}).get("select", {}).get("name") or "").strip()


class NotionClient:
    """Small stdlib-only Notion REST client."""

    def __init__(self, token: str, timeout: float = 30.0) -> None:
        self._token = token
        self._timeout = timeout

    def request(self, method: str, path: str, payload: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(
            f"{NOTION_API_BASE}{path}",
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {self._token}",
                "Notion-Version": NOTION_VERSION,
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self._timeout) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            # Deliberately do not surface request headers, response bodies, or credentials.
            raise RecorderError(f"Notion API request failed with HTTP {exc.code}") from exc
        except urllib.error.URLError as exc:
            raise RecorderError("Notion API request failed due to a network error") from exc
        try:
            decoded = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RecorderError("Notion API returned invalid JSON") from exc
        if not isinstance(decoded, dict):
            raise RecorderError("Notion API returned an unexpected response")
        return decoded


class CompletedWorkRecorder:
    def __init__(self, client: Any, database_id: str) -> None:
        self.client = client
        self.database_id = database_id.strip()
        if not self.database_id:
            raise RecorderError("NOTION_TODO_DB_ID is required")

    def migrate_schema(self, dry_run: bool = False) -> dict[str, object]:
        database = self.client.request("GET", f"/databases/{self.database_id}")
        properties = database.get("properties", {})
        if not isinstance(properties, dict):
            raise RecorderError("Notion database schema response is invalid")

        missing: dict[str, dict[str, object]] = {}
        for name, definition in SCHEMA_PROPERTIES.items():
            expected_type = next(iter(definition))
            current = properties.get(name)
            if current is None:
                missing[name] = definition
            elif current.get("type") != expected_type:
                raise RecorderError(
                    f"Schema property {name!r} has type {current.get('type')!r}; expected {expected_type!r}"
                )

        if not missing:
            return {"action": "schema_noop", "added": []}
        if dry_run:
            return {"action": "schema_dry_run", "added": list(missing)}

        self.client.request(
            "PATCH",
            f"/databases/{self.database_id}",
            {"properties": missing},
        )
        verified = self.client.request("GET", f"/databases/{self.database_id}")
        verified_properties = verified.get("properties", {})
        for name, definition in SCHEMA_PROPERTIES.items():
            expected_type = next(iter(definition))
            if verified_properties.get(name, {}).get("type") != expected_type:
                raise RecorderError(f"Schema migration verification failed for {name!r}")
        return {"action": "schema_migrated", "added": list(missing)}

    def _query_all(self, query_filter: dict[str, Any]) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        cursor: Optional[str] = None
        while True:
            payload: dict[str, Any] = {"filter": query_filter, "page_size": 100}
            if cursor:
                payload["start_cursor"] = cursor
            response = self.client.request(
                "POST",
                f"/databases/{self.database_id}/query",
                payload,
            )
            page_results = response.get("results", [])
            if not isinstance(page_results, list):
                raise RecorderError("Notion query response is invalid")
            results.extend(page_results)
            if not response.get("has_more"):
                break
            cursor = response.get("next_cursor")
            if not cursor:
                raise RecorderError("Notion pagination failed closed: missing next_cursor")
        return results

    def _record_key_matches(self, record_key: str) -> list[dict[str, Any]]:
        pages = self._query_all(
            {"property": "Record Key", "rich_text": {"equals": record_key}}
        )
        return [item for item in pages if _page_record_key(item) == record_key]

    def _active_title_matches(self, name: str) -> list[dict[str, Any]]:
        pages = self._query_all(
            {
                "and": [
                    {"property": "Name", "title": {"equals": name}},
                    {"property": "Status", "select": {"does_not_equal": "Done"}},
                ]
            }
        )
        return [item for item in pages if _page_name(item) == name]

    def _select_target(
        self,
        *,
        record_key: str,
        page_id: Optional[str],
        name: str,
    ) -> tuple[Optional[dict[str, Any]], str]:
        keyed = self._record_key_matches(record_key)
        if len(keyed) > 1:
            raise RecorderError("Multiple pages share the same Record Key; refusing ambiguous update")
        if keyed:
            return keyed[0], "updated_record_key"

        if page_id:
            explicit = self.client.request("GET", f"/pages/{page_id}")
            parent_database_id = explicit.get("parent", {}).get("database_id")
            if _normalize_notion_id(parent_database_id) != _normalize_notion_id(self.database_id):
                raise RecorderError("--page-id does not belong to the configured To-Do database")
            if explicit.get("archived") or explicit.get("in_trash"):
                raise RecorderError("--page-id points to an archived or trashed page")
            if _normalize_key_part(_page_name(explicit)) != _normalize_key_part(name):
                raise RecorderError("--page-id title does not match --name")
            return explicit, "updated_page_id"

        titled = self._active_title_matches(name)
        if len(titled) > 1:
            raise RecorderError("Multiple active pages have the exact title; refusing ambiguous update")
        if titled:
            return titled[0], "updated_title"
        return None, "created"

    def _completion_properties(
        self,
        item: RecordInput,
        *,
        record_key: str,
        completed_at: str,
        creating: bool,
        planned_target: bool,
    ) -> dict[str, Any]:
        result = _clean_required(item.result, "--result")
        properties: dict[str, Any] = {
            "Status": {"select": {"name": "Done"}},
            "Completed At": {"date": {"start": completed_at}},
            "Notes": {"rich_text": _rich_text(result)},
            "Result": {"rich_text": _rich_text(result)},
            "Record Key": {"rich_text": _rich_text(record_key)},
        }
        if creating:
            properties.update(
                {
                    "Name": {"title": _rich_text(_clean_required(item.name, "--name"))},
                    "Priority": {"select": {"name": _clean_optional(item.priority) or "Medium"}},
                    "Category": {"select": {"name": _clean_optional(item.category) or "일상업무"}},
                    "Origin": {"select": {"name": _clean_optional(item.origin) or "Ad-hoc"}},
                    "Source Ref": {"rich_text": _rich_text(_clean_optional(item.source_ref) or "")},
                }
            )
        else:
            if _clean_optional(item.priority):
                properties["Priority"] = {"select": {"name": _clean_optional(item.priority)}}
            if _clean_optional(item.category):
                properties["Category"] = {"select": {"name": _clean_optional(item.category)}}
            if _clean_optional(item.origin):
                properties["Origin"] = {"select": {"name": _clean_optional(item.origin)}}
            elif planned_target:
                properties["Origin"] = {"select": {"name": "Planned"}}
            if item.source_ref is not None:
                properties["Source Ref"] = {"rich_text": _rich_text(_clean_optional(item.source_ref) or "")}
        if _clean_optional(item.agent):
            properties["Agent"] = {"select": {"name": _clean_optional(item.agent)}}
        if item.requested_at is not None:
            properties["Requested At"] = {
                "date": {"start": normalize_iso_datetime(item.requested_at, "--requested-at")}
            }
        return properties

    def _verify(self, page_id: str, expected_record_key: str) -> dict[str, Any]:
        page = self.client.request("GET", f"/pages/{page_id}")
        properties = page.get("properties", {})
        status = properties.get("Status", {}).get("select", {}).get("name")
        actual_key = _page_record_key(page)
        if status != "Done" or actual_key != expected_record_key:
            raise RecorderError("Completed-work read-back verification failed")
        return page

    def record(self, item: RecordInput, dry_run: bool = False) -> dict[str, object]:
        name = _clean_required(item.name, "--name")
        _clean_required(item.result, "--result")
        source_ref = _clean_optional(item.source_ref)
        supplied_key = _clean_optional(item.record_key)
        page_id = _clean_optional(item.page_id)
        if not supplied_key and not source_ref and not page_id:
            raise RecorderError(
                "--source-ref or --record-key is required for ad-hoc work; "
                "planned work may use --page-id"
            )
        key_source = source_ref or (f"notion-page:{page_id}" if page_id else None)
        record_key = supplied_key or compute_record_key(name, key_source)
        completed_at = normalize_iso_datetime(item.completed_at, "--completed-at")

        target, action = self._select_target(
            record_key=record_key,
            page_id=page_id,
            name=name,
        )
        if target is not None and action == "updated_record_key" and _page_select(target, "Status") == "Done":
            if dry_run:
                return {
                    "action": "dry_run_deduped",
                    "page_id": target.get("id"),
                    "url": target.get("url"),
                    "name": _page_name(target) or name,
                    "status": "Done",
                    "completed_at": target.get("properties", {}).get("Completed At", {}).get("date", {}).get("start"),
                    "record_key": record_key,
                }
            verified = self._verify(str(target.get("id") or ""), record_key)
            verified_properties = verified.get("properties", {})
            return {
                "action": "deduped",
                "page_id": verified.get("id"),
                "url": verified.get("url"),
                "name": _page_name(verified) or name,
                "status": verified_properties.get("Status", {}).get("select", {}).get("name"),
                "completed_at": verified_properties.get("Completed At", {}).get("date", {}).get("start"),
                "record_key": _page_record_key(verified),
            }
        properties = self._completion_properties(
            item,
            record_key=record_key,
            completed_at=completed_at,
            creating=target is None,
            planned_target=(
                target is not None
                and action in {"updated_page_id", "updated_title"}
                and _page_select(target, "Status") != "Done"
                and not _page_select(target, "Origin")
            ),
        )

        if dry_run:
            return {
                "action": f"dry_run_{'create' if target is None else action.removeprefix('updated_')}",
                "page_id": target.get("id") if target else None,
                "url": target.get("url") if target else None,
                "name": _page_name(target) if target else name,
                "status": "Done",
                "completed_at": completed_at,
                "record_key": record_key,
            }

        if target is None:
            created = self.client.request(
                "POST",
                "/pages",
                {"parent": {"database_id": self.database_id}, "properties": properties},
            )
            target_page_id = created.get("id")
            if not target_page_id:
                raise RecorderError("Notion create response did not include a page ID")
        else:
            target_page_id = target.get("id")
            if not target_page_id:
                raise RecorderError("Notion target page did not include a page ID")
            self.client.request(
                "PATCH",
                f"/pages/{target_page_id}",
                {"properties": properties},
            )

        verified = self._verify(str(target_page_id), record_key)
        verified_properties = verified.get("properties", {})
        return {
            "action": action,
            "page_id": verified.get("id"),
            "url": verified.get("url"),
            "name": _page_name(verified) or name,
            "status": verified_properties.get("Status", {}).get("select", {}).get("name"),
            "completed_at": verified_properties.get("Completed At", {}).get("date", {}).get("start"),
            "record_key": _page_record_key(verified),
        }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--migrate-schema", action="store_true")
    parser.add_argument("--name")
    parser.add_argument("--result")
    parser.add_argument("--page-id")
    parser.add_argument("--source-ref")
    parser.add_argument("--origin")
    parser.add_argument("--agent")
    parser.add_argument("--requested-at")
    parser.add_argument("--completed-at")
    parser.add_argument("--priority")
    parser.add_argument("--category")
    parser.add_argument("--record-key")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--lock-file", type=Path, default=DEFAULT_LOCK_PATH)
    return parser


def main(
    argv: Optional[Iterable[str]] = None,
    *,
    environ: Optional[Mapping[str, str]] = None,
    stdout: TextIO = sys.stdout,
    stderr: TextIO = sys.stderr,
) -> int:
    args = build_parser().parse_args(list(argv) if argv is not None else None)
    try:
        config = load_config(environ if environ is not None else os.environ, args.env_file)
        service = CompletedWorkRecorder(NotionClient(config.token), config.database_id)
        with exclusive_lock(args.lock_file):
            if args.migrate_schema:
                output = service.migrate_schema(dry_run=args.dry_run)
            else:
                if args.name is None or args.result is None:
                    raise RecorderError("Record mode requires --name and --result")
                output = service.record(
                    RecordInput(
                        name=args.name,
                        result=args.result,
                        page_id=args.page_id,
                        source_ref=args.source_ref,
                        origin=args.origin,
                        agent=args.agent,
                        requested_at=args.requested_at,
                        completed_at=args.completed_at,
                        priority=args.priority,
                        category=args.category,
                        record_key=args.record_key,
                    ),
                    dry_run=args.dry_run,
                )
        json.dump(output, stdout, ensure_ascii=False, sort_keys=True)
        stdout.write("\n")
        return 0
    except RecorderError as exc:
        json.dump({"error": str(exc)}, stderr, ensure_ascii=False, sort_keys=True)
        stderr.write("\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
