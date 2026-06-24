// scripts/journal-collector/collect.ts
// TSJ 수집 엔트리포인트 — scrape → parse → ingest 파이프라인.
// 병원 M4 맥미니에서 launchd로 실행. run.sh 가 tsx 를 통해 호출.

import { scrapeTsjRaw } from "./scrape-tsj.mjs"
import { parseTsjCitation } from "../../lib/journal-alert/journalSite"
import { ingestScrapedArticles } from "../../lib/journal-alert/pipeline"

async function main() {
  const databaseId = process.env.NOTION_JOURNAL_DB_ID?.trim()
  if (!databaseId) throw new Error("NOTION_JOURNAL_DB_ID 환경변수 없음")

  // 1) TSJ Articles in Press DOM 추출 (Aside + Chrome)
  console.log("TSJ scraping 시작...")
  const raw: Array<{ title: string; href: string; innerText: string }> = await scrapeTsjRaw()
  console.log(`scraped raw: ${raw.length}`)

  // 2) 각 DOM 항목을 ScrapedArticle 로 파싱 (PII 없으면 null → 필터)
  const parsed = raw.map(parseTsjCitation)
  const scraped = parsed.filter((a): a is NonNullable<typeof a> => a !== null)
  console.log(`parsed: ${scraped.length}`)

  // 3) Notion dedup → PubMed enrich → create
  const result = await ingestScrapedArticles(databaseId, scraped)
  console.log("done", result)
}

main().catch((err) => {
  console.error("collect 실패:", err)
  process.exit(1)
})
