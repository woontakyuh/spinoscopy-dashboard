import { notionRequest } from "./client"
import {
  LO_BELTS,
  LO_PROFILE_DB_ID_ENV,
  LO_PROFILE_ROLES,
  type LoBelt,
  type LoBjjAttributes,
  type LoProfile,
  type LoProfileRole,
  type LoProfileSeed,
  type LoPromotionHistoryEntry,
} from "@/lib/types/lo-v2"

interface NotionRichText {
  plain_text?: string
}

interface NotionProperty {
  type: string
  title?: NotionRichText[]
  rich_text?: NotionRichText[]
  select?: { name: string } | null
  number?: number | null
  date?: { start: string } | null
  url?: string | null
}

interface NotionPage {
  id: string
  url: string
  properties: Record<string, NotionProperty>
}

interface NotionQueryResponse {
  results: NotionPage[]
  has_more: boolean
  next_cursor: string | null
}

function getText(property: NotionProperty | undefined): string {
  if (property?.type === "title") return (property.title ?? []).map((part) => part.plain_text ?? "").join("").trim()
  if (property?.type === "rich_text") return (property.rich_text ?? []).map((part) => part.plain_text ?? "").join("").trim()
  return ""
}

function getNumber(property: NotionProperty | undefined): number {
  return property?.type === "number" && property.number !== null && property.number !== undefined ? property.number : 0
}

function getSelect(property: NotionProperty | undefined): string | null {
  return property?.type === "select" ? property.select?.name ?? null : null
}

function getDate(property: NotionProperty | undefined): string | null {
  return property?.type === "date" ? property.date?.start ?? null : null
}

function getUrl(property: NotionProperty | undefined): string | null {
  return property?.type === "url" ? property.url ?? null : null
}

function asBelt(value: string | null): LoBelt {
  if (value && (LO_BELTS as readonly string[]).includes(value)) return value as LoBelt
  throw new Error(`Lo Profile has an invalid Belt value: ${value ?? "(empty)"}`)
}

function asRole(value: string | null): LoProfileRole {
  if (value && (LO_PROFILE_ROLES as readonly string[]).includes(value)) return value as LoProfileRole
  throw new Error(`Lo Profile has an invalid Role value: ${value ?? "(empty)"}`)
}

function malformedPromotionHistory(pageId: string, reason: string): Error {
  return new Error(`Lo Profile ${pageId} has a malformed Promotion History property: ${reason}`)
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

function promotionHistory(property: NotionProperty | undefined, pageId: string): LoPromotionHistoryEntry[] {
  if (property?.type !== "rich_text") {
    throw malformedPromotionHistory(pageId, "expected a rich_text property")
  }

  const content = getText(property)
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw malformedPromotionHistory(pageId, "expected valid JSON")
  }
  if (!Array.isArray(parsed)) {
    throw malformedPromotionHistory(pageId, "expected a JSON array")
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw malformedPromotionHistory(pageId, `entry ${index + 1} must be an object`)
    }
    const value = entry as Record<string, unknown>
    const keys = Object.keys(value)
    if (keys.length !== 5 || !["date", "belt", "stripes", "label", "ceremony"].every((key) => keys.includes(key))) {
      throw malformedPromotionHistory(pageId, `entry ${index + 1} has an invalid shape`)
    }
    if (typeof value.date !== "string" || !isIsoDate(value.date)) {
      throw malformedPromotionHistory(pageId, `entry ${index + 1} has an invalid date`)
    }
    if (typeof value.belt !== "string" || !(LO_BELTS as readonly string[]).includes(value.belt)) {
      throw malformedPromotionHistory(pageId, `entry ${index + 1} has an invalid belt`)
    }
    if (!Number.isInteger(value.stripes) || typeof value.stripes !== "number" || value.stripes < 0 || value.stripes > 4) {
      throw malformedPromotionHistory(pageId, `entry ${index + 1} has an invalid stripe count`)
    }
    if (typeof value.label !== "string" || !value.label.trim()) {
      throw malformedPromotionHistory(pageId, `entry ${index + 1} has an invalid label`)
    }
    if (typeof value.ceremony !== "boolean") {
      throw malformedPromotionHistory(pageId, `entry ${index + 1} has an invalid ceremony flag`)
    }

    return {
      date: value.date,
      belt: value.belt as LoBelt,
      stripes: value.stripes,
      label: value.label,
      ceremony: value.ceremony,
    }
  })
}

function attributes(properties: Record<string, NotionProperty>, prefix: "Gi" | "No-Gi"): LoBjjAttributes {
  return {
    guard: getNumber(properties[`${prefix} Guard`]),
    passing: getNumber(properties[`${prefix} Passing`]),
    control: getNumber(properties[`${prefix} Control`]),
    finishing: getNumber(properties[`${prefix} Finishing`]),
    takedowns: getNumber(properties[`${prefix} Takedowns`]),
    legLocks: getNumber(properties[`${prefix} Leg Locks`]),
  }
}

function toLoProfile(page: NotionPage): LoProfile {
  const properties = page.properties
  const trainingStartDate = getDate(properties["Training Start Date"])
  if (!trainingStartDate) throw new Error(`Lo Profile ${page.id} is missing Training Start Date`)

  return {
    pageId: page.id,
    url: page.url,
    name: getText(properties.Name),
    belt: asBelt(getSelect(properties.Belt)),
    stripes: getNumber(properties.Stripes),
    trainingStartDate,
    gym: getText(properties.Gym),
    instructor: getText(properties.Instructor),
    avatarUrl: getUrl(properties["Avatar URL"]),
    promotionHistory: promotionHistory(properties["Promotion History"], page.id),
    role: asRole(getSelect(properties.Role)),
    baseStats: {
      gi: attributes(properties, "Gi"),
      nogi: attributes(properties, "No-Gi"),
    },
  }
}

function richText(content: string): Array<{ text: { content: string } }> {
  return content ? [{ text: { content } }] : []
}

/** The exact property contract used to seed the single Lo Profile row. */
export function loProfileProperties(profile: LoProfileSeed): Record<string, unknown> {
  return {
    Name: { title: richText(profile.name) },
    Belt: { select: { name: profile.belt } },
    Stripes: { number: profile.stripes },
    "Training Start Date": { date: { start: profile.trainingStartDate } },
    Gym: { rich_text: richText(profile.gym) },
    Instructor: { rich_text: richText(profile.instructor) },
    Role: { select: { name: profile.role } },
    "Avatar URL": { url: profile.avatarUrl },
    "Promotion History": { rich_text: richText(JSON.stringify(profile.promotionHistory)) },
    "Gi Guard": { number: profile.baseStats.gi.guard },
    "Gi Passing": { number: profile.baseStats.gi.passing },
    "Gi Control": { number: profile.baseStats.gi.control },
    "Gi Finishing": { number: profile.baseStats.gi.finishing },
    "Gi Takedowns": { number: profile.baseStats.gi.takedowns },
    "Gi Leg Locks": { number: profile.baseStats.gi.legLocks },
    "No-Gi Guard": { number: profile.baseStats.nogi.guard },
    "No-Gi Passing": { number: profile.baseStats.nogi.passing },
    "No-Gi Control": { number: profile.baseStats.nogi.control },
    "No-Gi Finishing": { number: profile.baseStats.nogi.finishing },
    "No-Gi Takedowns": { number: profile.baseStats.nogi.takedowns },
    "No-Gi Leg Locks": { number: profile.baseStats.nogi.legLocks },
  }
}

export function getLoProfileDbId(): string {
  const databaseId = process.env[LO_PROFILE_DB_ID_ENV]?.trim()
  if (!databaseId) throw new Error(`${LO_PROFILE_DB_ID_ENV} is not configured`)
  return databaseId
}

/** Reads every profile page so an accidental second row cannot be silently hidden. */
export async function listLoProfiles(): Promise<LoProfile[]> {
  const databaseId = getLoProfileDbId()
  const profiles: LoProfile[] = []
  let cursor: string | null = null

  do {
    const response: NotionQueryResponse = await notionRequest<NotionQueryResponse>(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    })
    profiles.push(...response.results.map(toLoProfile))
    if (!response.has_more) {
      cursor = null
    } else if (!response.next_cursor) {
      throw new Error("Notion pagination error: has_more=true but next_cursor is missing (Lo Profile)")
    } else {
      cursor = response.next_cursor
    }
  } while (cursor)

  return profiles
}

export async function getLoProfile(): Promise<LoProfile> {
  const [profile] = await listLoProfiles()
  if (!profile) throw new Error("Lo Profile is empty")
  return profile
}
