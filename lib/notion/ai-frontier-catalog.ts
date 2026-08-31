import type { FrontierCatalogSource } from "@/lib/andrej/frontier-sources"
import type { AiFrontierEpisode } from "@/lib/types/ai-frontier"
import type { AiFrontierCatalogEpisode } from "@/lib/types/ai-frontier-import"

import { notionRequest } from "./client"
import {
  AI_FRONTIER_EPISODES_DB_ID,
  type AiFrontierNotionRequest,
} from "./ai-frontier"
import {
  AI_FRONTIER_SOURCE_KEY_PROPERTY,
  AI_FRONTIER_SOURCE_PROPERTY,
  type AiFrontierSourceIdentity,
} from "./ai-frontier-identity"
import {
  AiFrontierCatalogValidationError,
  planCatalogWrites,
} from "./ai-frontier-catalog-plan"

export {
  AiFrontierCatalogValidationError,
  DWARKESH_CATALOG_WINDOW,
} from "./ai-frontier-catalog-plan"
export { runAiFrontierCatalogSync } from "./ai-frontier-catalog-run"

export interface CatalogCreatedPage {
  pageId: string
  source: AiFrontierSourceIdentity["source"]
  sourceKey: string
  published: string | null
  officialUrl: string
}

export type CatalogSourceFailure = {
  readonly source: FrontierCatalogSource
  readonly reason: "upstream" | "empty" | "undersized"
  readonly status?: number
  readonly count?: number
}

export interface CatalogSyncResult {
  created: number
  updated: number
  unchanged: number
  /** Present for the real upsert; optional only for legacy injected sync fixtures. */
  createdPages?: CatalogCreatedPage[]
  sourceFailures?: readonly CatalogSourceFailure[]
}

export interface CatalogUpsertResult extends CatalogSyncResult {
  createdPages: CatalogCreatedPage[]
}

interface CatalogSyncDependencies {
  request: AiFrontierNotionRequest
  pause(): Promise<void>
}

const defaultDependencies: CatalogSyncDependencies = {
  request: (path, options) => notionRequest<unknown>(path, options),
  pause: () => new Promise((resolve) => setTimeout(resolve, 350)),
}


function title(content: string) {
  return { title: [{ text: { content } }] }
}

function richText(content: string) {
  return { rich_text: [{ text: { content } }] }
}

function identityProperties(identity: AiFrontierSourceIdentity) {
  return {
    [AI_FRONTIER_SOURCE_PROPERTY]: { select: { name: identity.source } },
    [AI_FRONTIER_SOURCE_KEY_PROPERTY]: richText(identity.sourceKey),
  }
}

function identityIsCurrent(
  existing: AiFrontierEpisode,
  identity: AiFrontierSourceIdentity
): boolean {
  return (
    existing.sourceIdentityPersisted &&
    existing.source === identity.source &&
    existing.sourceKey === identity.sourceKey
  )
}

function catalogProperties(
  episode: AiFrontierCatalogEpisode,
  identity: AiFrontierSourceIdentity
) {
  return {
    Name: title(episode.name),
    Status: { select: { name: episode.source === "dwarkesh" ? "수집 대기" : "목록" } },
    "Transcript Source": { url: episode.officialUrl },
    ...identityProperties(identity),
    ...(episode.episodeNumber !== null
      ? { Episode: { number: episode.episodeNumber } }
      : {}),
    ...(episode.published ? { Published: { date: { start: episode.published } } } : {}),
    ...(episode.duration ? { Duration: richText(episode.duration) } : {}),
    ...(episode.youtube ? { YouTube: { url: episode.youtube } } : {}),
  }
}

function changedProperties(
  episode: AiFrontierCatalogEpisode,
  existing: AiFrontierEpisode,
  identity: AiFrontierSourceIdentity
) {
  return {
    ...(identityIsCurrent(existing, identity) ? {} : identityProperties(identity)),
    ...(existing.name !== episode.name ? { Name: title(episode.name) } : {}),
    ...(episode.episodeNumber !== null &&
    existing.episodeNumber !== episode.episodeNumber
      ? { Episode: { number: episode.episodeNumber } }
      : {}),
    ...(existing.transcriptSource !== episode.officialUrl
      ? { "Transcript Source": { url: episode.officialUrl } }
      : {}),
    ...(episode.published && existing.published !== episode.published
      ? { Published: { date: { start: episode.published } } }
      : {}),
    ...(episode.duration && existing.duration !== episode.duration
      ? { Duration: richText(episode.duration) }
      : {}),
    ...(episode.youtube && existing.youtube !== episode.youtube
      ? { YouTube: { url: episode.youtube } }
      : {}),
  }
}

async function writePage(
  request: AiFrontierNotionRequest,
  path: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>
): Promise<unknown> {
  return request(path, {
    method,
    body: JSON.stringify(body),
  })
}

function createdPageId(response: unknown): string {
  if (typeof response === "object" && response !== null) {
    const id = Reflect.get(response, "id")
    if (typeof id === "string" && id.trim() !== "") return id
  }
  throw new AiFrontierCatalogValidationError(
    "Notion 페이지 생성 응답에 id가 없습니다.",
    "invalid-create-response"
  )
}

export async function syncAiFrontierCatalog(
  catalog: AiFrontierCatalogEpisode[],
  existingEpisodes: AiFrontierEpisode[],
  dependencies: CatalogSyncDependencies = defaultDependencies
): Promise<CatalogUpsertResult> {
  const plans = planCatalogWrites(catalog, existingEpisodes)
  const result: CatalogUpsertResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    createdPages: [],
  }

  for (const { episode, identity, existing } of plans) {
    if (!existing) {
      const response = await writePage(dependencies.request, "/pages", "POST", {
        parent: { database_id: AI_FRONTIER_EPISODES_DB_ID },
        properties: catalogProperties(episode, identity),
      })
      const pageId = createdPageId(response)
      result.created += 1
      result.createdPages.push({
        pageId,
        source: identity.source,
        sourceKey: identity.sourceKey,
        published: episode.published,
        officialUrl: episode.officialUrl,
      })
      await dependencies.pause()
      continue
    }

    const properties = changedProperties(episode, existing, identity)
    if (Object.keys(properties).length === 0) {
      result.unchanged += 1
      continue
    }
    await writePage(dependencies.request, `/pages/${existing.id}`, "PATCH", { properties })
    result.updated += 1
    await dependencies.pause()
  }

  return result
}
