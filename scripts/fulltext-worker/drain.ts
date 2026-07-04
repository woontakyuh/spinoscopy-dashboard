// scripts/fulltext-worker/drain.ts
// 큐를 한 번 소진 — OA fast-path → 원내망 Aside → Dropbox 저장 → Notion 갱신.
// daemon.ts가 트리거/폴링 시 호출. 처리 건수를 반환.
import { queryFulltextQueue, markAcquired, markFailed } from "../../lib/notion/fulltext"
import { resolveOA } from "../../lib/fulltext/oa"
import { fetchPdfViaAside } from "../../lib/fulltext/aside"
import { saveToDropbox } from "../../lib/fulltext/dropbox"
import { extractDoi, safeName } from "../../lib/fulltext/pdf"

// per-run 버스트 가드(진짜 일일 누적 아님 — Phase 1 단순화). 한 번 소진에 이만큼까지만.
const MAX_PER_RUN = Number(process.env.FULLTEXT_DAILY_MAX ?? "20")
const MIN_GAP_MS = 30_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const jitter = () => MIN_GAP_MS + Math.floor(((Date.now() % 1000) / 1000) * 15_000)

async function downloadOA(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.subarray(0, 4).toString("latin1") === "%PDF" ? buf : null
  } catch {
    return null
  }
}

export async function drainQueue(): Promise<number> {
  const queue = await queryFulltextQueue()
  console.log(`[drain ${new Date().toISOString()}] 큐 ${queue.length}건`)
  let processed = 0

  for (const item of queue) {
    if (processed >= MAX_PER_RUN) {
      console.log(`per-run 상한(${MAX_PER_RUN}) 도달 — 나머지는 다음 트리거/폴링에`)
      break
    }
    const doi = extractDoi(item.doiUrl)
    const name = safeName(doi, item.pageId)
    console.log(`처리: ${item.title.slice(0, 60)} (doi=${doi ?? "없음"})`)

    try {
      // 1) OA 먼저
      const oa = await resolveOA(doi, item.pmid)
      if (oa) {
        const pdf = await downloadOA(oa.url)
        if (pdf) {
          const { shareUrl } = await saveToDropbox(pdf, name)
          await markAcquired(item.pageId, "OA", shareUrl)
          console.log(`  → OA 확보 (${oa.source})`)
          processed++
          await sleep(jitter())
          continue
        }
      }

      // 2) 원내망 Aside
      if (!item.doiUrl) {
        await markFailed(item.pageId, "DOI 없음 — 원내망 확보 불가")
        continue
      }
      const { pdf, reason } = fetchPdfViaAside(item.doiUrl)
      if (pdf) {
        const { shareUrl } = await saveToDropbox(pdf, name)
        await markAcquired(item.pageId, "원내망", shareUrl)
        console.log(`  → 원내망 확보`)
      } else {
        await markFailed(item.pageId, reason ?? "원문 확보 실패")
        console.log(`  → 실패: ${reason}`)
      }
      processed++
      await sleep(jitter())
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`  ! 오류: ${msg}`)
      await markFailed(item.pageId, msg).catch(() => {})
    }
  }
  console.log(`[drain] done — ${processed}건 처리`)
  return processed
}
