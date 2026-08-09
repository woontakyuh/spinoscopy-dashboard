// scripts/journal-collector/country-backfill.ts
// 일회성: Affiliations 는 있는데 국가(select) 가 빈 행에 extractCountry 결과를 채운다.
// 이후 신규/보충은 pipeline(buildArticleProperties/buildBackfillPatch) 이 자동 기록.
//
// --fix-wrong 은 이미 채워진 값도 재계산해서 다른 경우 덮어쓴다. 이 컬럼은 사람이
// 손으로 고르는 값이 아니라 같은 함수가 적재 시점에 쓴 값이라, 함수를 고쳤으면
// 과거 값도 같이 고치는 게 맞다(예: 이메일 "cecchinato" 에서 China 를 뽑던 오탐).
//
//   대상 확인: set -a; . ./.env.local; set +a; npx tsx scripts/journal-collector/country-backfill.ts --dry-run
//   실제 실행: set -a; . ./.env.local; set +a; npx tsx scripts/journal-collector/country-backfill.ts
//   오분류까지: ... npx tsx scripts/journal-collector/country-backfill.ts --fix-wrong
import { notionRequest, notionEnv } from "../../lib/notion/client"
import { extractCountry } from "../../lib/scholar/country"

interface QueryResponse {
  results: Array<{
    id: string
    properties: Record<string, {
      rich_text?: Array<{ plain_text: string }>
      select?: { name: string } | null
    }>
  }>
  has_more: boolean
  next_cursor: string | null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Notion 은 평균 3 req/s 를 넘기면 429 를 던진다. 여유를 두고 간격을 잡되,
// 그래도 맞으면 지수 백오프로 재시도한다 — 수천 행짜리 백필이라 중간에
// 한 번 튕겼다고 전체를 다시 돌리는 건 낭비다.
async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 4): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      const message = e instanceof Error ? e.message : String(e)
      const retriable = message.includes("429") || message.includes("502") || message.includes("503")
      if (!retriable || i === attempts - 1) break
      const wait = 1000 * 2 ** i
      console.warn(`  ${label} 재시도 ${i + 1}/${attempts - 1} (${wait}ms 후) — ${message.slice(0, 120)}`)
      await sleep(wait)
    }
  }
  throw lastError
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const fixWrong = process.argv.includes("--fix-wrong")
  const databaseId = notionEnv("NOTION_JOURNAL_DB_ID")
  if (!databaseId) throw new Error("NOTION_JOURNAL_DB_ID 필요")
  if (!notionEnv("NOTION_TOKEN")) throw new Error("NOTION_TOKEN 필요")

  console.log(`[country-backfill] ${dryRun ? "DRY RUN — 쓰기 없음" : "실제 실행 — Notion 을 수정한다"}`
    + `${fixWrong ? " / 기존 오분류도 덮어쓴다" : ""}`)

  let scanned = 0, filled = 0, fixed = 0, noCountry = 0, keptSame = 0, keptWrong = 0, failed = 0
  const byCountry = new Map<string, number>()
  const unresolved: string[] = []
  let cursor: string | null = null

  const patch = async (pageId: string, country: string, kind: "fill" | "fix") => {
    if (dryRun) return true
    try {
      await withRetry(
        () => notionRequest(`/pages/${pageId}`, {
          method: "PATCH",
          body: JSON.stringify({ properties: { "국가": { select: { name: country } } } }),
        }),
        `${kind} ${pageId}`,
      )
      await sleep(350)
      return true
    } catch (e) {
      failed += 1
      console.error(`  실패 ${pageId}:`, e instanceof Error ? e.message : e)
      return false
    }
  }

  do {
    const currentCursor = cursor
    const res: QueryResponse = await withRetry(
      () => notionRequest<QueryResponse>(`/databases/${databaseId}/query`, {
        method: "POST",
        body: JSON.stringify({
          page_size: 100,
          ...(currentCursor ? { start_cursor: currentCursor } : {}),
          filter: { property: "Affiliations", rich_text: { is_not_empty: true } },
        }),
      }),
      "query",
    )

    for (const page of res.results) {
      scanned += 1
      const current = page.properties["국가"]?.select?.name ?? null
      const affiliations = (page.properties.Affiliations?.rich_text ?? [])
        .map((t) => t.plain_text).join("")
      const country = extractCountry(affiliations)

      if (!country) {
        if (!current) {
          noCountry += 1
          if (unresolved.length < 15) unresolved.push(affiliations.slice(0, 120))
        }
        continue
      }
      if (current === country) { keptSame += 1; continue }
      if (current && !fixWrong) {
        keptWrong += 1
        console.log(`  오분류(미수정) ${current} → ${country} — ${page.id}`)
        continue
      }

      byCountry.set(country, (byCountry.get(country) ?? 0) + 1)
      if (current) {
        console.log(`  교정 ${current} → ${country} — ${page.id}`)
        if (await patch(page.id, country, "fix")) fixed += 1
      } else if (await patch(page.id, country, "fill")) {
        filled += 1
      }
    }
    cursor = res.has_more ? res.next_cursor : null
    console.log(`  진행 — scanned=${scanned} 채움=${filled} 교정=${fixed}`)
  } while (cursor)

  console.log(`[country-backfill] 완료 — scanned=${scanned} 채움=${filled} 교정=${fixed}`
    + ` 그대로=${keptSame} 오분류남김=${keptWrong} 국가불명=${noCountry} failed=${failed}`)

  const ranked = [...byCountry.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length > 0) {
    console.log("  기록한 국가:", ranked.map(([c, n]) => `${c}=${n}`).join(" "))
  }
  if (unresolved.length > 0) {
    console.log(`  국가 추출 실패 샘플 (최대 15건):`)
    for (const a of unresolved) console.log(`    - ${a}`)
  }
}

main().catch((e) => { console.error("[country-backfill] 실패:", e); process.exit(1) })
