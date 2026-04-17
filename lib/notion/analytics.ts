import { notionRequest } from "./client"
import { parseVAS, parseODI, parseNDI, parseJOA, parseEQ5D } from "../prom/calculator"

interface NotionProperty {
  type: string
  title?: Array<{ plain_text?: string }>
  rich_text?: Array<{ plain_text?: string }>
  multi_select?: Array<{ name: string }>
  date?: { start: string } | null
  select?: { name: string } | null
}

interface NotionPage {
  id: string
  properties: Record<string, NotionProperty>
}

interface NotionQueryResponse {
  results: NotionPage[]
  has_more: boolean
  next_cursor: string | null
}

function getText(prop: NotionProperty | undefined): string {
  if (!prop) return ""
  if (prop.type === "title") return (prop.title ?? []).map(t => t.plain_text ?? "").join("").trim()
  if (prop.type === "rich_text") return (prop.rich_text ?? []).map(t => t.plain_text ?? "").join("").trim()
  return ""
}

function getMultiSelect(prop: NotionProperty | undefined): string[] {
  return (prop?.multi_select ?? []).map(o => o.name).filter(Boolean)
}

export type Dimension = "op_category" | "class_a" | "class_b" | "surgeon" | "hospital"

const DIMENSION_PROP_MAP: Record<Dimension, string> = {
  op_category: "Op Category",
  class_a: "ClassA",
  class_b: "ClassB",
  surgeon: "Surgeon",
  hospital: "Hospital",
}

export interface TimepointParsed {
  vas_prox: number | null
  vas_dist: number | null
  odi: number | null
  ndi: number | null
  joa: number | null
  eq5d_utility: number | null
  eq5d_vas: number | null
}

export interface PatientRow {
  page_id: string
  name: string
  age: string
  sex: string
  op_date: string | null
  op_name: string
  level: string
  op_category: string[]
  class_a: string[]
  class_b: string[]
  surgeon: string[]
  hospital: string[]
  timepoints: Record<string, TimepointParsed>
}

export interface AnalyticsData {
  patients: PatientRow[]
  fetchedAt: string
}

const TIMEPOINTS = ["pre", "1mo", "3mo", "6mo", "1y"]

interface NotionDatabaseSchema {
  properties: Record<string, {
    type: string
    multi_select?: { options: Array<{ name: string; color: string }> }
  }>
}

export type DimensionSchema = Record<Dimension, { name: string; color: string }[]>

export async function getAllDimensionOptions(): Promise<DimensionSchema> {
  const dbId = process.env.NOTION_PATIENT_DB_ID
  const db = await notionRequest<NotionDatabaseSchema>(`/databases/${dbId}`)

  const result = {} as DimensionSchema
  for (const [dim, propName] of Object.entries(DIMENSION_PROP_MAP) as [Dimension, string][]) {
    const prop = db.properties[propName]
    result[dim] = (prop?.type === "multi_select" ? prop.multi_select?.options : undefined) ?? []
  }
  return result
}

// 하위 호환
export async function getOpCategoryOptions(): Promise<{ name: string; color: string }[]> {
  const schema = await getAllDimensionOptions()
  return schema.op_category
}

export type DimensionFilters = Partial<Record<Dimension, string[]>>

async function fetchAllPatients(filters?: DimensionFilters): Promise<NotionPage[]> {
  const dbId = process.env.NOTION_PATIENT_DB_ID
  const all: NotionPage[] = []
  let cursor: string | undefined = undefined

  // Notion API 필터 구성: 각 차원에 대해 OR, 차원 간 AND
  // 수술 기준: DB="Op" AND Sch≠"canceled" (취소된 수술 제외)
  const andClauses: unknown[] = [
    { property: "DB", multi_select: { contains: "Op" } },
    { property: "Sch", select: { does_not_equal: "canceled" } },
  ]
  if (filters) {
    for (const [dim, values] of Object.entries(filters) as [Dimension, string[]][]) {
      if (!values || values.length === 0) continue
      const propName = DIMENSION_PROP_MAP[dim]
      if (values.length === 1) {
        andClauses.push({ property: propName, multi_select: { contains: values[0] } })
      } else {
        andClauses.push({
          or: values.map(v => ({ property: propName, multi_select: { contains: v } })),
        })
      }
    }
  }

  do {
    const body: Record<string, unknown> = { page_size: 100 }
    if (andClauses.length === 1) {
      body.filter = andClauses[0]
    } else if (andClauses.length > 1) {
      body.filter = { and: andClauses }
    }
    if (cursor) body.start_cursor = cursor

    const res = await notionRequest<NotionQueryResponse>(
      `/databases/${dbId}/query`,
      { method: "POST", body: JSON.stringify(body) }
    )

    all.push(...res.results)
    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined
  } while (cursor)

  return all
}

function parseRow(page: NotionPage): PatientRow {
  const p = page.properties
  const timepoints: Record<string, TimepointParsed> = {}

  for (const tp of TIMEPOINTS) {
    const getRaw = (score: string) => getText(p[`${tp} ${score}`])
    const vas = getRaw("VAS") ? parseVAS(getRaw("VAS")) : null
    const odi = getRaw("ODI") ? parseODI(getRaw("ODI")) : null
    const ndi = getRaw("NDI") ? parseNDI(getRaw("NDI")) : null
    const joa = getRaw("JOA") ? parseJOA(getRaw("JOA")) : null
    const eq5d = getRaw("EQ5D") ? parseEQ5D(getRaw("EQ5D")) : null

    timepoints[tp] = {
      vas_prox: vas?.proximal ?? null,
      vas_dist: vas?.distal ?? null,
      odi: odi?.score ?? null,
      ndi: ndi?.score ?? null,
      joa: joa ?? null,
      eq5d_utility: eq5d?.utility ?? null,
      eq5d_vas: eq5d?.vas ?? null,
    }
  }

  return {
    page_id: page.id,
    name: getText(p.Name),
    age: getText(p.Age),
    sex: p.Sex?.select?.name?.trim() ?? "",
    op_date: p["Op Date"]?.date?.start ?? null,
    op_name: getText(p["Op Name"]),
    level: getText(p.Level),
    op_category: getMultiSelect(p["Op Category"]),
    class_a: getMultiSelect(p["ClassA"]),
    class_b: getMultiSelect(p["ClassB"]),
    surgeon: getMultiSelect(p["Surgeon"]),
    hospital: getMultiSelect(p["Hospital"]),
    timepoints,
  }
}

export async function getAllPatientRows(filters?: DimensionFilters): Promise<AnalyticsData> {
  const pages = await fetchAllPatients(filters)
  return { patients: pages.map(parseRow), fetchedAt: new Date().toISOString() }
}
