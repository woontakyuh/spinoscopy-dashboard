import { NextResponse } from "next/server"
import { TRACKED_ASSETS } from "@/lib/vault/assets"
import type { VaultNewsItem, VaultNewsResponse } from "@/lib/types/vault"

function extractCdata(raw: string): string {
  const match = raw.match(/<!\[CDATA\[([\s\S]*?)]]>/)
  return match ? match[1].trim() : raw.trim()
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim()
}

interface ParsedNewsItem {
  title: string
  link: string
  source: string
  pubDate: string
}

function parseGoogleNewsRss(xml: string): ParsedNewsItem[] {
  const items: ParsedNewsItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g

  for (
    let match = itemRegex.exec(xml);
    match !== null;
    match = itemRegex.exec(xml)
  ) {
    const block = match[1]
    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
      return m ? extractCdata(m[1]) : ""
    }

    const rawTitle = get("title")
    const titleParts = stripHtml(rawTitle).split(" - ")
    const source = titleParts.length > 1 ? titleParts.pop()! : "Google News"
    const title = titleParts.join(" - ")

    items.push({
      title,
      link: get("link"),
      source,
      pubDate: get("pubDate"),
    })
  }

  return items
}

async function fetchNewsForAsset(
  symbol: string,
  query: string,
): Promise<VaultNewsItem[]> {
  const encoded = encodeURIComponent(query)
  const url = `https://news.google.com/rss/search?q=${encoded}&hl=ko&gl=KR&ceid=KR:ko`

  const res = await fetch(url, { next: { revalidate: 1800 } })
  if (!res.ok) return []

  const xml = await res.text()
  const parsed = parseGoogleNewsRss(xml)

  return parsed.slice(0, 5).map((item, idx) => ({
    id: `vault-${symbol}-${idx}`,
    title: item.title,
    url: item.link,
    source: item.source,
    date: item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : "",
    asset: symbol,
  }))
}

export async function GET() {
  try {
    const allNews = await Promise.all(
      TRACKED_ASSETS.map((asset) =>
        fetchNewsForAsset(asset.symbol, asset.newsQuery)
      )
    )

    const items = allNews
      .flat()
      .sort((a, b) => b.date.localeCompare(a.date))

    const response: VaultNewsResponse = {
      items,
      fetchedAt: new Date().toISOString(),
    }

    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
