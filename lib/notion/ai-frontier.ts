import { notionEnv, notionRequest } from "@/lib/notion/client"
import type {
  AiFrontierConcept, AiFrontierEpisode, AiFrontierEpisodeDetail,
  AiFrontierIndex, AiFrontierStatus, NotionAiFrontierBlock, NotionAiFrontierBlocksResponse,
  NotionAiFrontierPage, NotionAiFrontierProperty, NotionAiFrontierQueryResponse,
  NotionAiFrontierTextBlockType,
} from "@/lib/types/ai-frontier"

import { toAiFrontierConcept, toAiFrontierEpisode } from "./ai-frontier-parser"

export { toAiFrontierConcept, toAiFrontierEpisode } from "./ai-frontier-parser"
export type { NotionAiFrontierPage, NotionAiFrontierProperty }

export type AiFrontierNotionRequest = (path: string, options?: RequestInit) => Promise<unknown>

export const AI_FRONTIER_EPISODES_DB_ID = "3b2908af-25b9-81fb-88e7-c85a93ac62f4"
export const AI_FRONTIER_CONCEPTS_DB_ID = "3b2908af-25b9-8140-b0e8-d5ab9ed07844"
const EPISODES_DB_ID = AI_FRONTIER_EPISODES_DB_ID
const CONCEPTS_DB_ID = AI_FRONTIER_CONCEPTS_DB_ID
const MAX_BLOCKS = 200
const MAX_CHARACTERS = 12_000
const TEXT_BLOCK_TYPES: NotionAiFrontierTextBlockType[] = [
  "paragraph", "heading_1", "heading_2", "heading_3",
  "bulleted_list_item", "numbered_list_item", "quote",
]

const defaultRequest: AiFrontierNotionRequest = (path, options) =>
  notionRequest<unknown>(path, options)

function databaseId(envName: string, fallback: string): string {
  return notionEnv(envName) || fallback
}

async function loadPages(
  databaseId: string,
  request: AiFrontierNotionRequest
): Promise<NotionAiFrontierPage[]> {
  const pages: NotionAiFrontierPage[] = []
  let cursor: string | null = null
  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    }
    const response = await request(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    }) as NotionAiFrontierQueryResponse
    pages.push(...response.results)
    if (!response.has_more) cursor = null
    else if (!response.next_cursor) throw new Error("Notion pagination cursor is missing")
    else cursor = response.next_cursor
  } while (cursor)
  return pages
}

function present<T>(value: T | null): value is T {
  return value !== null
}

async function loadEpisodes(request: AiFrontierNotionRequest): Promise<AiFrontierEpisode[]> {
  const id = databaseId("NOTION_AI_FRONTIER_EPISODES_DB_ID", EPISODES_DB_ID)
  return (await loadPages(id, request)).map(toAiFrontierEpisode).filter(present)
}

async function loadConcepts(request: AiFrontierNotionRequest): Promise<AiFrontierConcept[]> {
  const id = databaseId("NOTION_AI_FRONTIER_CONCEPTS_DB_ID", CONCEPTS_DB_ID)
  return (await loadPages(id, request)).map(toAiFrontierConcept).filter(present)
}

function stableDateSort(episodes: AiFrontierEpisode[]): AiFrontierEpisode[] {
  return episodes
    .map((episode, index) => ({ episode, index }))
    .sort((left, right) => {
      const leftDate = left.episode.published ?? left.episode.recorded ?? ""
      const rightDate = right.episode.published ?? right.episode.recorded ?? ""
      return rightDate.localeCompare(leftDate) || left.index - right.index
    })
    .map(({ episode }) => episode)
}

function indexStatus(episodesOk: boolean, conceptsOk: boolean): AiFrontierStatus {
  if (episodesOk && conceptsOk) return "ok"
  if (episodesOk || conceptsOk) return "partial"
  return "unavailable"
}

export async function getAiFrontierIndex(
  request: AiFrontierNotionRequest = defaultRequest
): Promise<AiFrontierIndex> {
  const [episodeResult, conceptResult] = await Promise.allSettled([
    loadEpisodes(request),
    loadConcepts(request),
  ])
  const episodesOk = episodeResult.status === "fulfilled"
  const conceptsOk = conceptResult.status === "fulfilled"
  const episodes = stableDateSort(episodesOk ? episodeResult.value : [])
  const concepts = conceptsOk ? conceptResult.value : []
  const episodeIndex: Record<string, string> = {}

  for (const episode of episodes) {
    const ref = episode.sourceKey ?? (
      episode.episodeNumber === null ? null : `EP${episode.episodeNumber}`
    )
    if (ref !== null && !episodeIndex[ref]) episodeIndex[ref] = episode.id
  }

  return {
    status: indexStatus(episodesOk, conceptsOk),
    sources: {
      episodes: episodesOk ? "ok" : "unavailable",
      concepts: conceptsOk ? "ok" : "unavailable",
    },
    episodes,
    concepts: concepts.map((concept) => ({
      ...concept,
      episodes: concept.episodes.map((ref) => ({
        ...ref,
        available: episodeIndex[ref.ref] !== undefined,
        pageId: episodeIndex[ref.ref] ?? null,
      })),
    })),
    episodeIndex,
  }
}

function isTextBlockType(type: string): type is NotionAiFrontierTextBlockType {
  return TEXT_BLOCK_TYPES.includes(type as NotionAiFrontierTextBlockType)
}

function blockText(block: NotionAiFrontierBlock): string | null {
  if (!isTextBlockType(block.type)) return null
  const parts = block[block.type]?.rich_text
  if (!Array.isArray(parts)) return null
  const text = parts.map((part) => part.plain_text ?? "").join("")
  return text.trim() ? text : null
}

export class AiFrontierEpisodeNotFoundError extends Error {
  constructor(pageId: string) {
    super(`Episode not found in index: ${pageId}`)
    this.name = "AiFrontierEpisodeNotFoundError"
  }
}

export async function getAiFrontierEpisodeDetail(
  pageId: string,
  request: AiFrontierNotionRequest = defaultRequest
): Promise<AiFrontierEpisodeDetail> {
  const episode = (await loadEpisodes(request)).find((item) => item.id === pageId)
  if (!episode) throw new AiFrontierEpisodeNotFoundError(pageId)

  const blocks: AiFrontierEpisodeDetail["blocks"] = []
  let characterCount = 0
  let cursor: string | null = null
  let truncated = false

  do {
    const params = new URLSearchParams({ page_size: "100" })
    if (cursor) params.set("start_cursor", cursor)
    const response = await request(
      `/blocks/${encodeURIComponent(episode.id)}/children?${params.toString()}`
    ) as NotionAiFrontierBlocksResponse

    for (const block of response.results) {
      const text = blockText(block)
      if (text === null) continue
      const remaining = MAX_CHARACTERS - characterCount
      const boundedText = text.slice(0, remaining)
      blocks.push({ id: block.id, type: block.type, text: boundedText })
      characterCount += boundedText.length
      if (boundedText.length < text.length || characterCount === MAX_CHARACTERS || blocks.length === MAX_BLOCKS) {
        truncated = true
        break
      }
    }

    if (truncated || !response.has_more) cursor = null
    else if (!response.next_cursor) throw new Error("Notion block pagination cursor is missing")
    else cursor = response.next_cursor
  } while (cursor)

  return { ...episode, blocks, truncated }
}
