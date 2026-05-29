# Demo Mode (dashboard1.takmd.com) — Design

**Date:** 2026-05-29
**Branch:** `feat/demo-mode`

## Goal

Serve a public-facing demo of the existing dashboard at `dashboard1.takmd.com` for
showing the product to people. Same look and behavior as production, with three
differences when accessed via the demo domain:

1. Agent list (home `AgentGrid` **and** `Sidebar`) shows only **Elon** and **Brian**.
2. The home `MorningBriefing` shows the **Dakota photo only** — the greeting **speech
   bubble** is removed. Weather and date are **kept** (rendered as plain text, no bubble chrome).
3. Access is gated by a **demo-specific password** (`DEMO_PASSWORD`).

Real Notion data is shown as-is (explicit user decision). No fake/sample data.

## Non-Goals

- No change to the **main** domain's existing auth (it is already gated by `proxy.ts`
  with `DASHBOARD_PASSWORD`).
- No fake data layer.
- No changes to agent feature pages other than access gating in demo mode.

## Implementation note (discovered during build)

Next.js 16 renamed `middleware.ts` → `proxy.ts`, and the project **already has a
`proxy.ts`** that gates every route with `DASHBOARD_PASSWORD`. Demo logic is therefore
**integrated into the existing `proxy.ts`** (not a new `middleware.ts`): on the demo
host it additionally accepts `DEMO_PASSWORD`, blocks non-(elon/brian) agent paths, and
forwards the `x-demo=1` header.

## How it works — domain detection

Single Vercel project; the demo domain is added to the same project. Demo mode is
determined by the request `host` header equaling `dashboard1.takmd.com`.

### `middleware.ts` (new)

Runs for app routes (matcher excludes `_next`, static assets, and `/api/auth/*`).

For requests whose host is the demo domain **only**:

1. **Auth gate:** read the `dashboard-auth` cookie. Valid if its value equals
   `DEMO_PASSWORD` or the existing `DASHBOARD_PASSWORD`. If absent/invalid →
   redirect to `/login`.
2. **Hidden-agent block:** if the path targets a hidden agent
   (`/agents/warren`, `/agents/lo`, `/agents/andrej`) → redirect to `/`.
3. **Flag propagation:** forward the request with an added `x-demo=1` request header
   (`NextResponse.next({ request: { headers } })`).

For the main domain: middleware passes through unchanged (no gate, no header).

### Flag propagation to the UI

- `app/layout.tsx` (server component) reads `headers().get('x-demo')` → `demoMode: boolean`.
- Passes `demoMode` as a prop to `ClientLayout`.
- `ClientLayout` provides it via a new `DemoModeContext`; components read it with a
  `useDemoMode()` hook. SSR-safe (no client-side host sniffing, no hydration flash).

## UI changes (demo mode only)

- **`AgentGrid`**: filter `AGENTS` to `["elon", "brian"]`; change `grid-cols-5` →
  `grid-cols-2` so two cards lay out cleanly.
- **`Sidebar`**: filter its agent navigation list to Elon and Brian.
- **`MorningBriefing`**: keep the Dakota `<img>`; replace the greeting speech-bubble
  block with a plain (no border/tail/onClick-to-chat) rendering of `WeatherInline` +
  `dateStr` + location. The greeting `<h2>` text is omitted.

## Auth

- **`app/api/auth/login/route.ts`**: accept the submitted password if it equals
  `DASHBOARD_PASSWORD` **or** `DEMO_PASSWORD`; set the `dashboard-auth` cookie to the
  matched value. Unchanged cookie options.
- New env var **`DEMO_PASSWORD`**.

## Deployment (manual, by user)

- Vercel → project Domains: add `dashboard1.takmd.com` (+ DNS CNAME).
- Vercel → Environment Variables: add `DEMO_PASSWORD`.

## Files touched

| File | Change |
|------|--------|
| `middleware.ts` | **new** — demo-host auth gate, hidden-agent block, `x-demo` header |
| `app/layout.tsx` | read `x-demo` header → pass `demoMode` to `ClientLayout` |
| `components/layout/ClientLayout.tsx` | accept `demoMode`; provide `DemoModeContext` |
| `lib/demo.ts` (or context file) | `DemoModeContext` + `useDemoMode()` hook; demo constants (allowed/hidden agent ids, demo host) |
| `components/dashboard/AgentGrid.tsx` | filter to Elon/Brian; grid-cols-2 in demo |
| `components/layout/Sidebar.tsx` | filter agent list in demo |
| `components/dashboard/MorningBriefing.tsx` | demo: drop bubble chrome + greeting, keep weather/date |
| `app/api/auth/login/route.ts` | accept `DEMO_PASSWORD` |

## Testing

- Unit: agent-filter helper returns `[elon, brian]` when demo, full list otherwise.
- Unit: login accepts both passwords; rejects wrong password.
- Manual: with `Host: dashboard1.takmd.com`, unauthenticated → `/login`; after demo
  password, home shows two agents, sidebar two agents, Dakota photo without bubble but
  with weather/date; `/agents/warren` redirects to `/`. Main domain unchanged.

## Risks

- Real private data (patient/surgery/finance/schedule) is visible behind the demo
  password — accepted by user. Demo password is the only barrier; keep it non-trivial.
- `headers()` in the root layout opts it into dynamic rendering (acceptable for this
  personal dashboard).
