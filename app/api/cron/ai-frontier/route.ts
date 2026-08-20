import { type NextRequest, NextResponse } from "next/server"

import {
  importNewDwarkeshBatch,
  type FrontierBatchResult,
} from "@/lib/andrej/frontier-batch-import"
import { getAiFrontierIndex } from "@/lib/notion/ai-frontier"
import { runAiFrontierCatalogSync } from "@/lib/notion/ai-frontier-catalog"
import type { AiFrontierIndex } from "@/lib/types/ai-frontier"

import {
  AiFrontierCronSafetyError,
  candidateFrom,
  catalogCounts,
  createdPagesFrom,
  EMPTY_IMPORT,
  safeCronError,
  selectAutomaticDwarkeshCandidates,
  type CatalogCounts,
  type CatalogRunResult,
  type SafeError,
} from "./cron-contract"

export { AiFrontierCronSafetyError, selectAutomaticDwarkeshCandidates } from "./cron-contract"

export const maxDuration = 300

type SyncRunner = typeof runAiFrontierCatalogSync
type ImportRunner = typeof importNewDwarkeshBatch
type RecoveryDependencies = {
  readonly loadIndex: () => Promise<AiFrontierIndex>
  readonly now: () => Date
}

const defaultRecoveryDependencies: RecoveryDependencies = {
  loadIndex: () => getAiFrontierIndex(),
  now: () => new Date(),
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(
    secret && request.headers.get("authorization") === `Bearer ${secret}`
  )
}

function importResponse(result: FrontierBatchResult) {
  return {
    counts: {
      completed: result.completed.length,
      failed: result.failed.length,
      skipped: result.skipped.length,
    },
    completed: result.completed,
    failed: result.failed,
    skipped: result.skipped,
  }
}

type FailureResponse = {
  readonly catalog: CatalogCounts
  readonly result: FrontierBatchResult
  readonly status: number
  readonly error?: SafeError
}

function failureResponse(input: FailureResponse) {
  return NextResponse.json({
    ok: false,
    catalog: input.catalog,
    import: importResponse(input.result),
    ...(input.error ? { error: input.error } : {}),
  }, { status: input.status })
}

export function createAiFrontierCronHandler(
  runSync: SyncRunner = runAiFrontierCatalogSync,
  runImport: ImportRunner = importNewDwarkeshBatch,
  recovery: RecoveryDependencies = defaultRecoveryDependencies
) {
  return async function handleAiFrontierCron(request: NextRequest) {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let syncResult: CatalogRunResult
    try {
      syncResult = await runSync()
    } catch (error) {
      return NextResponse.json({ error: safeCronError(error) }, { status: 500 })
    }

    const counts = catalogCounts(syncResult)
    let createdCandidates
    try {
      createdCandidates = createdPagesFrom(syncResult)
        .filter((page) => page.source === "dwarkesh")
        .map(candidateFrom)
    } catch (error) {
      return failureResponse({
        catalog: counts,
        result: EMPTY_IMPORT,
        status: 500,
        error: safeCronError(error),
      })
    }

    if (createdCandidates.length > 3) {
      return failureResponse({
        catalog: counts,
        result: EMPTY_IMPORT,
        status: 500,
        error: safeCronError(new AiFrontierCronSafetyError(
          "More than three new Dwarkesh pages were created; automatic import stopped."
        )),
      })
    }
    if ((syncResult.sourceFailures?.length ?? 0) > 0) {
      return NextResponse.json({
        ok: false,
        catalog: counts,
        import: importResponse(EMPTY_IMPORT),
        sources: syncResult.sourceFailures,
        error: {
          name: "CatalogSourceError",
          message: "One or more catalog sources failed.",
        },
      }, { status: 502 })
    }

    let candidates = createdCandidates
    if (candidates.length === 0) {
      try {
        candidates = selectAutomaticDwarkeshCandidates(
          await recovery.loadIndex(),
          recovery.now()
        )
      } catch (error) {
        return failureResponse({
          catalog: counts,
          result: EMPTY_IMPORT,
          status: 500,
          error: safeCronError(error),
        })
      }
    }
    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true,
        catalog: counts,
        import: importResponse(EMPTY_IMPORT),
      })
    }

    const [candidate, ...pending] = candidates
    if (candidate === undefined) {
      return failureResponse({
        catalog: counts,
        result: EMPTY_IMPORT,
        status: 500,
        error: safeCronError(new AiFrontierCronSafetyError(
          "Automatic import candidate is missing."
        )),
      })
    }
    let importResult: FrontierBatchResult
    try {
      importResult = await runImport([candidate])
    } catch (error) {
      return failureResponse({
        catalog: counts,
        result: EMPTY_IMPORT,
        status: 500,
        error: safeCronError(error),
      })
    }

    if (importResult.failed.length > 0) {
      return failureResponse({
        catalog: counts,
        result: importResult,
        status: 502,
      })
    }
    return NextResponse.json({
      ok: true,
      catalog: counts,
      import: importResponse(importResult),
      pending: pending.map(({ sourceKey }) => sourceKey),
    })
  }
}

export const GET = createAiFrontierCronHandler()
