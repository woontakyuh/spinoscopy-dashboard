// Dakota Memory V2 — 구조화된 row 기반
// Dakota Memory DB의 row 단위로 사실을 저장·조회·수정

import { notionRequest } from "./client"
import type { AgentId } from "@/lib/orchestrator/types"

const DB_ID_KEY = "NOTION_DAKOTA_MEMORY_DB_ID"

export type MemoryCategory =
  | "profile"
  | "preference"
  | "person"
  | "project"
  | "rule"
  | "fact"
  | "event"

export interface MemoryRow {
  page_id: string
  url: string
  name: string
  category: MemoryCategory | string
  content: string
  importance: number
  source: string
  status: string
  created_time: string
  last_edited_time: string
}

interface NotionRichText {
  plain_text?: string
}

interface NotionProperty {
  type: string
  title?: NotionRichText[]
  rich_text?: NotionRichText[]
  select?: { name: string } | null
  created_time?: string
  last_edited_time?: string
}

interface NotionPage {
  id: string
  url: string
  created_time: string
  last_edited_time: string
  properties: Record<string, NotionProperty>
}

interface NotionQueryResponse {
  results: NotionPage[]
  next_cursor: string | null
  has_more: boolean
}

function getDbId(): string {
  const id = process.env[DB_ID_KEY]
  if (!id) throw new Error(`${DB_ID_KEY} is not configured`)
  return id
}

function getText(prop: NotionProperty | undefined): string {
  if (!prop) return ""
  if (prop.type === "title") return (prop.title ?? []).map((t) => t.plain_text ?? "").join("").trim()
  if (prop.type === "rich_text") return (prop.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim()
  return ""
}

function getSelect(prop: NotionProperty | undefined, fallback = ""): string {
  return prop?.select?.name ?? fallback
}

function toRow(page: NotionPage): MemoryRow {
  const p = page.properties
  const importanceStr = getSelect(p.Importance, "1")
  return {
    page_id: page.id,
    url: page.url,
    name: getText(p.Name),
    category: getSelect(p.Category, "fact"),
    content: getText(p.Content),
    importance: Number.parseInt(importanceStr, 10) || 1,
    source: getSelect(p.Source, "manual"),
    status: getSelect(p.Status, "active"),
    created_time: page.created_time,
    last_edited_time: page.last_edited_time,
  }
}

export interface MemoryQueryOptions {
  category?: MemoryCategory | string
  minImportance?: number
  status?: "active" | "archived" | "all"
  limit?: number
  source?: string | string[]
  excludeSources?: string[]
}

const SHARED_CORE_CATEGORIES = new Set<MemoryCategory | string>([
  "profile",
  "preference",
  "person",
  "project",
  "rule",
])

export function getAgentMemorySourcePrefix(agentId: AgentId): string {
  return `agent:${agentId}`
}

export function isSharedCoreCategory(category: MemoryCategory | string): boolean {
  return SHARED_CORE_CATEGORIES.has(category)
}

export function isAgentScopedSource(source: string | undefined, agentId: AgentId): boolean {
  if (!source) return false
  return source.toLowerCase().startsWith(`${getAgentMemorySourcePrefix(agentId)}:`)
}

function matchesSourceFilter(source: string, filter?: string | string[]): boolean {
  if (!filter) return true
  const candidates = Array.isArray(filter) ? filter : [filter]
  const lowered = source.toLowerCase()
  return candidates.some((candidate) => lowered.startsWith(candidate.toLowerCase()))
}

/** Memory DB 쿼리 — 카테고리/중요도/상태로 필터 */
export async function listMemories(opts: MemoryQueryOptions = {}): Promise<MemoryRow[]> {
  const dbId = getDbId()
  const filters: Record<string, unknown>[] = []

  const status = opts.status ?? "active"
  if (status !== "all") {
    filters.push({ property: "Status", select: { equals: status } })
  }
  if (opts.category) {
    filters.push({ property: "Category", select: { equals: opts.category } })
  }

  const filter =
    filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : { and: filters }

  const body: Record<string, unknown> = {
    page_size: Math.min(opts.limit ?? 100, 100),
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
  }
  if (filter) body.filter = filter

  const res = await notionRequest<NotionQueryResponse>(`/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify(body),
  })

  let rows = res.results.map(toRow)
  if (opts.source) {
    rows = rows.filter((r) => matchesSourceFilter(r.source, opts.source))
  }
  if (opts.excludeSources && opts.excludeSources.length > 0) {
    rows = rows.filter((r) => !opts.excludeSources!.some((source) => matchesSourceFilter(r.source, source)))
  }
  if (typeof opts.minImportance === "number") {
    rows = rows.filter((r) => r.importance >= (opts.minImportance ?? 0))
  }
  return rows
}

/**
 * Notion Source는 memory가 어느 runtime/surface에서 만들어졌는지의 provenance다.
 * Legacy `chat`/`session` rows에는 원본 플랫폼이 저장되지 않았으므로 추정하지 않는다.
 */
export function getMemoryProvenanceLabel(source: string | undefined): string {
  const value = source?.trim().toLowerCase() ?? ""
  const event = value.match(/^orchestrator:event:([a-z]+):(dashboard|telegram)$/)
  if (event) return `${event[2]} · ${event[1]} agent event`

  const transcript = value.match(/^agent:([a-z]+):(transcript|session)$/)
  if (transcript) return `${transcript[1]} agent · legacy session (original platform unrecorded)`

  const shared = value.match(/^shared-core:([a-z]+)$/)
  if (shared) return `shared core · curated by ${shared[1]}`

  const local = value.match(/^agent:([a-z]+):memory$/)
  if (local) return `${local[1]} agent local memory`

  if (!value || ["chat", "session", "migration", "dakota"].includes(value)) {
    return "legacy record · original platform unrecorded"
  }
  return source!.trim()
}

function rowsToDigest(rows: MemoryRow[], maxRows = 30): string {
  const sorted = rows.slice().sort((a, b) => b.importance - a.importance).slice(0, maxRows)
  if (sorted.length === 0) return ""

  const byCategory: Record<string, MemoryRow[]> = {}
  for (const r of sorted) {
    const k = r.category
    if (!byCategory[k]) byCategory[k] = []
    byCategory[k].push(r)
  }

  const order = ["profile", "person", "rule", "preference", "project", "event", "fact"]
  const lines: string[] = []
  for (const cat of order) {
    const items = byCategory[cat]
    if (!items || items.length === 0) continue
    lines.push(`\n[${cat}]`)
    for (const it of items) {
      const stars = "★".repeat(it.importance)
      const provenance = getMemoryProvenanceLabel(it.source)
      lines.push(`- ${it.name} ${stars} [provenance: ${provenance}]: ${it.content}`)
    }
  }
  // 누락된 카테고리 (혹시 새 게 추가되면)
  for (const cat of Object.keys(byCategory)) {
    if (order.includes(cat)) continue
    lines.push(`\n[${cat}]`)
    for (const it of byCategory[cat]) {
      const stars = "★".repeat(it.importance)
      const provenance = getMemoryProvenanceLabel(it.source)
      lines.push(`- ${it.name} ${stars} [provenance: ${provenance}]: ${it.content}`)
    }
  }
  return lines.join("\n").trim()
}

/** 시스템 프롬프트 주입용 — 중요도 높은 순으로 정렬한 텍스트 블록 */
export async function getMemoryDigest(maxRows = 30): Promise<string> {
  const rows = await listMemories({ status: "active", limit: 100 })
  return rowsToDigest(rows, maxRows)
}

/**
 * 모든 표면이 공유하는 durable context.
 *
 * 중요: 전체 Memory DB의 최신 100개를 먼저 읽은 뒤 category를 거르면 대화 transcript/event
 * row가 많은 경우 shared-core가 통째로 prompt에서 사라진다. 각 shared category를 Notion에서
 * 직접 필터해 읽어야 로그량과 무관하게 같은 core를 받을 수 있다.
 */
export async function getSharedCoreMemoryDigest(maxRows = 20): Promise<string> {
  const categories = Array.from(SHARED_CORE_CATEGORIES)
  const groups = await Promise.all(
    categories.map((category) => listMemories({
      category,
      status: "active",
      limit: 100,
    }))
  )
  return rowsToDigest(groups.flat(), maxRows)
}

export async function getAgentMemoryDigest(agentId: AgentId, maxRows = 20): Promise<string> {
  const rows = await listMemories({
    status: "active",
    limit: 100,
    source: getAgentMemorySourcePrefix(agentId),
  })
  return rowsToDigest(rows, maxRows)
}

export interface MemoryCreateInput {
  name: string
  category: MemoryCategory | string
  content: string
  importance?: number
  source?: string
}

export async function createMemory(input: MemoryCreateInput): Promise<MemoryRow> {
  const dbId = getDbId()
  const importance = Math.max(1, Math.min(5, input.importance ?? 3))
  const body = {
    parent: { database_id: dbId },
    properties: {
      Name: { title: [{ text: { content: input.name.slice(0, 200) } }] },
      Category: { select: { name: input.category } },
      Content: { rich_text: [{ text: { content: input.content.slice(0, 1900) } }] },
      Importance: { select: { name: String(importance) } },
      Source: { select: { name: input.source ?? "chat" } },
      Status: { select: { name: "active" } },
    },
  }
  const res = await notionRequest<NotionPage>("/pages", {
    method: "POST",
    body: JSON.stringify(body),
  })
  return toRow(res)
}

export interface MemoryUpdateInput {
  pageId: string
  name?: string
  category?: MemoryCategory | string
  content?: string
  importance?: number
  status?: "active" | "archived"
}

export async function updateMemory(input: MemoryUpdateInput): Promise<void> {
  const properties: Record<string, unknown> = {}
  if (input.name !== undefined) {
    properties.Name = { title: [{ text: { content: input.name.slice(0, 200) } }] }
  }
  if (input.category !== undefined) {
    properties.Category = { select: { name: input.category } }
  }
  if (input.content !== undefined) {
    properties.Content = { rich_text: [{ text: { content: input.content.slice(0, 1900) } }] }
  }
  if (input.importance !== undefined) {
    const v = Math.max(1, Math.min(5, input.importance))
    properties.Importance = { select: { name: String(v) } }
  }
  if (input.status !== undefined) {
    properties.Status = { select: { name: input.status } }
  }
  if (Object.keys(properties).length === 0) return
  await notionRequest(`/pages/${input.pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  })
}

export async function archiveMemory(pageId: string): Promise<void> {
  await updateMemory({ pageId, status: "archived" })
}
