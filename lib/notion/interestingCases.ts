import { notionRequest } from "./client"

interface NotionRichText { plain_text?: string }
interface NotionProperty {
  type: string
  title?: NotionRichText[]
  rich_text?: NotionRichText[]
  date?: { start: string | null; end: string | null } | null
  multi_select?: Array<{ name: string }>
  select?: { name: string } | null
}
interface NotionPage {
  id: string
  url: string
  last_edited_time: string
  properties: Record<string, NotionProperty>
}
interface NotionQueryResponse {
  results: NotionPage[]
  next_cursor: string | null
  has_more: boolean
}

function getText(prop: NotionProperty | undefined): string {
  if (!prop) return ""
  if (prop.type === "title") return (prop.title ?? []).map((t) => t.plain_text ?? "").join("").trim()
  if (prop.type === "rich_text") return (prop.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim()
  return ""
}

function getMultiSelect(prop: NotionProperty | undefined): string[] {
  return (prop?.multi_select ?? []).map((o) => o.name).filter(Boolean)
}

export interface InterestingCase {
  page_id: string
  url: string
  name: string
  pt_no: string
  age: string
  sex: string
  preop_dx: string
  note: string
  hospital: string[]
  db_tags: string[]
  last_edited_time: string
}

function toCase(page: NotionPage): InterestingCase {
  const p = page.properties
  return {
    page_id: page.id,
    url: page.url,
    name: getText(p.Name),
    pt_no: getText(p["Pt No"]),
    age: getText(p.Age),
    sex: p.Sex?.select?.name?.trim() ?? "",
    preop_dx: getText(p["Preop Dx"]),
    note: getText(p.Note),
    hospital: getMultiSelect(p.Hospital),
    db_tags: getMultiSelect(p.DB),
    last_edited_time: page.last_edited_time,
  }
}

/** Patient DB에서 DB 컬럼에 "Interesting case" 태그가 있는 환자를 반환한다. */
export async function listInterestingCases(limit = 100): Promise<InterestingCase[]> {
  const dbId = process.env.NOTION_PATIENT_DB_ID
  if (!dbId) throw new Error("NOTION_PATIENT_DB_ID is not configured")

  const all: NotionPage[] = []
  let cursor: string | undefined

  do {
    const body: Record<string, unknown> = {
      filter: { property: "DB", multi_select: { contains: "Interesting case" } },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: Math.min(100, limit - all.length),
    }
    if (cursor) body.start_cursor = cursor

    const res = await notionRequest<NotionQueryResponse>(`/databases/${dbId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    })
    all.push(...res.results)
    cursor = res.has_more && res.next_cursor && all.length < limit ? res.next_cursor : undefined
  } while (cursor)

  return all.slice(0, limit).map(toCase)
}
