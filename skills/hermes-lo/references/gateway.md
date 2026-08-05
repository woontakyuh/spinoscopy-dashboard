# Hermes Lo gateway reference

`skills/hermes-lo/SKILL.md` points to the repository-root `LO.md` at runtime. It does not duplicate that document, so persona changes remain a single-file update. The persona file is intentionally read by Hermes before it invokes the wrapper; it is not copied into this skill or sent as a transcript.

## Required local state

The Mac-local Lo gateway must already be running on `127.0.0.1:4318` (or the configured `LO_GATEWAY_PORT`) with these values available in the repository `.env.local`:

- `LO_GATEWAY_HMAC_SECRET` - the same secret used by the gateway, at least 16 characters.
- `OPENAI_API_KEY` - used only by the gateway's Luna Responses request with `store: false`.
- `NOTION_LO_MEMORY_DB_ID` and the other existing Lo source configuration required by the bounded dashboard service.

The wrapper loads `.env.local` only for its own process, creates a fresh nonce, and signs this exact JSON request to `POST /v1/conversation`:

```json
{"message":"..."}
```

The gateway verifies `lo-gateway-v1` HMAC, timestamp, and nonce replay protection before parsing JSON. It then runs the existing `runLoConversation` with the same bounded dashboard adapter used by the dashboard. Free-form conversation seeds `lo.memory.search` and excludes `lo.memory.save`, so the dedicated Notion Lo Memory is read-only and no transcript is persisted.

The wrapper writes only the citation-free answer to stdout. It has no Telegram client, poller, child-process launcher, direct Notion client, or direct model client.

## Repo-only skill lifecycle

From the repository root, first verify the committed skill structure without changing any Hermes installation:

```sh
./node_modules/.bin/tsx scripts/hermes-lo/verify-skill.ts
```

`sync-skill.ts` materializes a copy and `mount-skill.ts` creates a symlink. Both reject targets outside this repository unless the caller explicitly passes `--allow-external`; neither runs automatically. This task intentionally does not invoke either script against `~/.hermes`.

## Lead-only activation

After the canonical root `LO.md` exists and the local gateway has its existing
`LO_GATEWAY_HMAC_SECRET` plus `OPENAI_API_KEY`, the lead can apply the skill to
the normal Hermes skill root without copying it:

```sh
cd /Users/TakMD/workspace/spinoscopy-dashboard
./node_modules/.bin/tsx scripts/hermes-lo/verify-skill.ts --require-persona
mkdir -p "$HOME/.hermes/skills"
./node_modules/.bin/tsx scripts/hermes-lo/mount-skill.ts "$HOME/.hermes/skills/hermes-lo" --allow-external
```

The mount is a symlink back to `skills/hermes-lo`, so repository updates are
immediately visible and no persona text is duplicated. The lead may replace
that final command with `sync-skill.ts ... --allow-external` only when their
Hermes installation cannot follow symlinks. Neither activation path installs
launchd, starts a gateway, or sends Telegram messages.
