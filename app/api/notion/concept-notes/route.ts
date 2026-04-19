import { NextResponse } from "next/server"
import { notionRequest } from "@/lib/notion/client"

const CONCEPT_NOTES_DB_ID = "f0ecb091-93b8-4f6c-a136-42698d4bbbfb"

interface NotionRichText { plain_text?: string }
interface NotionProp {
  type: string
  title?: NotionRichText[]
  rich_text?: NotionRichText[]
  date?: { start: string } | null
  multi_select?: Array<{ name: string }>
  relation?: Array<{ id: string }>
}
interface NotionPage {
  id: string
  properties: Record<string, NotionProp>
}

function getText(prop: NotionProp | undefined): string {
  if (!prop) return ""
  if (prop.type === "title") return (prop.title ?? []).map((t) => t.plain_text ?? "").join("").trim()
  if (prop.type === "rich_text") return (prop.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim()
  return ""
}

export async function GET() {
  try {
    const res = await notionRequest<{ results: NotionPage[] }>(
      `/databases/${CONCEPT_NOTES_DB_ID}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          sorts: [{ property: "Date", direction: "descending" }],
          page_size: 100,
        }),
      },
    )
    const notes = res.results.map((p) => {
      const props = p.properties
      return {
        id: p.id,
        title: getText(props.Title),
        date: props.Date?.date?.start ?? null,
        type: (props.Type?.multi_select ?? []).map((o) => o.name),
        related_count: {
          positions: (props["Related Positions"]?.relation ?? []).length,
          transitions: (props["Related Transitions"]?.relation ?? []).length,
          techniques: (props["Related Techniques"]?.relation ?? []).length,
          archetypes: (props["Related Archetypes"]?.relation ?? []).length,
          competitions: (props["Related Competitions"]?.relation ?? []).length,
        },
      }
    })
    return NextResponse.json(notes)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
