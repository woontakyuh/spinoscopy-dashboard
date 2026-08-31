import type { DwarkeshBatchCandidate, FrontierBatchResult } from "@/lib/andrej/frontier-batch-import"
import type { CatalogCreatedPage, CatalogSyncResult } from "@/lib/notion/ai-frontier-catalog"
import { NotionRequestError } from "@/lib/notion/client"
import type { AiFrontierIndex } from "@/lib/types/ai-frontier"

export type CatalogRunResult = CatalogSyncResult & { readonly catalog: number }
export type CatalogCounts = {
  readonly total: number
  readonly created: number
  readonly updated: number
  readonly unchanged: number
}
export type SafeError = {
  readonly name: string
  readonly message: string
  readonly status?: number
}

export const EMPTY_IMPORT: FrontierBatchResult = {
  completed: [],
  failed: [],
  skipped: [],
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const STALE_IMPORT_MS = 10 * 60 * 1_000

export class AiFrontierCronSafetyError extends Error {
  readonly name = "AiFrontierCronSafetyError"
}

export function safeCronError(error: unknown): SafeError {
  if (error instanceof NotionRequestError) {
    return { name: error.name, message: error.message, status: error.status }
  }
  if (error instanceof AiFrontierCronSafetyError) {
    return { name: error.name, message: error.message }
  }
  return { name: "UpstreamError", message: "Upstream operation failed." }
}

export function catalogCounts(result: CatalogRunResult): CatalogCounts {
  return {
    total: result.catalog,
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
  }
}

function validateCreatedPage(value: unknown): CatalogCreatedPage {
  if (typeof value !== "object" || value === null) {
    throw new AiFrontierCronSafetyError("Catalog created page result is malformed.")
  }
  const pageId = Reflect.get(value, "pageId")
  const source = Reflect.get(value, "source")
  const sourceKey = Reflect.get(value, "sourceKey")
  const published = Reflect.get(value, "published")
  const officialUrl = Reflect.get(value, "officialUrl")
  if (
    typeof pageId !== "string" || pageId.trim() === "" ||
    (source !== "ai-frontier" && source !== "dwarkesh") ||
    typeof sourceKey !== "string" || sourceKey.trim() === "" ||
    (published !== null && typeof published !== "string") ||
    typeof officialUrl !== "string" || officialUrl.trim() === ""
  ) {
    throw new AiFrontierCronSafetyError("Catalog created page result is malformed.")
  }
  if (source === "dwarkesh" && (typeof published !== "string" || !ISO_DATE.test(published))) {
    throw new AiFrontierCronSafetyError("New Dwarkesh page has no valid published date.")
  }
  return { pageId, source, sourceKey, published, officialUrl }
}

export function createdPagesFrom(result: CatalogRunResult): CatalogCreatedPage[] {
  const counts = [result.catalog, result.created, result.updated, result.unchanged]
  if (!counts.every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new AiFrontierCronSafetyError("Catalog counts are malformed.")
  }
  if (result.createdPages === undefined) {
    if (result.created === 0) return []
    throw new AiFrontierCronSafetyError("Catalog created page results are missing.")
  }
  if (!Array.isArray(result.createdPages) || result.createdPages.length !== result.created) {
    throw new AiFrontierCronSafetyError("Catalog created page count does not match metadata writes.")
  }

  const pages = result.createdPages.map(validateCreatedPage)
  const pageIds = new Set<string>()
  const sourceKeys = new Set<string>()
  for (const page of pages) {
    if (pageIds.has(page.pageId) || sourceKeys.has(page.sourceKey)) {
      throw new AiFrontierCronSafetyError("Catalog created page identities are duplicated.")
    }
    pageIds.add(page.pageId)
    sourceKeys.add(page.sourceKey)
  }
  return pages
}

export function candidateFrom(page: CatalogCreatedPage): DwarkeshBatchCandidate {
  if (page.published === null) {
    throw new AiFrontierCronSafetyError("New Dwarkesh page has no published date.")
  }
  return {
    pageId: page.pageId,
    sourceKey: page.sourceKey,
    officialUrl: page.officialUrl,
    published: page.published,
  }
}

export function selectAutomaticDwarkeshCandidates(
  index: AiFrontierIndex,
  now: Date
): DwarkeshBatchCandidate[] {
  const staleBefore = now.getTime() - STALE_IMPORT_MS
  return index.episodes.flatMap((episode) => {
    if (
      episode.source !== "dwarkesh" ||
      episode.sourceKey === null ||
      episode.transcriptSource === null ||
      episode.published === null ||
      episode.lastEditedAt === undefined ||
      episode.lastEditedAt === null
    ) return []
    const editedAt = Date.parse(episode.lastEditedAt)
    if (!Number.isFinite(editedAt)) return []
    const pending = episode.status === "수집 대기"
    const stale = episode.status === "수집 중" && editedAt <= staleBefore
    if (!pending && !stale) return []
    return [{
      pageId: episode.id,
      sourceKey: episode.sourceKey,
      officialUrl: episode.transcriptSource,
      published: episode.published,
      expectedLastEditedAt: episode.lastEditedAt,
    }]
  }).sort((left, right) => right.published.localeCompare(left.published))
}
