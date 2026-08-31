import { execFileSync } from "node:child_process"
import { buildFetchScript, parseAsideResult, isPdfBuffer, describeAsideFailure } from "./pdf"

/**
 * aside repl로 로그인 Chrome을 구동해 논문 페이지에서 PDF를 in-page fetch한다.
 * 실패 시 pdf=null + reason. (봇차단 우회·기관 IP는 실브라우저 세션이 담당)
 */
export type AsideFetchResult = {
  readonly pdf: Buffer | null
  readonly reason?: string
  readonly retryable?: boolean
}

export function isAsideProfileDisconnected(message: string): boolean {
  return /Aside Browser profile[\s\S]*is not connected to the daemon/i.test(message)
}

export function fetchPdfViaAside(articleUrl: string): AsideFetchResult {
  const script = buildFetchScript(articleUrl)
  let stdout: string
  try {
    stdout = execFileSync("aside", ["repl", script], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 150000,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isAsideProfileDisconnected(message)) {
      return {
        pdf: null,
        reason: "Aside Browser Profile 0 연결 끊김 — 맥스튜디오에서 해당 브라우저 프로필을 실행하세요.",
        retryable: true,
      }
    }
    return { pdf: null, reason: `aside 실행 실패: ${message}` }
  }
  const result = parseAsideResult(stdout)
  if (!result.ok || !result.b64) return { pdf: null, reason: describeAsideFailure(result) }
  const pdf = Buffer.from(result.b64, "base64")
  if (!isPdfBuffer(pdf)) {
    return {
      pdf: null,
      reason: describeAsideFailure({ ...result, reason: "PDF 아님(구독 벽/challenge 추정)" }),
    }
  }
  return { pdf }
}
