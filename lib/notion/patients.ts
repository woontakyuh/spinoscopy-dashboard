import { notionRequest } from "./client"
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
    hospital: getMultiSelect(p.Hospital),
  }
}

export async function searchPatients(query: string): Promise<PatientSearchResult[]> {
  const dbId = process.env.NOTION_PATIENT_DB_ID
  const response = await notionRequest<NotionQueryResponse>(
    `/databases/${dbId}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: { property: "Name", title: { contains: query } },
        sorts: [{ property: "Op Date", direction: "descending" }],
        page_size: 20,
      }),
    }
  )
  return response.results.map(toPatientResult)
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
  const dbId = process.env.NOTION_PATIENT_DB_ID
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
