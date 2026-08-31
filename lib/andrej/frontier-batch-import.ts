import { analyzeAiFrontierEpisode } from "@/lib/andrej/frontier-analysis"
import { DwarkeshTranscriptNotReadyError } from "@/lib/andrej/dwarkesh-catalog"
import { fetchFrontierEpisode } from "@/lib/andrej/frontier-sources"
import { getAiFrontierIndex } from "@/lib/notion/ai-frontier"
import {
  persistAiFrontierImport,
  setAiFrontierImportStatus,
} from "@/lib/notion/ai-frontier-import"
import type { AiFrontierConcept, AiFrontierIndex } from "@/lib/types/ai-frontier"
import type {
  AiFrontierEpisodeAnalysis,
  AiFrontierImportResult,
  AiFrontierOfficialEpisode,
} from "@/lib/types/ai-frontier-import"

import {
  safeBatchDiagnostic,
  type FrontierBatchDiagnostic,
} from "./frontier-batch-diagnostic"
import {
  FrontierBatchValidationError,
  validateCandidateIdentities,
  validateCurrentCandidate,
  validateIndex,
  type DwarkeshBatchCandidate,
} from "./frontier-batch-validation"

export { type FrontierBatchDiagnostic } from "./frontier-batch-diagnostic"
export {
  FrontierBatchValidationError,
  type DwarkeshBatchCandidate,
  type FrontierBatchValidationCode,
} from "./frontier-batch-validation"

export const DWARKESH_INITIAL_SUMMARY_WINDOW = 10

export type FrontierBatchFailureReason =
  | "metadata-drift"
  | "notion-read"
  | "status"
  | "transcript"
  | "analysis"
  | "persistence"

export interface FrontierBatchFailure {
  sourceKey: string
  reason: FrontierBatchFailureReason
  detail: FrontierBatchDiagnostic
  statusUpdateFailed?: true
  statusDetail?: FrontierBatchDiagnostic
}

export interface FrontierBatchResult {
  completed: string[]
  failed: FrontierBatchFailure[]
  skipped: string[]
}

export interface FrontierBatchOptions {
  force?: boolean
}

type ImportStatus = "목록" | "수집 중" | "수집 실패"

export interface FrontierBatchDependencies {
  loadIndex(): Promise<AiFrontierIndex>
  loadEpisode(url: string): Promise<AiFrontierOfficialEpisode>
  analyze(episode: AiFrontierOfficialEpisode): Promise<AiFrontierEpisodeAnalysis>
  persist(input: {
    pageId: string
    episode: AiFrontierOfficialEpisode
    analysis: AiFrontierEpisodeAnalysis
    existingConcepts: AiFrontierConcept[]
  }): Promise<AiFrontierImportResult>
  setStatus(pageId: string, status: ImportStatus): Promise<void>
}

const defaultDependencies: FrontierBatchDependencies = {
  loadIndex: () => getAiFrontierIndex(),
  loadEpisode: (url) => fetchFrontierEpisode(url),
  analyze: (episode) => analyzeAiFrontierEpisode(episode, {
    apiKey: process.env.OPENAI_API_KEY ?? "",
  }),
  persist: (input) => persistAiFrontierImport(input),
  setStatus: (pageId, status) => setAiFrontierImportStatus(pageId, status),
}

async function markFailure(
  candidate: DwarkeshBatchCandidate,
  reason: FrontierBatchFailureReason,
  dependencies: FrontierBatchDependencies,
  collecting: boolean,
  error: unknown
): Promise<FrontierBatchFailure> {
  const failure = {
    sourceKey: candidate.sourceKey,
    reason,
    detail: safeBatchDiagnostic(error),
  }
  if (!collecting) return failure
  try {
    await dependencies.setStatus(candidate.pageId, "수집 실패")
    return failure
  } catch (statusError) {
    return {
      ...failure,
      statusUpdateFailed: true,
      statusDetail: safeBatchDiagnostic(statusError),
    }
  }
}

/**
 * Validates canonical identities and imports an already bounded Dwarkesh window
 * sequentially. Full-window Notion metadata matching finishes before transcript
 * or analysis work begins, so malformed windows have zero provider cost.
 */
export async function importDwarkeshBatch(
  candidates: readonly DwarkeshBatchCandidate[],
  options: FrontierBatchOptions = {},
  dependencies: FrontierBatchDependencies = defaultDependencies
): Promise<FrontierBatchResult> {
  validateCandidateIdentities(candidates)
  const index = await dependencies.loadIndex()
  validateIndex(candidates, index)
  const result: FrontierBatchResult = { completed: [], failed: [], skipped: [] }

  for (const candidate of candidates) {
    let currentIndex: AiFrontierIndex
    try {
      currentIndex = await dependencies.loadIndex()
      const record = validateCurrentCandidate(candidate, currentIndex)
      if (record.status === "완료" && options.force !== true) {
        result.skipped.push(candidate.sourceKey)
        continue
      }
    } catch (error) {
      const reason = error instanceof FrontierBatchValidationError &&
        error.code === "metadata-mismatch"
        ? "metadata-drift"
        : "notion-read"
      result.failed.push({
        sourceKey: candidate.sourceKey,
        reason,
        detail: safeBatchDiagnostic(error),
      })
      continue
    }

    // Re-entering `수집 중` is intentional crash recovery for every non-completed
    // page. It is not a concurrency lock or a claim that concurrent imports are safe.
    let collecting = false
    try {
      await dependencies.setStatus(candidate.pageId, "수집 중")
      collecting = true
    } catch (error) {
      result.failed.push({
        sourceKey: candidate.sourceKey,
        reason: "status",
        detail: safeBatchDiagnostic(error),
      })
      continue
    }

    let episode: AiFrontierOfficialEpisode
    try {
      episode = await dependencies.loadEpisode(candidate.officialUrl)
      if (
        episode.source !== "dwarkesh" ||
        episode.reference !== candidate.sourceKey ||
        episode.officialUrl !== candidate.officialUrl
      ) {
        throw new Error("Dwarkesh transcript identity mismatch")
      }
    } catch (error) {
      if (error instanceof DwarkeshTranscriptNotReadyError) {
        try {
          await dependencies.setStatus(candidate.pageId, "목록")
          result.skipped.push(candidate.sourceKey)
        } catch (statusError) {
          result.failed.push({
            sourceKey: candidate.sourceKey,
            reason: "status",
            detail: safeBatchDiagnostic(statusError),
          })
        }
        continue
      }
      result.failed.push(
        await markFailure(candidate, "transcript", dependencies, collecting, error)
      )
      continue
    }

    let analysis: AiFrontierEpisodeAnalysis
    try {
      analysis = await dependencies.analyze(episode)
    } catch (error) {
      result.failed.push(
        await markFailure(candidate, "analysis", dependencies, collecting, error)
      )
      continue
    }

    try {
      const persisted = await dependencies.persist({
        pageId: candidate.pageId,
        episode,
        analysis,
        existingConcepts: currentIndex.concepts,
      })
      if (persisted.status !== "완료" || persisted.reference !== candidate.sourceKey) {
        throw new Error("Dwarkesh persistence result mismatch")
      }
      result.completed.push(candidate.sourceKey)
    } catch (error) {
      result.failed.push(
        await markFailure(candidate, "persistence", dependencies, collecting, error)
      )
    }
  }

  return result
}

/** Imports only a future cron window of one to three newly created pages. */
export async function importNewDwarkeshBatch(
  candidates: readonly DwarkeshBatchCandidate[],
  dependencies: FrontierBatchDependencies = defaultDependencies
): Promise<FrontierBatchResult> {
  if (candidates.length !== 1) {
    throw new FrontierBatchValidationError(
      "Dwarkesh 자동 요약 배치는 정확히 1개여야 합니다.",
      "future-window"
    )
  }
  return importDwarkeshBatch(candidates, {}, dependencies)
}

/** Preserves the approved Todo 5 exact-10 initial backfill contract. */
export async function importNewestDwarkeshBatch(
  candidates: readonly DwarkeshBatchCandidate[],
  options: FrontierBatchOptions = {},
  dependencies: FrontierBatchDependencies = defaultDependencies
): Promise<FrontierBatchResult> {
  if (candidates.length !== DWARKESH_INITIAL_SUMMARY_WINDOW) {
    throw new FrontierBatchValidationError(
      `Dwarkesh 초기 요약 배치는 정확히 ${DWARKESH_INITIAL_SUMMARY_WINDOW}개여야 합니다.`,
      "exact-window"
    )
  }
  return importDwarkeshBatch(candidates, options, dependencies)
}
