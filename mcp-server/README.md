# Dakota MCP Server

Exposes Dakota's persona, memory, and tools to any MCP client (Claude Desktop, Claude Code CLI, etc.) backed by the same Notion DBs and DAKOTA.md the web dashboard uses.

**Single source of truth** — Dakota is one assistant with one core persona and shared brain. Dashboard, Telegram, and Claude are just different conversation surfaces over the same Dakota.

Anything you save in Claude Desktop should appear in the web dashboard, and vice versa. Telegram should route into the same Dakota backend rather than becoming a separate Dakota clone.

## What it provides

### Resources
- `dakota://persona` — DAKOTA.md content (immutable identity)
- `dakota://memory-digest` — top facts from Dakota Memory DB

### Tools
- `list_memories`, `add_memory`, `update_memory`
- `list_todos`, `add_todo`, `update_todo`
- `list_schedules` (Notion + GCal merged), `create_schedule`
- `ask_brian`, `ask_opdb` (orchestration shortcuts)

## Setup

### 1. Install (one-time)
The repo already has `@modelcontextprotocol/sdk` installed. Just make sure dependencies are up to date:
```
npm install
```

### 2. Verify .env.local
The MCP server reads `.env.local` from the repo root. Required keys:
```
NOTION_TOKEN=...
NOTION_DAKOTA_MEMORY_DB_ID=...
NOTION_TODO_DB_ID=...
NOTION_SCHEDULE_DB_ID=...
NOTION_JOURNAL_DB_ID=...        # (for ask_brian)
NOTION_PATIENT_DB_ID=...        # (for ask_opdb)
```
Google Calendar (optional, for GCal merge in list_schedules):
```
GOOGLE_CREDENTIALS={...}
GOOGLE_TOKEN={...}
```

### 3. Test locally
```
npx tsx mcp-server/index.ts
```
You should see `[dakota-mcp] connected via stdio` and the process waits for input. Hit Ctrl+C to exit.

### 4. Register in Claude Desktop

Open `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) and add:

```json
{
  "mcpServers": {
    "dakota": {
      "command": "npx",
      "args": [
        "tsx",
        "/Users/TakMD/workspace/spinoscopy-dashboard/mcp-server/index.ts"
      ]
    }
  }
}
```

(Adjust the absolute path to where the repo lives on your machine.)

Restart Claude Desktop. You should see `dakota` listed in the bottom-right MCP indicator.

### 5. Use in Claude Desktop

#### Option A — Quick (manual)
Start a new conversation and say:
> Read the `dakota://persona` and `dakota://memory-digest` resources first. If this Claude surface cannot read MCP resources directly, call `get_persona` and `get_memory_digest` instead, then act as Dakota.

Claude should prefer the resources when available. On Claude Desktop surfaces that expose Dakota tools but not resource URIs to the model, the fallback tools provide the same effective bootstrap.

#### Option B — Project (recommended for daily use)
1. Open Claude Desktop → Projects → New Project named "Dakota"
2. Set Project Instructions (canonical version also lives in `docs/superpowers/specs/dakota-claude-project-instructions.md`):
   ```
   You are Dakota.

   At the start of every new conversation, read the `dakota://persona`
   MCP resource and follow it strictly as your identity, tone, role, and
   hard rules. If this Claude surface cannot read MCP resources directly,
   call the `get_persona` tool instead.

   Also read `dakota://memory-digest` for current cross-session context
   about Tak before answering. If direct resource reads are unavailable,
   call `get_memory_digest` instead.

   Treat dashboard, Telegram, and Claude as different surfaces of the
   same Dakota, not separate assistants.

   Do not invent a separate persona. Do not ignore the MCP persona
   resource or fallback bootstrap tool even if the user starts casually.
   ```
3. All conversations inside this project = Dakota
4. For the local repo `/Users/TakMD/workspace/spinoscopy-dashboard`, Claude Code / local Claude project config should preload these MCP context URIs:
   - `dakota://persona`
   - `dakota://memory-digest`
5. Advanced note: once a Claude Desktop project/space has actually been created and opened locally, Claude also materializes project memory under a path like:
   - `~/Library/Application Support/Claude/local-agent-mode-sessions/<session-root>/<workspace-id>/spaces/<space-id>/memory/project_<name>.md`
   - Observed example on this machine: `.../spaces/ac1168e0-b424-479e-bb63-007a59efe8a9/memory/project_neurogait.md`
   - A Dakota-ready template lives at `docs/superpowers/specs/dakota-claude-project-memory-template.md`

### 6. Use in Claude Code CLI

Add to `~/.claude.json` (or wherever your Claude Code MCP config lives):
```json
{
  "mcpServers": {
    "dakota": {
      "command": "npx",
      "args": ["tsx", "/Users/TakMD/workspace/spinoscopy-dashboard/mcp-server/index.ts"]
    }
  }
}
```

## Architecture

```
DAKOTA.md (git)                    ← immutable persona
       ↓
       ├──→ Web dashboard (Vercel) ───────┐
       │                                  │
       ├──→ Telegram bridge / bot ────────┤
       │                                  ├─→ Notion DBs (single source of truth)
       └──→ Dakota MCP Server             │     - Dakota Memory
              ↓                           │     - Todo
              ├──→ Claude Desktop         │     - Schedule
              ├──→ Claude Code CLI        │     - Journal / Research / Patients
              └──→ Other MCP clients      ─┘
                                          └─→ Google Calendar
```

Same persona, same memory, same actions — whichever channel you use.

## Operational rule

- **Dakota is one brain**.
- **Dashboard / Telegram / Claude are different surfaces**.
- A separate Telegram bot token or worker does **not** mean a separate Dakota identity.
- The only reason to separate Telegram transport is to avoid polling conflicts or to isolate runtime ownership.
- Specialist agents (Elon, Brian, Lo, Warren, Andrej) remain separate from Dakota and should keep their own local memory lanes.
- `npm run telegram:bot` now fails closed if Hermes gateway is already running, so the dashboard poller cannot silently fight for the same `getUpdates` ownership.
- Hermes gateway is the **official runtime owner** for Dakota's Telegram bot in normal operation.
- Use `npm run telegram:bot:force` only when you intentionally know the dashboard worker and Hermes gateway are using different Telegram bot tokens.
