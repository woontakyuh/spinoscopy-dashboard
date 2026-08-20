import {
  AI_FRONTIER_SOURCE_KEY_PROPERTY,
  AI_FRONTIER_SOURCE_PROPERTY,
  resolveEpisodeSourceIdentity,
} from "@/lib/notion/ai-frontier-identity"
import type {
  AiFrontierConcept,
  AiFrontierEpisode,
  AiFrontierEpisodeRef,
  NotionAiFrontierPage,
  NotionAiFrontierProperty,
} from "@/lib/types/ai-frontier"

function joinedText(parts: Array<{ plain_text?: string }> | undefined): string | null {
  if (!Array.isArray(parts)) return null
  const text = parts.map((part) => part.plain_text ?? "").join("").trim()
  return text || null
}

function readTitle(prop?: NotionAiFrontierProperty): string | null {
  return prop?.type === "title" ? joinedText(prop.title) : null
}

function readText(prop?: NotionAiFrontierProperty): string | null {
  return prop?.type === "rich_text" ? joinedText(prop.rich_text) : null
}

function readSelect(prop?: NotionAiFrontierProperty): string | null {
  if (prop?.type !== "select") return null
  const name = prop.select?.name?.trim()
  return name || null
}

function readMultiSelect(prop?: NotionAiFrontierProperty): string[] {
  if (prop?.type !== "multi_select" || !Array.isArray(prop.multi_select)) return []
  return prop.multi_select
    .map((option) => option.name?.trim() ?? "")
    .filter((name) => name.length > 0)
}

function readNumber(prop?: NotionAiFrontierProperty): number | null {
  return prop?.type === "number" && typeof prop.number === "number" && Number.isFinite(prop.number)
    ? prop.number
    : null
}

function readCheckbox(prop?: NotionAiFrontierProperty): boolean {
  return prop?.type === "checkbox" && prop.checkbox === true
}

function readDate(prop?: NotionAiFrontierProperty): string | null {
  if (prop?.type !== "date") return null
  const start = prop.date?.start?.trim()
  return start || null
}

function readUrl(prop?: NotionAiFrontierProperty): string | null {
  if (prop?.type !== "url") return null
  const url = prop.url?.trim()
  return url || null
}

function readEpisodeRefs(prop?: NotionAiFrontierProperty): AiFrontierEpisodeRef[] {
  const refs: AiFrontierEpisodeRef[] = []
  const seen = new Set<string>()
  for (const name of readMultiSelect(prop)) {
    const ref = name.replace(/\s+/g, "").toUpperCase()
    if (!ref || seen.has(ref)) continue
    seen.add(ref)
    refs.push({ ref, available: false, pageId: null })
  }
  return refs
}

export function toAiFrontierEpisode(page: NotionAiFrontierPage): AiFrontierEpisode | null {
  const id = page.id?.trim()
  const props = page.properties ?? {}
  const name = readTitle(props.Name)
  if (!id || !name) return null

  const episodeNumber = readNumber(props.Episode)
  const transcriptSource = readUrl(props["Transcript Source"])
  const identity = resolveEpisodeSourceIdentity({
    source: readSelect(props[AI_FRONTIER_SOURCE_PROPERTY]),
    sourceKey: readText(props[AI_FRONTIER_SOURCE_KEY_PROPERTY]),
    episodeNumber,
    transcriptSource,
  })
  return {
    id,
    name,
    episodeNumber,
    status: readSelect(props.Status),
    published: readDate(props.Published),
    recorded: readDate(props.Recorded),
    lastEditedAt: page.last_edited_time?.trim() || null,
    reviewed: readCheckbox(props.Reviewed),
    topics: readMultiSelect(props.Topics),
    models: readMultiSelect(props.Models),
    people: readMultiSelect(props.People),
    youtube: readUrl(props.YouTube),
    transcriptSource,
    duration: readText(props.Duration),
    summary: readText(props.한줄요약),
    keyTerms: readMultiSelect(props["Key Terms"]),
    source: identity.source,
    sourceKey: identity.sourceKey,
    sourceIdentityPersisted: identity.persisted,
  }
}

export function toAiFrontierConcept(page: NotionAiFrontierPage): AiFrontierConcept | null {
  const id = page.id?.trim()
  const props = page.properties ?? {}
  const term = readTitle(props.Term)
  if (!id || !term) return null
  return {
    id,
    term,
    korean: readText(props.Korean),
    category: readSelect(props.Category),
    verified: readSelect(props.Verified),
    oneLine: readText(props["One-line Explanation"]),
    intuition: readText(props.Intuition),
    whyItMatters: readText(props["Why It Matters"]),
    source: readUrl(props.Source),
    episodes: readEpisodeRefs(props.Episodes),
  }
}
