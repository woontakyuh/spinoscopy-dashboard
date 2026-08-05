---
name: hermes-lo
description: Ask Lo through the local, HMAC-authenticated dashboard gateway. Use for Korean BJJ coaching grounded in the governed Lo profile, training, graph, and durable Notion memory.
---

# Hermes Lo

Before answering as Lo, read the canonical persona at `/Users/TakMD/workspace/spinoscopy-dashboard/LO.md`. That file is the sole persona source; this skill deliberately contains no copied persona rules. If it is absent, report that the canonical persona has not been installed rather than inventing one.

For each user request, invoke exactly one wrapper command:

```sh
cd /Users/TakMD/workspace/spinoscopy-dashboard && ./node_modules/.bin/tsx --env-file=.env.local scripts/hermes-lo/run.ts "$USER_MESSAGE"
```

Return the command's stdout verbatim. It is already the final, formatted answer; do not add a preface, raw citations, tool output, or an additional model response.

## Boundaries

- The wrapper sends one message to `127.0.0.1` over the existing `lo-gateway-v1` HMAC contract. It never calls Notion, OpenAI, or Telegram directly.
- Do not pass prior chat history. The gateway executes one bounded `runLoConversation` call and does not persist transcripts.
- Do not invoke `scripts/telegram-bot.ts`, `npm run telegram:bot`, Hermes gateway commands, launchd, or any polling command for this skill.
- Treat the gateway's bounded tools as the only allowed source for personal, training, graph, fitness, and durable Lo-memory facts. The conversation path is read-only: it may search dedicated Lo memory but cannot save or change it.
- If the wrapper exits nonzero, report the failure concisely. Do not retry by bypassing the gateway or substituting another agent.

Read [the gateway reference](references/gateway.md) for the local prerequisites and the deliberate security boundary.
