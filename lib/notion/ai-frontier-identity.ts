// Frontier Episodes의 정규 소스 정체성(`Source`, `Source Key`) 규칙.
// 읽기는 절대 실패하지 않고 레거시 값(Episode 번호, 공식 URL)으로 안전하게 되돌아가며,
// 쓰기는 정체성이 어긋나면 첫 변이 이전에 거부한다.
import type { AiFrontierSource } from "@/lib/types/ai-frontier-import"

/** Notion에 저장되는 정체성 속성 이름. 스키마 마이그레이터와 같은 값을 쓴다. */
export const AI_FRONTIER_SOURCE_PROPERTY = "Source"
export const AI_FRONTIER_SOURCE_KEY_PROPERTY = "Source Key"

const AI_FRONTIER_ORIGIN = "https://aifrontier.kr"
const DWARKESH_ORIGIN = "https://www.dwarkesh.com"
const AI_FRONTIER_EPISODE_PATH = /^\/ko\/episodes\/ep(\d+)$/
const DWARKESH_EPISODE_PATH = /^\/p\/([^/]+)$/
const EPISODE_KEY = /^EP\s*(\d+)$/
const DWARKESH_KEY = /^DWARKESH:[A-Z0-9][A-Z0-9._-]*$/

export interface AiFrontierSourceIdentity {
  source: AiFrontierSource
  sourceKey: string
}

/** 읽기에서 해석된 정체성. `persisted`는 Notion에 실제로 저장된 값인지 나타낸다. */
export interface AiFrontierResolvedSourceIdentity {
  source: AiFrontierSource
  sourceKey: string | null
  persisted: boolean
}

export interface AiFrontierPersistedSourceInput {
  /** Notion `Source` select 원문 */
  source: string | null
  /** Notion `Source Key` rich_text 원문 */
  sourceKey: string | null
  /** Notion `Episode` (레거시 fallback) */
  episodeNumber: number | null
  /** Notion `Transcript Source` (레거시 fallback) */
  transcriptSource: string | null
}

export interface AiFrontierCatalogSourceInput {
  source: AiFrontierSource
  reference: string
  officialUrl: string
}

export interface AiFrontierExistingSourceInput {
  id: string
  sourceKey: string | null
  persisted: boolean
}

export type AiFrontierSourceConflictReason =
  | "malformed-source-key"
  | "source-mismatch"
  | "official-url-mismatch"
  | "existing-source-key-mismatch"

export interface AiFrontierSourceConflictDetail {
  reason: AiFrontierSourceConflictReason
  expected: string | null
  actual: string | null
  pageId?: string
}

export class AiFrontierSourceConflictError extends Error {
  readonly name = "AiFrontierSourceConflictError"
  readonly detail: AiFrontierSourceConflictDetail

  constructor(detail: AiFrontierSourceConflictDetail) {
    super(
      `Frontier 소스 정체성이 충돌했습니다(${detail.reason}): ` +
        `expected=${detail.expected ?? "none"} actual=${detail.actual ?? "none"}` +
        (detail.pageId ? ` page=${detail.pageId}` : "")
    )
    this.detail = detail
  }
}

/** 정규 Source Key로 정규화한다. 형식을 벗어나면 null이며 예외를 던지지 않는다. */
export function normalizeSourceKey(value: string | null | undefined): string | null {
  const candidate = value?.trim().toUpperCase() ?? ""
  if (candidate === "") return null
  const episode = candidate.match(EPISODE_KEY)
  if (episode) return `EP${Number(episode[1])}`
  return DWARKESH_KEY.test(candidate) ? candidate : null
}

/** 정규 Source Key가 가리키는 출처. 정규 형식이 아니면 null. */
export function sourceOfSourceKey(key: string): AiFrontierSource | null {
  const normalized = normalizeSourceKey(key)
  if (normalized === null) return null
  return normalized.startsWith("DWARKESH:") ? "dwarkesh" : "ai-frontier"
}

/** 공식 URL에서 정규 Source Key를 유도한다. 공식 형식이 아니면 null. */
export function sourceKeyFromOfficialUrl(value: string | null | undefined): string | null {
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.origin === DWARKESH_ORIGIN) {
    const slug = url.pathname.match(DWARKESH_EPISODE_PATH)?.[1]
    return slug ? normalizeSourceKey(`DWARKESH:${slug}`) : null
  }
  if (url.origin === AI_FRONTIER_ORIGIN) {
    const number = url.pathname.match(AI_FRONTIER_EPISODE_PATH)?.[1]
    return number ? normalizeSourceKey(`EP${number}`) : null
  }
  return null
}

function knownSource(value: string | null): AiFrontierSource | null {
  return value === "ai-frontier" || value === "dwarkesh" ? value : null
}

/**
 * 저장된 `Source`/`Source Key`를 우선 사용하고, 없거나 깨졌으면 레거시 값으로 되돌아간다.
 * 정체성 판단의 기준은 정규 키이므로 select가 키와 어긋나면 키를 따른다.
 */
export function resolveEpisodeSourceIdentity(
  input: AiFrontierPersistedSourceInput
): AiFrontierResolvedSourceIdentity {
  const persistedSource = knownSource(input.source)
  const persistedKey = normalizeSourceKey(input.sourceKey)
  if (persistedKey !== null) {
    const source = sourceOfSourceKey(persistedKey) ?? "ai-frontier"
    return { source, sourceKey: persistedKey, persisted: persistedSource === source }
  }

  const legacyKey =
    sourceKeyFromOfficialUrl(input.transcriptSource) ??
    (input.episodeNumber === null ? null : normalizeSourceKey(`EP${input.episodeNumber}`))
  if (legacyKey !== null) {
    return {
      source: sourceOfSourceKey(legacyKey) ?? "ai-frontier",
      sourceKey: legacyKey,
      persisted: false,
    }
  }

  return { source: persistedSource ?? "ai-frontier", sourceKey: null, persisted: false }
}

/** 카탈로그 항목의 정체성을 검증한다. 어긋나면 어떤 쓰기보다 먼저 거부한다. */
export function assertCatalogSourceIdentity(
  episode: AiFrontierCatalogSourceInput
): AiFrontierSourceIdentity {
  const sourceKey = normalizeSourceKey(episode.reference)
  if (sourceKey === null) {
    throw new AiFrontierSourceConflictError({
      reason: "malformed-source-key",
      expected: null,
      actual: episode.reference,
    })
  }
  const keySource = sourceOfSourceKey(sourceKey)
  if (keySource !== episode.source) {
    throw new AiFrontierSourceConflictError({
      reason: "source-mismatch",
      expected: keySource,
      actual: episode.source,
    })
  }
  const urlKey = sourceKeyFromOfficialUrl(episode.officialUrl)
  if (urlKey !== null && urlKey !== sourceKey) {
    throw new AiFrontierSourceConflictError({
      reason: "official-url-mismatch",
      expected: urlKey,
      actual: sourceKey,
    })
  }
  return { source: episode.source, sourceKey }
}

/**
 * 이미 저장된 정체성과 쓰려는 정체성이 어긋나면 거부한다.
 * 아직 저장되지 않은 유도 키는 마이그레이션 대상이므로 막지 않는다.
 */
export function assertExistingSourceIdentity(
  existing: AiFrontierExistingSourceInput,
  identity: AiFrontierSourceIdentity
): void {
  if (!existing.persisted || existing.sourceKey === null) return
  if (existing.sourceKey === identity.sourceKey) return
  throw new AiFrontierSourceConflictError({
    reason: "existing-source-key-mismatch",
    expected: identity.sourceKey,
    actual: existing.sourceKey,
    pageId: existing.id,
  })
}
