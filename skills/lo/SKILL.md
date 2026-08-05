---
name: lo
description: Short Telegram command alias for the canonical Hermes Lo BJJ coach.
---

# Lo

This is the short-command alias for `hermes-lo`. Before answering, read the
canonical persona at `/Users/TakMD/workspace/spinoscopy-dashboard/LO.md`. That
file remains the sole persona source; this alias contains no copied persona
rules.

For each user request, invoke exactly one wrapper command:

```sh
cd /Users/TakMD/workspace/spinoscopy-dashboard && ./node_modules/.bin/tsx --env-file=.env.local scripts/hermes-lo/run.ts "$USER_MESSAGE"
```

Return the command's stdout verbatim. Do not add a preface, raw citations, tool
output, or a second model response.

## Boundaries

- The wrapper calls only the existing HMAC-authenticated Lo loopback gateway.
- Do not start or restart Hermes, Telegram polling, launchd, or the Lo gateway.
- Do not pass prior chat history or bypass the bounded Lo tools.
- If the wrapper exits nonzero, report the failure without substituting another
  agent.
