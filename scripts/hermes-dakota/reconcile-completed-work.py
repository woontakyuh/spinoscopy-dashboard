#!/usr/bin/env python3
"""Conservatively identify completed Dakota Session Log rows for To-Do reconciliation."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import sys
import unicodedata
from dataclasses import asdict, dataclass
from datetime import date as CalendarDate, datetime
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional, TextIO
from zoneinfo import ZoneInfo


def _load_recorder_module() -> Any:
    module_name = "record_completed_work"
    loaded = sys.modules.get(module_name)
    if loaded is not None:
        return loaded
    path = Path(__file__).with_name("record-completed-work.py")
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load recorder module from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


record_completed_work = _load_recorder_module()
RecorderError = record_completed_work.RecorderError

SENSITIVE_TEXT_PATTERN = re.compile(
    r"환자|상담|화담|케이스|진료|수술|검사|의무기록|차트|병력|진단|생년월일|주민번호|"
    r"등록번호|병록번호|pacs|dicom|mri|mrn|"
    r"\bpatient\b|\bcounsel(?:ing|ling|or|led)?\b|\bcase\b|\bmedical records?\b|"
    r"\bdiagnos(?:is|es|tic)?\b|\bsurger(?:y|ies)\b|"
    r"(?<!\d)\d{2,3}[- ]?\d{3,4}[- ]?\d{4}(?!\d)|(?<!\d)\d{6}-[1-4]\d{6}(?!\d)",
    re.IGNORECASE,
)
ELIGIBLE_ORIGINS = {"지시", "논의"}
ELIGIBLE_OUTCOME = "완료"
SEOUL = ZoneInfo("Asia/Seoul")


@dataclass(frozen=True)
class ReconcileConfig:
    token: str
    todo_database_id: str
    session_log_database_id: str

    def __repr__(self) -> str:
        return (
            "ReconcileConfig(token=<redacted>, "
            f"todo_database_id={self.todo_database_id!r}, "
            f"session_log_database_id={self.session_log_database_id!r})"
        )


@dataclass(frozen=True)
class SessionLogRow:
    page_id: str
    name: str
    outcome: str
    origin: str
    session_key: str
    summary: str
    agent: Optional[str]
    date: Optional[str]
    domain: Optional[str]


@dataclass(frozen=True)
class Candidate:
    session_log_page_id: str
    name: str
    result: str
    source_ref: str
    origin: str
    agent: Optional[str]
    requested_at: Optional[str]
    completed_at: Optional[str]
    record_key: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def load_reconcile_config(
    environ: Mapping[str, str],
    env_file: Optional[Path] = None,
) -> ReconcileConfig:
    file_values = record_completed_work._parse_env_file(env_file) if env_file else {}

    def value(name: str) -> str:
        return (environ.get(name) or file_values.get(name) or "").strip()

    token = value("NOTION_TOKEN")
    todo_database_id = value("NOTION_TODO_DB_ID")
    session_log_database_id = value("NOTION_DAKOTA_SESSION_LOG_DB_ID")
    missing = [
        name
        for name, configured in (
            ("NOTION_TOKEN", token),
            ("NOTION_TODO_DB_ID", todo_database_id),
            ("NOTION_DAKOTA_SESSION_LOG_DB_ID", session_log_database_id),
        )
        if not configured
    ]
    if missing:
        raise RecorderError(f"Missing required configuration: {', '.join(missing)}")
    return ReconcileConfig(token, todo_database_id, session_log_database_id)


def _text(prop: Optional[dict[str, Any]]) -> str:
    if not prop:
        return ""
    values = prop.get("title") if prop.get("type") == "title" else prop.get("rich_text", [])
    pieces: list[str] = []
    for value in values or []:
        plain = value.get("plain_text")
        if plain is None:
            plain = value.get("text", {}).get("content", "")
        pieces.append(str(plain or ""))
    return "".join(pieces).strip()


def _select(prop: Optional[dict[str, Any]]) -> str:
    return str((prop or {}).get("select", {}).get("name") or "").strip()


def parse_session_log_page(page: dict[str, Any]) -> SessionLogRow:
    properties = page.get("properties", {})
    return SessionLogRow(
        page_id=str(page.get("id") or ""),
        name=_text(properties.get("Name")),
        outcome=_select(properties.get("Outcome")),
        origin=_select(properties.get("Origin")),
        session_key=_text(properties.get("Session Key")),
        summary=_text(properties.get("Summary")),
        agent=_select(properties.get("Agent")) or None,
        date=properties.get("Date", {}).get("date", {}).get("start"),
        domain=_select(properties.get("Domain")) or None,
    )


def is_sensitive_text(text: str) -> bool:
    normalized = unicodedata.normalize("NFKC", text).casefold()
    return bool(SENSITIVE_TEXT_PATTERN.search(normalized))


def _parse_calendar_date(value: str) -> CalendarDate:
    try:
        return CalendarDate.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"날짜를 해석할 수 없습니다: {value!r} (YYYY-MM-DD)") from exc


def _session_seoul_date(value: Optional[str]) -> Optional[CalendarDate]:
    if not value:
        return None
    candidate = value.strip()
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", candidate):
            return CalendarDate.fromisoformat(candidate)
        parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=SEOUL)
        return parsed.astimezone(SEOUL).date()
    except ValueError:
        return None


def _completion_identity(name: str, completed_at: Optional[str]) -> Optional[tuple[str, str]]:
    completion_date = _session_seoul_date(completed_at)
    normalized_name = " ".join(unicodedata.normalize("NFKC", name).casefold().split())
    if not normalized_name or completion_date is None:
        return None
    return normalized_name, completion_date.isoformat()


def build_candidates(
    rows: Iterable[SessionLogRow],
    recorded_keys: set[str],
    *,
    recorded_completions: Optional[set[tuple[str, str]]] = None,
    since: Optional[CalendarDate] = None,
    until: Optional[CalendarDate] = None,
) -> list[Candidate]:
    existing_completions = recorded_completions or set()
    candidates: list[Candidate] = []
    for row in rows:
        if since is not None or until is not None:
            row_date = _session_seoul_date(row.date)
            if row_date is None:
                continue
            if since is not None and row_date < since:
                continue
            if until is not None and row_date > until:
                continue
        if row.outcome != ELIGIBLE_OUTCOME or row.origin not in ELIGIBLE_ORIGINS:
            continue
        if (
            not row.name
            or not row.session_key
            or row.domain == "Clinical"
            or is_sensitive_text(row.name)
            or is_sensitive_text(row.summary)
        ):
            continue
        record_key = record_completed_work.compute_record_key(row.name, row.session_key)
        if record_key in recorded_keys:
            continue
        identity = _completion_identity(row.name, row.date)
        if identity is not None and identity in existing_completions:
            continue
        candidates.append(
            Candidate(
                session_log_page_id=row.page_id,
                name=row.name,
                result=row.summary or f"Completed: {row.name}",
                source_ref=row.session_key,
                origin=row.origin,
                agent=row.agent,
                requested_at=row.date,
                completed_at=row.date,
                record_key=record_key,
            )
        )
    return candidates


def _full_datetime(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    candidate = value.strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", candidate):
        return f"{candidate}T00:00:00+09:00"
    return record_completed_work.normalize_iso_datetime(candidate, "Session Log Date")


class ReconciliationService:
    def __init__(
        self,
        client: Any,
        todo_database_id: str,
        session_log_database_id: str,
        *,
        recorder: Optional[Any] = None,
    ) -> None:
        self.client = client
        self.todo_database_id = todo_database_id
        self.session_log_database_id = session_log_database_id
        self.recorder = recorder

    def _query_all(self, database_id: str, query_filter: Optional[dict[str, Any]] = None) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        cursor: Optional[str] = None
        while True:
            payload: dict[str, Any] = {"page_size": 100}
            if query_filter is not None:
                payload["filter"] = query_filter
            if cursor:
                payload["start_cursor"] = cursor
            response = self.client.request("POST", f"/databases/{database_id}/query", payload)
            current = response.get("results", [])
            if not isinstance(current, list):
                raise RecorderError("Notion query response is invalid")
            results.extend(current)
            if not response.get("has_more"):
                return results
            cursor = response.get("next_cursor")
            if not cursor:
                raise RecorderError("Notion pagination failed closed: missing next_cursor")

    def read_session_logs(self) -> list[SessionLogRow]:
        return [parse_session_log_page(page) for page in self._query_all(self.session_log_database_id)]

    def read_recorded_state(self) -> tuple[set[str], set[tuple[str, str]]]:
        pages = self._query_all(
            self.todo_database_id,
            {"property": "Record Key", "rich_text": {"is_not_empty": True}},
        )
        keys = {
            key
            for page in pages
            if (key := _text(page.get("properties", {}).get("Record Key")))
        }
        completions = {
            identity
            for page in pages
            if (
                identity := _completion_identity(
                    _text(page.get("properties", {}).get("Name")),
                    (page.get("properties", {}).get("Completed At", {}).get("date") or {}).get("start"),
                )
            )
        }
        return keys, completions

    def run(
        self,
        apply: bool = False,
        *,
        since: Optional[CalendarDate] = None,
        until: Optional[CalendarDate] = None,
    ) -> dict[str, object]:
        rows = self.read_session_logs()
        recorded_keys, recorded_completions = self.read_recorded_state()
        candidates = build_candidates(
            rows,
            recorded_keys,
            recorded_completions=recorded_completions,
            since=since,
            until=until,
        )
        output: dict[str, object] = {
            "mode": "apply" if apply else "dry-run",
            "since": since.isoformat() if since else None,
            "until": until.isoformat() if until else None,
            "candidate_count": len(candidates),
            "candidates": [candidate.to_dict() for candidate in candidates],
        }
        if not apply:
            return output

        target_recorder = self.recorder or record_completed_work.CompletedWorkRecorder(
            self.client,
            self.todo_database_id,
        )
        applied: list[dict[str, object]] = []
        for candidate in candidates:
            completed_at = _full_datetime(candidate.completed_at)
            requested_at = _full_datetime(candidate.requested_at)
            applied.append(
                target_recorder.record(
                    record_completed_work.RecordInput(
                        name=candidate.name,
                        result=candidate.result,
                        source_ref=candidate.source_ref,
                        origin="Ad-hoc",
                        agent=candidate.agent,
                        requested_at=requested_at,
                        completed_at=completed_at,
                        record_key=candidate.record_key,
                    )
                )
            )
        output["applied_count"] = len(applied)
        output["applied"] = applied
        return output


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--since", type=_parse_calendar_date, help="inclusive KST date boundary (YYYY-MM-DD)")
    parser.add_argument("--until", type=_parse_calendar_date, help="inclusive KST date boundary (YYYY-MM-DD)")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="write eligible candidates; omitted means read-only dry-run",
    )
    parser.add_argument("--lock-file", type=Path, default=record_completed_work.DEFAULT_LOCK_PATH)
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
        if args.since and args.until and args.since > args.until:
            raise RecorderError("--since must be on or before --until")
        config = load_reconcile_config(environ if environ is not None else os.environ, args.env_file)
        client = record_completed_work.NotionClient(config.token)
        service = ReconciliationService(
            client,
            config.todo_database_id,
            config.session_log_database_id,
        )
        if args.apply:
            with record_completed_work.exclusive_lock(args.lock_file):
                output = service.run(apply=True, since=args.since, until=args.until)
        else:
            output = service.run(apply=False, since=args.since, until=args.until)
        json.dump(output, stdout, ensure_ascii=False, sort_keys=True)
        stdout.write("\n")
        return 0
    except RecorderError as exc:
        json.dump({"error": str(exc)}, stderr, ensure_ascii=False, sort_keys=True)
        stderr.write("\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
