#!/usr/bin/env python3
"""Tests for conservative completed-work reconciliation."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("reconcile-completed-work.py")
SPEC = importlib.util.spec_from_file_location("reconcile_completed_work", SCRIPT_PATH)
assert SPEC and SPEC.loader
reconcile = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = reconcile
SPEC.loader.exec_module(reconcile)


def text_property(kind: str, value: str) -> dict:
    return {"type": kind, kind: [{"plain_text": value}]}


def session_page(
    page_id: str,
    name: str,
    *,
    outcome: str = "완료",
    origin: str = "지시",
    session_key: str | None = None,
    summary: str = "Verified implementation result",
    agent: str = "dakota",
    date: str = "2026-08-25T10:00:00+09:00",
    domain: str = "Operations",
) -> dict:
    return {
        "id": page_id,
        "url": f"https://notion.so/{page_id}",
        "properties": {
            "Name": text_property("title", name),
            "Outcome": {"type": "select", "select": {"name": outcome}},
            "Origin": {"type": "select", "select": {"name": origin}},
            "Session Key": text_property("rich_text", session_key or f"session:{page_id}"),
            "Summary": text_property("rich_text", summary),
            "Agent": {"type": "select", "select": {"name": agent}},
            "Date": {"type": "date", "date": {"start": date}},
            "Domain": {"type": "select", "select": {"name": domain}},
        },
    }


def todo_page(
    page_id: str,
    record_key: str,
    *,
    name: str = "",
    completed_at: str | None = None,
) -> dict:
    return {
        "id": page_id,
        "properties": {
            "Name": text_property("title", name),
            "Record Key": text_property("rich_text", record_key),
            "Completed At": {
                "type": "date",
                "date": {"start": completed_at, "end": None} if completed_at else None,
            },
        },
    }


class FakeClient:
    def __init__(self, sessions: list[dict], todos: list[dict]) -> None:
        self.sessions = sessions
        self.todos = todos
        self.calls: list[tuple[str, str, dict | None]] = []

    def request(self, method: str, path: str, payload: dict | None = None) -> dict:
        self.calls.append((method, path, payload))
        if method != "POST":
            raise AssertionError(f"Unexpected mutation: {method} {path}")
        if path == "/databases/session-db/query":
            return {"results": self.sessions, "has_more": False, "next_cursor": None}
        if path == "/databases/todo-db/query":
            return {"results": self.todos, "has_more": False, "next_cursor": None}
        raise AssertionError(f"Unexpected path: {path}")


class FakeRecorder:
    def __init__(self) -> None:
        self.calls: list[object] = []

    def record(self, item: object, dry_run: bool = False) -> dict:
        self.calls.append(item)
        return {
            "action": "created",
            "page_id": f"todo-{len(self.calls)}",
            "url": f"https://notion.so/todo-{len(self.calls)}",
            "name": item.name,
            "status": "Done",
            "completed_at": item.completed_at,
            "record_key": item.record_key,
        }


class ReconcileCompletedWorkTests(unittest.TestCase):
    def test_only_completed_instruction_or_discussion_rows_become_candidates(self) -> None:
        sessions = [
            session_page("instruction", "Build recorder", origin="지시"),
            session_page("discussion", "Agree operating rules", origin="논의"),
            session_page("execution", "Run existing sync", origin="수행"),
            session_page("lookup", "Check a version", outcome="단발조회"),
            session_page("progress", "Implement pending work", outcome="진행"),
        ]
        service = reconcile.ReconciliationService(FakeClient(sessions, []), "todo-db", "session-db")

        output = service.run()

        self.assertEqual(output["mode"], "dry-run")
        self.assertEqual(output["candidate_count"], 2)
        self.assertEqual([item["name"] for item in output["candidates"]], ["Build recorder", "Agree operating rules"])

    def test_patient_and_counseling_sensitive_names_are_excluded(self) -> None:
        sensitive_names = [
            "환자 김OO 상담 정리",
            "Patient follow-up summary",
            "Counseling note cleanup",
            "척추 케이스 검토",
        ]
        sessions = [session_page(str(index), name) for index, name in enumerate(sensitive_names)]
        service = reconcile.ReconciliationService(FakeClient(sessions, []), "todo-db", "session-db")

        output = service.run()

        self.assertEqual(output["candidate_count"], 0)
        self.assertEqual(output["candidates"], [])

    def test_sensitive_summary_is_excluded_even_when_title_is_generic(self) -> None:
        session = session_page(
            "sensitive-summary",
            "자료 정리 완료",
            summary="환자 DICOM 영상을 검토하고 상담 내용을 정리함",
        )
        service = reconcile.ReconciliationService(FakeClient([session], []), "todo-db", "session-db")

        output = service.run()

        self.assertEqual(output["candidate_count"], 0)

    def test_clinical_domain_and_identifier_like_summary_are_excluded(self) -> None:
        sessions = [
            session_page("clinical", "자료 정리 완료", domain="Clinical", summary="업무 완료"),
            session_page("mrn", "자료 정리 완료", summary="MRN 123456 자료를 정리함"),
            session_page("phone", "연락 완료", summary="010-1234-5678로 연락함"),
        ]
        service = reconcile.ReconciliationService(FakeClient(sessions, []), "todo-db", "session-db")

        output = service.run()

        self.assertEqual(output["candidate_count"], 0)

    def test_already_recorded_keys_are_excluded(self) -> None:
        session = session_page("existing", "Build recorder", session_key="session:existing")
        key = reconcile.record_completed_work.compute_record_key("Build recorder", "session:existing")
        service = reconcile.ReconciliationService(
            FakeClient([session], [todo_page("todo", key)]),
            "todo-db",
            "session-db",
        )

        output = service.run()

        self.assertEqual(output["candidate_count"], 0)

    def test_same_title_and_seoul_completion_date_is_conservatively_deduped(self) -> None:
        session = session_page(
            "source-session",
            "Build recorder",
            session_key="session:different-key",
            date="2026-08-25T01:21:00+09:00",
        )
        existing = todo_page(
            "existing-todo",
            "another-record-key",
            name="  BUILD   recorder ",
            completed_at="2026-08-24T16:21:00Z",
        )
        service = reconcile.ReconciliationService(
            FakeClient([session], [existing]),
            "todo-db",
            "session-db",
        )

        output = service.run()

        self.assertEqual(output["candidate_count"], 0)

    def test_candidate_json_contains_provenance_and_deterministic_key(self) -> None:
        session = session_page("new", "Build recorder", session_key="session:new", origin="논의")
        service = reconcile.ReconciliationService(FakeClient([session], []), "todo-db", "session-db")

        candidate = service.run()["candidates"][0]

        self.assertEqual(candidate["source_ref"], "session:new")
        self.assertEqual(candidate["session_log_page_id"], "new")
        self.assertEqual(candidate["origin"], "논의")
        self.assertEqual(
            candidate["record_key"],
            reconcile.record_completed_work.compute_record_key("Build recorder", "session:new"),
        )

    def test_default_parser_mode_is_dry_run_and_apply_is_explicit(self) -> None:
        self.assertFalse(reconcile.build_parser().parse_args([]).apply)
        self.assertTrue(reconcile.build_parser().parse_args(["--apply"]).apply)

    def test_parser_accepts_inclusive_calendar_bounds(self) -> None:
        args = reconcile.build_parser().parse_args(
            ["--since", "2026-08-23", "--until", "2026-08-25"]
        )
        self.assertEqual(args.since.isoformat(), "2026-08-23")
        self.assertEqual(args.until.isoformat(), "2026-08-25")

    def test_date_bounds_use_seoul_calendar_dates_and_fail_closed_without_date(self) -> None:
        sessions = [
            session_page("old", "Old work", date="2026-08-22T23:59:59+09:00"),
            session_page("first", "First day work", date="2026-08-23"),
            session_page("last", "Last day work", date="2026-08-25T22:00:00+09:00"),
            session_page("utc-next", "Next KST day", date="2026-08-25T16:00:00Z"),
            session_page("malformed", "Malformed date", date="not-a-date"),
        ]
        service = reconcile.ReconciliationService(FakeClient(sessions, []), "todo-db", "session-db")

        output = service.run(
            since=reconcile.CalendarDate.fromisoformat("2026-08-23"),
            until=reconcile.CalendarDate.fromisoformat("2026-08-25"),
        )

        self.assertEqual(output["since"], "2026-08-23")
        self.assertEqual(output["until"], "2026-08-25")
        self.assertEqual(
            [item["name"] for item in output["candidates"]],
            ["First day work", "Last day work"],
        )

    def test_apply_records_each_candidate_with_explicit_key_and_full_datetime(self) -> None:
        sessions = [
            session_page("one", "Build recorder", date="2026-08-24"),
            session_page("two", "Document rules", date="2026-08-25T11:22:33+09:00"),
        ]
        fake_recorder = FakeRecorder()
        service = reconcile.ReconciliationService(
            FakeClient(sessions, []),
            "todo-db",
            "session-db",
            recorder=fake_recorder,
        )

        output = service.run(apply=True)

        self.assertEqual(output["mode"], "apply")
        self.assertEqual(output["applied_count"], 2)
        self.assertEqual(len(fake_recorder.calls), 2)
        self.assertEqual(fake_recorder.calls[0].completed_at, "2026-08-24T00:00:00+09:00")
        self.assertEqual(fake_recorder.calls[1].completed_at, "2026-08-25T11:22:33+09:00")
        self.assertEqual(fake_recorder.calls[0].record_key, output["candidates"][0]["record_key"])

    def test_missing_session_key_fails_closed_by_excluding_row(self) -> None:
        session = session_page("missing", "Build recorder")
        session["properties"]["Session Key"] = text_property("rich_text", "")
        service = reconcile.ReconciliationService(FakeClient([session], []), "todo-db", "session-db")

        output = service.run()

        self.assertEqual(output["candidate_count"], 0)


if __name__ == "__main__":
    unittest.main()
