import { NextResponse } from "next/server"
import { notionRequest } from "@/lib/notion/client"

interface NotionProperty {
  type: string
  title?: Array<{ plain_text?: string }>
  rich_text?: Array<{ plain_text?: string }>
  date?: { start: string; end: string | null } | null
  multi_select?: Array<{ name: string }>
}

interface NotionPage {
  id: string
  url: string
  properties: Record<string, NotionProperty>
}

interface NotionQueryResponse {
  results: NotionPage[]
}

interface DashboardSurgeryItem {
  page_id: string
  name: string
  op_name: string
  op_date: string | null
  hospital: string
  url: string
}

function getText(prop: NotionProperty | undefined): string {
  if (!prop) return ""
  if (prop.type === "title") return (prop.title ?? []).map((item) => item.plain_text ?? "").join("").trim()
  if (prop.type === "rich_text") return (prop.rich_text ?? []).map((item) => item.plain_text ?? "").join("").trim()
  return ""
}

function getMultiSelect(prop: NotionProperty | undefined): string {
  return (prop?.multi_select ?? []).map((option) => option.name).join(", ")
}

function getTodayInSeoul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

export async function GET() {
  try {
    const dbId = process.env.NOTION_PATIENT_DB_ID
    if (!dbId) {
      return NextResponse.json({ error: "NOTION_PATIENT_DB_ID is not configured" }, { status: 500 })
    }

    const today = getTodayInSeoul()
    const response = await notionRequest<NotionQueryResponse>(`/databases/${dbId}/query`, {
      method: "POST",
      body: JSON.stringify({
        filter: {
          property: "Op Date",
          date: { equals: today },
        },
        sorts: [{ property: "Op Date", direction: "ascending" }],
        page_size: 100,
      }),
    })

    const items: DashboardSurgeryItem[] = response.results.map((page) => {
      const properties = page.properties
      return {
        page_id: page.id,
        name: getText(properties.Name),
        op_name: getText(properties["Op Name"]),
        op_date: properties["Op Date"]?.date?.start ?? null,
        hospital: getMultiSelect(properties.Hospital),
        url: page.url,
      }
    })

    return NextResponse.json(items)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
