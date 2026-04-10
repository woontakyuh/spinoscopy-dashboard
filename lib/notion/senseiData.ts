// Notion API에서 Archetypes / Positions / Transitions DB를 병렬 fetch
import { notionRequest } from "./client"
import type { Archetype, Position, Transition, BjjAttributes, GameplanStep, PositionLayer, PositionPerspective, TransitionType } from "@/lib/types/sensei"

const ARCHETYPES_DB = "44202e73974b467488c6456a9fa5a759"
const POSITIONS_DB = "d8d39f8582f74cb79d59484b76a8407b"
const TRANSITIONS_DB = "c5fd431ac58c42cdaf7ffcfa3cb196ea"

// ─── Notion property helpers ──────────────────────────────
interface NP {
  type: string
  title?: Array<{ plain_text?: string }>
  rich_text?: Array<{ plain_text?: string }>
  number?: number | null
  select?: { name: string } | null
  multi_select?: Array<{ name: string }>
  url?: string | null
  checkbox?: boolean
}

function txt(p: NP | undefined): string {
  if (!p) return ""
  if (p.type === "title") return (p.title ?? []).map((t) => t.plain_text ?? "").join("").trim()
  if (p.type === "rich_text") return (p.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim()
  return ""
}
function num(p: NP | undefined, fallback = 0): number {
  return typeof p?.number === "number" ? p.number : fallback
}
function sel(p: NP | undefined): string {
  return p?.select?.name ?? ""
}
function multiSel(p: NP | undefined): string[] {
  return (p?.multi_select ?? []).map((o) => o.name)
}

interface QR { results: Array<{ properties: Record<string, NP> }> }

async function queryAll(dbId: string): Promise<Array<Record<string, NP>>> {
  let all: Array<Record<string, NP>> = []
  let cursor: string | undefined
  let safety = 0
  do {
    const body: Record<string, unknown> = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const res = await notionRequest<QR & { has_more: boolean; next_cursor: string | null }>(
      `/databases/${dbId}/query`,
      { method: "POST", body: JSON.stringify(body) }
    )
    all = all.concat(res.results.map((r) => r.properties))
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
    safety++
  } while (cursor && safety < 10)
  return all
}

// ─── Parse Archetypes ─────────────────────────────────────
function parseArchetype(p: Record<string, NP>): Archetype {
  const ruleSetRaw = sel(p.RuleSet).toLowerCase()
  const ruleSet = (ruleSetRaw === "gi" || ruleSetRaw === "nogi" || ruleSetRaw === "both") ? ruleSetRaw as "gi" | "nogi" | "both" : "both"

  const categoryRaw = sel(p.Category)
  const category = (["gi-legend", "gi-active", "nogi", "special"].includes(categoryRaw) ? categoryRaw : "special") as Archetype["category"]

  const stats: BjjAttributes = {
    guard: num(p.Guard),
    passing: num(p.Passing),
    control: num(p.Control),
    finishing: num(p.Submission),
    takedowns: num(p.Standing),
    legLocks: num(p.Leglock),
  }

  let gameplan: GameplanStep[] = []
  try {
    const raw = txt(p.GameplanSummary)
    if (raw.startsWith("[")) gameplan = JSON.parse(raw)
  } catch { /* fallback empty */ }

  return {
    name: txt(p.Name),
    flag: txt(p.Nationality) || "🏳️",
    nickname: txt(p.Nickname),
    team: txt(p.Team),
    stats,
    tags: multiSel(p.SignatureTech),
    playstyle: txt(p.Playstyle),
    ruleSet,
    category,
    gameplan,
    videoUrl: p.VideoURL?.url ?? undefined,
    ovrFloor: num(p.OVR) || undefined,
  }
}

// ─── Parse Positions ──────────────────────────────────────
function parsePosition(p: Record<string, NP>): Position {
  const layerRaw = sel(p.Layer).toLowerCase()
  const layer = (["standing", "guard", "passing", "control", "submission", "leglock"].includes(layerRaw) ? layerRaw : "guard") as PositionLayer

  const perspRaw = sel(p.Perspective).toLowerCase()
  const perspective = (["top", "bottom", "neutral"].includes(perspRaw) ? perspRaw : undefined) as PositionPerspective | undefined

  const ruleSetRaw = sel(p.RuleSet).toLowerCase()
  const ruleSet = (ruleSetRaw === "gi" || ruleSetRaw === "nogi" || ruleSetRaw === "common") ? ruleSetRaw as Position["ruleSet"] : "common"

  let lessonNumbers: number[] | undefined
  try {
    const raw = txt(p.LessonNumbers)
    if (raw) lessonNumbers = raw.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
  } catch { /* ignore */ }

  const familyRaw = sel(p.Family)
  const family = familyRaw || undefined

  return {
    id: txt(p.PosID) || txt(p.Name).toLowerCase().replace(/\s+/g, "_"),
    name: txt(p.Name),
    nameKr: txt(p.NameKr),
    layer,
    family,
    perspective,
    lessonNumbers,
    ruleSet,
    parent: txt(p.Parent) || undefined,
  }
}

// ─── Parse Transitions ────────────────────────────────────
function parseTransition(p: Record<string, NP>): Transition {
  const typeRaw = txt(p.Type || p.TransitionType).toLowerCase()
  const type = (["sweep", "pass", "escape", "submission", "transition", "takedown", "guard_pull", "recovery"].includes(typeRaw) ? typeRaw : "transition") as TransitionType

  const ruleSetRaw = sel(p.RuleSet).toLowerCase()
  const ruleSet = (ruleSetRaw === "gi" || ruleSetRaw === "nogi" || ruleSetRaw === "common") ? ruleSetRaw as Transition["ruleSet"] : "common"

  let lessonNumber: number | undefined
  try {
    const raw = txt(p.LessonNumber)
    if (raw) lessonNumber = parseInt(raw, 10)
    if (isNaN(lessonNumber as number)) lessonNumber = undefined
  } catch { /* ignore */ }

  return {
    from: txt(p.From),
    to: txt(p.To),
    action: txt(p.Action),
    actionEn: txt(p.ActionEn || p.Action_En) || txt(p.Action),
    condition: txt(p.Condition) || undefined,
    type,
    lessonNumber,
    videoUrl: p.VideoURL?.url ?? undefined,
    ruleSet,
  }
}

// ─── Public API ───────────────────────────────────────────
export interface SenseiDataResult {
  archetypes: Archetype[]
  positions: Position[]
  transitions: Transition[]
}

export async function fetchSenseiData(): Promise<SenseiDataResult> {
  const [arcRows, posRows, transRows] = await Promise.all([
    queryAll(ARCHETYPES_DB),
    queryAll(POSITIONS_DB),
    queryAll(TRANSITIONS_DB).catch(() => [] as Array<Record<string, NP>>),
  ])

  return {
    archetypes: arcRows.map(parseArchetype),
    positions: posRows.map(parsePosition),
    transitions: transRows.map(parseTransition),
  }
}
