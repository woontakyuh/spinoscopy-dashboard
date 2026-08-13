// Journal Alert 메일 공통 템플릿 — 모든 발송 스크립트(sweep 다이제스트, crossref-gap,
// topic-radar, backfill 리포트)가 공유한다.
// 규칙: 제목은 "[Journal Alert] …" 단일 prefix, 본문은 화이트 배경 라이트 톤.

export function alertSubject(text: string): string {
  return `[Journal Alert] ${text}`
}

export function escHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** 라이트 테마 공통 래퍼 — JOURNAL ALERT 라벨 + 제목 + meta 줄들 + 본문 */
export function alertWrap(heading: string, metaLines: string[], bodyHtml: string): string {
  const meta = metaLines
    .filter(Boolean)
    .map((m) => `<p style="margin:0 0 6px;color:#6b7280;font-size:12px;">${m}</p>`)
    .join("")
  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><div style="max-width:680px;margin:0 auto;padding:24px;"><p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;color:#9ca3af;">JOURNAL ALERT</p><h1 style="margin:0 0 10px;font-size:20px;color:#111827;">${heading}</h1>${meta}<div style="margin-top:16px;">${bodyHtml}</div></div></body></html>`
}

export function notionPageUrl(pageId: string): string {
  return `https://www.notion.so/${pageId.replace(/-/g, "")}`
}

/**
 * 논문 제목 뒤에 붙는 작은 Notion 아이콘 링크 — 클릭하면 그 논문의 Notion 페이지로 이동.
 * Gmail 은 SVG/data-URI 를 막으므로 Notion 파비콘 이미지(프록시 로딩) + alt "N" 사용.
 */
export function notionIconLink(url: string): string {
  return `<a href="${escHtml(url)}" style="text-decoration:none;margin-left:6px;" title="Notion에서 열기"><img src="https://www.notion.so/images/favicon.ico" width="13" height="13" alt="N" style="vertical-align:-2px;border:0;"></a>`
}

/**
 * 논문 제목 옆 "원문" 버튼 — 누르면 원문 수집이 걸리고 확보되면 그 자리에서 PDF 가 열린다.
 * url 이 null 이면(서명 키·baseUrl 미설정) 빈 문자열 — 깨진 링크를 내보내느니 안 그린다.
 * 이미지 없이 인라인 스타일만 쓴다: Gmail 이미지 차단 상태에서도 보여야 한다.
 */
export function fulltextButton(url: string | null): string {
  if (!url) return ""
  return `<a href="${escHtml(url)}" style="display:inline-block;margin-left:6px;padding:1px 7px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:10px;text-decoration:none;font-size:11px;font-weight:600;vertical-align:1px;" title="원문 수집 요청">원문</a>`
}

/**
 * 논문 1건 리스트 아이템 (라이트). title/href 는 여기서 escape,
 * badgesHtml/subHtml/noteHtml 은 호출부가 완성한 HTML 을 그대로 받는다.
 */
export function articleItem(a: {
  href: string
  title: string
  notionUrl?: string
  badgesHtml?: string
  subHtml: string
  noteHtml?: string
}): string {
  return `<li style="margin:0 0 14px 0;line-height:1.5;">
    <a href="${escHtml(a.href)}" style="color:#2563eb;text-decoration:none;font-weight:600;">${escHtml(a.title)}</a>${a.notionUrl ? notionIconLink(a.notionUrl) : ""}${a.badgesHtml ?? ""}<br>
    <span style="color:#6b7280;font-size:13px;">${a.subHtml}</span>${a.noteHtml ? `<br><span style="color:#374151;font-size:13px;">${a.noteHtml}</span>` : ""}
  </li>`
}

export function articleList(itemsHtml: string): string {
  return `<ul style="padding-left:18px;margin:0;">${itemsHtml}</ul>`
}
