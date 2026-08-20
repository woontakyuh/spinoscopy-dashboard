import {
  normalizeSourceKey,
  sourceKeyFromOfficialUrl,
} from "@/lib/notion/ai-frontier-identity"
import type { AiFrontierIndex } from "@/lib/types/ai-frontier"

export type DwarkeshBatchCandidate = {
  readonly pageId: string
  readonly sourceKey: string
  readonly officialUrl: string
  readonly published: string
  readonly expectedLastEditedAt?: string
}

export type FrontierBatchValidationCode =
  | "exact-window"
  | "future-window"
  | "duplicate-source-key"
  | "invalid-candidate"
  | "metadata-mismatch"
  | "index-unavailable"

export class FrontierBatchValidationError extends Error {
  readonly name = "FrontierBatchValidationError"

  constructor(
    message: string,
    readonly code: FrontierBatchValidationCode
  ) {
    super(message)
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function validateCandidateIdentities(
  candidates: readonly DwarkeshBatchCandidate[]
): void {
  const seen = new Set<string>()
  let previousPublished: string | null = null
  for (const candidate of candidates) {
    if (seen.has(candidate.sourceKey)) {
      throw new FrontierBatchValidationError(
        "Dwarkesh Source Key가 중복되었습니다.",
        "duplicate-source-key"
      )
    }
    seen.add(candidate.sourceKey)

    const normalized = normalizeSourceKey(candidate.sourceKey)
    const urlKey = sourceKeyFromOfficialUrl(candidate.officialUrl)
    const parsedDate = new Date(`${candidate.published}T00:00:00Z`)
    const validDate = ISO_DATE.test(candidate.published) &&
      !Number.isNaN(parsedDate.getTime()) &&
      parsedDate.toISOString().slice(0, 10) === candidate.published
    if (
      candidate.pageId.trim() === "" ||
      normalized !== candidate.sourceKey ||
      !candidate.sourceKey.startsWith("DWARKESH:") ||
      urlKey !== candidate.sourceKey ||
      !validDate ||
      (previousPublished !== null && candidate.published > previousPublished)
    ) {
      throw new FrontierBatchValidationError(
        "Dwarkesh 배치 후보가 정규 source identity 또는 최신순 계약을 위반했습니다.",
        "invalid-candidate"
      )
    }
    previousPublished = candidate.published
  }
}

function matchesCandidate(
  candidate: DwarkeshBatchCandidate,
  record: AiFrontierIndex["episodes"][number] | undefined
): record is AiFrontierIndex["episodes"][number] {
  return record !== undefined &&
    record.source === "dwarkesh" &&
    record.sourceKey === candidate.sourceKey &&
    record.transcriptSource === candidate.officialUrl &&
    record.published === candidate.published &&
    (candidate.expectedLastEditedAt === undefined ||
      record.lastEditedAt === candidate.expectedLastEditedAt)
}

function assertAvailable(index: AiFrontierIndex): void {
  if (index.sources.episodes !== "ok" || index.sources.concepts !== "ok") {
    throw new FrontierBatchValidationError(
      "Frontier Notion index를 읽지 못했습니다.",
      "index-unavailable"
    )
  }
}

export function validateIndex(
  candidates: readonly DwarkeshBatchCandidate[],
  index: AiFrontierIndex
): void {
  assertAvailable(index)
  const records = new Map(index.episodes.map((episode) => [episode.id, episode]))
  for (const candidate of candidates) {
    if (!matchesCandidate(candidate, records.get(candidate.pageId))) {
      throw new FrontierBatchValidationError(
        "Dwarkesh 배치 후보와 저장된 metadata가 일치하지 않습니다.",
        "metadata-mismatch"
      )
    }
  }
}

export function validateCurrentCandidate(
  candidate: DwarkeshBatchCandidate,
  index: AiFrontierIndex
): AiFrontierIndex["episodes"][number] {
  assertAvailable(index)
  const record = index.episodes.find((episode) => episode.id === candidate.pageId)
  if (!matchesCandidate(candidate, record)) {
    throw new FrontierBatchValidationError(
      "현재 Dwarkesh 후보와 저장된 metadata가 일치하지 않습니다.",
      "metadata-mismatch"
    )
  }
  return record
}
