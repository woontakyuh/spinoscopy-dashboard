import { NextResponse } from "next/server"
import type { FeedItem, FeedResponse } from "@/lib/types/radar"

interface HnHit {
  objectID: string
  title: string
  url: string | null
  author: string
  created_at: string
  points: number
  num_comments: number
}

interface HnSearchResponse {
  hits: HnHit[]
}

interface RssItem {
  title?: string
  link?: string
  pubDate?: string
  creator?: string
  "dc:creator"?: string
  guid?: string
}

function extractCdata(raw: string): string {
  const match = raw.match(/<!\[CDATA\[([\s\S]*?)]]>/)
  return match ? match[1].trim() : raw.trim()
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  for (
    let match = itemRegex.exec(xml);
    match !== null;
    match = itemRegex.exec(xml)
  ) {
    const block = match[1]
    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
      return m ? extractCdata(m[1]) : undefined
    }
    items.push({
      title: get("title"),
      link: get("link"),
      pubDate: get("pubDate"),
      creator: get("dc:creator") ?? get("creator"),
      guid: get("guid"),
    })
  }
  return items
}

async function fetchHnItems(): Promise<FeedItem[]> {
  const params = new URLSearchParams({
    query: "AI",
    tags: "story",
    numericFilters: `created_at_i>${Math.floor(Date.now() / 1000) - 86400 * 3}`,
    hitsPerPage: "20",
  })

  const res = await fetch(`https://hn.algolia.com/api/v1/search?${params}`, {
    next: { revalidate: 600 },
  })

  if (!res.ok) return []

  const data = (await res.json()) as HnSearchResponse

  return data.hits.map((hit) => ({
    id: `hn-${hit.objectID}`,
    title: hit.title,
    url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
    source: "hn" as const,
    sourceLabel: "Hacker News",
    author: hit.author,
    date: hit.created_at.slice(0, 10),
    points: hit.points,
    commentUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    summary: null,
  }))
}

async function fetchTechCrunchItems(): Promise<FeedItem[]> {
  const res = await fetch("https://techcrunch.com/category/artificial-intelligence/feed/", {
    next: { revalidate: 1800 },
  })

  if (!res.ok) return []

  const xml = await res.text()
  const rssItems = parseRssItems(xml)

  return rssItems.slice(0, 15).map((item, idx) => ({
    id: `tc-${item.guid ?? idx}`,
    title: item.title ?? "Untitled",
    url: item.link ?? "https://techcrunch.com/category/artificial-intelligence/",
    source: "techcrunch" as const,
    sourceLabel: "TechCrunch",
    author: item.creator ?? null,
    date: item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : "",
    points: null,
    commentUrl: null,
    summary: null,
  }))
}

export async function GET() {
  try {
    const [hnItems, tcItems] = await Promise.all([
      fetchHnItems(),
      fetchTechCrunchItems(),
    ])

    const items = [...hnItems, ...tcItems].sort(
      (a, b) => b.date.localeCompare(a.date)
    )

    const response: FeedResponse = {
      items,
      fetchedAt: new Date().toISOString(),
    }

    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
