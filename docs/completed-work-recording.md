# Dakota completed-work recording

Dakota records substantive, verified ad-hoc work in the existing Notion To-Do database as `Done`. The To-Do row is the user-visible completion history; the Dakota Session Log remains the provenance source. This workflow does not create Operations or schedule a new reconciliation job.

## What qualifies

Record work only when all of these are true:

- The result is review-worthy: it produced a durable artifact, completed a meaningful multi-step action, changed a system or document, or reached a decision worth seeing in completion history.
- The result is substantive rather than a greeting, status check, one-off lookup (`단발조회`), or a routine execution (`수행`) of an already-recorded process.
- A tool result and any required read-back have verified the outcome.
- No approval is still pending. A draft waiting for review or approval is not `Done`.

Do not put patient or counseling details into completion history. Those details stay operational-only. If the fact of completion itself is useful, use a de-identified generic title and concise result with no names, identifiers, diagnoses, quoted counseling text, or other re-identification clues.

When work originated from a planned To-Do, pass its existing Notion page ID with `--page-id`. Do not create a parallel ad-hoc row for the same planned task.

## Configuration

Both CLIs are Python 3 standard-library scripts and install no packages. They read:

- `NOTION_TOKEN`
- `NOTION_TODO_DB_ID`
- `NOTION_DAKOTA_SESSION_LOG_DB_ID` (reconciliation only)

Values may come from the process environment or `--env-file`; process environment values win. Output and errors never include credentials.

Source scripts:

- `scripts/hermes-dakota/record-completed-work.py`
- `scripts/hermes-dakota/reconcile-completed-work.py`

Repository tests never perform live installation or Notion mutation. Operators install the verified scripts under `~/.hermes/scripts` and run live migration/write steps explicitly using the commands below.

## Schema migration

The recorder idempotently adds these properties to the To-Do database:

| Property | Type |
| --- | --- |
| Origin | select |
| Agent | select |
| Requested At | date |
| Result | rich_text |
| Source Ref | rich_text |
| Record Key | rich_text |

Run the source copy when preparing the installation:

```bash
python3 scripts/hermes-dakota/record-completed-work.py \
  --env-file .env.local \
  --migrate-schema
```

A second run returns `schema_noop`. An existing property with an incompatible type fails closed rather than rewriting it. Use `--dry-run` to preview missing properties without mutation.

## Record a verified completion

Preview a new ad-hoc completion:

```bash
python3 scripts/hermes-dakota/record-completed-work.py \
  --env-file .env.local \
  --name "Dakota completed-work recorder implemented" \
  --result "Recorder, reconciliation, tests, and operating documentation verified." \
  --source-ref "<session-key>" \
  --origin Ad-hoc \
  --agent dakota \
  --requested-at "2026-08-25T08:00:00+09:00" \
  --completed-at "2026-08-25T09:10:11+09:00" \
  --dry-run
```

Remove `--dry-run` only after the work result is verified. For a planned task, add its exact page ID:

```bash
python3 scripts/hermes-dakota/record-completed-work.py \
  --env-file .env.local \
  --page-id "<existing-notion-page-id>" \
  --name "Existing planned task title" \
  --result "Verified concise result" \
  --source-ref "<session-key>"
```

Record mode requires `--name` and `--result`. Ad-hoc work also requires a stable `--source-ref` or explicit `--record-key`; planned work may use `--page-id`, from which a stable key is derived when no source reference is available. It also accepts `--priority` and `--category`. Do not supply Priority or Category for a planned task unless the completion should intentionally change them.

The recorder:

1. Computes a SHA-256 key from normalized name plus source reference unless `--record-key` is supplied.
2. Selects a target in this order: Record Key, explicit page ID, one exact active title, then create.
3. Refuses multiple Record Key or exact-title matches.
   An explicit page ID must belong to the configured To-Do DB, be active, and match the supplied title.
4. Writes `Done`, a full ISO `Completed At`, concise Notes/Result, and provenance metadata.
5. Reads the page back and verifies `Done` plus the expected Record Key before reporting success.
6. If the same Record Key is already `Done`, returns `deduped` without rewriting its original completion time.
7. Serializes local writers with an owner-only file lock to prevent same-Mac create races.

New ad-hoc rows default to `Priority=Medium`, `Category=일상업무`, and `Origin=Ad-hoc`. Existing planned rows preserve unset Priority and Category; an empty Origin is marked `Planned`.

## Reconciliation candidates

Reconciliation is read-only unless `--apply` is explicitly present:

```bash
python3 scripts/hermes-dakota/reconcile-completed-work.py --env-file .env.local
```

The JSON output contains only candidates where Session Log `Outcome=완료` and `Origin` is `지시` or `논의`. It excludes `단발조회`, `수행`, the Clinical domain, patient/counseling-sensitive titles or summaries, common medical/identifier patterns, missing Session Keys, and keys already present in To-Do.

Review every candidate before any write. Applying is an explicit operator action:

```bash
python3 scripts/hermes-dakota/reconcile-completed-work.py \
  --env-file .env.local \
  --apply
```

No automatic historical backfill and no scheduled reconciliation job are part of this implementation.

## Runner and dashboard compatibility

`scripts/dakota-ledger-cron.sh` passes the runner's `--since` bound into the To-Do lane. This prevents an ordinary run from scanning and backfilling the entire completed To-Do history. The runner still attempts all four lanes when one fails, counts lane failures, and exits non-zero after the final lane if any failed so launchd cannot report false success.

Completed work now stores a full ISO timestamp, defaulting to an explicit `+09:00` offset. The Dakota Todo history UI converts full timestamps to Asia/Seoul for daily counts and display, while preserving historical date-only values unchanged.

## Local verification

These checks are read-only and require no credentials:

```bash
python3 -m unittest discover -s scripts/hermes-dakota -p 'test_*.py' -v
npx vitest run components/dakota/TodoCompletionDatetime.test.ts
bash -n scripts/dakota-ledger-cron.sh
git diff --check
```
