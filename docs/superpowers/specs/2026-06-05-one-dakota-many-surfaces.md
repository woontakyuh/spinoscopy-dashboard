# One Dakota, Many Surfaces

## Decision
Dakota should be operated as **one identical assistant** across:
- dashboard
- Telegram
- Claude / MCP clients

This means:
- **same persona**
- **same shared core memory / brain**
- **same operational rules**
- only the **conversation surface** changes

Specialist agents remain separate:
- Elon
- Brian
- Lo
- Warren
- Andrej

## What this decision is not
This does **not** mean:
- one Telegram bot token must be shared by multiple pollers
- every specialist should share one undifferentiated memory bucket
- Telegram transport separation implies a second Dakota identity

Transport/process separation and assistant identity are different concerns.

## Architecture rule
### Dakota
Treat Dakota as:
- one front-door identity
- one core persona source (`DAKOTA.md`)
- one shared memory source of truth
- one orchestration layer

### Surfaces
Each surface is just an ingress/UX layer:
- **dashboard** → web chat surface
- **Telegram** → messaging surface
- **Claude Desktop / Claude Code** → MCP surface

All of them should read from the same Dakota persona and the same Dakota memory layer.

### Specialists
Specialists are not alternate Dakotas.
They are separate workers with their own local memory lanes and heuristics.

Dakota may route to them, but Dakota remains the visible chief-of-staff front door.

## Current repo mapping
### Persona
- `DAKOTA.md` is the single Dakota persona source.
- Dashboard chat loads it in `app/api/ai/chat/route.ts`.
- Claude-side MCP exposes it as `dakota://persona` in `mcp-server/index.ts`.

### Memory
- Dakota memory lives in the Notion Dakota memory layer.
- Dashboard and MCP both read that same Dakota memory source.
- Shared core + agent-local memory boundaries are handled in `dakotaMemoryV2` and prompt builders.

### Telegram
- Telegram is a transport bridge into the same Dakota backend.
- `scripts/telegram-bot.ts` should be treated as an ingress worker, not a separate Dakota brain.
- A dedicated Telegram token/worker is acceptable only to prevent `getUpdates` ownership conflicts.

## Operational rule for Telegram
Safe rule:
- one active poller per bot token
- many surfaces may point to the same Dakota backend

Therefore:
- **one Dakota brain** can still have Telegram + dashboard + Claude access
- but **one Telegram token** cannot be polled by multiple always-on consumers simultaneously

If a dedicated worker token is used, document it as a **transport ownership choice**, not as a second Dakota identity.

## Product principle
For the user experience, the system should feel like:
- same Dakota everywhere
- same memory everywhere
- same judgment everywhere
- different windows into the same assistant

## Verification checklist
A change is correct only if all are true:
1. dashboard Dakota uses `DAKOTA.md`
2. Claude Dakota uses `dakota://persona`
3. Telegram routes into the same Dakota backend
4. Dakota memory source is shared across surfaces
5. specialist local memory remains separated from Dakota and from one another
6. no Telegram polling conflict exists for the active token
