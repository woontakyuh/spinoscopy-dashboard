import { notionRequest, notionEnv } from "./client"
import type { PatientSearchResult, PromScores, NewCaseInput } from "../types/patient"

interface NotionPage {
  id: string
  url: string
  properties: Record<string, NotionProperty>
}

interface NotionProperty {
  type: string
  title?: Array<{ plain_text?: string }>
  rich_text?: Array<{ plain_text?: string }>
  date?: { start: string; end: string | null } | null
  select?: { name: string } | null
  multi_select?: Array<{ name: string }>
  number?: number | null
  checkbox?: boolean
}

interface NotionQueryResponse {
  results: NotionPage[]
}

function getText(prop: NotionProperty | undefined): string {
  if (!prop) return ""
  if (prop.type === "title") return (prop.title ?? []).map(t => t.plain_text ?? "").join("").trim()
  if (prop.type === "rich_text") return (prop.rich_text ?? []).map(t => t.plain_text ?? "").join("").trim()
  return ""
}

function getMultiSelect(prop: NotionProperty | undefined): string[] {
  return (prop?.multi_select ?? []).map(o => o.name)
}

function toPatientResult(page: NotionPage): PatientSearchResult {
  const p = page.properties
  return {
    page_id: page.id,
    url: page.url,
    name: getText(p.Name),
    pt_no: getText(p["Pt No"]),
    age: getText(p.Age),
    sex: p.Sex?.select?.name?.trim() ?? "",
    op_date: p["Op Date"]?.date?.start ?? null,
    op_name: getText(p["Op Name"]),
    preop_dx: getText(p["Preop Dx"]),
    level: getText(p.Level),
    hospital: getMultiSelect(p.Hospital),
  }
}

export async function searchPatients(query: string): Promise<PatientSearchResult[]> {
  const dbId = notionEnv("NOTION_PATIENT_DB_ID")
  const q = query.trim()
  if (!q) return []
  const response = await notionRequest<NotionQueryResponse>(
    `/databases/${dbId}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: {
          and: [
            { property: "DB", multi_select: { contains: "Op" } },
            { property: "Sch", select: { does_not_equal: "canceled" } },
            {
              or: [
                { property: "Name", title: { contains: q } },
                { property: "Pt No", rich_text: { contains: q } },
                { property: "Op Name", rich_text: { contains: q } },
                { property: "Preop Dx", rich_text: { contains: q } },
                { property: "Level", rich_text: { contains: q } },
              ],
            },
          ],
        },
        sorts: [{ property: "Op Date", direction: "descending" }],
        page_size: 30,
      }),
    }
  )
  return response.results.map(toPatientResult)
}

function getNumber(prop: NotionProperty | undefined): number | null {
  if (!prop || prop.type !== "number") return null
  return prop.number ?? null
}

function getCheckbox(prop: NotionProperty | undefined): boolean {
  if (!prop || prop.type !== "checkbox") return false
  return prop.checkbox ?? false
}

function getSelect(prop: NotionProperty | undefined): string {
  if (!prop || prop.type !== "select") return ""
  return prop.select?.name ?? ""
}

function getDate(prop: NotionProperty | undefined): string | null {
  if (!prop || prop.type !== "date") return null
  return prop.date?.start ?? null
}

export interface PatientProfile {
  // Basic
  name: string
  pt_no: string
  age: string
  sex: string
  op_date: string | null
  op_name: string
  hospital: string[]
  surgeon: string[]
  level: string
  preop_dx: string
  // Classification
  ctl: string[]
  class_a: string[]
  class_b: string[]
  class_c: string[]
  op_category: string[]
  // Clinical
  pmhx: string
  note: string
  cx: string
  ai_insight: string
  // Body metrics
  height: number | null
  weight: number | null
  bmi: number | null
  bmd: number | null
  // Lab / BTM
  vitd: number | null
  vitd_fu: number | null
  ctx: number | null
  ctx_fu: number | null
  p1np: number | null
  p1np_fu: number | null
  hba1c: number | null
  btm_fu_date: string | null
  // Comorbidities
  htn: boolean
  dm: boolean
  dl: boolean
  cardiac: boolean
  renal: boolean
  liver: boolean
  // Surgical
  op_time: number | null
  ebl: string
  postop_los: number | null
  total_los: number | null
  // Spine parameters
  pi: number | null
  pt: number | null
  ss: number | null
  // Cost
  cost_total: string
  cost_patient: string
  cost_insurance: string
  // Links
  url: string
  obsidian_link: string
  // PROM (별도)
  prom: Record<string, string>
}

export async function getPatientProfile(pageId: string): Promise<PatientProfile> {
  const page = await notionRequest<NotionPage>(`/pages/${pageId}`)
  const p = page.properties

  // PROM
  const prom: Record<string, string> = {}
  const timepoints = ["pre", "1mo", "3mo", "6mo", "1y"]
  const scores = ["VAS", "ODI", "JOA", "NDI", "EQ5D"]
  for (const tp of timepoints) {
    for (const sc of scores) {
      const key = `${tp} ${sc}`
      prom[key] = getText(p[key])
    }
  }

  return {
    name: getText(p.Name),
    pt_no: getText(p["Pt No"]),
    age: getText(p.Age),
    sex: getSelect(p.Sex),
    op_date: getDate(p["Op Date"]),
    op_name: getText(p["Op Name"]),
    hospital: getMultiSelect(p.Hospital),
    surgeon: getMultiSelect(p.Surgeon),
    level: getText(p.Level),
    preop_dx: getText(p["Preop Dx"]),
    ctl: getMultiSelect(p.CTL),
    class_a: getMultiSelect(p.ClassA),
    class_b: getMultiSelect(p.ClassB),
    class_c: getMultiSelect(p.ClassC),
    op_category: getMultiSelect(p["Op Category"]),
    pmhx: getText(p.PMHx),
    note: getText(p.Note),
    cx: getText(p.Cx),
    ai_insight: getText(p.AI_Insight),
    height: getNumber(p.Height),
    weight: getNumber(p.Weight),
    bmi: getNumber(p.BMI),
    bmd: getNumber(p.BMD),
    vitd: getNumber(p.VitD),
    vitd_fu: getNumber(p.VitD_fu),
    ctx: getNumber(p.CTx),
    ctx_fu: getNumber(p.CTx_fu),
    p1np: getNumber(p.P1NP),
    p1np_fu: getNumber(p.P1NP_fu),
    hba1c: getNumber(p.HbA1c),
    btm_fu_date: getDate(p.BTM_fu_date),
    htn: getCheckbox(p.HTN),
    dm: getCheckbox(p.DM),
    dl: getCheckbox(p.DL),
    cardiac: getCheckbox(p.Cardiac),
    renal: getCheckbox(p.Renal),
    liver: getCheckbox(p.Liver),
    op_time: getNumber(p["Op time"]),
    ebl: getText(p.EBL),
    postop_los: getNumber(p["postop LOS"]),
    total_los: getNumber(p["total LOS"]),
    pi: getNumber(p.PI),
    pt: getNumber(p.PT),
    ss: getNumber(p.SS),
    cost_total: getText(p["Cost total"]),
    cost_patient: getText(p["Cost 환자"]),
    cost_insurance: getText(p["Cost 공단"]),
    url: page.url,
    obsidian_link: getText(p.Obsidian_Link),
    prom,
  }
}

export async function getPatientProm(pageId: string): Promise<Record<string, string>> {
  const page = await notionRequest<NotionPage>(`/pages/${pageId}`)
  const p = page.properties
  const timepoints = ["pre", "1mo", "3mo", "6mo", "1y"]
  const scores = ["VAS", "ODI", "JOA", "NDI", "EQ5D"]
  const result: Record<string, string> = {}
  for (const tp of timepoints) {
    for (const sc of scores) {
      const key = `${tp} ${sc}`
      result[key] = getText(p[key])
    }
  }
  return result
}

export async function updateProm(
  pageId: string,
  timepoint: string,
  scores: PromScores
): Promise<void> {
  const properties: Record<string, unknown> = {}
  const map: Record<string, string | undefined> = {
    VAS: scores.vas,
    ODI: scores.odi,
    JOA: scores.joa,
    NDI: scores.ndi,
    EQ5D: scores.eq5d,
  }
  for (const [score, value] of Object.entries(map)) {
    if (value !== undefined && value !== "") {
      properties[`${timepoint} ${score}`] = {
        rich_text: [{ text: { content: value } }],
      }
    }
  }
  if (Object.keys(properties).length === 0) return
  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  })
}

export async function createCase(input: NewCaseInput): Promise<string> {
  const dbId = notionEnv("NOTION_PATIENT_DB_ID")
  const properties: Record<string, unknown> = {
    Name: { title: [{ text: { content: input.name } }] },
    "Pt No": { rich_text: [{ text: { content: input.pt_no } }] },
    Age: { rich_text: [{ text: { content: input.age } }] },
    Sex: { select: { name: input.sex === "M" ? " M" : "F " } },
    "Op Date": input.op_date ? { date: { start: input.op_date } } : undefined,
    "Op Name": { rich_text: [{ text: { content: input.op_name } }] },
    Level: { rich_text: [{ text: { content: input.level } }] },
    "Preop Dx": { rich_text: [{ text: { content: input.preop_dx } }] },
    Hospital: { multi_select: [{ name: input.hospital }] },
    Surgeon: { multi_select: input.surgeon.map(s => ({ name: s })) },
    "Op Category": { multi_select: input.op_category.map(s => ({ name: s })) },
    Landmark: { multi_select: input.landmark.map(s => ({ name: s })) },
    ClassA: { multi_select: input.class_a.map(s => ({ name: s })) },
    ClassB: { multi_select: input.class_b.map(s => ({ name: s })) },
  }

  const cleanedProperties = Object.fromEntries(
    Object.entries(properties).filter(([, v]) => v !== undefined)
  )

  const scores = ["VAS", "ODI", "JOA", "NDI", "EQ5D"]
  const promMap: Record<string, string | undefined> = {
    VAS: input.prom.vas,
    ODI: input.prom.odi,
    JOA: input.prom.joa,
    NDI: input.prom.ndi,
    EQ5D: input.prom.eq5d,
  }
  for (const [score, value] of Object.entries(promMap)) {
    if (value) {
      cleanedProperties[`pre ${score}`] = { rich_text: [{ text: { content: value } }] }
    }
  }
  scores

  interface NotionCreateResponse { id: string }
  const res = await notionRequest<NotionCreateResponse>("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: cleanedProperties,
    }),
  })
  return res.id
}
