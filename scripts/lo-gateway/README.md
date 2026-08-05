# Lo local gateway

This service exposes the bounded Lo dashboard tools only on `127.0.0.1`.
It does not provision a tunnel, Cloudflare service, filesystem browser, shell,
or generic Notion client.

## Configuration

Copy the required keys in [`.env.example`](./.env.example) into the process
environment or `.env.local`:

- `BJJ_GRAPH_ROOT`: required absolute path to the canonical BJJ markdown root.
  The gateway reports an explicit graph-source error when it is missing or does
  not resolve to an accessible directory.
- `LO_GATEWAY_HMAC_SECRET`: required shared secret of at least 16 characters.
- `LO_GATEWAY_PORT`: optional loopback port, default `4318`.
- `OPENAI_API_KEY`: required only for the authenticated Hermes conversation endpoint. Its Luna Responses request sets `store: false`.

Run it on the Mac that has the source databases and graph checkout:

```sh
./node_modules/.bin/tsx --env-file=.env.local scripts/lo-gateway/server.ts
```

The process always binds to `127.0.0.1`; changing an environment variable
cannot make it bind to a LAN or public interface.

## Endpoints

- `GET /health` returns the protocol name and static tool schemas.
- `POST /v1/tools` executes one of these tool names:
  `lo.profile.get`, `lo.training.recent`, `lo.fitness.trends`,
  `lo.graph.neighborhood`, `lo.graph.flow.compare`, `lo.memory.search`,
  `lo.memory.save`, `lo.sync.status`.
- `POST /v1/conversation` accepts only `{ "message": "..." }` and runs the existing
  read-only Luna `runLoConversation` loop. It seeds the dedicated Lo Memory
  search, cannot save memory, persists no transcript, and returns `{ "answer": "..." }`
  with raw citations removed.

Every successful data result includes source citations. The dashboard API uses
per-section `ready`, `empty`, or `error` envelopes; graph citations retain the
canonical `bjj:path#Lline` IDs.

## HMAC request contract

For a `POST /v1/tools` call, send the exact UTF-8 JSON body plus these headers:

```text
X-Lo-Timestamp: Unix seconds
X-Lo-Nonce: 16-128 URL-safe random characters
X-Lo-Signature: sha256=<hex HMAC>
```

The same signed envelope is required for both `POST /v1/tools` and
`POST /v1/conversation`. The signed byte string is exactly:

```text
lo-gateway-v1\n<timestamp>\n<nonce>\n<raw JSON body>
```

where `\n` is a single newline byte. Requests older or newer than five minutes,
requests with an invalid signature, and nonce replays are rejected before JSON
parsing or tool dispatch. Send the raw body unchanged after computing its
signature.

## launchd

Copy [`com.takmd.lo-gateway.plist.example`](./com.takmd.lo-gateway.plist.example),
replace `__DASHBOARD_ROOT__` and `__HOME__`, then load the result in the current
user domain:

```sh
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.takmd.lo-gateway.plist
```

No public reverse proxy or Cloudflare setup is part of this gateway.

## Hermes skill wrapper

The repo-backed skill is at [`../../skills/hermes-lo/SKILL.md`](../../skills/hermes-lo/SKILL.md).
It invokes one command from the repository root:

```sh
./node_modules/.bin/tsx --env-file=.env.local scripts/hermes-lo/run.ts "하프가드 우선순위 알려줘"
```

The wrapper signs one loopback conversation request and prints only the formatted
answer. It does not start a gateway, Telegram poller, launchd job, or another
Notion/model client. `scripts/hermes-lo/verify-skill.ts`, `sync-skill.ts`, and
`mount-skill.ts` are explicit operator tools; none run during gateway startup.

Mount the repository skill into Hermes so updates cannot drift from the
canonical source:

```sh
./node_modules/.bin/tsx scripts/hermes-lo/mount-skill.ts \
  "$HOME/.hermes/skills/hermes-lo" \
  --allow-external \
  --force
```

Hermes discovers the mounted skill without restarting its gateway. Verify it
with `hermes skills list` and a direct `hermes --skills hermes-lo --cli` call.
Do not run `hermes gateway restart`, `launchctl kickstart`, or any equivalent
service restart from a session hosted by that gateway; doing so terminates the
active session before it can record or report the result.

### Telegram without Threaded Mode

Private-chat topics require Telegram to expose and enable **Threaded Mode** for
the bot. When BotFather does not show that setting and `createForumTopic`
returns `The chat is not a forum`, remove `dm_topics` from Hermes configuration
instead of retrying or restarting the gateway.

The installed skill remains available as the Telegram slash command
`/hermes_lo`. Register that command in the bot's chat-specific command menu and
send BJJ requests as:

```text
/hermes_lo 오늘 하프가드 첫 우선순위 알려줘
```

Hermes normalizes Telegram's underscore form to the skill command
`/hermes-lo`, loads only the canonical `hermes-lo` skill, and forwards the
remaining text as the user request. This keeps Dakota's normal DM behavior
unchanged while making Lo selection explicit.
