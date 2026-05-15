import { notionRequest } from "./client"
import type {
  ResearchProject,
  ResearchStatus,
  ResearchDecision,
  ResearchCreateInput,
  ResearchUpdateInput,
} from "../types/research"

interface NotionPage {
  id: string
  url: string
  properties: Record<string, NotionProperty>
}

interface NotionProperty {
  type: string
  title?: Array<{ plain_text?: string }>
  rich_text?: Array<{ plain_text?: string }>
  date?: { start: string; end: string | null } | null
  select?: { name: string } | null
  multi_select?: Array<{ name: string }>
  number?: number | null
  url?: string | null
}

interface NotionQueryResponse {
  results: NotionPage[]
  has_more: boolean
  next_cursor: string | null
}

interface NotionCreatePageResponse {
  id: string
  url: string
}

const DB_ID = () => process.env.NOTION_RESEARCH_DB_ID!

function getText(prop: NotionProperty | undefined): string {
  if (!prop) return ""
  if (prop.type === "title")
    return (prop.title ?? []).map((t) => t.plain_text ?? "").join("").trim()
  if (prop.type === "rich_text")
    return (prop.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim()
  return ""
}

function getSelect(prop: NotionProperty | undefined): string {
  return prop?.select?.name ?? ""
}

function getMultiSelect(prop: NotionProperty | undefined): string[] {
  return prop?.multi_select?.map((s) => s.name) ?? []
}

function getDate(prop: NotionProperty | undefined): string | null {
  if (!prop || prop.type !== "date") return null
  return prop.date?.start ?? null
}

const STATUS_ORDER: Record<string, number> = {
  // Tak 작업 단계 (펜이 그의 손에)
  "Idea": 0,
  "Lit Review": 1,
  "WNS": 1,                       // 레거시 alias
  "Drafting": 2,
  "Manuscript drafting": 2,        // 레거시 alias
  "\bManscript drafting": 2,       // 레거시 alias
  "Editing": 3,
  "Revision": 4,
  // 저널 대기
  "Submitted": 5,
  "Under Review": 6,
  "2nd Review": 7,
  // 종료
  "Accepted": 8,
  "Published": 9,
  "Rejected": 10,
  // 보류
  "Hold": 99,
}

function toResearchProject(page: NotionPage): ResearchProject {
  const p = page.properties
  const decisionRaw = getSelect(p.Decision)
  return {
    page_id: page.id,
    url: page.url,
    title: getText(p.Title),
    status: (getSelect(p.Status) as ResearchStatus) || "Idea",
    first_author: getMultiSelect(p["1st Author"]),
    co_author: getMultiSelect(p["Co-author"]),
    corresponding: getMultiSelect(p.Corresponding),
    target_journal: getSelect(p["Target J"]),
    start_date: getDate(p.Start),
    publish_date: getDate(p["출판"]),
    manuscript_id: getText(p["Manuscript ID"]) || null,
    manuscript_type: getSelect(p["Manuscript Type"]) || null,
    methodology: getMultiSelect(p.Methodology),
    decision: decisionRaw ? (decisionRaw as ResearchDecision) : null,
    review_round: p["Review Round"]?.number ?? null,
    deadline: getDate(p.Deadline),
    doi: getText(p.doi) || null,
  }
}

export async function listResearchProjects(): Promise<ResearchProject[]> {
  const allResults: NotionPage[] = []
  let cursor: string | undefined

  do {
    const response = await notionRequest<NotionQueryResponse>(
      `/databases/${DB_ID()}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      }
    )
    allResults.push(...response.results)
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined
  } while (cursor)

  const projects = allResults.map(toResearchProject)

  // Sort by status pipeline order, then by start date (nulls last)
  projects.sort((a, b) => {
    const statusDiff =
      (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
    if (statusDiff !== 0) return statusDiff
    if (!a.start_date && !b.start_date) return 0
    if (!a.start_date) return 1
    if (!b.start_date) return -1
    return a.start_date.localeCompare(b.start_date)
  })

  return projects
}

export async function createResearchProject(
  input: ResearchCreateInput
): Promise<{ page_id: string; url: string }> {
  const properties: Record<string, unknown> = {
    Title: {
      title: [{ text: { content: input.title } }],
    },
    Status: {
      select: { name: input.status },
    },
  }

  if (input.firstAuthor.length > 0) {
    properties["1st Author"] = {
      multi_select: input.firstAuthor.map((name) => ({ name })),
    }
  }

  if (input.corresponding.length > 0) {
    properties.Corresponding = {
      multi_select: input.corresponding.map((name) => ({ name })),
    }
  }

  if (input.targetJournal) {
    properties["Target J"] = {
      select: { name: input.targetJournal },
    }
  }

  if (input.startDate) {
    properties.Start = {
      date: { start: input.startDate },
    }
  }

  if (input.publishDate) {
    properties["출판"] = {
      date: { start: input.publishDate },
    }
  }

  const response = await notionRequest<NotionCreatePageResponse>("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: DB_ID() },
      properties,
    }),
  })

  return { page_id: response.id, url: response.url }
}

export async function updateResearchProject(
  pageId: string,
  updates: ResearchUpdateInput
): Promise<void> {
  const properties: Record<string, unknown> = {}

  if (updates.title !== undefined) {
    properties.Title = {
      title: [{ text: { content: updates.title } }],
    }
  }

  if (updates.status !== undefined) {
    properties.Status = {
      select: { name: updates.status },
    }
  }

  if (updates.firstAuthor !== undefined) {
    properties["1st Author"] = {
      multi_select: updates.firstAuthor.map((name) => ({ name })),
    }
  }

  if (updates.corresponding !== undefined) {
    properties.Corresponding = {
      multi_select: updates.corresponding.map((name) => ({ name })),
    }
  }

  if (updates.targetJournal !== undefined) {
    if (updates.targetJournal) {
      properties["Target J"] = {
        select: { name: updates.targetJournal },
      }
    } else {
      properties["Target J"] = { select: null }
    }
  }

  if (updates.startDate !== undefined) {
    properties.Start = updates.startDate
      ? { date: { start: updates.startDate } }
      : { date: null }
  }

  if (updates.publishDate !== undefined) {
    properties["출판"] = updates.publishDate
      ? { date: { start: updates.publishDate } }
      : { date: null }
  }

  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  })
}
