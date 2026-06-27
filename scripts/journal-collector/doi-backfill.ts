// scripts/journal-collector/doi-backfill.ts
// DOI 는 있는데 PMID 가 없는 행(주로 CrossRef stub) 을 PubMed 로 보충.
// DOI→PMID 해석 후 Abstract/Keywords/Affiliations/Vol/Issue/Category/Type/PMID 를 PATCH.
// 맥미니 launchd 에서 매일 실행 (sweep/crossref-gap 이후). 패치 0건이면 메일 생략.
import { runDoiBackfill } from "../../lib/journal-alert/pipeline"

async function main() {
  console.log(`[doi-backfill ${new Date().toISOString()}] start`)
  const res = await runDoiBackfill()
  console.log(`[doi-backfill ${new Date().toISOString()}] done`, JSON.stringify(res))
}
main().catch((e) => { console.error("[doi-backfill] 실패:", e); process.exit(1) })
