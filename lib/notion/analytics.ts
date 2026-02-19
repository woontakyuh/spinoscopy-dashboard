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

export type GroupBy = "op_category" | "class_a" | "class_b"

export interface TimepointAvg {
  n: number
  vas_prox: number | null
  vas_dist: number | null
  odi: number | null
  ndi: number | null
  joa: number | null
  eq5d_utility: number | null
  eq5d_vas: number | null
}

export interface GroupResult {
  name: string
  total: number
  timepoints: Record<string, TimepointAvg>
}

export interface AnalyticsResult {
  groupBy: GroupBy
  groups: GroupResult[]
  fetchedAt: string
}

const TIMEPOINTS = ["pre", "1mo", "3mo", "6mo", "1y"]
const PROM_SCORES = ["VAS", "ODI", "JOA", "NDI", "EQ5D"]

async function fetchAllPatients(): Promise<NotionPage[]> {
  const dbId = process.env.NOTION_PATIENT_DB_ID
  const all: NotionPage[] = []
  let cursor: string | undefined = undefined

  do {
    const body: Record<string, unknown> = { page_size: 100 }
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

function extractGroupKeys(page: NotionPage, groupBy: GroupBy): string[] {
  const p = page.properties
  switch (groupBy) {
    case "op_category": return getMultiSelect(p["Op Category"])
    case "class_a":     return getMultiSelect(p["ClassA"])
    case "class_b":     return getMultiSelect(p["ClassB"])
  }
}

interface Accumulator {
  n: number
  vas_prox: number[]
  vas_dist: number[]
  odi: number[]
  ndi: number[]
  joa: number[]
  eq5d_utility: number[]
  eq5d_vas: number[]
}

function emptyAcc(): Accumulator {
  return { n: 0, vas_prox: [], vas_dist: [], odi: [], ndi: [], joa: [], eq5d_utility: [], eq5d_vas: [] }
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100
}

export async function getAnalytics(groupBy: GroupBy): Promise<AnalyticsResult> {
  const pages = await fetchAllPatients()

  const accMap: Record<string, Record<string, Accumulator>> = {}

  for (const page of pages) {
    const keys = extractGroupKeys(page, groupBy)
    if (keys.length === 0) continue

    const p = page.properties

    for (const key of keys) {
      if (!accMap[key]) {
        accMap[key] = {}
        for (const tp of TIMEPOINTS) accMap[key][tp] = emptyAcc()
      }

      for (const tp of TIMEPOINTS) {
        const acc = accMap[key][tp]
        const getRaw = (score: string) =>
          getText(p[`${tp} ${score}`])

        const vasRaw = getRaw("VAS")
        const odiRaw = getRaw("ODI")
        const ndiRaw = getRaw("NDI")
        const joaRaw = getRaw("JOA")
        const eq5dRaw = getRaw("EQ5D")

        const hasAny = vasRaw || odiRaw || ndiRaw || joaRaw || eq5dRaw
        if (!hasAny) continue

        acc.n++

        const vas = vasRaw ? parseVAS(vasRaw) : null
        if (vas) { acc.vas_prox.push(vas.proximal); acc.vas_dist.push(vas.distal) }

        const odi = odiRaw ? parseODI(odiRaw) : null
        if (odi) acc.odi.push(odi.score)

        const ndi = ndiRaw ? parseNDI(ndiRaw) : null
        if (ndi) acc.ndi.push(ndi.score)

        const joa = joaRaw ? parseJOA(joaRaw) : null
        if (joa !== null) acc.joa.push(joa)

        const eq5d = eq5dRaw ? parseEQ5D(eq5dRaw) : null
        if (eq5d) { acc.eq5d_utility.push(eq5d.utility); acc.eq5d_vas.push(eq5d.vas) }
      }
    }
  }

  const groups: GroupResult[] = Object.entries(accMap)
    .map(([name, tpMap]) => {
      const total = pages.filter(pg => extractGroupKeys(pg, groupBy).includes(name)).length
      const timepoints: Record<string, TimepointAvg> = {}
      for (const tp of TIMEPOINTS) {
        const a = tpMap[tp]
        timepoints[tp] = {
          n: a.n,
          vas_prox: avg(a.vas_prox),
          vas_dist: avg(a.vas_dist),
          odi: avg(a.odi),
          ndi: avg(a.ndi),
          joa: avg(a.joa),
          eq5d_utility: avg(a.eq5d_utility),
          eq5d_vas: avg(a.eq5d_vas),
        }
      }
      return { name, total, timepoints }
    })
    .sort((a, b) => b.total - a.total)

  return { groupBy, groups, fetchedAt: new Date().toISOString() }
}
