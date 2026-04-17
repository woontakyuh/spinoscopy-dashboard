# Elon & Lo — Persona + Shared Memory System

**Date:** 2026-04-17
**Status:** Design approved, implementation authorized (autonomous)

## Goal

Extend Dakota's proven pattern (persona + structured Notion memory DB + MCP server) to Elon and Lo so that deep conversations in Claude Desktop are remembered and shared with the web dashboard, each agent maintaining a consistent persona across channels.

## Non-Goals

- Not replacing the official Notion MCP the user already has connected in the Lo BJJ Desktop project (that stays for Archetype/Position/Transition DB access). The new `lo` MCP is **additive**, layering persona and memory on top.
- Not unifying Dakota's memory with Elon's or Lo's — each agent has its own Memory DB.
- Not customizing memory categories per agent. The same 7 (`profile / preference / person / project / rule / fact / event`) apply to all.

## Architecture

Per agent:

```
{AGENT}.md (persona, repo root, git-tracked, immutable identity)
Notion {Agent} Memory DB (structured rows)
lib/notion/{agent}Memory.ts (factory-backed wrapper)
                  │
                  ├─→ Web dashboard (app/api/ai/chat/route.ts, agentId=elon|lo)
                  └─→ Claude Desktop (mcp-server/{agent}.ts)

Domain data (shared, read-mostly):
  Elon → Notion Patient DB (surgery + non-surgery cases)
  Lo   → Notion Sensei DB (training sessions)
```

## Scope Clarifications

**Elon role**
- Covers surgery cases AND non-surgery patient discussions.
- Two Claude Desktop projects will use the elon MCP:
  - `Patient DB-EMR workflow` — surgery/EMR flow
  - `Clinical consultation` — clinical advice on cases (surgical + non-surgical)
- Both projects' conversations persist into the same Elon Memory DB.
- New dashboard tab **"Interesting Cases"** for `DB="interesting case"` patients.

**Lo role**
- Stays coupled to the Desktop `BJJ 프로젝트` (a.k.a. "Lo BJJ agent").
- `lo` MCP runs alongside the existing official Notion MCP in that project.
- Persona + memory ride on top; raw Notion writes to Archetype/Position/Transition DBs continue via official Notion MCP.

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Memory scoping | **Separate DB per agent** | Domain-distinct conversations, no cross-contamination of tone. Simpler. |
| MCP structure | **One MCP server per agent** | Projects can enable only the right agent. Clean tool namespaces. |
| Persona depth | **Full embodiment** (Dakota-level) | User values deep discussion presence. Consistent with Dakota's existing treatment. |
| Tool scope | **Memory + own domain + web_search** | No cross-agent orchestration (separate MCPs handle that on Desktop side). |
| Live-data injection | **Curated summary** | Memory digest + key domain snapshot (today's surgeries / this month's sessions). Deep queries go through tools. |
| Surgery filter | **`DB="Op"` AND `Sch≠"canceled"`** | Single source of truth, applied everywhere. Retrofits existing surgery queries. |
| Interesting case UI | **Simple list** (A) | Discussion context lives in Elon Memory DB; list links back via `search_memory(patient_name)`. No redundant Notion column. |
| Notion DB creation | **Scripted** (B) | One-shot: infer parent page from Dakota Memory DB, create two sibling DBs. |

## Live-Data Injection (System Prompt Context)

**Elon prompt appendix:**
- Current time (Asia/Seoul)
- Elon Memory digest (top 40 rows by importance)
- Today's surgery list (filtered: `DB="Op" AND Sch≠"canceled" AND Op Date=today`)
- This month's surgery status: total count + op category breakdown + cumulative lifetime total
- *(No research projects — that's Brian's domain)*

**Lo prompt appendix:**
- Current time (Asia/Seoul)
- Lo Memory digest (top 40)
- This month's training sessions (date / gym / tags, up to ~30)
- Current training streak (consecutive days)
- Top 10 most-used BJJ tags this month

## File Plan

### New files
```
ELON.md                                                 — persona
LO.md                                                   — persona
lib/notion/agentMemory.ts                               — generic factory
lib/notion/elonMemory.ts                                — 2-line wrapper
lib/notion/loMemory.ts                                  — 2-line wrapper
lib/notion/interestingCases.ts                          — DB="interesting case" query
app/api/notion/elon/interesting/route.ts                — GET list
mcp-server/elon.ts                                      — Elon MCP server
mcp-server/lo.ts                                        — Lo MCP server
scripts/create-agent-memory-db.ts                       — Notion DB creator
docs/superpowers/specs/2026-04-17-elon-lo-persona-memory-design.md  — this doc
```

### Modified files
```
app/api/ai/chat/route.ts    — add buildElonPrompt/buildLoPrompt + tools + branching
app/agents/elon/page.tsx    — mount AgentChat + new Interesting Cases tab
app/agents/lo/page.tsx      — mount AgentChat
lib/notion/patients.ts      — surgery filter (DB=Op AND Sch≠canceled)
lib/notion/analytics.ts     — same filter in analytics pipeline
.env.local                  — NOTION_ELON_MEMORY_DB_ID, NOTION_LO_MEMORY_DB_ID
```

### Vercel env (via `vercel env add`)
- `NOTION_ELON_MEMORY_DB_ID` (production, preview)
- `NOTION_LO_MEMORY_DB_ID` (production, preview)

### Desktop config (manual, user applies after wake)
Append to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "elon": {
      "command": "npx",
      "args": ["tsx", "/Users/TakMD/workspace/spinoscopy-dashboard/mcp-server/elon.ts"]
    },
    "lo": {
      "command": "npx",
      "args": ["tsx", "/Users/TakMD/workspace/spinoscopy-dashboard/mcp-server/lo.ts"]
    }
  }
}
```

Project instruction addendum (both projects):
> Read `{agent}://persona` and `{agent}://memory-digest` at session start and follow them.

## Verification

- `npm run build` passes (no TS errors).
- Dashboard Elon page renders chat + Interesting Cases tab.
- Dashboard Lo page renders chat.
- `vercel --prod` deploys cleanly.
- Post-deploy manual test by user:
  - Desktop `Clinical consultation` → "Patient X is interesting because Y" → `add_memory` row appears → reload dashboard Elon → reference "Patient X" → model recalls via `search_memory`.
  - Same cross-channel test for Lo via `BJJ 프로젝트`.

## Risk / Notes

- Surgery filter refactor: ripples through analytics counts and possibly dashboard widgets. Every call site updated at once. If any widget silently depends on old behavior (counting cancelled or non-Op rows), it will change. Acceptable because the new filter is semantically correct.
- MCP persona files are loaded via `dakota://persona`-style resources. Claude Desktop projects must be instructed to read them each session — otherwise the persona is inert.
- Two real-person-inspired personas (Elon Musk, Leandro Lo). Guardrails baked into each persona file: stay in-character, no impersonation for malicious purposes, domain-focused, no fabricated biographical claims about the real person.
