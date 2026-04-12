import { notionRequest } from "./client"
import type {
  EditorialItem,
  EditorialRole,
  EditorialStatus,
  Recommendation,
  FinalDecision,
  ManuscriptType,
} from "../types/editorial"

interface NotionPage {
  id: string
  url: string
  properties: Record<string, NotionProperty>
}

interface NotionProperty {
  type: string
  title?: Array<{ plain_text?: string }>
  rich_text?: Array<{ plain_text?: string }>
  select?: { name: string } | null
  date?: { start: string | null } | null
  number?: number | null
  checkbox?: boolean
}

interface NotionQueryResponse {
  results: NotionPage[]
  has_more: boolean
  next_cursor: string | null
}

function getText(prop?: NotionProperty): string {
  if (!prop) return ""
  if (prop.title) return prop.title.map((t) => t.plain_text ?? "").join("")
  if (prop.rich_text) return prop.rich_text.map((t) => t.plain_text ?? "").join("")
  return ""
}

const DB_ID = process.env.NOTION_EDITORIAL_DB_ID ?? ""

function mapPage(page: NotionPage): EditorialItem {
  const p = page.properties
  return {
    page_id: page.id,
    url: page.url,
    name: getText(p.Name),
    role: (p.Role?.select?.name as EditorialRole) ?? "Reviewer",
    journal: p.Journal?.select?.name ?? "",
    manuscript_id: getText(p["Manuscript ID"]),
    manuscript_type: (p["Manuscript Type"]?.select?.name as ManuscriptType) ?? "Other",
    status: (p.Status?.select?.name as EditorialStatus) ?? "Received",
    first_recommendation: (p["First Recommendation"]?.select?.name as Recommendation) ?? null,
    last_recommendation: (p["Last Recommendation"]?.select?.name as Recommendation) ?? null,
    final_decision: (p["Final Decision"]?.select?.name as FinalDecision) ?? null,
    date_received: p["Date Received"]?.date?.start ?? null,
    date_submitted: p["Date Submitted"]?.date?.start ?? null,
    deadline: p.Deadline?.date?.start ?? null,
    decision_date: p["Decision Date"]?.date?.start ?? null,
    review_round: p["Review Round"]?.number ?? null,
    reviewers: getText(p.Reviewers),
    notes: getText(p.Notes),
  }
}

export async function listEditorialItems(): Promise<EditorialItem[]> {
  const items: EditorialItem[] = []
  let cursor: string | null = null
  let hasMore = true

  while (hasMore) {
    const body: Record<string, unknown> = {
      page_size: 100,
      sorts: [{ property: "Date Received", direction: "descending" }],
    }
    if (cursor) body.start_cursor = cursor

    const response = await notionRequest<NotionQueryResponse>(
      `/databases/${DB_ID}/query`,
      { method: "POST", body: JSON.stringify(body) }
    )

    for (const page of response.results) {
      items.push(mapPage(page))
    }

    hasMore = response.has_more
    cursor = response.next_cursor
  }

  return items
}
