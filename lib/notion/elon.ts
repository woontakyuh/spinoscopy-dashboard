import { getAllPatientRows } from "./analytics"
import type { PatientProfile } from "./patients"

export interface SurgeryStats {
  period_label: string
  from_date: string
  to_date: string | null
  count: number
  by_category: Record<string, number>
  by_class_a: Record<string, number>
  by_hospital: Record<string, number>
}

/**
 * 임의의 기간에 대한 수술 현황 통계.
 * @param fromDate YYYY-MM-DD (포함)
 * @param toDate   YYYY-MM-DD (포함, 미지정 시 오늘까지)
 * @param label    사람이 읽을 레이블 (e.g. "이번 달", "2026-03")
 */
export async function getSurgeryStatsInRange(
  fromDate: string,
  toDate?: string,
  label = `${fromDate}${toDate ? `~${toDate}` : "~"}`,
): Promise<SurgeryStats> {
  const data = await getAllPatientRows()
  const patients = data.patients.filter((p) => {
    if (!p.op_date) return false
    const d = p.op_date.slice(0, 10)
    if (d < fromDate) return false
    if (toDate && d > toDate) return false
    return true
  })
  const bucket = (key: "op_category" | "class_a" | "hospital"): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const p of patients) {
      const vals = (p[key] as string[] | undefined) ?? []
      if (vals.length === 0) {
        out["(없음)"] = (out["(없음)"] ?? 0) + 1
      } else {
        for (const v of vals) out[v] = (out[v] ?? 0) + 1
      }
    }
    return out
  }
  return {
    period_label: label,
    from_date: fromDate,
    to_date: toDate ?? null,
    count: patients.length,
    by_category: bucket("op_category"),
    by_class_a: bucket("class_a"),
    by_hospital: bucket("hospital"),
  }
}

/**
 * 월 기준 편의 함수. year=2026, month=3 → 2026-03 전체.
 */
export async function getSurgeryStatsForMonth(year: number, month: number): Promise<SurgeryStats> {
  const mm = String(month).padStart(2, "0")
  const fromDate = `${year}-${mm}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const toDate = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`
  return getSurgeryStatsInRange(fromDate, toDate, `${year}-${mm}`)
}

/**
 * LLM 프롬프트에 넣기 좋은 형태로 PatientProfile 포맷.
 * 빈 필드는 생략해서 노이즈 최소화.
 */
export function formatPatientForPrompt(p: PatientProfile): string {
  const lines: string[] = []
  const push = (label: string, value: unknown) => {
    if (value === null || value === undefined) return
    if (typeof value === "string" && !value.trim()) return
    if (Array.isArray(value) && value.length === 0) return
    if (typeof value === "boolean" && !value) return
    lines.push(`- ${label}: ${Array.isArray(value) ? value.join(", ") : value}`)
  }

  lines.push(`# ${p.name} (${p.pt_no || "no-pt-no"})`)
  push("Age", p.age)
  push("Sex", p.sex)
  push("Op Date", p.op_date)
  push("Op Name", p.op_name)
  push("Hospital", p.hospital)
  push("Surgeon", p.surgeon)
  push("Level", p.level)
  push("Preop Dx", p.preop_dx)

  lines.push("")
  lines.push("## Classification")
  push("CTL", p.ctl)
  push("ClassA", p.class_a)
  push("ClassB", p.class_b)
  push("ClassC", p.class_c)
  push("Op Category", p.op_category)

  lines.push("")
  lines.push("## Clinical")
  push("PMHx", p.pmhx)
  push("Note", p.note)
  push("Cx (Complications)", p.cx)
  push("AI Insight", p.ai_insight)

  lines.push("")
  lines.push("## Body / Lab / BTM")
  push("Height (cm)", p.height)
  push("Weight (kg)", p.weight)
  push("BMI", p.bmi)
  push("BMD", p.bmd)
  push("Vit D (pre)", p.vitd)
  push("Vit D (fu)", p.vitd_fu)
  push("CTx (pre)", p.ctx)
  push("CTx (fu)", p.ctx_fu)
  push("P1NP (pre)", p.p1np)
  push("P1NP (fu)", p.p1np_fu)
  push("HbA1c", p.hba1c)
  push("BTM fu date", p.btm_fu_date)

  lines.push("")
  lines.push("## Comorbidities")
  const comorb: string[] = []
  if (p.htn) comorb.push("HTN")
  if (p.dm) comorb.push("DM")
  if (p.dl) comorb.push("DL")
  if (p.cardiac) comorb.push("Cardiac")
  if (p.renal) comorb.push("Renal")
  if (p.liver) comorb.push("Liver")
  if (comorb.length > 0) lines.push(`- ${comorb.join(", ")}`)

  lines.push("")
  lines.push("## Surgical")
  push("Op time (min)", p.op_time)
  push("EBL", p.ebl)
  push("Postop LOS", p.postop_los)
  push("Total LOS", p.total_los)
  push("PI", p.pi)
  push("PT", p.pt)
  push("SS", p.ss)

  lines.push("")
  lines.push("## Cost")
  push("Total", p.cost_total)
  push("Patient", p.cost_patient)
  push("Insurance", p.cost_insurance)

  // PROM — 채워진 타임포인트만
  const promLines: string[] = []
  for (const [k, v] of Object.entries(p.prom)) {
    if (v && v.trim()) promLines.push(`- ${k}: ${v}`)
  }
  if (promLines.length > 0) {
    lines.push("")
    lines.push("## PROM")
    lines.push(...promLines)
  }

  lines.push("")
  lines.push(`(Notion: ${p.url})`)
  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n")
}
