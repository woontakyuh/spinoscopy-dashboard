import type { AiFrontierEpisode } from "@/lib/types/ai-frontier"
import type { AiFrontierCatalogEpisode } from "@/lib/types/ai-frontier-import"

import {
  assertCatalogSourceIdentity,
  sourceKeyFromOfficialUrl,
  sourceOfSourceKey,
} from "./ai-frontier-identity"

export const AI_FRONTIER_BACKFILL_METADATA_WINDOW = 20
export const AI_FRONTIER_BACKFILL_SUMMARY_WINDOW = 10

export type AiFrontierBackfillPreviewErrorCode =
  | "mode-required"
  | "mode-ambiguous"
  | "unknown-flag"
  | "schema-conflict"
  | "invalid-schema-preview"
  | "invalid-schema-apply"
  | "episodes-unavailable"
  | "invalid-catalog-row"
  | "undersized-catalog"
  | "undersized-transcript-window"
  | "transcript-audit-failed"
  | "invalid-transcript"
  | "invalid-transcript-audit"
  | "duplicate-source-key"
  | "identity-conflict"
  | "applied-candidate-missing"

export class AiFrontierBackfillPreviewError extends Error {
  readonly name = "AiFrontierBackfillPreviewError"

  constructor(
    message: string,
    readonly code: AiFrontierBackfillPreviewErrorCode
  ) {
    super(message)
  }
}

export type ValidDwarkeshRow = {
  readonly episode: AiFrontierCatalogEpisode
  readonly sourceKey: string
  readonly published: string
}

export function failAiFrontierBackfill(
  message: string,
  code: AiFrontierBackfillPreviewErrorCode
): never {
  throw new AiFrontierBackfillPreviewError(message, code)
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

export function selectAiFrontierBackfillMetadata(
  catalog: readonly AiFrontierCatalogEpisode[]
): readonly ValidDwarkeshRow[] {
  const rows: ValidDwarkeshRow[] = []
  const seen = new Set<string>()
  for (const [index, episode] of catalog.entries()) {
    if (episode.source !== "dwarkesh") continue
    if (
      episode.name.trim() === "" || episode.episodeNumber !== null ||
      episode.published === null || !validIsoDate(episode.published)
    ) {
      failAiFrontierBackfill(
        `Dwarkesh 카탈로그 ${index + 1}번째 행의 필수 메타데이터가 올바르지 않습니다.`,
        "invalid-catalog-row"
      )
    }
    let sourceKey: string
    try {
      sourceKey = assertCatalogSourceIdentity(episode).sourceKey
    } catch {
      failAiFrontierBackfill(
        `Dwarkesh 카탈로그 ${index + 1}번째 행의 정체성이 충돌합니다.`,
        "identity-conflict"
      )
    }
    if (sourceKeyFromOfficialUrl(episode.officialUrl) !== sourceKey) {
      failAiFrontierBackfill(`Dwarkesh 공식 URL이 Source Key와 일치하지 않습니다: ${sourceKey}`, "identity-conflict")
    }
    if (seen.has(sourceKey)) {
      failAiFrontierBackfill(`Dwarkesh Source Key가 중복되었습니다: ${sourceKey}`, "duplicate-source-key")
    }
    seen.add(sourceKey)
    rows.push({ episode, sourceKey, published: episode.published })
  }
  if (rows.length < AI_FRONTIER_BACKFILL_METADATA_WINDOW) {
    failAiFrontierBackfill(
      `유효한 Dwarkesh 에피소드가 ${rows.length}개뿐입니다(필요: ${AI_FRONTIER_BACKFILL_METADATA_WINDOW}).`,
      "undersized-catalog"
    )
  }
  return rows
    .sort((left, right) =>
      right.published.localeCompare(left.published) || left.sourceKey.localeCompare(right.sourceKey)
    )
    .slice(0, AI_FRONTIER_BACKFILL_METADATA_WINDOW)
}

export function validateExistingBackfillEpisodes(episodes: readonly AiFrontierEpisode[]): void {
  const pageByKey = new Map<string, string>()
  for (const episode of episodes) {
    if (episode.sourceKey === null) {
      if (episode.sourceIdentityPersisted) {
        failAiFrontierBackfill(`저장된 Source Key가 없습니다: ${episode.id}`, "identity-conflict")
      }
      continue
    }
    if (sourceOfSourceKey(episode.sourceKey) !== episode.source) {
      failAiFrontierBackfill(`저장된 Source와 Source Key가 충돌합니다: ${episode.id}`, "identity-conflict")
    }
    const urlKey = sourceKeyFromOfficialUrl(episode.transcriptSource)
    if (urlKey !== null && urlKey !== episode.sourceKey) {
      failAiFrontierBackfill(`저장된 URL과 Source Key가 충돌합니다: ${episode.id}`, "identity-conflict")
    }
    const previousPage = pageByKey.get(episode.sourceKey)
    if (previousPage !== undefined && previousPage !== episode.id) {
      failAiFrontierBackfill(`기존 Source Key가 중복되었습니다: ${episode.sourceKey}`, "identity-conflict")
    }
    pageByKey.set(episode.sourceKey, episode.id)
  }
}
