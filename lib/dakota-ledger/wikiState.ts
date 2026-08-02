/**
 * TakBrain LLM Wiki v2의 `.wiki-state.json` 파싱 + Notion 적재용 스냅샷 행 계산.
 *
 * 순수 함수만 둔다 — 파일 읽기(fs)와 Notion 호출은 scripts/dakota-wiki-sync.ts와
 * lib/notion/wikiState.ts에 있다. 정체일수 계산은 새로 만들지 않고 period.ts의
 * computeStalledDays(KST 달력일 기준)를 그대로 재사용한다.
 */
import { computeStalledDays } from "./period"

export interface WikiPageEntry {
  source_path: string
  source_sha256: string
  content_sha256: string
  created_at: string
  kind: string
  layer: string
}

export interface WikiInputEntry {
  sha256: string
  kind: string
}

export interface WikiEvent {
  /** ISO 8601, dedup 키로도 쓰인다 */
  at: string
  status: "changed" | "unchanged"
  created: string[]
  updated: string[]
  deleted: string[]
}

export interface WikiStateFile {
  schema_version: number
  compiler_version: string
  inputs: Record<string, WikiInputEntry>
  pages: Record<string, WikiPageEntry>
  events: WikiEvent[]
}

export function parseWikiState(raw: unknown): WikiStateFile {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("wiki-state.json 파싱 오류: 최상위 값이 객체가 아닙니다")
  }
  const obj = raw as Record<string, unknown>

  if (typeof obj.compiler_version !== "string") {
    throw new Error("wiki-state.json 파싱 오류: compiler_version이 없습니다")
  }
  if (typeof obj.inputs !== "object" || obj.inputs === null) {
    throw new Error("wiki-state.json 파싱 오류: inputs가 없습니다")
  }
  if (typeof obj.pages !== "object" || obj.pages === null) {
    throw new Error("wiki-state.json 파싱 오류: pages가 없습니다")
  }
  if (!Array.isArray(obj.events)) {
    throw new Error("wiki-state.json 파싱 오류: events가 배열이 아닙니다")
  }

  return obj as unknown as WikiStateFile
}

interface CountEntry {
  name: string
  count: number
}

function countBy(pages: Record<string, WikiPageEntry>, field: "layer" | "kind"): CountEntry[] {
  const counts = new Map<string, number>()
  for (const page of Object.values(pages)) {
    const key = page[field]
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** "이름 개수" 쌍을 개수 내림차순(동률은 이름 오름차순)으로 " · "로 이어 붙인다. */
export function formatCounts(entries: CountEntry[]): string {
  return entries.map((e) => `${e.name} ${e.count}`).join(" · ")
}

export function formatLayers(pages: Record<string, WikiPageEntry>): string {
  return formatCounts(countBy(pages, "layer"))
}

export function formatKinds(pages: Record<string, WikiPageEntry>): string {
  return formatCounts(countBy(pages, "kind"))
}

export interface SourceMismatch {
  mismatched: boolean
  label: string
}

/** 소스 개수와 페이지 개수가 다르면(컴파일러가 무언가를 드롭했으면) 그 사실을 명시한다. */
export function detectSourceMismatch(totalSources: number, totalPages: number): SourceMismatch {
  if (totalSources === totalPages) {
    return { mismatched: false, label: `소스 ${totalSources} → 페이지 ${totalPages} (누락 없음)` }
  }
  const missing = Math.abs(totalSources - totalPages)
  return {
    mismatched: true,
    label: `소스 ${totalSources} → 페이지 ${totalPages} · ${missing}건 누락`,
  }
}

/**
 * lastEventAt(이벤트의 `at`, UTC)부터 now까지 KST 달력일 기준 정체일수.
 * period.ts의 computeStalledDays를 그대로 재사용한다 — 숫자를 새로 만들지 않는다.
 */
export function computeWikiStaleDays(lastEventAt: string, now: Date): number | null {
  return computeStalledDays(lastEventAt, now)
}

/** events 배열의 순서를 신뢰하지 않고 `at`이 가장 늦은 이벤트의 인덱스를 찾는다. */
export function newestEventIndex(events: WikiEvent[]): number {
  if (events.length === 0) return -1
  let best = 0
  for (let i = 1; i < events.length; i++) {
    if (new Date(events[i].at).getTime() > new Date(events[best].at).getTime()) best = i
  }
  return best
}

export interface WikiSnapshotRow {
  /** 이벤트의 `at` — Notion Event Key(dedup 키)로 그대로 쓰인다 */
  eventKey: string
  /** ISO 8601, Notion Date 프로퍼티용 */
  date: string
  status: "changed" | "unchanged"
  created: number
  updated: number
  deleted: number
  /** 가장 최신 이벤트에만 채워진다. 과거 이벤트는 파일이 그 시점 총계를 보존하지 않으므로 null. */
  totalPages: number | null
  totalSources: number | null
  layers: string | null
  kinds: string | null
  compiler: string | null
}

/**
 * events[] 하나당 행 하나. 파일 최상위(pages/inputs)의 "현재" 총계·레이어·종류 분포는
 * 가장 최신 이벤트(at 기준)의 행에만 찍는다 — 과거 이벤트는 그 시점 총계를 지어내지 않는다.
 */
export function buildWikiSnapshotRows(state: WikiStateFile): WikiSnapshotRow[] {
  if (state.events.length === 0) return []

  const totalPages = Object.keys(state.pages).length
  const totalSources = Object.keys(state.inputs).length
  const layers = formatLayers(state.pages)
  const kinds = formatKinds(state.pages)
  const newestIdx = newestEventIndex(state.events)

  return state.events.map((event, i) => {
    const isNewest = i === newestIdx
    return {
      eventKey: event.at,
      date: event.at,
      status: event.status,
      created: event.created.length,
      updated: event.updated.length,
      deleted: event.deleted.length,
      totalPages: isNewest ? totalPages : null,
      totalSources: isNewest ? totalSources : null,
      layers: isNewest ? layers : null,
      kinds: isNewest ? kinds : null,
      compiler: isNewest ? state.compiler_version : null,
    }
  })
}
