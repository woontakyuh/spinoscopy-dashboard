import { notionRequest } from "./client"

/**
 * Dakota Wiki State DB. TakBrain LLM Wiki v2 컴파일러의 `.wiki-state.json`을
 * 그대로 옮긴 이벤트 로그다 — 데이터 흐름·페이지네이션 패턴은 sessionLog.ts /
 * operations.ts / conversationLog.ts와 동일하게 맞춘다.
 */
const WIKI_DB_ID_KEY = "NOTION_DAKOTA_WIKI_DB_ID"

export type WikiSnapshotStatus = "changed" | "unchanged"

interface NotionWikiProperty {
  type: string
  title?: Array<{ plain_text?: string }>
  rich_text?: Array<{ plain_text?: string }>
  select?: { name: string } | null
  number?: number | null
  date?: { start: string; end: string | null } | null
}

interface NotionWikiPage {
  id: string
  properties: Record<string, NotionWikiProperty>
}

interface NotionWikiQueryResponse {
  results: NotionWikiPage[]
  has_more: boolean
  next_cursor: string | null
}

export interface WikiSnapshotItem {
  pageId: string
  name: string
  eventKey: string
  /** ISO 8601 (Notion Date 프로퍼티), 없으면 null */
  date: string | null
  status: WikiSnapshotStatus | null
  created: number
  updated: number
  deleted: number
  totalPages: number | null
  totalSources: number | null
  layers: string
  kinds: string
  compiler: string
}

export interface CreateWikiSnapshotInput {
  name: string
  /** 이벤트의 `at` 문자열 — dedup 키 */
  eventKey: string
  /** ISO 8601 */
  date: string
  status: WikiSnapshotStatus
  created: number
  updated: number
  deleted: number
  totalPages: number | null
  totalSources: number | null
  layers: string | null
  kinds: string | null
  compiler: string | null
}

function plainText(values: Array<{ plain_text?: string }> | undefined): string {
  return (values ?? []).map((v) => v.plain_text ?? "").join("").trim()
}

function toWikiSnapshotItem(page: NotionWikiPage): WikiSnapshotItem {
  const p = page.properties
  return {
    pageId: page.id,
    name: plainText(p.Name?.title),
    eventKey: plainText(p["Event Key"]?.rich_text),
    date: p.Date?.date?.start ?? null,
    status: (p.Status?.select?.name as WikiSnapshotStatus | undefined) ?? null,
    created: p.Created?.number ?? 0,
    updated: p.Updated?.number ?? 0,
    deleted: p.Deleted?.number ?? 0,
    totalPages: p["Total Pages"]?.number ?? null,
    totalSources: p["Total Sources"]?.number ?? null,
    layers: plainText(p.Layers?.rich_text),
    kinds: plainText(p.Kinds?.rich_text),
    compiler: plainText(p.Compiler?.rich_text),
  }
}

export function getWikiDbId(): string | null {
  return process.env[WIKI_DB_ID_KEY] ?? null
}

function richText(content: string | null | undefined): Array<{ text: { content: string } }> {
  const safe = (content ?? "").trim().slice(0, 1800)
  return safe ? [{ text: { content: safe } }] : []
}

function numberValue(value: number | null | undefined): number | null {
  return value ?? null
}

/**
 * Wiki State DB 전체를 페이지네이션해 읽는다. has_more=true인데 next_cursor가
 * 없으면 조용히 진행하지 않고 던진다 — sessionLog.ts/operations.ts/
 * conversationLog.ts와 같은 이유(I3): 조용한 진행은 dedup 스냅샷을 반쪽만 채워
 * 다음 런이 잘려나간 이벤트를 "신규"로 오인해 중복 행을 쓰게 만든다.
 */
export async function listWikiSnapshots(): Promise<WikiSnapshotItem[]> {
  const dbId = getWikiDbId()
  if (!dbId) return []

  const results: NotionWikiPage[] = []
  let cursor: string | null = null
  do {
    const res: NotionWikiQueryResponse = await notionRequest<NotionWikiQueryResponse>(`/databases/${dbId}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    })
    results.push(...res.results)
    if (res.has_more) {
      if (!res.next_cursor) {
        throw new Error("Notion 페이지네이션 오류: has_more=true인데 next_cursor가 없습니다 (Wiki State)")
      }
      cursor = res.next_cursor
    } else {
      cursor = null
    }
  } while (cursor)

  return results.map(toWikiSnapshotItem)
}

export async function createWikiSnapshot(input: CreateWikiSnapshotInput): Promise<string> {
  const dbId = getWikiDbId()
  if (!dbId) throw new Error(`${WIKI_DB_ID_KEY} is not configured`)

  const res = await notionRequest<{ id: string }>("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        Name: { title: richText(input.name) },
        "Event Key": { rich_text: richText(input.eventKey) },
        Date: { date: { start: input.date } },
        Status: { select: { name: input.status } },
        Created: { number: input.created },
        Updated: { number: input.updated },
        Deleted: { number: input.deleted },
        "Total Pages": { number: numberValue(input.totalPages) },
        "Total Sources": { number: numberValue(input.totalSources) },
        Layers: { rich_text: richText(input.layers) },
        Kinds: { rich_text: richText(input.kinds) },
        Compiler: { rich_text: richText(input.compiler) },
      },
    }),
  })

  return res.id
}
