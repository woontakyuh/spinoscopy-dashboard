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
import { notionRequest } from "./client"

type ImportStatus = "목록" | "수집 중" | "수집 실패" | "완료"

interface PersistImportInput {
  pageId: string
  episode: AiFrontierOfficialEpisode
  analysis: AiFrontierEpisodeAnalysis
  existingConcepts: AiFrontierConcept[]
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

function multiSelect(values: string[]) {
  return { multi_select: values.map((name) => ({ name })) }
}

async function write(
  request: AiFrontierNotionRequest,
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: Record<string, unknown>
) {
  await request(path, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

function normalizedTerm(value: string): string {
  return value.trim().toLocaleLowerCase("en-US")
}

async function upsertConcepts(
  input: PersistImportInput,
  dependencies: ImportDependencies
): Promise<{ created: number; updated: number }> {
  const byTerm = new Map(
    input.existingConcepts.map((concept) => [normalizedTerm(concept.term), concept])
  )
  const episodeRef = `EP${input.episode.episodeNumber}`
  let created = 0
  let updated = 0

  for (const concept of input.analysis.concepts) {
    const existing = byTerm.get(normalizedTerm(concept.term))
    if (existing) {
      const refs = [...new Set([...existing.episodes.map(({ ref }) => ref), episodeRef])]
      if (!existing.episodes.some(({ ref }) => ref === episodeRef)) {
        await write(dependencies.request, `/pages/${existing.id}`, "PATCH", {
          properties: { Episodes: multiSelect(refs) },
        })
        updated += 1
        await dependencies.pause()
      }
      continue
    }

    await write(dependencies.request, "/pages", "POST", {
      parent: { database_id: AI_FRONTIER_CONCEPTS_DB_ID },
      properties: {
        Term: title(concept.term),
        Korean: richText(concept.korean),
        Category: { select: { name: concept.category } },
        Verified: { select: { name: "전사 기반" } },
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
    const parsed = childrenSchema.safeParse(
      await dependencies.request(`/blocks/${pageId}/children${query}`)
    )
    if (!parsed.success) throw new Error("Notion Episode 본문을 읽지 못했습니다.")
    for (const block of parsed.data.results) {
      await write(dependencies.request, `/blocks/${block.id}`, "DELETE")
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
    await write(dependencies.request, `/blocks/${pageId}/children`, "PATCH", {
      children: blocks.slice(index, index + 100),
    })
    await dependencies.pause()
  }
}

function completedEpisodeProperties(
  episode: AiFrontierOfficialEpisode,
  analysis: AiFrontierEpisodeAnalysis
) {
  return {
    Name: title(episode.name),
    Episode: { number: episode.episodeNumber },
    Status: { select: { name: "완료" } },
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
  await write(request, `/pages/${pageId}`, "PATCH", {
    properties: { Status: { select: { name: status } } },
  })
}

export async function persistAiFrontierImport(
  input: PersistImportInput,
  dependencies: ImportDependencies = defaultDependencies
): Promise<AiFrontierImportResult> {
  const conceptResult = await upsertConcepts(input, dependencies)
  await clearPageBlocks(input.pageId, dependencies)
  await appendPageBlocks(
    input.pageId,
    buildAiFrontierEpisodeBlocks(input.episode, input.analysis),
    dependencies
  )
  await write(dependencies.request, `/pages/${input.pageId}`, "PATCH", {
    properties: completedEpisodeProperties(input.episode, input.analysis),
  })

  return {
    pageId: input.pageId,
    episodeNumber: input.episode.episodeNumber,
    status: "완료",
    conceptsCreated: conceptResult.created,
    conceptsUpdated: conceptResult.updated,
  }
}
