import { z } from "zod"

import type {
  AiFrontierCatalogEpisode,
  AiFrontierOfficialEpisode,
} from "@/lib/types/ai-frontier-import"

const DWARKESH_ORIGIN = "https://www.dwarkesh.com"
const DWARKESH_API_ORIGIN = "https://dwarkesh.substack.com"
const ARCHIVE_PAGE_SIZE = 20
const MAX_ARCHIVE_ITEMS = 500

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

const archiveEntrySchema = z.object({
  type: z.string(),
  slug: z.string().trim().min(1),
  title: z.string().trim().min(1),
  subtitle: z
    .string()
    .transform((value) => value.trim() || null)
    .nullable(),
  post_date: z.string().datetime(),
  canonical_url: z.string().url(),
  podcast_duration: z.number().nonnegative().nullable(),
})

const archiveSchema = z.array(archiveEntrySchema)
const episodeSchema = archiveEntrySchema.extend({
  body_html: z.string().min(1),
})

export class DwarkeshCatalogError extends Error {
  readonly name: string = "DwarkeshCatalogError"

  constructor(
    message = "Dwarkesh 공식 자료를 가져오지 못했습니다.",
    cause?: unknown,
    readonly status: number | null = null
  ) {
    super(message, { cause })
  }
}

export class DwarkeshTranscriptNotReadyError extends DwarkeshCatalogError {
  readonly name = "DwarkeshTranscriptNotReadyError"

  constructor() {
    super("Dwarkesh Episode 전사본이 아직 없습니다.")
  }
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

function officialSlug(value: string): string {
  const url = new URL(value)
  const match = url.origin === DWARKESH_ORIGIN
    ? url.pathname.match(/^\/p\/([^/]+)$/)
    : null
  const slug = match?.[1]
  if (!slug) throw new DwarkeshCatalogError("공식 Dwarkesh Episode URL이 아닙니다.")
  return slug
}

function referenceForSlug(slug: string): string {
  return `DWARKESH:${slug.toUpperCase()}`
}

function isoDuration(seconds: number | null): string | null {
  if (seconds === null) return null
  const rounded = Math.round(seconds)
  const hours = Math.floor(rounded / 3_600)
  const minutes = Math.floor((rounded % 3_600) / 60)
  const remainingSeconds = rounded % 60
  return `PT${hours > 0 ? `${hours}H` : ""}${minutes > 0 ? `${minutes}M` : ""}${remainingSeconds}S`
}

function catalogEpisode(
  entry: z.infer<typeof archiveEntrySchema>
): AiFrontierCatalogEpisode {
  if (
    officialSlug(entry.canonical_url) !== entry.slug ||
    new URL(entry.canonical_url).origin !== DWARKESH_ORIGIN
  ) {
    throw new DwarkeshCatalogError("Dwarkesh Episode slug가 일치하지 않습니다.")
  }
  return {
    source: "dwarkesh",
    reference: referenceForSlug(entry.slug),
    episodeNumber: null,
    name: entry.title,
    officialUrl: entry.canonical_url,
    published: entry.post_date.slice(0, 10),
    duration: isoDuration(entry.podcast_duration),
    youtube: null,
    summary: entry.subtitle,
  }
}

function youtubeWatchUrl(html: string): string | null {
  const patterns = [
    /https?:\/\/(?:www\.)?youtu\.be\/([\w-]+)/i,
    /https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/)([\w-]+)/i,
  ] as const
  for (const pattern of patterns) {
    const videoId = html.match(pattern)?.[1]
    if (videoId) return `https://www.youtube.com/watch?v=${videoId}`
  }
  return null
}

function transcriptFromHtml(html: string): string {
  let transcript = ""
  for (const heading of html.matchAll(/<h([1-6])[^>]*>[\s\S]*?<\/h\1>/gi)) {
    if (textFromHtml(heading[0]).toLowerCase() !== "transcript") continue
    const start = (heading.index ?? 0) + heading[0].length
    transcript = textFromHtml(html.slice(start))
    break
  }
  if (transcript === "") {
    throw new DwarkeshTranscriptNotReadyError()
  }
  return transcript
}

async function fetchJson(url: string, fetchImpl: FetchLike): Promise<unknown> {
  let response: Response
  try {
    response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    throw new DwarkeshCatalogError(undefined, error)
  }
  if (!response.ok) {
    throw new DwarkeshCatalogError(
      "Dwarkesh upstream request failed.",
      undefined,
      response.status
    )
  }
  return response.json()
}

export function parseDwarkeshArchive(payload: unknown): AiFrontierCatalogEpisode[] {
  const parsed = archiveSchema.safeParse(payload)
  if (!parsed.success) throw new DwarkeshCatalogError("Dwarkesh archive 형식이 올바르지 않습니다.")
  return parsed.data
    .filter((entry) => entry.type === "podcast")
    .map(catalogEpisode)
}

export function parseDwarkeshEpisode(
  payload: unknown,
  officialUrl: string
): AiFrontierOfficialEpisode {
  const parsed = episodeSchema.safeParse(payload)
  if (!parsed.success) throw new DwarkeshCatalogError("Dwarkesh Episode 형식이 올바르지 않습니다.")
  const expectedSlug = officialSlug(officialUrl)
  if (
    parsed.data.type !== "podcast" ||
    parsed.data.slug !== expectedSlug ||
    parsed.data.canonical_url !== officialUrl
  ) {
    throw new DwarkeshCatalogError("Dwarkesh Episode slug가 일치하지 않습니다.")
  }
  return {
    ...catalogEpisode(parsed.data),
    youtube: youtubeWatchUrl(parsed.data.body_html),
    transcript: transcriptFromHtml(parsed.data.body_html),
  }
}

export async function fetchDwarkeshCatalog(
  fetchImpl: FetchLike = fetch,
  pageSize = ARCHIVE_PAGE_SIZE,
  targetPodcastCount = ARCHIVE_PAGE_SIZE
): Promise<AiFrontierCatalogEpisode[]> {
  const catalog = new Map<string, AiFrontierCatalogEpisode>()
  for (let offset = 0; offset < MAX_ARCHIVE_ITEMS; offset += pageSize) {
    const url = new URL("/api/v1/archive", DWARKESH_API_ORIGIN)
    url.search = new URLSearchParams({
      sort: "new",
      search: "",
      offset: String(offset),
      limit: String(pageSize),
    }).toString()
    const payload = await fetchJson(url.toString(), fetchImpl)
    const page = archiveSchema.safeParse(payload)
    if (!page.success) {
      throw new DwarkeshCatalogError("Dwarkesh archive 형식이 올바르지 않습니다.")
    }
    for (const episode of parseDwarkeshArchive(page.data)) {
      if (!catalog.has(episode.reference)) catalog.set(episode.reference, episode)
    }
    if (catalog.size >= targetPodcastCount || page.data.length < pageSize) break
  }
  return [...catalog.values()]
}

export async function fetchDwarkeshEpisode(
  officialUrl: string,
  fetchImpl: FetchLike = fetch
): Promise<AiFrontierOfficialEpisode> {
  const slug = officialSlug(officialUrl)
  const endpoint = `${DWARKESH_API_ORIGIN}/api/v1/posts/${encodeURIComponent(slug)}`
  return parseDwarkeshEpisode(await fetchJson(endpoint, fetchImpl), officialUrl)
}
