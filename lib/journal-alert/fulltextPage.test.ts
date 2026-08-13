import { describe, it, expect } from "vitest"
import { decideFulltextAction, renderFulltextPage } from "./fulltextPage"

describe("decideFulltextAction", () => {
  it("아직 요청 전이면 요청을 건다", () => {
    expect(decideFulltextAction("none", false)).toEqual({ shouldRequest: true, refreshSeconds: 10 })
  })

  it("이미 대기 중이면 다시 걸지 않는다 — 자동 새로고침이 같은 URL 을 계속 연다", () => {
    // 이게 무너지면 페이지를 열어둔 동안 10초마다 원문요청이 재발행된다.
    expect(decideFulltextAction("pending", false)).toEqual({ shouldRequest: false, refreshSeconds: 10 })
  })

  it("확보되면 새로고침을 멈춘다", () => {
    expect(decideFulltextAction("acquired", false)).toEqual({ shouldRequest: false, refreshSeconds: null })
  })

  it("실패는 자동 재시도하지 않는다 — 무한 재시도로 브라우저를 헛돌리면 안 된다", () => {
    expect(decideFulltextAction("failed", false)).toEqual({ shouldRequest: false, refreshSeconds: null })
  })

  it("실패 상태에서 사람이 [다시 시도] 를 누른 경우에만 다시 건다", () => {
    expect(decideFulltextAction("failed", true)).toEqual({ shouldRequest: true, refreshSeconds: 10 })
  })

  it("이미 확보된 논문은 재시도 요청이 와도 다시 걸지 않는다", () => {
    expect(decideFulltextAction("acquired", true)).toEqual({ shouldRequest: false, refreshSeconds: null })
  })
})

describe("renderFulltextPage", () => {
  const base = { title: "Development and Initial Validation", journal: "Spine" }

  it("확보되면 PDF 링크를 띄우고 meta refresh 를 넣지 않는다", () => {
    const html = renderFulltextPage({
      ...base,
      state: "acquired",
      pdfUrl: "https://www.dropbox.com/scl/fi/x/a.pdf?rlkey=k&dl=0",
      refreshSeconds: null,
    })
    expect(html).toContain("PDF 열기")
    expect(html).not.toContain("http-equiv=\"refresh\"")
    // Dropbox 공유링크는 raw 로 바꿔야 미리보기 페이지를 안 거치고 바로 열린다.
    expect(html).toContain("raw=1")
  })

  it("대기 중이면 meta refresh 를 넣는다", () => {
    const html = renderFulltextPage({ ...base, state: "pending", pdfUrl: null, refreshSeconds: 10 })
    expect(html).toContain('http-equiv="refresh"')
    expect(html).toContain("content=\"10\"")
  })

  it("실패면 사유와 다시 시도 링크를 보여준다", () => {
    const html = renderFulltextPage({
      ...base,
      state: "failed",
      pdfUrl: null,
      refreshSeconds: null,
      reason: "PDF 아님(구독 벽 추정)",
      retryUrl: "https://example.com/api/journal/fulltext?p=x&t=y&retry=1",
    })
    expect(html).toContain("PDF 아님(구독 벽 추정)")
    expect(html).toContain("다시 시도")
  })

  it("제목의 HTML 특수문자를 이스케이프한다", () => {
    const html = renderFulltextPage({
      title: "A <script>alert(1)</script> B",
      journal: "Spine",
      state: "pending",
      pdfUrl: null,
      refreshSeconds: 10,
    })
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;")
  })
})
