import type { AiFrontierEpisode } from "@/lib/types/ai-frontier"
import type { AiFrontierCatalogEpisode } from "@/lib/types/ai-frontier-import"

import type { AiFrontierSchemaConflict, AiFrontierSchemaResult } from "./ai-frontier-schema"
import {
  AI_FRONTIER_BACKFILL_METADATA_WINDOW,
  AI_FRONTIER_BACKFILL_SUMMARY_WINDOW,
  failAiFrontierBackfill,
  selectAiFrontierBackfillMetadata,
  validateExistingBackfillEpisodes,
  type ValidDwarkeshRow,
} from "./ai-frontier-backfill-validation"

export {
  AI_FRONTIER_BACKFILL_METADATA_WINDOW,
  AI_FRONTIER_BACKFILL_SUMMARY_WINDOW,
  AiFrontierBackfillPreviewError,
  failAiFrontierBackfill,
  selectAiFrontierBackfillMetadata,
} from "./ai-frontier-backfill-validation"
export type { AiFrontierBackfillPreviewErrorCode } from "./ai-frontier-backfill-validation"

export type AiFrontierBackfillMode = "dryRun" | "apply"

export type AiFrontierBackfillTranscriptResult = {
  readonly sourceKey: string
  readonly status: "ready" | "missing"
}

export type AiFrontierBackfillOrderedEntry = {
  readonly sourceKey: string
  readonly published: string
}

type CountedKeys = {
  readonly count: number
  readonly sourceKeys: readonly string[]
}

export type AiFrontierBackfillExecution = {
  readonly schema: { readonly writes: number; readonly applied: number }
  readonly catalog: {
    readonly created: number
    readonly updated: number
    readonly unchanged: number
  }
  readonly summaries: {
    readonly completed: number
    readonly failed: number
    readonly skipped: number
    readonly analysisCalls: number
  }
}

export type AiFrontierBackfillPreview = {
  readonly mode: AiFrontierBackfillMode
  readonly metadataWindow: 20
  readonly summaryWindow: 10
  readonly schema: {
    readonly additions: { readonly count: number; readonly properties: readonly string[] }
    readonly conflicts: { readonly count: number; readonly entries: readonly AiFrontierSchemaConflict[] }
  }
  readonly aiFrontierIdentityUpdates: CountedKeys
  readonly dwarkesh: {
    readonly creates: CountedKeys
    readonly updates: CountedKeys
    readonly skips: CountedKeys
  }
  readonly metadataCount: 20
  readonly metadata: readonly AiFrontierBackfillOrderedEntry[]
  readonly transcripts: {
    readonly checked: 20
    readonly ready: CountedKeys
    readonly missing: CountedKeys
  }
  readonly summaryCandidateCount: 10
  readonly summaryCandidates: readonly AiFrontierBackfillOrderedEntry[]
  readonly execution: AiFrontierBackfillExecution | null
  readonly deletes: 0
}

export type AiFrontierBackfillPlanInput = {
  readonly mode: AiFrontierBackfillMode
  readonly schema: AiFrontierSchemaResult
  readonly catalog: AiFrontierCatalogEpisode[]
  readonly existingEpisodes: AiFrontierEpisode[]
  readonly transcripts: readonly AiFrontierBackfillTranscriptResult[]
}

function metadataChanged(catalog: AiFrontierCatalogEpisode, existing: AiFrontierEpisode): boolean {
  return !existing.sourceIdentityPersisted || existing.source !== catalog.source ||
    existing.sourceKey !== catalog.reference || existing.name !== catalog.name ||
    existing.transcriptSource !== catalog.officialUrl || existing.published !== catalog.published ||
    (catalog.duration !== null && existing.duration !== catalog.duration) ||
    (catalog.youtube !== null && existing.youtube !== catalog.youtube)
}

function counted(sourceKeys: readonly string[]): CountedKeys {
  return { count: sourceKeys.length, sourceKeys }
}

function auditedTranscriptKeys(
  selected: readonly ValidDwarkeshRow[],
  transcripts: readonly AiFrontierBackfillTranscriptResult[]
): { readonly ready: readonly string[]; readonly missing: readonly string[] } {
  const statusByKey = new Map<string, AiFrontierBackfillTranscriptResult["status"]>()
  for (const result of transcripts) {
    if (statusByKey.has(result.sourceKey)) {
      failAiFrontierBackfill(`전사 감사 결과가 중복되었습니다: ${result.sourceKey}`, "invalid-transcript-audit")
    }
    statusByKey.set(result.sourceKey, result.status)
  }
  if (statusByKey.size !== selected.length || selected.some(({ sourceKey }) => !statusByKey.has(sourceKey))) {
    failAiFrontierBackfill("전사 감사 결과가 metadata window와 정확히 일치하지 않습니다.", "invalid-transcript-audit")
  }
  const ready = selected.filter(({ sourceKey }) => statusByKey.get(sourceKey) === "ready").map(({ sourceKey }) => sourceKey)
  const missing = selected.filter(({ sourceKey }) => statusByKey.get(sourceKey) === "missing").map(({ sourceKey }) => sourceKey)
  if (ready.length < AI_FRONTIER_BACKFILL_SUMMARY_WINDOW) {
    failAiFrontierBackfill(
      `전사 준비 완료 에피소드가 ${ready.length}개뿐입니다(필요: ${AI_FRONTIER_BACKFILL_SUMMARY_WINDOW}).`,
      "undersized-transcript-window"
    )
  }
  return { ready, missing }
}

export function planAiFrontierBackfillPreview(input: AiFrontierBackfillPlanInput): AiFrontierBackfillPreview {
  if (input.schema.mode !== "dryRun" || input.schema.writes !== 0 || input.schema.applied.length !== 0) {
    failAiFrontierBackfill("스키마 preview가 읽기 전용 결과가 아닙니다.", "invalid-schema-preview")
  }
  validateExistingBackfillEpisodes(input.existingEpisodes)
  const selected = selectAiFrontierBackfillMetadata(input.catalog)
  const transcriptKeys = auditedTranscriptKeys(selected, input.transcripts)
  const byKey = new Map(input.existingEpisodes.map((row) => [row.sourceKey, row]))
  const byUrl = new Map<string, AiFrontierEpisode>()
  for (const row of input.existingEpisodes) {
    if (row.transcriptSource !== null) byUrl.set(row.transcriptSource, row)
  }
  const creates: string[] = []
  const updates: string[] = []
  const skips: string[] = []
  for (const row of selected) {
    const keyed = byKey.get(row.sourceKey)
    const linked = byUrl.get(row.episode.officialUrl)
    if (keyed !== undefined && linked !== undefined && keyed.id !== linked.id) {
      failAiFrontierBackfill(`Source Key와 URL이 서로 다른 기존 페이지를 가리킵니다: ${row.sourceKey}`, "identity-conflict")
    }
    const existing = keyed ?? linked
    if (existing === undefined) creates.push(row.sourceKey)
    else if (existing.sourceKey !== row.sourceKey || existing.source !== "dwarkesh") {
      failAiFrontierBackfill(`기존 페이지 정체성이 충돌합니다: ${existing.id}`, "identity-conflict")
    } else if (metadataChanged(row.episode, existing)) updates.push(row.sourceKey)
    else skips.push(row.sourceKey)
  }
  const identityUpdates: string[] = []
  for (const row of input.existingEpisodes) {
    if (row.source !== "ai-frontier" || row.sourceIdentityPersisted) continue
    if (row.sourceKey === null) {
      failAiFrontierBackfill("AI Frontier 레거시 행의 Source Key를 안전하게 유도할 수 없습니다.", "identity-conflict")
    }
    identityUpdates.push(row.sourceKey)
  }
  identityUpdates.sort()
  const metadata = selected.map(({ sourceKey, published }) => ({ sourceKey, published }))
  const readySet = new Set(transcriptKeys.ready)
  return {
    mode: input.mode,
    metadataWindow: AI_FRONTIER_BACKFILL_METADATA_WINDOW,
    summaryWindow: AI_FRONTIER_BACKFILL_SUMMARY_WINDOW,
    schema: {
      additions: { count: input.schema.planned.length, properties: input.schema.planned.map(({ property }) => property) },
      conflicts: { count: input.schema.conflicts.length, entries: input.schema.conflicts },
    },
    aiFrontierIdentityUpdates: counted(identityUpdates),
    dwarkesh: { creates: counted(creates), updates: counted(updates), skips: counted(skips) },
    metadataCount: AI_FRONTIER_BACKFILL_METADATA_WINDOW,
    metadata,
    transcripts: {
      checked: AI_FRONTIER_BACKFILL_METADATA_WINDOW,
      ready: counted(transcriptKeys.ready),
      missing: counted(transcriptKeys.missing),
    },
    summaryCandidateCount: AI_FRONTIER_BACKFILL_SUMMARY_WINDOW,
    summaryCandidates: metadata.filter(({ sourceKey }) => readySet.has(sourceKey)).slice(0, AI_FRONTIER_BACKFILL_SUMMARY_WINDOW),
    execution: null,
    deletes: 0,
  }
}
