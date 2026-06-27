// scripts/journal-collector/dedup-merge.ts
// 일회성 정리: 같은 논문이 여러 행으로 적재된 중복을 병합한다.
// 식별 기준(우선순위): 정규화 DOI → PMID → titleKey.
// 각 그룹에서 "가장 완전한" 행을 keeper 로 남기고 나머지는 Notion archive(휴지통, 복구가능).
//
// 기본은 DRY-RUN(아무것도 안 지움). 실제 적용은 DEDUP_APPLY=1 환경변수.
//   미리보기:  set -a; . ./.env.local; set +a; npx tsx scripts/journal-collector/dedup-merge.ts
//   실제적용:  set -a; . ./.env.local; set +a; DEDUP_APPLY=1 npx tsx scripts/journal-collector/dedup-merge.ts
import { doiKey, titleKey } from "../../lib/journal-alert/pipeline"

const TOKEN = process.env.NOTION_TOKEN
const DB = process.env.NOTION_JOURNAL_DB_ID?.trim()
const APPLY = process.env.DEDUP_APPLY === "1"
if (!TOKEN || !DB) { console.error("NOTION_TOKEN / NOTION_JOURNAL_DB_ID missing"); process.exit(1) }

interface Row {
  pageId: string
  title: string
  created: string
  doi: string
  pmid: string
  score: number
  hasPmid: boolean
  alerted: boolean
}

async function notion(path: string, init: RequestInit): Promise<any> {
  const r = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`notion ${r.status}: ${await r.text()}`)
  return r.json()
}

function loadProps(p: any) {
  const rt = (x: any) => (x?.rich_text ?? []).map((t: any) => t.plain_text).join("")
  const ms = (x: any) => (x?.multi_select ?? []).length
  const title = (p.Title?.title ?? p.Name?.title ?? []).map((t: any) => t.plain_text).join("")
  const abstract = rt(p.Abstract).length > 0
  const keywords = ms(p.Keywords) > 0
  const affiliations = rt(p.Affiliations).length > 0
  const pmid = rt(p.PMID)
  const alerted = p.Alerted?.checkbox === true
  const score = (abstract ? 1 : 0) + (keywords ? 1 : 0) + (affiliations ? 1 : 0) + (pmid ? 2 : 0) + (alerted ? 1 : 0)
  return { title, doi: (p.DOI?.url ?? "").trim(), pmid, alerted, score, hasPmid: !!pmid }
}

async function loadAll(): Promise<Row[]> {
  const rows: Row[] = []
  let cursor: string | null = null, hasMore = true
  while (hasMore) {
    const body: any = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const resp = await notion(`/databases/${DB}/query`, { method: "POST", body: JSON.stringify(body) })
    for (const pg of resp.results) {
      if (pg.archived) continue
      const x = loadProps(pg.properties)
      rows.push({ pageId: pg.id, created: pg.created_time, ...x })
    }
    hasMore = resp.has_more
    cursor = resp.next_cursor
  }
  return rows
}

function identity(r: Row): { key: string; kind: string } | null {
  if (r.doi) return { key: "doi:" + doiKey(r.doi), kind: "DOI" }
  if (r.pmid) return { key: "pmid:" + r.pmid, kind: "PMID" }
  const tk = titleKey(r.title)
  if (tk) return { key: "title:" + tk, kind: "TITLE" }
  return null
}

// keeper 선택: score 높은 것 → PMID 있는 것 → Alerted → 최근 생성
function pickKeeper(group: Row[]): Row {
  return [...group].sort((a, b) =>
    b.score - a.score ||
    Number(b.hasPmid) - Number(a.hasPmid) ||
    Number(b.alerted) - Number(a.alerted) ||
    b.created.localeCompare(a.created),
  )[0]
}

async function main() {
  console.log(`[dedup-merge] mode=${APPLY ? "APPLY" : "DRY-RUN"}`)
  const rows = await loadAll()
  console.log(`[dedup-merge] 전체 행: ${rows.length}`)

  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    const id = identity(r)
    if (!id) continue
    const arr = groups.get(id.key) ?? []
    arr.push(r)
    groups.set(id.key, arr)
  }

  const dupGroups = [...groups.entries()].filter(([, g]) => g.length > 1)
  const byKind: Record<string, number> = { DOI: 0, PMID: 0, TITLE: 0 }
  const toArchive: Row[] = []

  console.log(`\n=== 중복 그룹: ${dupGroups.length}개 ===\n`)
  for (const [key, g] of dupGroups) {
    const kind = key.split(":")[0].toUpperCase()
    byKind[kind] = (byKind[kind] ?? 0) + 1
    const keeper = pickKeeper(g)
    const losers = g.filter((r) => r.pageId !== keeper.pageId)
    toArchive.push(...losers)
    console.log(`[${kind}] ${keeper.title.slice(0, 60)}`)
    console.log(`   KEEP    score=${keeper.score} pmid=${keeper.pmid || "-"} alerted=${keeper.alerted} [${keeper.created.slice(0, 10)}]`)
    for (const l of losers) {
      console.log(`   ARCHIVE score=${l.score} pmid=${l.pmid || "-"} alerted=${l.alerted} [${l.created.slice(0, 10)}] "${l.title.slice(0, 50)}"`)
    }
  }

  console.log(`\n=== 요약 ===`)
  console.log(`중복 그룹: ${dupGroups.length} (DOI=${byKind.DOI}, PMID=${byKind.PMID}, TITLE=${byKind.TITLE})`)
  console.log(`archive 대상 행: ${toArchive.length}`)

  if (!APPLY) {
    console.log(`\nDRY-RUN — 아무것도 변경하지 않음. 적용하려면 DEDUP_APPLY=1`)
    return
  }

  console.log(`\n[dedup-merge] archive 시작...`)
  let done = 0
  for (const r of toArchive) {
    await notion(`/pages/${r.pageId}`, { method: "PATCH", body: JSON.stringify({ archived: true }) })
    done++
    if (done % 20 === 0) console.log(`  ...${done}/${toArchive.length}`)
    await new Promise((res) => setTimeout(res, 120))
  }
  console.log(`[dedup-merge] 완료 — ${done}건 archive`)
}

main().catch((e) => { console.error("[dedup-merge] 실패:", e); process.exit(1) })
