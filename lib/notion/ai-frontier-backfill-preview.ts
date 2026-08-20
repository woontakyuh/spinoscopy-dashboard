import { DwarkeshTranscriptNotReadyError } from "@/lib/andrej/dwarkesh-catalog"
import { importNewestDwarkeshBatch, type DwarkeshBatchCandidate, type FrontierBatchResult } from "@/lib/andrej/frontier-batch-import"
import { fetchFrontierCatalog, fetchFrontierEpisode } from "@/lib/andrej/frontier-sources"
import type { AiFrontierEpisode, AiFrontierIndex } from "@/lib/types/ai-frontier"
import type { AiFrontierCatalogEpisode, AiFrontierOfficialEpisode } from "@/lib/types/ai-frontier-import"

import { getAiFrontierIndex } from "./ai-frontier"
import {
  syncAiFrontierCatalog,
  type CatalogSyncResult,
} from "./ai-frontier-catalog"
import {
  AI_FRONTIER_BACKFILL_METADATA_WINDOW,
  AI_FRONTIER_BACKFILL_SUMMARY_WINDOW,
  AiFrontierBackfillPreviewError,
  failAiFrontierBackfill,
  planAiFrontierBackfillPreview,
  selectAiFrontierBackfillMetadata,
  type AiFrontierBackfillExecution,
  type AiFrontierBackfillMode,
  type AiFrontierBackfillOrderedEntry,
  type AiFrontierBackfillPlanInput,
  type AiFrontierBackfillPreview,
  type AiFrontierBackfillPreviewErrorCode,
  type AiFrontierBackfillTranscriptResult,
} from "./ai-frontier-backfill-plan"
import {
  migrateAiFrontierEpisodesSchema,
  type AiFrontierSchemaResult,
} from "./ai-frontier-schema"

export {
  AI_FRONTIER_BACKFILL_METADATA_WINDOW,
  AI_FRONTIER_BACKFILL_SUMMARY_WINDOW,
  AiFrontierBackfillPreviewError,
  planAiFrontierBackfillPreview,
}
export type {
  AiFrontierBackfillExecution,
  AiFrontierBackfillMode,
  AiFrontierBackfillOrderedEntry,
  AiFrontierBackfillPlanInput,
  AiFrontierBackfillPreview,
  AiFrontierBackfillPreviewErrorCode,
  AiFrontierBackfillTranscriptResult,
}

export type AiFrontierBackfillCliOptions = {
  readonly mode: AiFrontierBackfillMode
}

export interface AiFrontierBackfillApplyDependencies {
  migrateSchema(): Promise<AiFrontierSchemaResult>
  syncCatalog(
    catalog: AiFrontierCatalogEpisode[],
    existingEpisodes: AiFrontierEpisode[]
  ): Promise<CatalogSyncResult>
  loadIndex(): Promise<AiFrontierIndex>
  importSummaries(candidates: readonly DwarkeshBatchCandidate[]): Promise<FrontierBatchResult>
}

export interface AiFrontierBackfillPreviewDependencies {
  loadSchemaPreview(): Promise<AiFrontierSchemaResult>
  loadCatalog(): Promise<AiFrontierCatalogEpisode[]>
  loadExistingEpisodes(): Promise<AiFrontierEpisode[]>
  loadTranscript(episode: AiFrontierCatalogEpisode): Promise<AiFrontierOfficialEpisode>
  apply: AiFrontierBackfillApplyDependencies
}

const defaultDependencies: AiFrontierBackfillPreviewDependencies = {
  loadSchemaPreview: () => migrateAiFrontierEpisodesSchema({ mode: "dryRun" }),
  loadCatalog: () => fetchFrontierCatalog(),
  loadExistingEpisodes: async () => {
    const index = await getAiFrontierIndex()
    if (index.sources.episodes !== "ok") {
      failAiFrontierBackfill("AI Frontier Episodes DB를 읽지 못했습니다.", "episodes-unavailable")
    }
    return index.episodes
  },
  loadTranscript: (episode) => fetchFrontierEpisode(episode.officialUrl),
  apply: {
    migrateSchema: () => migrateAiFrontierEpisodesSchema({ mode: "apply" }),
    syncCatalog: (catalog, existingEpisodes) => syncAiFrontierCatalog(catalog, existingEpisodes),
    loadIndex: () => getAiFrontierIndex(),
    importSummaries: (candidates) => importNewestDwarkeshBatch(candidates),
  },
}

export function parseAiFrontierBackfillArgs(argv: readonly string[]): AiFrontierBackfillCliOptions {
  const unknown = argv.find((arg) => arg !== "--dry-run" && arg !== "--apply")
  if (unknown !== undefined) failAiFrontierBackfill(`알 수 없는 인자입니다: ${unknown}`, "unknown-flag")
  const dryRuns = argv.filter((arg) => arg === "--dry-run").length
  const applies = argv.filter((arg) => arg === "--apply").length
  if (dryRuns === 0 && applies === 0) {
    failAiFrontierBackfill("--dry-run 또는 --apply 중 하나를 명시해야 합니다.", "mode-required")
  }
  if (dryRuns + applies !== 1) {
    failAiFrontierBackfill("--dry-run 또는 --apply 중 정확히 하나만 명시해야 합니다.", "mode-ambiguous")
  }
  return { mode: dryRuns === 1 ? "dryRun" : "apply" }
}

function assertNever(value: never): never {
  return failAiFrontierBackfill(`처리할 수 없는 감사 결과입니다: ${String(value)}`, "invalid-transcript-audit")
}

function validTranscript(
  expected: AiFrontierCatalogEpisode,
  actual: AiFrontierOfficialEpisode
): boolean {
  return actual.source === expected.source && actual.reference === expected.reference &&
    actual.officialUrl === expected.officialUrl && actual.transcript.trim() !== ""
}

async function auditTranscripts(
  catalog: readonly AiFrontierCatalogEpisode[],
  loadTranscript: AiFrontierBackfillPreviewDependencies["loadTranscript"]
): Promise<readonly AiFrontierBackfillTranscriptResult[]> {
  const selected = selectAiFrontierBackfillMetadata(catalog)
  const settled = await Promise.allSettled(selected.map(({ episode }) => loadTranscript(episode)))
  return selected.map(({ episode, sourceKey }, index) => {
    const result = settled[index]
    if (result === undefined) {
      failAiFrontierBackfill("전사 감사 결과가 누락되었습니다.", "invalid-transcript-audit")
    }
    switch (result.status) {
      case "fulfilled":
        if (!validTranscript(episode, result.value)) {
          failAiFrontierBackfill(`전사 감사 결과가 원본 metadata와 일치하지 않습니다: ${sourceKey}`, "invalid-transcript")
        }
        return { sourceKey, status: "ready" }
      case "rejected":
        if (result.reason instanceof DwarkeshTranscriptNotReadyError) {
          return { sourceKey, status: "missing" }
        }
        failAiFrontierBackfill(`전사 감사 요청에 실패했습니다: ${sourceKey}`, "transcript-audit-failed")
      default:
        return assertNever(result)
    }
  })
}

function candidatesForApply(
  summaryCandidates: readonly AiFrontierBackfillOrderedEntry[],
  catalog: readonly AiFrontierCatalogEpisode[],
  index: AiFrontierIndex
): readonly DwarkeshBatchCandidate[] {
  if (index.sources.episodes !== "ok" || index.sources.concepts !== "ok") {
    failAiFrontierBackfill("적용 후 Frontier index를 읽지 못했습니다.", "episodes-unavailable")
  }
  const catalogByKey = new Map(catalog.map((row) => [row.reference, row]))
  const episodeByKey = new Map<string, AiFrontierEpisode>()
  for (const row of index.episodes) {
    if (row.sourceKey !== null) episodeByKey.set(row.sourceKey, row)
  }
  return summaryCandidates.map(({ sourceKey, published }) => {
    const catalogRow = catalogByKey.get(sourceKey)
    const persisted = episodeByKey.get(sourceKey)
    if (
      catalogRow === undefined || persisted === undefined ||
      persisted.source !== "dwarkesh" || persisted.transcriptSource !== catalogRow.officialUrl ||
      persisted.published !== published
    ) {
      failAiFrontierBackfill(`적용 후 요약 후보를 찾을 수 없습니다: ${sourceKey}`, "applied-candidate-missing")
    }
    return {
      pageId: persisted.id,
      sourceKey,
      officialUrl: catalogRow.officialUrl,
      published,
    }
  })
}

function observedAnalysisCalls(result: FrontierBatchResult): number {
  return result.completed.length + result.failed.filter(({ reason }) =>
    reason === "analysis" || reason === "persistence"
  ).length
}

type AiFrontierBackfillApplyContext = {
  readonly preview: AiFrontierBackfillPreview
  readonly catalog: AiFrontierCatalogEpisode[]
  readonly existingEpisodes: AiFrontierEpisode[]
  readonly dependencies: AiFrontierBackfillApplyDependencies
}

async function executeApply(context: AiFrontierBackfillApplyContext): Promise<AiFrontierBackfillExecution> {
  const { preview, catalog, existingEpisodes, dependencies } = context
  const schema = await dependencies.migrateSchema()
  if (schema.mode !== "apply" || schema.conflicts.length > 0) {
    failAiFrontierBackfill("적용 스키마 결과가 안전하지 않습니다.", "invalid-schema-apply")
  }
  const catalogResult = await dependencies.syncCatalog(catalog, existingEpisodes)
  const index = await dependencies.loadIndex()
  const candidates = candidatesForApply(preview.summaryCandidates, catalog, index)
  const summaries = await dependencies.importSummaries(candidates)
  return {
    schema: { writes: schema.writes, applied: schema.applied.length },
    catalog: {
      created: catalogResult.created,
      updated: catalogResult.updated,
      unchanged: catalogResult.unchanged,
    },
    summaries: {
      completed: summaries.completed.length,
      failed: summaries.failed.length,
      skipped: summaries.skipped.length,
      analysisCalls: observedAnalysisCalls(summaries),
    },
  }
}

export async function runAiFrontierBackfillPreview(
  options: AiFrontierBackfillCliOptions,
  dependencies: AiFrontierBackfillPreviewDependencies = defaultDependencies
): Promise<AiFrontierBackfillPreview> {
  const [schema, catalog, existingEpisodes] = await Promise.all([
    dependencies.loadSchemaPreview(),
    dependencies.loadCatalog(),
    dependencies.loadExistingEpisodes(),
  ])
  const transcripts = await auditTranscripts(catalog, dependencies.loadTranscript)
  const preview = planAiFrontierBackfillPreview({
    mode: options.mode, schema, catalog, existingEpisodes, transcripts,
  })
  if (options.mode === "dryRun") return preview
  if (preview.schema.conflicts.count > 0) {
    failAiFrontierBackfill("스키마 충돌이 있어 apply를 시작하지 않습니다.", "schema-conflict")
  }
  const execution = await executeApply({
    preview,
    catalog,
    existingEpisodes,
    dependencies: dependencies.apply,
  })
  return { ...preview, execution }
}
