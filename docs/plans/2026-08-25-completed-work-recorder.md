# Dakota Completed Work Recorder Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Record substantive, verified ad-hoc work from Dakota conversations into the existing Notion To-Do DB as completed items, while updating an existing planned To-Do when explicitly matched.

**Architecture:** Keep Notion To-Do as the user-visible completion history and the existing Session Log as provenance. A dependency-free Python CLI performs idempotent schema migration and completed-work upsert with read-back verification; the existing dashboard automatically shows the resulting Done rows. Install the verified CLI under `~/.hermes/scripts` and expose its operating procedure as a Hermes skill without changing gateway/config.

**Tech Stack:** Python 3 stdlib, Notion REST API, unittest, existing Notion To-Do DB, Hermes skills.

---

### Task 1: Add schema migration and recorder core

**Files:**
- Create: `scripts/hermes-dakota/record-completed-work.py`
- Test: `scripts/hermes-dakota/test_record_completed_work.py`

**Requirements:**
- Parse `NOTION_TOKEN` and `NOTION_TODO_DB_ID` from environment or `--env-file` without printing secrets.
- `--migrate-schema` idempotently adds: Origin(select), Agent(select), Requested At(date), Result(rich_text), Source Ref(rich_text), Record Key(rich_text).
- Record mode requires `--name` and `--result`; accepts `--page-id`, `--source-ref`, `--origin`, `--agent`, `--requested-at`, `--completed-at`, `--priority`, `--category`, and `--dry-run`.
- Compute deterministic SHA-256 record key from normalized name + source ref unless `--record-key` is supplied.
- Upsert precedence: Record Key match → explicit page ID → one exact active title match → create new Done item. Multiple active exact-title matches must fail closed.
- Do not overwrite existing planned Priority/Category unless explicitly supplied.
- New ad-hoc item defaults: Status=Done, Priority=Medium, Category=일상업무, Origin=Ad-hoc.
- Write full ISO datetime to Completed At.
- Mirror concise result into Notes for compatibility and into Result metadata.
- Read the page back and verify Status=Done and Record Key before success.
- Emit JSON containing action, page_id, url, name, status, completed_at, record_key; no credentials.

**Tests:**
- deterministic key normalization
- create properties contain Done/full completed datetime/metadata
- planned update preserves unset priority/category
- record-key dedupe wins
- exact-title single match updates
- exact-title ambiguity fails
- read-back verification fails closed
- dry-run performs no mutation

### Task 2: Add conservative reconciliation candidate CLI

**Files:**
- Create: `scripts/hermes-dakota/reconcile-completed-work.py`
- Test: `scripts/hermes-dakota/test_reconcile_completed_work.py`

**Requirements:**
- Read existing Dakota Session Log rows and To-Do Record Keys.
- Candidate only when Outcome=완료 and Origin is 지시 or 논의.
- Exclude 단발조회, 수행, patient/counseling-sensitive names, and already-recorded keys.
- Default is dry-run JSON candidate output; writes require explicit `--apply`.
- Do not schedule a new job in this implementation.

### Task 3: Document and install operating path

**Files:**
- Modify: `DAKOTA.md`
- Create: `docs/completed-work-recording.md`

**Requirements:**
- Define review-worthy completion threshold.
- Never record before verified tool result/read-back.
- Drafts waiting for approval are not Done.
- Patient/counseling details must remain operational-only and de-identified.
- Existing To-Do page ID should be passed when work originated from a planned task.

### Task 4: Verification

- Run focused Python unittest suite.
- Run schema migration twice and verify second run is no-op.
- Run dry-run recorder.
- Install exact verified script to `~/.hermes/scripts/record-completed-work.py` mode 755.
- Record this implementation as the first real completed work item and read it back.
- Run existing `dakota-todo-sync.ts --since today --dry-run` to verify the Done item is visible to Session Log ingestion.
- Run project tests relevant to Todo/Ledger and `git diff --check`.
- Do not backfill historical conversations automatically.
