#!/usr/bin/env python3
"""Tests for the dependency-free Dakota completed-work recorder."""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("record-completed-work.py")
SPEC = importlib.util.spec_from_file_location("record_completed_work", SCRIPT_PATH)
assert SPEC and SPEC.loader
recorder = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = recorder
SPEC.loader.exec_module(recorder)


def rich_text(value: str) -> dict:
    return {"type": "rich_text", "rich_text": [{"plain_text": value}]}


def page(
    page_id: str,
    name: str,
    *,
    status: str = "To Do",
    record_key: str = "",
    priority: str = "High",
    category: str = "연구",
) -> dict:
    return {
        "id": page_id,
        "url": f"https://notion.so/{page_id}",
        "parent": {"type": "database_id", "database_id": "todo-db"},
        "archived": False,
        "in_trash": False,
        "properties": {
            "Name": {"type": "title", "title": [{"plain_text": name}]},
            "Status": {"type": "select", "select": {"name": status}},
            "Priority": {"type": "select", "select": {"name": priority}},
            "Category": {"type": "select", "select": {"name": category}},
            "Record Key": rich_text(record_key),
        },
    }


class FakeNotionClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict | None]] = []
        self.pages: dict[str, dict] = {}
        self.record_key_results: list[dict] = []
        self.title_results: list[dict] = []
        self.db_properties: dict[str, dict] = {}
        self.next_page_id = "created-page"

    def request(self, method: str, path: str, payload: dict | None = None) -> dict:
        self.calls.append((method, path, payload))
        if method == "GET" and path == "/databases/todo-db":
            return {"properties": self.db_properties}
        if method == "PATCH" and path == "/databases/todo-db":
            assert payload is not None
            for name, definition in payload["properties"].items():
                prop_type = next(iter(definition))
                self.db_properties[name] = {"type": prop_type, **definition}
            return {"properties": self.db_properties}
        if method == "POST" and path == "/databases/todo-db/query":
            assert payload is not None
            serialized = json.dumps(payload["filter"], ensure_ascii=False)
            results = self.record_key_results if "Record Key" in serialized else self.title_results
            return {"results": results, "has_more": False, "next_cursor": None}
        if method == "POST" and path == "/pages":
            assert payload is not None
            created = {
                "id": self.next_page_id,
                "url": f"https://notion.so/{self.next_page_id}",
                "properties": payload["properties"],
            }
            self.pages[self.next_page_id] = created
            return created
        if method == "PATCH" and path.startswith("/pages/"):
            assert payload is not None
            page_id = path.removeprefix("/pages/")
            target = self.pages[page_id]
            target["properties"].update(payload["properties"])
            return target
        if method == "GET" and path.startswith("/pages/"):
            return self.pages[path.removeprefix("/pages/")]
        raise AssertionError(f"Unexpected request: {method} {path} {payload}")

    @property
    def mutations(self) -> list[tuple[str, str, dict | None]]:
        return [call for call in self.calls if call[0] in {"POST", "PATCH"} and not call[1].endswith("/query")]


class RecordCompletedWorkTests(unittest.TestCase):
    def make_input(self, **overrides: object) -> object:
        values: dict[str, object] = {
            "name": "Recorder implementation",
            "result": "Implemented and verified the recorder.",
            "source_ref": "session:123",
            "completed_at": "2026-08-25T09:10:11+09:00",
        }
        values.update(overrides)
        return recorder.RecordInput(**values)

    def test_record_key_normalizes_unicode_case_and_whitespace(self) -> None:
        first = recorder.compute_record_key("  Ａ  Project\nDONE ", " SESSION:ABC ")
        second = recorder.compute_record_key("a project done", "session:abc")
        self.assertEqual(first, second)
        self.assertEqual(len(first), 64)

    def test_default_completion_time_uses_seoul_offset(self) -> None:
        self.assertTrue(recorder.normalize_iso_datetime(None, "--completed-at").endswith("+09:00"))

    def test_create_contains_done_full_datetime_and_metadata(self) -> None:
        client = FakeNotionClient()
        service = recorder.CompletedWorkRecorder(client, "todo-db")

        output = service.record(
            self.make_input(
                origin="Ad-hoc",
                agent="dakota",
                requested_at="2026-08-25T08:00:00+09:00",
            )
        )

        create = next(call for call in client.calls if call[:2] == ("POST", "/pages"))
        properties = create[2]["properties"]
        self.assertEqual(properties["Status"]["select"]["name"], "Done")
        self.assertEqual(properties["Completed At"]["date"]["start"], "2026-08-25T09:10:11+09:00")
        self.assertEqual(properties["Priority"]["select"]["name"], "Medium")
        self.assertEqual(properties["Category"]["select"]["name"], "일상업무")
        self.assertEqual(properties["Origin"]["select"]["name"], "Ad-hoc")
        self.assertEqual(properties["Agent"]["select"]["name"], "dakota")
        self.assertEqual(properties["Requested At"]["date"]["start"], "2026-08-25T08:00:00+09:00")
        self.assertEqual(properties["Result"]["rich_text"][0]["text"]["content"], "Implemented and verified the recorder.")
        self.assertEqual(properties["Notes"]["rich_text"], properties["Result"]["rich_text"])
        self.assertEqual(output["action"], "created")
        self.assertEqual(output["status"], "Done")

    def test_planned_page_update_preserves_unset_priority_and_category(self) -> None:
        client = FakeNotionClient()
        planned = page("planned", "Recorder implementation", priority="High", category="AI")
        client.pages["planned"] = planned
        service = recorder.CompletedWorkRecorder(client, "todo-db")

        output = service.record(self.make_input(page_id="planned", source_ref="session:planned"))

        patch_call = next(call for call in client.calls if call[:2] == ("PATCH", "/pages/planned"))
        properties = patch_call[2]["properties"]
        self.assertNotIn("Priority", properties)
        self.assertNotIn("Category", properties)
        self.assertEqual(properties["Origin"]["select"]["name"], "Planned")
        self.assertEqual(client.pages["planned"]["properties"]["Priority"]["select"]["name"], "High")
        self.assertEqual(client.pages["planned"]["properties"]["Category"]["select"]["name"], "AI")
        self.assertEqual(output["action"], "updated_page_id")

    def test_ad_hoc_record_requires_stable_provenance(self) -> None:
        client = FakeNotionClient()
        service = recorder.CompletedWorkRecorder(client, "todo-db")

        with self.assertRaisesRegex(recorder.RecorderError, "source-ref"):
            service.record(self.make_input(source_ref=None))

        self.assertEqual(client.calls, [])

    def test_planned_page_can_derive_record_key_from_page_id(self) -> None:
        client = FakeNotionClient()
        planned = page("planned", "Recorder implementation")
        client.pages["planned"] = planned
        service = recorder.CompletedWorkRecorder(client, "todo-db")

        output = service.record(self.make_input(page_id="planned", source_ref=None))

        self.assertEqual(
            output["record_key"],
            recorder.compute_record_key("Recorder implementation", "notion-page:planned"),
        )

    def test_explicit_page_id_must_belong_to_todo_database(self) -> None:
        client = FakeNotionClient()
        wrong = page("wrong", "Recorder implementation")
        wrong["parent"]["database_id"] = "another-db"
        client.pages["wrong"] = wrong
        service = recorder.CompletedWorkRecorder(client, "todo-db")

        with self.assertRaisesRegex(recorder.RecorderError, "configured To-Do database"):
            service.record(self.make_input(page_id="wrong"))

        self.assertEqual(client.mutations, [])

    def test_explicit_page_id_title_must_match(self) -> None:
        client = FakeNotionClient()
        client.pages["wrong-title"] = page("wrong-title", "A different task")
        service = recorder.CompletedWorkRecorder(client, "todo-db")

        with self.assertRaisesRegex(recorder.RecorderError, "title does not match"):
            service.record(self.make_input(page_id="wrong-title"))

        self.assertEqual(client.mutations, [])

    def test_record_key_match_wins_over_explicit_page_and_title(self) -> None:
        client = FakeNotionClient()
        key = recorder.compute_record_key("Recorder implementation", "session:123")
        keyed = page("keyed", "Earlier title", record_key=key)
        explicit = page("explicit", "Recorder implementation")
        titled = page("titled", "Recorder implementation")
        client.pages = {item["id"]: item for item in (keyed, explicit, titled)}
        client.record_key_results = [keyed]
        client.title_results = [titled]
        service = recorder.CompletedWorkRecorder(client, "todo-db")

        output = service.record(self.make_input(page_id="explicit"))

        self.assertEqual(output["page_id"], "keyed")
        self.assertEqual(output["action"], "updated_record_key")
        self.assertIn(("PATCH", "/pages/keyed"), [(method, path) for method, path, _ in client.calls])
        self.assertNotIn(("PATCH", "/pages/explicit"), [(method, path) for method, path, _ in client.calls])

    def test_completed_record_key_match_is_deduped_without_rewriting_timestamp(self) -> None:
        client = FakeNotionClient()
        key = recorder.compute_record_key("Recorder implementation", "session:123")
        existing = page("existing", "Recorder implementation", status="Done", record_key=key)
        existing["properties"]["Completed At"] = {
            "type": "date",
            "date": {"start": "2026-08-25T09:10:11+09:00"},
        }
        client.pages["existing"] = existing
        client.record_key_results = [existing]
        service = recorder.CompletedWorkRecorder(client, "todo-db")

        output = service.record(
            self.make_input(completed_at="2026-08-25T12:00:00+09:00")
        )

        self.assertEqual(output["action"], "deduped")
        self.assertEqual(output["completed_at"], "2026-08-25T09:10:11+09:00")
        self.assertEqual(client.mutations, [])

    def test_one_exact_active_title_match_is_updated(self) -> None:
        client = FakeNotionClient()
        titled = page("titled", "Recorder implementation")
        client.pages["titled"] = titled
        client.title_results = [titled]
        service = recorder.CompletedWorkRecorder(client, "todo-db")

        output = service.record(self.make_input())

        self.assertEqual(output["action"], "updated_title")
        self.assertEqual(output["page_id"], "titled")

    def test_multiple_exact_active_title_matches_fail_closed(self) -> None:
        client = FakeNotionClient()
        client.title_results = [page("one", "Recorder implementation"), page("two", "Recorder implementation")]
        service = recorder.CompletedWorkRecorder(client, "todo-db")

        with self.assertRaisesRegex(recorder.RecorderError, "ambiguous"):
            service.record(self.make_input())

        self.assertEqual(client.mutations, [])

    def test_multiple_record_key_matches_fail_closed(self) -> None:
        client = FakeNotionClient()
        key = recorder.compute_record_key("Recorder implementation", "session:123")
        client.record_key_results = [page("one", "One", record_key=key), page("two", "Two", record_key=key)]
        service = recorder.CompletedWorkRecorder(client, "todo-db")

        with self.assertRaisesRegex(recorder.RecorderError, "Record Key"):
            service.record(self.make_input())

        self.assertEqual(client.mutations, [])

    def test_readback_verification_fails_closed(self) -> None:
        client = FakeNotionClient()
        planned = page("planned", "Recorder implementation")
        client.pages["planned"] = planned
        service = recorder.CompletedWorkRecorder(client, "todo-db")
        original_request = client.request

        def bad_readback(method: str, path: str, payload: dict | None = None) -> dict:
            response = original_request(method, path, payload)
            if method == "GET" and path == "/pages/planned":
                response["properties"]["Status"] = {"type": "select", "select": {"name": "To Do"}}
            return response

        client.request = bad_readback  # type: ignore[method-assign]
        with self.assertRaisesRegex(recorder.RecorderError, "verification"):
            service.record(self.make_input(page_id="planned"))

    def test_dry_run_performs_no_mutation(self) -> None:
        client = FakeNotionClient()
        service = recorder.CompletedWorkRecorder(client, "todo-db")

        output = service.record(self.make_input(), dry_run=True)

        self.assertEqual(output["action"], "dry_run_create")
        self.assertIsNone(output["page_id"])
        self.assertEqual(client.mutations, [])

    def test_schema_migration_adds_only_missing_properties_and_then_is_noop(self) -> None:
        client = FakeNotionClient()
        client.db_properties = {"Origin": {"type": "select", "select": {"options": []}}}
        service = recorder.CompletedWorkRecorder(client, "todo-db")

        first = service.migrate_schema()
        second = service.migrate_schema()

        self.assertEqual(first["action"], "schema_migrated")
        self.assertEqual(set(first["added"]), {"Agent", "Requested At", "Result", "Source Ref", "Record Key"})
        self.assertEqual(second, {"action": "schema_noop", "added": []})
        db_patches = [call for call in client.calls if call[:2] == ("PATCH", "/databases/todo-db")]
        self.assertEqual(len(db_patches), 1)

    def test_schema_migration_rejects_wrong_existing_property_type(self) -> None:
        client = FakeNotionClient()
        client.db_properties = {"Record Key": {"type": "number", "number": {}}}
        service = recorder.CompletedWorkRecorder(client, "todo-db")

        with self.assertRaisesRegex(recorder.RecorderError, "Record Key"):
            service.migrate_schema()

        self.assertEqual(client.mutations, [])

    def test_env_file_is_loaded_without_overriding_environment(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            env_file = Path(tmp) / ".env"
            env_file.write_text(
                "# local credentials\nexport NOTION_TOKEN=file-token\nNOTION_TODO_DB_ID='file-db'\n",
                encoding="utf-8",
            )
            config = recorder.load_config(
                {"NOTION_TOKEN": "environment-token"},
                env_file,
            )

        self.assertEqual(config.token, "environment-token")
        self.assertEqual(config.database_id, "file-db")
        self.assertNotIn("environment-token", repr(config))
        self.assertNotIn("file-token", repr(config))

    def test_exclusive_lock_rejects_second_local_writer(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            lock_path = Path(tmp) / "recorder.lock"
            with recorder.exclusive_lock(lock_path):
                with self.assertRaisesRegex(recorder.RecorderError, "already running"):
                    with recorder.exclusive_lock(lock_path):
                        self.fail("nested lock unexpectedly succeeded")


if __name__ == "__main__":
    unittest.main()
