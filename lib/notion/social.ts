import { notionRequest } from "./client"
import { accountLang } from "@/lib/radar/socialSources"
import type { SocialItem, SocialPlatform } from "@/lib/types/social"

// Notion "Social Feed" DB 속성 (스펙 2026-06-22-radar-social-column-design):
// Title(title) / Platform(select) / Account(rich_text) / PostId(rich_text) /
// URL(url) / FullText(rich_text) / PostedAt(date) / CollectedAt(date)

interface NotionRichText {
  plain_text?: string
}
interface NotionProperty {
  type: string
  title?: NotionRichText[]
  rich_text?: NotionRichText[]
  select?: { name?: string } | null
  url?: string | null
  date?: { start?: string } | null
}
interface NotionPage {
  id: string
  properties: Record<string, NotionProperty>
}
interface NotionQueryResponse {
  results: NotionPage[]
}

function plainText(prop?: NotionProperty): string {
  if (!prop) return ""
  const rich = prop.title ?? prop.rich_text ?? []
  return rich.map((r) => r.plain_text ?? "").join("").trim()
}

function toSocialItem(page: NotionPage): SocialItem | null {
  const props = page.properties
  const platformRaw = props.Platform?.select?.name ?? ""
  const platform: SocialPlatform = platformRaw === "x" ? "x" : "threads"
  const account = plainText(props.Account)
  const text = plainText(props.FullText) || plainText(props.Title)
  const url = props.URL?.url ?? ""
  if (!text || !url) return null
  return {
    id: page.id,
    platform,
    account,
    lang: accountLang(account),
    text,
    url,
    postedAt: props.PostedAt?.date?.start ?? "",
  }
}

export async function querySocialItems(limit = 40): Promise<SocialItem[]> {
  const dbId = process.env.NOTION_SOCIAL_DB_ID
  if (!dbId) return []

  const data = await notionRequest<NotionQueryResponse>(`/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: limit,
      sorts: [{ property: "PostedAt", direction: "descending" }],
    }),
  })

  return data.results
    .map(toSocialItem)
    .filter((item): item is SocialItem => item !== null)
}
