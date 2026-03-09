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

export async function getOpCategoryOptions(): Promise<{ name: string; color: string }[]> {
  const dbId = process.env.NOTION_PATIENT_DB_ID
  const db = await notionRequest<NotionDatabaseSchema>(`/databases/${dbId}`)
  const prop = db.properties["Op Category"]
  if (!prop || prop.type !== "multi_select") return []
  return prop.multi_select?.options ?? []
}

async function fetchAllPatients(categories?: string[]): Promise<NotionPage[]> {
  const dbId = process.env.NOTION_PATIENT_DB_ID
  const all: NotionPage[] = []
  let cursor: string | undefined = undefined

  do {
    const body: Record<string, unknown> = { page_size: 100 }
    if (categories && categories.length > 0) {
      if (categories.length === 1) {
        body.filter = {
          property: "Op Category",
          multi_select: { contains: categories[0] },
        }
      } else {
        body.filter = {
          or: categories.map(c => ({
            property: "Op Category",
            multi_select: { contains: c },
          })),
        }
      }
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
    op_category: getMultiSelect(p["Op Category"]),
    class_a: getMultiSelect(p["ClassA"]),
    class_b: getMultiSelect(p["ClassB"]),
    surgeon: getMultiSelect(p["Surgeon"]),
    hospital: getMultiSelect(p["Hospital"]),
    timepoints,
  }
}

export async function getAllPatientRows(categories?: string[]): Promise<AnalyticsData> {
  const pages = await fetchAllPatients(categories)
  return { patients: pages.map(parseRow), fetchedAt: new Date().toISOString() }
}
