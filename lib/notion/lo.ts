import { notionRequest } from "./client"

const POSITIONS_DB = "d8d39f85-82f7-4cb7-9d59-484b76a8407b"
const TRANSITIONS_DB = "c5fd431a-c58c-42cd-af7f-fcfa3cb196ea"
const TECHNIQUES_DB = "38319eac-3335-431e-a53d-f84a8ae83f6a"
const ARCHETYPES_DB = "44202e73-974b-4674-88c6-456a9fa5a759"
const GAME_PLANS_HUB = "33d908af-25b9-81eb-8726-cad2f8f36169"
const PLAYER_PROFILE_PAGE = "346908af-25b9-81cb-bf79-faf5c785cb1c"

interface NotionRichText { plain_text?: string }

interface NotionProp {
  type: string
  title?: NotionRichText[]
  rich_text?: NotionRichText[]
  select?: { name: string } | null
  multi_select?: Array<{ name: string }>
  number?: number | null
  relation?: Array<{ id: string }>
  url?: string | null
  checkbox?: boolean
  date?: { start: string; end?: string | null } | null
}

interface NotionPageRow {
  id: string
  url: string
  properties: Record<string, NotionProp>
}

const titlePropCache = new Map<string, string>()

async function getTitlePropName(dbId: string): Promise<string> {
  const cached = titlePropCache.get(dbId)
  if (cached) return cached
  const db = await notionRequest<{ properties: Record<string, { type: string }> }>(`/databases/${dbId}`)
  const name = Object.entries(db.properties).find(([, p]) => p.type === "title")?.[0] ?? "Name"
  titlePropCache.set(dbId, name)
  return name
}

function getPlainText(prop: NotionProp | undefined): string {
  if (!prop) return ""
  if (prop.type === "title" && prop.title) return prop.title.map((t) => t.plain_text ?? "").join("").trim()
  if (prop.type === "rich_text" && prop.rich_text) return prop.rich_text.map((t) => t.plain_text ?? "").join("").trim()
  return ""
}

function summarizeProperties(properties: Record<string, NotionProp>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, prop] of Object.entries(properties)) {
    if (prop.type === "title" || prop.type === "rich_text") {
      const v = getPlainText(prop)
      if (v) out[key] = v
    } else if (prop.type === "select") {
      if (prop.select?.name) out[key] = prop.select.name
    } else if (prop.type === "multi_select" && prop.multi_select && prop.multi_select.length > 0) {
      out[key] = prop.multi_select.map((o) => o.name)
    } else if (prop.type === "number" && prop.number !== null && prop.number !== undefined) {
      out[key] = prop.number
    } else if (prop.type === "relation" && prop.relation && prop.relation.length > 0) {
      out[key] = prop.relation.map((r) => r.id)
    } else if (prop.type === "url" && prop.url) {
      out[key] = prop.url
    } else if (prop.type === "checkbox") {
      out[key] = prop.checkbox ?? false
    } else if (prop.type === "date" && prop.date?.start) {
      out[key] = prop.date.start
    }
  }
  return out
}

interface QueryRow {
  id: string
  url: string
  title: string
  properties: Record<string, unknown>
}

async function queryByTitleContains(dbId: string, query: string, limit: number): Promise<QueryRow[]> {
  const titleProp = await getTitlePropName(dbId)
  const res = await notionRequest<{ results: NotionPageRow[] }>(
    `/databases/${dbId}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: { property: titleProp, title: { contains: query } },
        page_size: Math.min(Math.max(limit, 1), 50),
      }),
    },
  )
  return res.results.map((p) => ({
    id: p.id,
    url: p.url,
    title: getPlainText(p.properties[titleProp]),
    properties: summarizeProperties(p.properties),
  }))
}

export async function lookupTechnique(name: string, limit = 5): Promise<QueryRow[]> {
  return queryByTitleContains(TECHNIQUES_DB, name, limit)
}

export async function lookupPosition(name: string, limit = 5): Promise<QueryRow[]> {
  return queryByTitleContains(POSITIONS_DB, name, limit)
}

export async function lookupArchetype(name: string, limit = 3): Promise<QueryRow[]> {
  return queryByTitleContains(ARCHETYPES_DB, name, limit)
}

export async function findTransitions(
  fromPosition?: string,
  toPosition?: string,
  limit = 20,
): Promise<QueryRow[]> {
  const titleProp = await getTitlePropName(TRANSITIONS_DB)
  const res = await notionRequest<{ results: NotionPageRow[] }>(
    `/databases/${TRANSITIONS_DB}/query`,
    { method: "POST", body: JSON.stringify({ page_size: 100 }) },
  )
  const rows: QueryRow[] = res.results.map((p) => ({
    id: p.id,
    url: p.url,
    title: getPlainText(p.properties[titleProp]),
    properties: summarizeProperties(p.properties),
  }))
  if (!fromPosition && !toPosition) return rows.slice(0, limit)
  const matches = (r: QueryRow, q: string) => {
    const hay = (r.title + " " + JSON.stringify(r.properties)).toLowerCase()
    return hay.includes(q.toLowerCase())
  }
  const filtered = rows.filter((r) =>
    (fromPosition ? matches(r, fromPosition) : true) && (toPosition ? matches(r, toPosition) : true),
  )
  return filtered.slice(0, limit)
}

// ─── Page content flattening (Player Profile, Game Plans) ──────

interface Block {
  id: string
  type: string
  has_children?: boolean
  paragraph?: { rich_text: NotionRichText[] }
  heading_1?: { rich_text: NotionRichText[] }
  heading_2?: { rich_text: NotionRichText[] }
  heading_3?: { rich_text: NotionRichText[] }
  bulleted_list_item?: { rich_text: NotionRichText[] }
  numbered_list_item?: { rich_text: NotionRichText[] }
  quote?: { rich_text: NotionRichText[] }
  to_do?: { rich_text: NotionRichText[]; checked?: boolean }
  toggle?: { rich_text: NotionRichText[] }
  callout?: { rich_text: NotionRichText[] }
  code?: { rich_text: NotionRichText[]; language?: string }
  child_page?: { title: string }
}

function blockToText(block: Block, depth = 0): string {
  const indent = "  ".repeat(depth)
  const extract = (rt?: NotionRichText[]) => (rt ?? []).map((t) => t.plain_text ?? "").join("")
  switch (block.type) {
    case "paragraph":
      return indent + extract(block.paragraph?.rich_text)
    case "heading_1":
      return `\n# ${extract(block.heading_1?.rich_text)}`
    case "heading_2":
      return `\n## ${extract(block.heading_2?.rich_text)}`
    case "heading_3":
      return `\n### ${extract(block.heading_3?.rich_text)}`
    case "bulleted_list_item":
      return `${indent}- ${extract(block.bulleted_list_item?.rich_text)}`
    case "numbered_list_item":
      return `${indent}1. ${extract(block.numbered_list_item?.rich_text)}`
    case "quote":
      return `${indent}> ${extract(block.quote?.rich_text)}`
    case "to_do":
      return `${indent}${block.to_do?.checked ? "[x]" : "[ ]"} ${extract(block.to_do?.rich_text)}`
    case "toggle":
      return `${indent}▸ ${extract(block.toggle?.rich_text)}`
    case "callout":
      return `${indent}💡 ${extract(block.callout?.rich_text)}`
    case "code":
      return `${indent}\`\`\`${block.code?.language ?? ""}\n${extract(block.code?.rich_text)}\n\`\`\``
    case "child_page":
      return `${indent}📄 ${block.child_page?.title ?? "(untitled)"}`
    default:
      return ""
  }
}

async function fetchAllBlocks(blockId: string): Promise<Block[]> {
  const all: Block[] = []
  let cursor: string | undefined
  do {
    const url = `/blocks/${blockId}/children${cursor ? `?start_cursor=${cursor}` : ""}`
    const res = await notionRequest<{ results: Block[]; has_more: boolean; next_cursor: string | null }>(url)
    all.push(...res.results)
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
  } while (cursor)
  return all
}

async function flattenPage(pageId: string, maxDepth = 2): Promise<string> {
  const render = async (bid: string, depth: number): Promise<string[]> => {
    if (depth > maxDepth) return []
    const blocks = await fetchAllBlocks(bid)
    const lines: string[] = []
    for (const b of blocks) {
      const line = blockToText(b, depth)
      if (line) lines.push(line)
      if (b.has_children && depth < maxDepth) {
        const nested = await render(b.id, depth + 1)
        lines.push(...nested)
      }
    }
    return lines
  }
  const lines = await render(pageId, 0)
  return lines.join("\n").trim()
}

export async function getPlayerProfile(): Promise<string | null> {
  try {
    const page = await notionRequest<{ properties: Record<string, NotionProp> }>(`/pages/${PLAYER_PROFILE_PAGE}`)
    const props = summarizeProperties(page.properties)
    const propsLines = Object.entries(props)
      .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n")
    const content = await flattenPage(PLAYER_PROFILE_PAGE, 2)
    const sections: string[] = []
    if (propsLines) sections.push(propsLines)
    if (content) sections.push(content)
    const out = sections.join("\n\n").trim()
    return out || null
  } catch {
    return null
  }
}

export async function listGamePlans(): Promise<Array<{ id: string; title: string; url: string }>> {
  try {
    const blocks = await fetchAllBlocks(GAME_PLANS_HUB)
    return blocks
      .filter((b) => b.type === "child_page")
      .map((b) => ({
        id: b.id,
        title: b.child_page?.title ?? "(untitled)",
        url: `https://www.notion.so/${b.id.replace(/-/g, "")}`,
      }))
  } catch {
    return []
  }
}

export async function getGamePlan(
  titleQuery: string,
): Promise<{ title: string; content: string; url: string } | null> {
  const plans = await listGamePlans()
  const q = titleQuery.toLowerCase()
  const match =
    plans.find((p) => p.title.toLowerCase() === q) ??
    plans.find((p) => p.title.toLowerCase().includes(q))
  if (!match) return null
  const content = await flattenPage(match.id, 3)
  return { title: match.title, content, url: match.url }
}
