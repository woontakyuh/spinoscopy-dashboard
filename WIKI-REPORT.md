# Dakota LLM Wiki 상태 패널 + Notion 동기화

## What was built

**Notion sink**
- `scripts/dakota-ledger-schema.ts`: added `createWikiStateDb()` / `extendWikiState()` / `ensureWikiStateDb()`,
  reusing the existing `mergedOptions()` helper for the `Status` select (`changed` / `unchanged`) so re-running
  the schema script never loses hand-set option colors. `main()` now also prints
  `NOTION_DAKOTA_WIKI_DB_ID=<id>` in the final `.env.local` block, next to
  `NOTION_DAKOTA_SESSION_LOG_DB_ID`.
- `lib/notion/wikiState.ts` (new): `getWikiDbId()`, `listWikiSnapshots()`, `createWikiSnapshot()`. The
  paginator matches `sessionLog.ts` / `operations.ts` / `conversationLog.ts` exactly — it throws if
  `has_more` is true but `next_cursor` is falsy, instead of silently truncating.

**Sync script**
- `scripts/dakota-wiki-sync.ts` (new): same `--dry-run` CLI shape as the sibling syncs (no `--since` — the
  state file is tiny, the whole file is read and diffed every run). Reads
  `WIKI_STATE_FILE` (defaults to `~/Library/CloudStorage/Dropbox/Tak/Obsidian/TakBrain/ExoBrain/LLM_Wiki_v2/.wiki-state.json`
  via `os.homedir()`), and if the file is missing (`ENOENT`) prints a line and returns — exit code 0,
  cron chain unaffected. Writes one Notion row per `events[]` entry, deduped by `Event Key` (the event's
  `at` string) against everything already in the DB. Only the **newest** event (by `at`, not array order)
  gets `Total Pages` / `Total Sources` / `Layers` / `Kinds` / `Compiler` stamped with the file's *current*
  top-level totals; older events keep whatever they were written with (the file doesn't retain historical
  totals, so nothing is fabricated).
- `scripts/dakota-ledger-cron.sh`: appended `run "Wiki" npx tsx --env-file=.env.local scripts/dakota-wiki-sync.ts`
  after the `Conversation` line.
- `.gitignore`: added `!scripts/dakota-wiki-sync.ts` to the allowlist (scripts/* is ignored by default).

**API**
- `app/api/dakota/wiki/route.ts` (new): `GET` → `{ configured, snapshots }`, same try/catch → 500 shape as
  `app/api/dakota/operations/route.ts`.

**Panel**
- `components/dakota/WikiPanel.tsx` (new): status block, not a trend chart. Renders under the existing
  "분석" (analytics) section in `components/dakota/OperationsLedger.tsx`. If unconfigured or no snapshots,
  renders a single plain sentence (no empty frame). Staleness headline reuses the ledger's own thresholds —
  `tone()` in `components/dakota/charts/StalledChart.tsx` was exported (it already encodes >14d
  warning / >30d critical against the same `--status-revision-text` / `--status-hold-text` tokens) instead
  of re-deriving the 14/30 numbers. Day computation itself reuses `computeStalledDays` from
  `lib/dakota-ledger/period.ts` (via a thin `computeWikiStaleDays` wrapper in the new pure module) — not
  reimplemented.
- Source/page mismatch uses `detectSourceMismatch()` from the new pure module, computed client-side from
  the snapshot's stored totals.
- `components/dakota/charts/WikiEventsChart.tsx` (new): only rendered when `snapshots.length >= 3` — a
  small created/updated/deleted grouped bar chart over time. Colors reuse three already-`dataviz`-validated
  hex slots straight from `operationLabels.ts`'s `DOMAIN_CHART_COLOR` (Family green `#008300`, Strategy blue
  `#3987e5`, Operations red `#e66767`) rather than picking new hex — those were validated for both light and
  dark surfaces per the comment already in that file. Grid/tooltip chrome resolves through the existing
  `useChartTokens()` hook, matching `TrendChart.tsx`'s pattern. I could not re-run
  `scripts/validate_palette.js` in this sandbox (the dataviz skill's bundled script isn't reachable from
  Bash here — `find / -iname validate_palette.js` turned up nothing) but no new hex was introduced.

**Pure module**
- `lib/dakota-ledger/wikiState.ts` (new): `parseWikiState`, `formatLayers` / `formatKinds` (descending count,
  ties broken alphabetically), `detectSourceMismatch`, `computeWikiStaleDays` (wraps `computeStalledDays`),
  `newestEventIndex`, `buildWikiSnapshotRows`. No fs/Notion imports — safe to import from the client
  component too.

## TDD evidence

`lib/dakota-ledger/wikiState.test.ts` was written and run **before** `lib/dakota-ledger/wikiState.ts`
existed:

```
$ npx vitest run lib/dakota-ledger/wikiState.test.ts
 ❯ lib/dakota-ledger/wikiState.test.ts (0 test)
 Error: Cannot find module './wikiState' imported from '.../wikiState.test.ts'
 Test Files  1 failed (1)
      Tests  no tests
```

After implementing `wikiState.ts`:

```
$ npx vitest run lib/dakota-ledger/wikiState.test.ts
 ✓ lib/dakota-ledger/wikiState.test.ts (19 tests) 36ms
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

One test is worth calling out: `computeWikiStaleDays` is checked against the spec's stated "17 days stale"
reality (measured 2026-08-02, event `at: "2026-07-15T23:29:24Z"`). Naive UTC date subtraction gives 18 days;
the test only passes because `computeStalledDays` converts through `Asia/Seoul` first — `23:29:24Z` on
07-15 is `08:29` KST on 07-16, so the KST-calendar diff to 08-02 is 17. This confirms reusing the ledger's
existing function (rather than reimplementing date math) was the right call, not just a style preference.

## Verify

```
$ npm run test
 Test Files  3 failed | 30 passed (33)
      Tests  3 failed | 320 passed (323)
```
The 3 failures are exactly the pre-existing ones named in the task brief:
`components/dashboard/WeatherDetail.test.tsx` (2 tests), `app/api/weather/route.test.ts` (1 test), and
`scripts/social-collector/normalize.test.mjs`. All 19 new `wikiState.test.ts` tests are in the 320 passing.

```
$ npx tsc --noEmit
components/dashboard/WeatherDetail.test.tsx(9,3): error TS2739: ... missing wind_deg, pressure, visibility, sunrise, sunset
lib/types/weather.test.ts(7,7): error TS2739: ... missing wind_deg, pressure, visibility, sunrise, sunset
```
Exactly the 2 pre-existing errors named in the task brief — nothing new.

```
$ npm run build
✓ Compiled successfully in 6.2s
✓ Generating static pages using 9 workers (60/60)
```
`/api/dakota/wiki` appears in the route list, build otherwise clean.

## grep result

```
$ grep -rnE "zinc-[0-9]|text-white" components/dakota/
NO MATCHES
```

## Panel sketch (status-block-only, <3 events — matches today's reality)

```
┌──────────────────────────────────────────────────────────┐
│ LLM Wiki                              마지막 컴파일 17일 전 │
│ 31 페이지 · 소스 31 → 페이지 31 (누락 없음)                  │
│ Core 28 · Research Graph 3                                │
│ core_notes 17 · core_agent_os 6 · core_strategy 5 ·        │
│ research_projects 3                                        │
└──────────────────────────────────────────────────────────┘
```
"17일 전" renders in `--status-revision-text` (amber) since 14 < 17 ≤ 30. Past 30 days it switches to
`--status-hold-text` (red). No chart — only 1 event exists today, below the 3-event minimum.

With ≥3 events, a second panel appears below with a small created/updated/deleted grouped bar chart
(`WikiEventsChart`), one bar-group per event date.

If unconfigured / zero snapshots: just `LLM Wiki 상태가 아직 동기화되지 않았어요.` — no frame at all.

## Ordered commands the controller must run

These are the writes I was told not to perform myself:

1. `npx tsx --env-file=.env.local scripts/dakota-ledger-schema.ts`
   — creates (or reuses) the "Dakota Wiki State" DB and prints `NOTION_DAKOTA_WIKI_DB_ID=<id>`.
2. Add that line to `.env.local` — both on the Mac mini (the ledger-runner worktree that
   `dakota-ledger-cron.sh` `cd`s into, for the sync script) **and** in the Vercel project env vars (for the
   deployed dashboard's `/api/dakota/wiki` read path).
3. `npx tsx --env-file=.env.local scripts/dakota-wiki-sync.ts --dry-run`
   — sanity-check the row(s) it intends to write against the real `.wiki-state.json`.
4. `npx tsx --env-file=.env.local scripts/dakota-wiki-sync.ts`
   — the real write. With today's data this creates exactly one row (2026-07-15 event).
5. No change needed to get the cron wrapper picking this up going forward — `dakota-ledger-cron.sh`
   already `git fetch`/`checkout`es `origin/main` on every run, so once this PR merges the appended
   `run "Wiki" ...` line ships automatically on the next scheduled run.
6. Confirm `/agents/dakota` (operations tab) renders the panel in production after the Vercel env var is
   set and a redeploy has picked it up.

## Concerns

- I could not run `scripts/validate_palette.js` from the dataviz skill in this sandbox to re-confirm the
  3-color created/updated/deleted chart palette (the script wasn't reachable via Bash here). I mitigated
  this by reusing 3 hex values already validated and in production use elsewhere in this file
  (`operationLabels.ts`'s `DOMAIN_CHART_COLOR`), rather than introducing new hex — but this is worth a
  quick manual re-check with the validator in an environment where it's reachable.
- `buildWikiSnapshotRows` stamps current totals only onto whichever event is newest by `at` *at sync time*.
  If the compiler ever produces a run where totals drift without a new event being appended (not possible
  under the current compiler's one-event-per-change model, but worth knowing), the already-written newest
  row's totals will not be updated on a later sync — this matches "re-running must write nothing" literally,
  per the task brief.
