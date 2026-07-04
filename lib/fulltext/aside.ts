import { execFileSync } from "node:child_process"
import { buildFetchScript, parseAsideResult, isPdfBuffer } from "./pdf"

/**
 * aside repl로 로그인 Chrome을 구동해 논문 페이지에서 PDF를 in-page fetch한다.
 * 실패 시 pdf=null + reason. (봇차단 우회·기관 IP는 실브라우저 세션이 담당)
 */
export function fetchPdfViaAside(articleUrl: string): { pdf: Buffer | null; reason?: string } {
  const script = buildFetchScript(articleUrl)
  let stdout: string
  try {
    // execFileSync는 의도적 동기 블록 — 데몬은 뮤텍스로 직렬 처리하므로 이 구간 이벤트루프
    // 정지는 허용된다(끝나면 Ably 자동 재연결 + 백업 폴링이 복구). 상한 timeout 150s.
    stdout = execFileSync("aside", ["repl", script], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 150000,
    })
  } catch (e) {
    return { pdf: null, reason: `aside 실행 실패: ${e instanceof Error ? e.message : String(e)}` }
  }
  const res = parseAsideResult(stdout)
  if (!res.ok || !res.b64) return { pdf: null, reason: res.reason ?? "결과 없음" }
  const pdf = Buffer.from(res.b64, "base64")
  if (!isPdfBuffer(pdf)) return { pdf: null, reason: "PDF 아님(구독 벽/challenge 추정)" }
  return { pdf }
}
