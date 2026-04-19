import { NextResponse } from "next/server"
import { notionRequest } from "@/lib/notion/client"

const COMPETITIONS_DB_ID = "e404bc96-ef6e-4436-99e3-05878c175815"

interface NotionRichText { plain_text?: string }
interface NotionProp {
  type: string
  title?: NotionRichText[]
  rich_text?: NotionRichText[]
  date?: { start: string } | null
  select?: { name: string } | null
  checkbox?: boolean
}
interface NotionPage {
  id: string
  url: string
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
      `/databases/${COMPETITIONS_DB_ID}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          sorts: [{ property: "Date", direction: "ascending" }],
          page_size: 100,
        }),
      },
    )
    const comps = res.results.map((p) => {
      const props = p.properties
      return {
        id: p.id,
        url: p.url,
        name: getText(props.Name),
        date: props.Date?.date?.start ?? null,
        location: getText(props.Location),
        tier: props.Tier?.select?.name ?? null,
        belt: props.Belt?.select?.name ?? null,
        weight_class: props["Weight Class"]?.select?.name ?? null,
        division: props.Division?.select?.name ?? null,
        gi_nogi: props["Gi/No-Gi"]?.select?.name ?? null,
        status: props["Registration Status"]?.select?.name ?? null,
        is_target: props["Is Target"]?.checkbox ?? false,
        result: getText(props.Result),
        source: props.Source?.select?.name ?? null,
      }
    })
    return NextResponse.json(comps)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
