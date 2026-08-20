import type { AiFrontierEpisode } from "@/lib/types/ai-frontier"
import type { AiFrontierCatalogEpisode } from "@/lib/types/ai-frontier-import"

import {
  assertCatalogSourceIdentity,
  assertExistingSourceIdentity,
  type AiFrontierSourceIdentity,
} from "./ai-frontier-identity"

export const DWARKESH_CATALOG_WINDOW = 20

export type AiFrontierCatalogValidationCode =
  | "duplicate-source-key"
  | "undersized-dwarkesh-catalog"
  | "ambiguous-existing-match"
  | "invalid-create-response"

export class AiFrontierCatalogValidationError extends Error {
  readonly name = "AiFrontierCatalogValidationError"

  constructor(
    message: string,
    readonly code: AiFrontierCatalogValidationCode
  ) {
    super(message)
  }
}

export type CatalogWritePlan = {
  readonly episode: AiFrontierCatalogEpisode
  readonly identity: AiFrontierSourceIdentity
  readonly existing: AiFrontierEpisode | null
}

type ValidatedCatalogRow = {
  readonly episode: AiFrontierCatalogEpisode
  readonly identity: AiFrontierSourceIdentity
  readonly inputIndex: number
}

function uniqueExistingIndex<K>(
  episodes: readonly AiFrontierEpisode[],
  key: (episode: AiFrontierEpisode) => K | null
): Map<K, AiFrontierEpisode> {
  const map = new Map<K, AiFrontierEpisode>()
  for (const episode of episodes) {
    const value = key(episode)
    if (value === null) continue
    const previous = map.get(value)
    if (previous && previous.id !== episode.id) {
      throw new AiFrontierCatalogValidationError(
        `기존 Frontier 페이지 identity가 중복되었습니다: ${String(value)}`,
        "ambiguous-existing-match"
      )
    }
    map.set(value, episode)
  }
  return map
}

function selectCatalogWindow(
  catalog: readonly AiFrontierCatalogEpisode[]
): ValidatedCatalogRow[] {
  const rows: ValidatedCatalogRow[] = []
  const seen = new Set<string>()
  for (const [inputIndex, episode] of catalog.entries()) {
    const identity = assertCatalogSourceIdentity(episode)
    if (seen.has(identity.sourceKey)) {
      throw new AiFrontierCatalogValidationError(
        `Frontier Source Key가 중복되었습니다: ${identity.sourceKey}`,
        "duplicate-source-key"
      )
    }
    seen.add(identity.sourceKey)
    rows.push({ episode, identity, inputIndex })
  }

  const aiFrontier = rows.filter(({ episode }) => episode.source === "ai-frontier")
  const dwarkeshRows = rows.filter(({ episode }) => episode.source === "dwarkesh")
  if (dwarkeshRows.length > 0 && dwarkeshRows.length < DWARKESH_CATALOG_WINDOW) {
    throw new AiFrontierCatalogValidationError(
      `Dwarkesh 카탈로그가 ${dwarkeshRows.length}개뿐입니다(필요: ${DWARKESH_CATALOG_WINDOW}).`,
      "undersized-dwarkesh-catalog"
    )
  }
  const dwarkesh = dwarkeshRows
    .sort((left, right) =>
      (right.episode.published ?? "").localeCompare(left.episode.published ?? "") ||
      left.identity.sourceKey.localeCompare(right.identity.sourceKey) ||
      left.inputIndex - right.inputIndex
    )
    .slice(0, DWARKESH_CATALOG_WINDOW)
  return [...aiFrontier, ...dwarkesh]
}

export function planCatalogWrites(
  catalog: readonly AiFrontierCatalogEpisode[],
  existingEpisodes: readonly AiFrontierEpisode[]
): CatalogWritePlan[] {
  const selected = selectCatalogWindow(catalog)
  const bySourceKey = uniqueExistingIndex(existingEpisodes, (episode) => episode.sourceKey)
  const byOfficialUrl = uniqueExistingIndex(existingEpisodes, (episode) => episode.transcriptSource)
  const byNumber = uniqueExistingIndex(existingEpisodes, (episode) => episode.episodeNumber)
  const sourceKeyByExistingPageId = new Map<string, string>()

  return selected.map(({ episode, identity }) => {
    const keyed = bySourceKey.get(identity.sourceKey)
    const linked = byOfficialUrl.get(episode.officialUrl)
    const numbered = episode.episodeNumber === null
      ? undefined
      : byNumber.get(episode.episodeNumber)
    const candidates = [keyed, linked, numbered].filter(
      (candidate): candidate is AiFrontierEpisode => candidate !== undefined
    )
    if (new Set(candidates.map((candidate) => candidate.id)).size > 1) {
      throw new AiFrontierCatalogValidationError(
        `Source Key와 migration fallback이 서로 다른 페이지를 가리킵니다: ${identity.sourceKey}`,
        "ambiguous-existing-match"
      )
    }
    const existing = keyed ?? linked ?? numbered ?? null
    if (existing) {
      assertExistingSourceIdentity({
        id: existing.id,
        sourceKey: existing.sourceKey,
        persisted: existing.sourceIdentityPersisted,
      }, identity)
      const claimedBy = sourceKeyByExistingPageId.get(existing.id)
      if (claimedBy !== undefined) {
        throw new AiFrontierCatalogValidationError(
          `서로 다른 catalog rows가 같은 기존 페이지를 가리킵니다: ${claimedBy}, ${identity.sourceKey}`,
          "ambiguous-existing-match"
        )
      }
      sourceKeyByExistingPageId.set(existing.id, identity.sourceKey)
    }
    return { episode, identity, existing }
  })
}
