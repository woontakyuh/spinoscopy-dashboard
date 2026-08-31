import { z } from "zod"

import type {
  AiFrontierCatalogEpisode,
  AiFrontierOfficialEpisode,
} from "@/lib/types/ai-frontier-import"

const AI_FRONTIER_ORIGIN = "https://aifrontier.kr"
const AI_FRONTIER_SITEMAP = `${AI_FRONTIER_ORIGIN}/sitemap.xml`
const KOREAN_EPISODE_PATH = /^\/ko\/episodes\/ep(\d+)$/
const MAX_CATALOG_CONCURRENCY = 6

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

const podcastEpisodeSchema = z.object({
  "@type": z.literal("PodcastEpisode"),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  datePublished: z.string().trim().min(1).optional(),
  duration: z.string().trim().min(1).optional(),
  episodeNumber: z.number().int().positive(),
  url: z.string().url(),
  associatedMedia: z.object({
    embedUrl: z.string().url(),
  }).optional(),
})

function officialEpisodeNumber(value: string): number {
  const url = new URL(value)
  const match = url.origin === AI_FRONTIER_ORIGIN
    ? url.pathname.match(KOREAN_EPISODE_PATH)
    : null
  if (!match) throw new Error("공식 AI Frontier Episode URL이 아닙니다.")
  return Number(match[1])
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
}

function textFromHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|h[1-6]|li|blockquote)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, "")
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
}

function episodeJsonLd(html: string) {
  const scripts = [...html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )]
  for (const script of scripts) {
    try {
      const parsed = podcastEpisodeSchema.safeParse(JSON.parse(script[1] ?? ""))
      if (parsed.success) return parsed.data
    } catch {
      // 다른 JSON-LD가 깨져 있어도 PodcastEpisode 후보를 계속 찾는다.
    }
  }
  throw new Error("AI Frontier Episode 메타데이터가 없습니다.")
}

function transcriptFromHtml(html: string): string {
  const section = html.match(
    /<section[^>]*class=["'][^"']*\bprose-transcript\b[^"']*["'][^>]*>([\s\S]*?)<\/section>/i
  )
  const transcript = textFromHtml(section?.[1] ?? "")
  if (transcript === "") throw new Error("AI Frontier Episode 전사본이 없습니다.")
  return transcript
}

function youtubeWatchUrl(embedUrl: string | undefined): string | null {
  if (!embedUrl) return null
  const url = new URL(embedUrl)
  const match = url.hostname === "www.youtube.com"
    ? url.pathname.match(/^\/embed\/([^/]+)$/)
    : null
  return match ? `https://www.youtube.com/watch?v=${match[1]}` : null
}

function standardizedName(name: string, episodeNumber: number): string {
  const title = name.replace(/^EP\s*\d+\s*[:.]\s*/i, "").trim()
  return `EP${episodeNumber}. ${title}`
}

async function fetchText(url: string, fetchImpl: FetchLike): Promise<string> {
  const response = await fetchImpl(url, {
    headers: { Accept: "text/html, application/xml;q=0.9, */*;q=0.8" },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`AI Frontier 응답 오류: ${response.status}`)
  return response.text()
}

export function parseAiFrontierSitemap(xml: string): string[] {
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)]
    .map((match) => decodeHtmlEntities(match[1] ?? "").trim())
    .filter((url) => {
      try {
        officialEpisodeNumber(url)
        return true
      } catch {
        return false
      }
    })
  return [...new Set(urls)].sort(
    (left, right) => officialEpisodeNumber(right) - officialEpisodeNumber(left)
  )
}

export function parseAiFrontierEpisodePage(
  html: string,
  officialUrl: string
): AiFrontierOfficialEpisode {
  const expectedNumber = officialEpisodeNumber(officialUrl)
  const metadata = episodeJsonLd(html)
  if (
    metadata.episodeNumber !== expectedNumber ||
    officialEpisodeNumber(metadata.url) !== expectedNumber
  ) {
    throw new Error("AI Frontier Episode 번호가 일치하지 않습니다.")
  }
  return {
    source: "ai-frontier",
    reference: `EP${expectedNumber}`,
    episodeNumber: expectedNumber,
    name: standardizedName(metadata.name, expectedNumber),
    officialUrl,
    published: metadata.datePublished ?? null,
    duration: metadata.duration ?? null,
    youtube: youtubeWatchUrl(metadata.associatedMedia?.embedUrl),
    summary: metadata.description ?? null,
    transcript: transcriptFromHtml(html),
  }
}

export async function fetchAiFrontierEpisode(
  officialUrl: string,
  fetchImpl: FetchLike = fetch
): Promise<AiFrontierOfficialEpisode> {
  return parseAiFrontierEpisodePage(
    await fetchText(officialUrl, fetchImpl),
    officialUrl
  )
}

export async function fetchAiFrontierCatalog(
  fetchImpl: FetchLike = fetch
): Promise<AiFrontierCatalogEpisode[]> {
  const urls = parseAiFrontierSitemap(
    await fetchText(AI_FRONTIER_SITEMAP, fetchImpl)
  )
  const catalog: AiFrontierCatalogEpisode[] = []
  for (let index = 0; index < urls.length; index += MAX_CATALOG_CONCURRENCY) {
    const batch = urls.slice(index, index + MAX_CATALOG_CONCURRENCY)
    const episodes = await Promise.all(
      batch.map((url) => fetchAiFrontierEpisode(url, fetchImpl))
    )
    catalog.push(...episodes.map(({ transcript: _transcript, ...episode }) => episode))
  }
  return catalog
}
