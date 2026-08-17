import { type NextRequest, NextResponse } from "next/server"

import { runAiFrontierCatalogSync } from "@/lib/notion/ai-frontier-catalog"

type SyncRunner = typeof runAiFrontierCatalogSync

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(
    secret && request.headers.get("authorization") === `Bearer ${secret}`
  )
}

export function createAiFrontierCronHandler(
  runSync: SyncRunner = runAiFrontierCatalogSync
) {
  return async function handleAiFrontierCron(request: NextRequest) {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
      return NextResponse.json({ ok: true, ...await runSync() })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}

export const GET = createAiFrontierCronHandler()
