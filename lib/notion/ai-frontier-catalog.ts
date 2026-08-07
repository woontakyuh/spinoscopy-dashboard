import type { AiFrontierEpisode } from "@/lib/types/ai-frontier"
import type { AiFrontierCatalogEpisode } from "@/lib/types/ai-frontier-import"

import { notionRequest } from "./client"
import {
  AI_FRONTIER_EPISODES_DB_ID,
  type AiFrontierNotionRequest,
} from "./ai-frontier"

interface CatalogSyncResult {
  created: number
  updated: number
  unchanged: number
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

function catalogProperties(episode: AiFrontierCatalogEpisode) {
  return {
    Name: title(episode.name),
    Episode: { number: episode.episodeNumber },
    Status: { select: { name: "목록" } },
    "Transcript Source": { url: episode.officialUrl },
    ...(episode.published ? { Published: { date: { start: episode.published } } } : {}),
    ...(episode.duration ? { Duration: richText(episode.duration) } : {}),
    ...(episode.youtube ? { YouTube: { url: episode.youtube } } : {}),
  }
}

function changedProperties(
  episode: AiFrontierCatalogEpisode,
  existing: AiFrontierEpisode
) {
  return {
    ...(existing.name !== episode.name ? { Name: title(episode.name) } : {}),
    ...(existing.episodeNumber !== episode.episodeNumber
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
) {
  await request(path, {
    method,
    body: JSON.stringify(body),
  })
}

export async function syncAiFrontierCatalog(
  catalog: AiFrontierCatalogEpisode[],
  existingEpisodes: AiFrontierEpisode[],
  dependencies: CatalogSyncDependencies = defaultDependencies
): Promise<CatalogSyncResult> {
  const byNumber = new Map(
    existingEpisodes.flatMap((episode) =>
      episode.episodeNumber === null ? [] : [[episode.episodeNumber, episode] as const]
    )
  )
  const result: CatalogSyncResult = { created: 0, updated: 0, unchanged: 0 }

  for (const episode of catalog) {
    const existing = byNumber.get(episode.episodeNumber)
    if (!existing) {
      await writePage(dependencies.request, "/pages", "POST", {
        parent: { database_id: AI_FRONTIER_EPISODES_DB_ID },
        properties: catalogProperties(episode),
      })
      result.created += 1
      await dependencies.pause()
      continue
    }

    const properties = changedProperties(episode, existing)
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
