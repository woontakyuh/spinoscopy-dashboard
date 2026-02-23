import { NextResponse } from "next/server"
import type { FeedItem, FeedResponse } from "@/lib/types/radar"
import { RADAR_SOURCES, getSourceConfig } from "@/lib/radar/sources"
import { buildRuleBasedNote, inferCategories, scoreImportance } from "@/lib/radar/classify"

interface RssItem {
  title?: string
  link?: string
  pubDate?: string
  creator?: string
  "dc:creator"?: string
  guid?: string
}

interface HfDailyPaper {
  title?: string
  paper?: {
    id?: string
    title?: string
    publishedAt?: string
    published_at?: string
    source?: string
    url?: string
    summary?: string
    authors?: Array<{ name?: string }>
  }
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

function normalizeDate(raw?: string): string {
  if (!raw) return ""
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ""
  return parsed.toISOString().slice(0, 10)
}

interface BatchPost {
  title: string
  slug: string
  custom_excerpt?: string
  published_at: string
}

interface BatchNextData {
  props: {
    pageProps: {
      posts: BatchPost[]
    }
  }
}

function toFeedItem(params: {
  sourceId: FeedItem["source"]
  id: string
  title: string
  url: string
  date?: string
  author?: string | null
  points?: number | null
  commentUrl?: string | null
  summary?: string | null
}): FeedItem {
  const config = getSourceConfig(params.sourceId)
  const sourceLabel = config?.label ?? params.sourceId
  const tier = config?.tier ?? "tier1-daily"
  const cadence = config?.cadence ?? "24h"
  const categories = inferCategories(params.title, params.sourceId, tier)
  const importanceScore = scoreImportance(params.title, categories, tier)

  const base: FeedItem = {
    id: params.id,
    title: params.title,
    url: params.url,
    source: params.sourceId,
    sourceLabel,
    tier,
    cadence,
    author: params.author ?? null,
    date: params.date ?? "",
    points: params.points ?? null,
    commentUrl: params.commentUrl ?? null,
    summary: params.summary ?? null,
    categories,
    importanceScore,
    notes: null,
  }

  return {
    ...base,
    notes: buildRuleBasedNote(base),
  }
}

async function fetchRssItems(sourceId: FeedItem["source"], endpoint: string, limit = 12): Promise<FeedItem[]> {
  const config = getSourceConfig(sourceId)
  const revalidate = (config?.intervalHours ?? 24) * 3600

  const res = await fetch(endpoint, { next: { revalidate } })
  if (!res.ok) return []

  const xml = await res.text()
  const rssItems = parseRssItems(xml)

  return rssItems
    .filter((item) => Boolean(item.title && item.link))
    .slice(0, limit)
    .map((item, idx) =>
      toFeedItem({
        sourceId,
        id: `${sourceId}-${item.guid ?? idx}`,
        title: item.title ?? "Untitled",
        url: item.link ?? endpoint,
        date: normalizeDate(item.pubDate),
        author: item.creator ?? null,
      })
    )
}

async function fetchTheBatchItems(): Promise<FeedItem[]> {
  const config = getSourceConfig("the-batch")
  const res = await fetch("https://www.deeplearning.ai/the-batch/", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SpinoscopyRadar/1.0)" },
    next: { revalidate: (config?.intervalHours ?? 168) * 3600 },
  })

  if (!res.ok) return []

  const html = await res.text()
  const dataMatch = html.match(/__NEXT_DATA__[^>]*>([\s\S]*?)<\/script>/)
  if (!dataMatch) return []

  let data: BatchNextData
  try {
    data = JSON.parse(dataMatch[1]) as BatchNextData
  } catch {
    return []
  }

  const posts = data.props?.pageProps?.posts ?? []

  return posts.slice(0, 10).map((post) =>
    toFeedItem({
      sourceId: "the-batch",
      id: `batch-${post.slug}`,
      title: post.title,
      url: `https://www.deeplearning.ai/the-batch/${post.slug}/`,
      author: "Andrew Ng",
      date: normalizeDate(post.published_at),
    })
  )
}

async function fetchHfDailyPapers(): Promise<FeedItem[]> {
  const config = getSourceConfig("hf-daily-papers")
  const res = await fetch("https://huggingface.co/api/daily_papers", {
    next: { revalidate: (config?.intervalHours ?? 6) * 3600 },
  })

  if (!res.ok) return []

  const payload = (await res.json()) as HfDailyPaper[]

  return payload.slice(0, 15).map((entry, idx) => {
    const paper = entry.paper
    const title = paper?.title ?? entry.title ?? "Untitled"
    const url = paper?.url ?? (paper?.id ? `https://huggingface.co/papers/${paper.id}` : "https://huggingface.co/papers")
    const author = paper?.authors?.[0]?.name ?? null
    const date = normalizeDate(paper?.publishedAt ?? paper?.published_at)

    return toFeedItem({
      sourceId: "hf-daily-papers",
      id: `hf-paper-${paper?.id ?? idx}`,
      title,
      url,
      author,
      date,
      summary: paper?.summary ?? null,
    })
  })
}

async function fetchModuletterItems(): Promise<FeedItem[]> {
  const config = getSourceConfig("moduletter")
  const res = await fetch("https://modulabs.co.kr/blog?page=1", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SpinoscopyRadar/1.0)" },
    next: { revalidate: (config?.intervalHours ?? 168) * 3600 },
  })

  if (!res.ok) return []

  const html = await res.text()

  // Parse blog cards: links containing "moduletter" in href
  const items: FeedItem[] = []

  // Split HTML into card blocks by link boundaries
  const blocks = html.split(/(?=<a[^>]*href="\/blog\/[^"]*moduletter)/)

  for (const block of blocks) {
    const linkMatch = block.match(/href="(\/blog\/[^"]*moduletter[^"]*)"/)
    if (!linkMatch) continue

    const slug = linkMatch[1].replace(/\?page=\d+/, "")
    const url = `https://modulabs.co.kr${slug}`

    // Extract title — look for heading tags or text content
    let title = "Untitled"
    const h3Match = block.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/)
    if (h3Match) {
      title = h3Match[1].replace(/<[^>]*>/g, "").replace(/\ud83d\udcee\s*\ubaa8\ub450\ub808\ud130\s*[:\uff1a]\s*/g, "").trim()
    }

    // Extract date (2026.02.23 → 2026-02-23)
    let date = ""
    const dateMatch = block.match(/(\d{4})\.(\d{2})\.(\d{2})/)
    if (dateMatch) {
      date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    }

    // Extract summary/description
    let summary: string | null = null
    const pMatch = block.match(/<p[^>]*>([^<]{10,})<\/p>/)
    if (pMatch) {
      summary = pMatch[1].trim()
    }

    items.push(
      toFeedItem({
        sourceId: "moduletter",
        id: `moduletter-${slug.replace(/\//g, "-")}`,
        title: title || "\ubaa8\ub450\ub808\ud130",
        url,
        date,
        author: "\ubaa8\ub450\uc5f0",
        summary,
      })
    )
  }

  return items.slice(0, 10)
}

export async function GET() {
  try {
    const [batchItems, hfItems, tldrItems, rundownItems, importAiItems, latentSpaceItems, raschkaItems, arxivItems, natureItems, radiologyItems, msrItems, moduletterItems] =
      await Promise.all([
        fetchTheBatchItems().catch(() => []),
        fetchHfDailyPapers().catch(() => []),
        fetchRssItems("tldr-ai", "https://tldr.tech/api/rss/ai").catch(() => []),
        fetchRssItems("the-rundown-ai", "https://www.therundown.ai/rss").catch(() => []),
        fetchRssItems("import-ai", "https://importai.substack.com/feed").catch(() => []),
        fetchRssItems("latent-space", "https://www.latent.space/feed").catch(() => []),
        fetchRssItems("raschka", "https://magazine.sebastianraschka.com/feed").catch(() => []),
        fetchRssItems("arxiv", "https://rss.arxiv.org/rss/cs.AI+cs.LG", 20).catch(() => []),
        fetchRssItems("nature-digital-medicine", "https://www.nature.com/npjdigitalmed.rss").catch(() => []),
        fetchRssItems("radiology-ai", "https://pubs.rsna.org/action/showFeed?type=etoc&feed=rss&jc=ai").catch(() => []),
        fetchRssItems("msr-health", "https://www.microsoft.com/en-us/research/blog/feed/").then((items) => {
          return items.filter((item) => {
            const text = `${item.title} ${item.summary ?? ""}`.toLowerCase()
            return ["health", "medical", "clinical", "radiology", "hospital", "patient"].some((k) => text.includes(k))
          })
        }).catch(() => []),
        fetchModuletterItems().catch(() => []),
      ])

    const activeSourceCount = RADAR_SOURCES.filter((s) => s.active && s.mode !== "manual").length

    const items = [
      ...batchItems,
      ...hfItems,
      ...tldrItems,
      ...rundownItems,
      ...importAiItems,
      ...latentSpaceItems,
      ...raschkaItems,
      ...arxivItems,
      ...natureItems,
      ...radiologyItems,
      ...msrItems,
      ...moduletterItems,
    ]
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date)
        return b.importanceScore - a.importanceScore
      })
      .slice(0, Math.max(80, activeSourceCount * 6))

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
