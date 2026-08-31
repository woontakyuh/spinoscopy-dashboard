import { z } from "zod"

import type { AiFrontierConcept } from "@/lib/types/ai-frontier"
import type {
  AiFrontierEpisodeAnalysis,
  AiFrontierImportResult,
  AiFrontierOfficialEpisode,
} from "@/lib/types/ai-frontier-import"

import {
  AI_FRONTIER_CONCEPTS_DB_ID,
  type AiFrontierNotionRequest,
} from "./ai-frontier"
import {
  buildAiFrontierEpisodeBlocks,
  type NotionWriteBlock,
} from "./ai-frontier-blocks"
import {
  AI_FRONTIER_SOURCE_KEY_PROPERTY,
  AI_FRONTIER_SOURCE_PROPERTY,
  assertCatalogSourceIdentity,
  type AiFrontierSourceIdentity,
} from "./ai-frontier-identity"
import { NotionRequestError, notionRequest } from "./client"

type ImportStatus = "목록" | "수집 중" | "수집 실패" | "완료"

export type AiFrontierPersistenceStage =
  | "concept-update"
  | "concept-create"
  | "blocks-read"
  | "blocks-delete"
  | "blocks-append"
  | "episode-properties"
  | "status-update"

export class AiFrontierPersistenceError extends Error {
  readonly name = "AiFrontierPersistenceError"

  constructor(
    readonly stage: AiFrontierPersistenceStage,
    readonly status: number | null
  ) {
    super("AI Frontier Notion 저장에 실패했습니다.")
  }
}

interface PersistImportInput {
  pageId: string
  episode: AiFrontierOfficialEpisode
  analysis: AiFrontierEpisodeAnalysis
  existingConcepts: AiFrontierConcept[]
  /** Retry-only: caller already verified the existing body is complete and must remain untouched. */
  preserveExistingBlocks?: boolean
}

interface ImportDependencies {
  request: AiFrontierNotionRequest
  pause(): Promise<void>
}

const childrenSchema = z.object({
  results: z.array(z.object({ id: z.string().min(1) })),
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
})

const defaultDependencies: ImportDependencies = {
  request: (path, options) => notionRequest<unknown>(path, options),
  pause: () => new Promise((resolve) => setTimeout(resolve, 350)),
}

function title(content: string) {
  return { title: [{ text: { content } }] }
}

function richText(content: string) {
  return { rich_text: [{ text: { content } }] }
}

const NOTION_OPTION_MAX_LENGTH = 100

function optionName(value: string): string {
  return value.trim().replaceAll(",", "，").slice(0, NOTION_OPTION_MAX_LENGTH)
}

function select(value: string) {
  return { select: { name: optionName(value) } }
}

function multiSelect(values: string[]) {
  const names = [...new Set(values.map(optionName))]
  return { multi_select: names.map((name) => ({ name })) }
}

function notionStatus(error: unknown): number | null {
  return error instanceof NotionRequestError ? error.status : null
}

async function atStage<T>(
  stage: AiFrontierPersistenceStage,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof AiFrontierPersistenceError) throw error
    throw new AiFrontierPersistenceError(stage, notionStatus(error))
  }
}

async function write(
  request: AiFrontierNotionRequest,
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  stage: AiFrontierPersistenceStage,
  body?: Record<string, unknown>
) {
  await atStage(stage, () => request(path, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  }))
}

function normalizedTerm(value: string): string {
  return value.trim().toLocaleLowerCase("en-US")
}

async function upsertConcepts(
  input: PersistImportInput,
  identity: AiFrontierSourceIdentity,
  dependencies: ImportDependencies
): Promise<{ created: number; updated: number }> {
  const byTerm = new Map(
    input.existingConcepts.map((concept) => [normalizedTerm(concept.term), concept])
  )
  const episodeRef = identity.sourceKey
  let created = 0
  let updated = 0

  for (const concept of input.analysis.concepts) {
    const existing = byTerm.get(normalizedTerm(concept.term))
    if (existing) {
      const refs = [...new Set([...existing.episodes.map(({ ref }) => ref), episodeRef])]
      if (!existing.episodes.some(({ ref }) => ref === episodeRef)) {
        await write(dependencies.request, `/pages/${existing.id}`, "PATCH", "concept-update", {
          properties: { Episodes: multiSelect(refs) },
        })
        updated += 1
        await dependencies.pause()
      }
      continue
    }

    await write(dependencies.request, "/pages", "POST", "concept-create", {
      parent: { database_id: AI_FRONTIER_CONCEPTS_DB_ID },
      properties: {
        Term: title(concept.term),
        Korean: richText(concept.korean),
        Category: select(concept.category),
        Verified: select("전사 기반"),
        "One-line Explanation": richText(concept.oneLine),
        Intuition: richText(concept.intuition),
        "Why It Matters": richText(concept.whyItMatters),
        Source: richText(input.episode.officialUrl),
        Episodes: multiSelect([episodeRef]),
      },
    })
    created += 1
    await dependencies.pause()
  }
  return { created, updated }
}

async function clearPageBlocks(
  pageId: string,
  dependencies: ImportDependencies
) {
  let cursor: string | null = null
  do {
    const query = cursor
      ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}`
      : ""
    const response = await atStage("blocks-read", () =>
      dependencies.request(`/blocks/${pageId}/children${query}`)
    )
    const parsed = childrenSchema.safeParse(response)
    if (!parsed.success) throw new AiFrontierPersistenceError("blocks-read", null)
    for (const block of parsed.data.results) {
      await write(dependencies.request, `/blocks/${block.id}`, "DELETE", "blocks-delete")
      await dependencies.pause()
    }
    cursor = parsed.data.has_more ? parsed.data.next_cursor : null
  } while (cursor)
}

async function appendPageBlocks(
  pageId: string,
  blocks: NotionWriteBlock[],
  dependencies: ImportDependencies
) {
  for (let index = 0; index < blocks.length; index += 100) {
    await write(dependencies.request, `/blocks/${pageId}/children`, "PATCH", "blocks-append", {
      children: blocks.slice(index, index + 100),
    })
    await dependencies.pause()
  }
}

function completedEpisodeProperties(
  episode: AiFrontierOfficialEpisode,
  analysis: AiFrontierEpisodeAnalysis,
  identity: AiFrontierSourceIdentity
) {
  return {
    Name: title(episode.name),
    Status: select("완료"),
    [AI_FRONTIER_SOURCE_PROPERTY]: select(identity.source),
    [AI_FRONTIER_SOURCE_KEY_PROPERTY]: richText(identity.sourceKey),
    ...(episode.episodeNumber !== null
      ? { Episode: { number: episode.episodeNumber } }
      : {}),
    Published: episode.published ? { date: { start: episode.published } } : { date: null },
    Reviewed: { checkbox: false },
    Topics: multiSelect(analysis.topics),
    Models: multiSelect(analysis.models),
    People: multiSelect(analysis.people),
    YouTube: { url: episode.youtube },
    "Transcript Source": { url: episode.officialUrl },
    Duration: episode.duration ? richText(episode.duration) : { rich_text: [] },
    한줄요약: richText(analysis.summary),
    "Key Terms": multiSelect(analysis.concepts.map(({ term }) => term)),
  }
}

export async function setAiFrontierImportStatus(
  pageId: string,
  status: ImportStatus,
  request: AiFrontierNotionRequest = defaultDependencies.request
) {
  await write(request, `/pages/${pageId}`, "PATCH", "status-update", {
    properties: { Status: { select: { name: status } } },
  })
}

export async function persistAiFrontierImport(
  input: PersistImportInput,
  dependencies: ImportDependencies = defaultDependencies
): Promise<AiFrontierImportResult> {
  const identity = assertCatalogSourceIdentity(input.episode)
  const conceptResult = await upsertConcepts(input, identity, dependencies)
  if (input.preserveExistingBlocks !== true) {
    await clearPageBlocks(input.pageId, dependencies)
    await appendPageBlocks(
      input.pageId,
      buildAiFrontierEpisodeBlocks(input.episode, input.analysis),
      dependencies
    )
  }
  await write(dependencies.request, `/pages/${input.pageId}`, "PATCH", "episode-properties", {
    properties: completedEpisodeProperties(input.episode, input.analysis, identity),
  })

  return {
    pageId: input.pageId,
    reference: identity.sourceKey,
    episodeNumber: input.episode.episodeNumber,
    status: "완료",
    conceptsCreated: conceptResult.created,
    conceptsUpdated: conceptResult.updated,
  }
}
