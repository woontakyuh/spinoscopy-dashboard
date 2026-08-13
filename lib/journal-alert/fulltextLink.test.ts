import { describe, it, expect } from "vitest"
import { signPageId, verifyPageToken, buildFulltextLink } from "./fulltextLink"

const SECRET = "test-secret-0123456789"
const PAGE = "3b8908af-25b9-8141-be36-d2c0cf8772e8"

describe("signPageId / verifyPageToken", () => {
  it("같은 입력이면 같은 서명 — 지난주 메일의 버튼도 계속 동작해야 한다", () => {
    expect(signPageId(PAGE, SECRET)).toBe(signPageId(PAGE, SECRET))
  })

  it("제 서명은 통과한다", () => {
    expect(verifyPageToken(PAGE, signPageId(PAGE, SECRET), SECRET)).toBe(true)
  })

  it("pageId 를 바꿔치기하면 거부한다", () => {
    // 엔드포인트가 로그인을 우회하므로, 서명 없이 pageId 만 알아도 통과하면
    // 아무나 맥스튜디오에 작업을 밀어넣을 수 있다.
    const token = signPageId(PAGE, SECRET)
    expect(verifyPageToken("11111111-2222-3333-4444-555555555555", token, SECRET)).toBe(false)
  })

  it("다른 키로 만든 서명은 거부한다", () => {
    expect(verifyPageToken(PAGE, signPageId(PAGE, "other-secret"), SECRET)).toBe(false)
  })

  it("빈 토큰·엉뚱한 길이의 토큰에도 죽지 않고 false", () => {
    // timingSafeEqual 은 길이가 다르면 던진다 — 그대로 두면 500 이 난다.
    expect(verifyPageToken(PAGE, "", SECRET)).toBe(false)
    expect(verifyPageToken(PAGE, "abc", SECRET)).toBe(false)
    expect(verifyPageToken(PAGE, "!!not-hex!!", SECRET)).toBe(false)
  })

  it("키가 비면 무엇도 통과시키지 않는다", () => {
    expect(verifyPageToken(PAGE, signPageId(PAGE, ""), "")).toBe(false)
  })
})

describe("buildFulltextLink", () => {
  it("pageId 와 서명이 붙은 절대 URL 을 만든다", () => {
    const url = buildFulltextLink("https://example.com", PAGE, SECRET)
    expect(url).not.toBeNull()
    const u = new URL(url!)
    expect(u.pathname).toBe("/api/journal/fulltext")
    expect(u.searchParams.get("p")).toBe(PAGE)
    expect(verifyPageToken(PAGE, u.searchParams.get("t")!, SECRET)).toBe(true)
  })

  it("baseUrl 끝 슬래시를 먹는다", () => {
    expect(buildFulltextLink("https://example.com/", PAGE, SECRET)).toContain(
      "https://example.com/api/journal/fulltext?"
    )
  })

  it("키나 baseUrl 이 없으면 null — 깨진 링크를 메일에 내보내느니 버튼을 안 그린다", () => {
    expect(buildFulltextLink("https://example.com", PAGE, "")).toBeNull()
    expect(buildFulltextLink("", PAGE, SECRET)).toBeNull()
  })
})
