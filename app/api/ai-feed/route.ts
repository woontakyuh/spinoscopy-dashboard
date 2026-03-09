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


function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ")
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

function extractMeta(html: string, property: string): string {
  // property="og:title" content="..." 또는 content="..." property="og:title"
  const r1 = new RegExp(`<meta[^>]*property="${property}"[^>]*content="([^"]*)"`, "i")
  const r2 = new RegExp(`<meta[^>]*content="([^"]*)"[^>]*property="${property}"`, "i")
  return r1.exec(html)?.[1] ?? r2.exec(html)?.[1] ?? ""
}

async function fetchSingleModuletter(issueNum: number): Promise<FeedItem | null> {
  const url = `https://moduletter.stibee.com/p/${issueNum}`
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SpinoscopyRadar/1.0)" },
    next: { revalidate: 43200 }, // 12시간 캐시 (발행 후 내용 변경 없음)
  })
  if (!res.ok) return null

  const html = await res.text()

  // og:title 또는 <title>에서 제목 추출
  let title = extractMeta(html, "og:title")
  if (!title) {
    const titleTag = html.match(/<title>([^<]*)<\/title>/)
    title = titleTag?.[1] ?? ""
  }
  title = decodeHtmlEntities(title.replace(/📮\s*/g, "").trim())
  if (!title) return null

  // 날짜 추출: "2026년 3월 9일" 또는 "March 9, 2026" 또는 og 메타
  let date = ""
  const koDate = html.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
  if (koDate) {
    date = `${koDate[1]}-${koDate[2].padStart(2, "0")}-${koDate[3].padStart(2, "0")}`
  } else {
    const enDate = html.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})/)
    if (enDate) {
      const months: Record<string, string> = {
        January: "01", February: "02", March: "03", April: "04", May: "05", June: "06",
        July: "07", August: "08", September: "09", October: "10", November: "11", December: "12",
      }
      date = `${enDate[3]}-${months[enDate[1]]}-${enDate[2].padStart(2, "0")}`
    }
  }

  // 날짜 없으면 발행일 추정 (주간 뉴스레터, 기준: #198 = 2026-03-09)
  if (!date) {
    const refDate = new Date("2026-03-09T00:00:00")
    const diff = (issueNum - 198) * 7
    refDate.setDate(refDate.getDate() + diff)
    date = refDate.toISOString().slice(0, 10)
  }

  // 요약 추출: og:description은 해시태그뿐이라 본문에서 첫 실질 문단 추출
  let summary: string | null = null
  // HTML 태그 제거 후 텍스트 추출, 인사말/해시태그 이후 첫 문장들
  const bodyText = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
  // "왔어요" 인사말 이후 본문 시작점 찾기
  const contentStart = bodyText.search(/(?:왔어요[^\w]*|레터가[^\w]*){1,}/)
  if (contentStart > -1) {
    const afterGreeting = bodyText.slice(contentStart + 20).trim()
    // 첫 150자 정도의 실질 텍스트
    const cleaned = afterGreeting
      .replace(/^[#\s@_.\d가-힣]*?(?=[가-힣]{2})/, "") // 해시태그/공백 건너뛰기
      .trim()
    if (cleaned.length > 20) {
      summary = cleaned.slice(0, 200).replace(/\s+/g, " ").trim()
      // 마지막 온전한 문장까지 자르기
      const lastPeriod = summary.lastIndexOf(".")
      const lastEnd = Math.max(lastPeriod, summary.lastIndexOf("요"), summary.lastIndexOf("다"))
      if (lastEnd > 50) summary = summary.slice(0, lastEnd + 1)
    }
  }
  if (!summary) {
    const desc = extractMeta(html, "og:description")
    summary = desc ? decodeHtmlEntities(desc).slice(0, 200) : null
  }

  return toFeedItem({
    sourceId: "moduletter",
    id: `moduletter-${issueNum}`,
    title: title || "모두레터",
    url,
    date,
    author: "모두연",
    summary,
  })
}

async function fetchModuletterItems(): Promise<FeedItem[]> {
  // 기준점: #198 = 2026-03-09 (월요일 발행)
  const refNum = 198
  const refDate = new Date("2026-03-09T00:00:00")
  const now = new Date()
  const weeksDiff = Math.floor((now.getTime() - refDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
  const estimatedLatest = refNum + Math.max(0, weeksDiff) + 1 // +1 버퍼

  // 최근 10개 이슈를 병렬 fetch
  const fetches = Array.from({ length: 10 }, (_, i) =>
    fetchSingleModuletter(estimatedLatest - i).catch(() => null)
  )

  const results = await Promise.all(fetches)
  return results
    .filter((item): item is FeedItem => item !== null)
    .sort((a, b) => b.date.localeCompare(a.date))
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
