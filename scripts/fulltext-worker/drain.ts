// scripts/fulltext-worker/drain.ts
// 큐를 한 번 소진 — OA fast-path → 원내망 Aside → Dropbox 저장 → Notion 갱신.
// daemon.ts가 트리거/폴링 시 호출. 처리 건수를 반환.
import { queryFulltextQueue, markAcquired, markFailed, markNoAccess } from "../../lib/notion/fulltext"
import { isNoAccessJournal } from "../../lib/fulltext/access"
import { getArticle } from "../../lib/notion/journal"
import { resolveOA } from "../../lib/fulltext/oa"
import { fetchPdfViaAside } from "../../lib/fulltext/aside"
import { saveToDropbox } from "../../lib/fulltext/dropbox"
import { extractDoi, buildFilename, isPdfBuffer } from "../../lib/fulltext/pdf"

// per-run 버스트 가드(진짜 일일 누적 아님 — Phase 1 단순화). 한 번 소진에 이만큼까지만.
const MAX_PER_RUN = Number(process.env.FULLTEXT_DAILY_MAX ?? "20")
const MIN_GAP_MS = 30_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const jitter = () => MIN_GAP_MS + Math.floor(Math.random() * 15_000)

// 출판사 PDF 엔드포인트는 UA 없는 요청을 막는 경우가 있다.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

async function downloadOA(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return isPdfBuffer(buf) ? buf : null
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
    // 사람이 읽는 파일명(발행연월_저널_저자_키워드)을 위해 전체 메타 조회
    const art = await getArticle(item.pageId)

    // 구독 없는 저널은 브라우저를 띄우지 않는다 — 열어봐야 PDF 가 없다.
    if (isNoAccessJournal(art.journal_name)) {
      await markNoAccess(item.pageId)
      console.log(`  → 건너뜀(구독 없음): ${art.journal_name}`)
      continue
    }

    const name = buildFilename({
      pubDate: art.pub_date,
      journal: art.journal_name,
      authors: art.authors,
      title: art.title,
      doiUrl: art.doi_url,
      pageId: item.pageId,
    })
    console.log(`처리: ${item.title.slice(0, 60)} → ${name} (doi=${doi ?? "없음"})`)

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
        processed++
        continue
      }
      const { pdf, reason, retryable } = fetchPdfViaAside(item.doiUrl)
      if (pdf) {
        const { shareUrl } = await saveToDropbox(pdf, name)
        await markAcquired(item.pageId, "Aside", shareUrl)
        console.log(`  → 원내망 확보`)
      } else if (retryable) {
        console.warn(`  → 보류(자동 재시도): ${reason}`)
        continue
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
      processed++
      await sleep(jitter())
    }
  }
  console.log(`[drain] done — ${processed}건 처리`)
  return processed
}
