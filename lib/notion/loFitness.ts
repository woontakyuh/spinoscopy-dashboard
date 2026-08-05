import { notionRequest, notionEnv } from "./client"
import {
  BJJ_TRAINING_DB_ID,
  FITNESS_LOG_DB_ID,
  type LoBjjTrainingQuery,
  type LoBjjTrainingSession,
  type LoFitnessRecord,
  type LoFitnessRecordType,
  type LoFitnessSnapshot,
  type LoTrainingSessionType,
} from "@/lib/types/lo-v2"

interface NotionRichText {
  plain_text?: string
}

interface NotionProperty {
  type: string
  title?: NotionRichText[]
  rich_text?: NotionRichText[]
  select?: { name: string } | null
  multi_select?: Array<{ name: string }>
  number?: number | null
  date?: { start: string } | null
  checkbox?: boolean
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

function getText(property: NotionProperty | undefined): string | null {
  if (property?.type === "title") return (property.title ?? []).map((part) => part.plain_text ?? "").join("").trim() || null
  if (property?.type === "rich_text") return (property.rich_text ?? []).map((part) => part.plain_text ?? "").join("").trim() || null
  return null
}

function getSelect(property: NotionProperty | undefined): string | null {
  return property?.type === "select" ? property.select?.name ?? null : null
}

function getNumber(property: NotionProperty | undefined): number | null {
  return property?.type === "number" ? property.number ?? null : null
}

function getDate(property: NotionProperty | undefined): string | null {
  return property?.type === "date" ? property.date?.start ?? null : null
}

function getMultiSelect(property: NotionProperty | undefined): string[] {
  return property?.type === "multi_select" ? (property.multi_select ?? []).map((option) => option.name) : []
}

function getUrl(property: NotionProperty | undefined): string | null {
  return property?.type === "url" ? property.url ?? null : null
}

function getCheckbox(property: NotionProperty | undefined): boolean {
  return property?.type === "checkbox" ? property.checkbox ?? false : false
}

function recordType(value: string | null): LoFitnessRecordType | null {
  return value === "Daily log" || value === "Current regimen" ? value : null
}

function toFitnessRecord(page: NotionPage): LoFitnessRecord {
  const properties = page.properties
  const manager = getSelect(properties.Manager)
  return {
    pageId: page.id,
    url: page.url,
    day: getText(properties.Day) ?? "",
    date: getDate(properties.Date),
    recordType: recordType(getSelect(properties["Record type"])),
    manager: manager === "Lo" || manager === "Dakota" ? manager : null,
    metrics: {
      weightKg: getNumber(properties["Weight kg"]),
      bodyFatPercent: getNumber(properties["Body fat %"]),
      smmKg: getNumber(properties["SMM kg"]),
      muscleMassKg: getNumber(properties["Muscle mass kg"]),
      fatFreeMassKg: getNumber(properties["Fat-free mass kg"]),
      bodyFatMassKg: getNumber(properties["Body fat mass kg"]),
      boneMassKg: getNumber(properties["Bone mass kg"]),
      mineralMassKg: getNumber(properties["Mineral mass kg"]),
      visceralFatLevel: getNumber(properties["Visceral fat level"]),
      bmi: getNumber(properties["BMI kg/m²"]),
      bmrKcal: getNumber(properties["BMR kcal"]),
      obesityDegreePercent: getNumber(properties["Obesity degree %"]),
      pushUps: getNumber(properties["Push-ups"]),
      dailyTarget: getNumber(properties["Daily target"]),
    },
    workout: getText(properties.Workout),
    meals: getText(properties.Meals),
    notes: getText(properties.Notes),
    challenge: getSelect(properties.Challenge),
    dailyMedication: getText(properties["Daily medication"]),
    dailySupplements: getText(properties["Daily supplements"]),
    mounjaroDose: getText(properties["Mounjaro dose"]),
    injectionStatus: getSelect(properties["Injection status"]),
    injectionSite: getSelect(properties["Injection site"]),
    pushUpSets: getText(properties["Push-up sets"]),
    lastConfirmed: getDate(properties["Last confirmed"]),
  }
}

function normalizeSessionType(raw: string | null): LoTrainingSessionType {
  switch (raw) {
    case "class":
    case "openmat":
    case "study":
    case "reflection":
    case "body":
      return raw
    case "promotion":
    case "승급식":
      return "promotion"
    default:
      return "unknown"
  }
}

function toBjjTrainingSession(page: NotionPage): LoBjjTrainingSession {
  const properties = page.properties
  const sessionTypeRaw = getSelect(properties.SessionType)
  return {
    pageId: page.id,
    url: page.url,
    name: getText(properties.Name) ?? "",
    date: getDate(properties.Date),
    sessionType: normalizeSessionType(sessionTypeRaw),
    sessionTypeRaw,
    instructor: getSelect(properties.Instructor),
    gym: getSelect(properties.Gym),
    classTags: getMultiSelect(properties.Class),
    sparringTags: getMultiSelect(properties.Sparring),
    studyTags: getMultiSelect(properties["Study Tags"]),
    note: getText(properties.Note),
    todayFocus: getText(properties["Today Focus"]),
    focusApplied: getCheckbox(properties["Focus Applied"]),
    videoUrl: getUrl(properties["Video URL"]),
    videoTitle: getText(properties["Video Title"]),
  }
}

function getFitnessLogDbId(): string {
  return notionEnv("NOTION_FITNESS_LOG_DB_ID") || FITNESS_LOG_DB_ID
}

function getBjjTrainingDbId(): string {
  return notionEnv("NOTION_BJJ_DB_ID") || BJJ_TRAINING_DB_ID
}

async function queryAll(
  databaseId: string,
  query: Record<string, unknown>,
  context: string,
  limit?: number,
): Promise<NotionPage[]> {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error("limit must be a positive integer")
  }

  const pages: NotionPage[] = []
  let cursor: string | null = null
  do {
    const remaining = limit === undefined ? 100 : Math.min(100, limit - pages.length)
    if (remaining <= 0) break
    const body: Record<string, unknown> = {
      ...query,
      page_size: remaining,
      ...(cursor ? { start_cursor: cursor } : {}),
    }
    const response = await notionRequest<NotionQueryResponse>(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    })
    pages.push(...response.results)
    if (!response.has_more) {
      cursor = null
    } else if (!response.next_cursor) {
      throw new Error(`Notion pagination error: has_more=true but next_cursor is missing (${context})`)
    } else {
      cursor = response.next_cursor
    }
  } while (cursor)

  return limit === undefined ? pages : pages.slice(0, limit)
}

/** Full Fitness Log read. The existing database remains the source of truth. */
export async function listFitnessRecords(limit?: number): Promise<LoFitnessRecord[]> {
  const pages = await queryAll(
    getFitnessLogDbId(),
    { sorts: [{ property: "Date", direction: "descending" }] },
    "Fitness Log",
    limit,
  )
  return pages.map(toFitnessRecord)
}

export async function getLoFitnessSnapshot(): Promise<LoFitnessSnapshot> {
  const records = await listFitnessRecords()
  const currentRegimen = records.find((record) => record.recordType === "Current regimen") ?? null
  const latestDailyLog = records
    .filter((record) => record.recordType === "Daily log")
    .sort((left, right) => (right.date ?? "").localeCompare(left.date ?? ""))[0] ?? null
  return { currentRegimen, latestDailyLog }
}

/** Full BJJ Training read with an optional inclusive date range. */
export async function listBjjTrainingSessions(options: LoBjjTrainingQuery = {}): Promise<LoBjjTrainingSession[]> {
  const dateFilters: Array<Record<string, unknown>> = []
  if (options.from) dateFilters.push({ property: "Date", date: { on_or_after: options.from } })
  if (options.to) dateFilters.push({ property: "Date", date: { on_or_before: options.to } })
  const filter = dateFilters.length === 0 ? undefined : dateFilters.length === 1 ? dateFilters[0] : { and: dateFilters }
  const query: Record<string, unknown> = {
    sorts: [{ property: "Date", direction: "descending" }],
  }
  if (filter) query.filter = filter

  const pages = await queryAll(getBjjTrainingDbId(), query, "BJJ Training", options.limit)
  return pages.map(toBjjTrainingSession)
}
