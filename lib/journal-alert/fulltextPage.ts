// lib/journal-alert/fulltextPage.ts
// 메일의 "원문" 버튼을 눌렀을 때 뜨는 페이지 — 판단부와 렌더부.
//
// 이 페이지는 meta refresh 로 자기 자신을 계속 다시 연다(JS 없이 어느 메일
// 클라이언트의 인앱 브라우저에서도 돌게). 그래서 "이번 열림에서 원문요청을
// 걸어야 하는가" 를 상태로 판단하는 게 핵심이다 — 매번 걸면 페이지를 띄워둔
// 동안 10초마다 요청이 재발행된다.

import type { FulltextState } from "../fulltext/status"
import { escHtml } from "./mailTemplate"

const REFRESH_SECONDS = 10

export interface PageDecision {
  shouldRequest: boolean
  refreshSeconds: number | null
}

/** `retry` 는 실패 화면의 [다시 시도] 를 사람이 눌렀을 때만 true. */
export function decideFulltextAction(state: FulltextState, retry: boolean): PageDecision {
  if (state === "acquired") return { shouldRequest: false, refreshSeconds: null }
  if (state === "none") return { shouldRequest: true, refreshSeconds: REFRESH_SECONDS }
  if (state === "pending") return { shouldRequest: false, refreshSeconds: REFRESH_SECONDS }
  // failed — 자동 재시도는 하지 않는다. 안 그러면 영영 못 받는 논문 하나가
  // 페이지를 열어둔 내내 맥스튜디오 브라우저를 헛돌린다.
  return retry
    ? { shouldRequest: true, refreshSeconds: REFRESH_SECONDS }
    : { shouldRequest: false, refreshSeconds: null }
}

/** Dropbox 공유링크 → 미리보기 페이지를 거치지 않고 파일이 바로 열리는 raw 링크. */
function rawPdfUrl(shareUrl: string): string {
  try {
    const u = new URL(shareUrl)
    if (!u.hostname.includes("dropbox.com")) return shareUrl
    u.searchParams.delete("dl")
    u.searchParams.set("raw", "1")
    return u.toString()
  } catch {
    return shareUrl
  }
}

export interface PageInput {
  title: string
  journal: string
  state: FulltextState
  pdfUrl: string | null
  refreshSeconds: number | null
  reason?: string
  retryUrl?: string
  /** 구독이 없어 애초에 받을 수 없는 저널일 때의 안내. */
  blockedReason?: string
}

const WRAP = (inner: string, refresh: number | null) =>
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${
    refresh ? `<meta http-equiv="refresh" content="${refresh}">` : ""
  }<title>원문 확보</title></head><body style="margin:0;background:#ffffff;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><div style="max-width:520px;margin:0 auto;padding:32px 24px;">${inner}</div></body></html>`

const BTN = (href: string, label: string, bg: string) =>
  `<a href="${escHtml(href)}" style="display:inline-block;margin-top:18px;padding:12px 20px;background:${bg};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">${label}</a>`

export function renderFulltextPage(p: PageInput): string {
  const head = `<p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;color:#9ca3af;">JOURNAL ALERT</p>
    <h1 style="margin:0 0 4px;font-size:17px;line-height:1.45;color:#111827;">${escHtml(p.title)}</h1>
    <p style="margin:0 0 20px;color:#6b7280;font-size:13px;">${escHtml(p.journal)}</p>`

  if (p.blockedReason) {
    return WRAP(
      `${head}<p style="margin:0;font-size:15px;color:#b45309;">🚫 ${escHtml(p.blockedReason)}</p>`,
      null
    )
  }

  if (p.state === "acquired" && p.pdfUrl) {
    return WRAP(
      `${head}<p style="margin:0;font-size:15px;color:#047857;">✅ 원문 확보 완료</p>${BTN(
        rawPdfUrl(p.pdfUrl),
        "📄 PDF 열기",
        "#2563eb"
      )}`,
      null
    )
  }

  if (p.state === "failed") {
    const why = p.reason ? `<p style="margin:8px 0 0;color:#6b7280;font-size:13px;">${escHtml(p.reason)}</p>` : ""
    const retry = p.retryUrl ? BTN(p.retryUrl, "다시 시도", "#4b5563") : ""
    return WRAP(`${head}<p style="margin:0;font-size:15px;color:#b91c1c;">⚠️ 원문 확보 실패</p>${why}${retry}`, null)
  }

  // none(막 접수) · pending(받는 중) — 둘 다 기다리는 화면
  const line =
    p.state === "none"
      ? "✅ 원문요청 접수됨 — 곧 받기 시작합니다"
      : "⏳ 원내망에서 받는 중…"
  return WRAP(
    `${head}<p style="margin:0;font-size:15px;color:#1d4ed8;">${line}</p>
     <p style="margin:10px 0 0;color:#6b7280;font-size:13px;">이 페이지는 ${p.refreshSeconds ?? REFRESH_SECONDS}초마다 자동으로 새로고침됩니다. 보통 몇 분 안에 끝납니다 — 창을 닫으셔도 수집은 계속됩니다.</p>`,
    p.refreshSeconds
  )
}
