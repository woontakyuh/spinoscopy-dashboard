import { describe, it, expect } from "vitest"
import { fulltextButton } from "./mailTemplate"

describe("fulltextButton", () => {
  it("링크가 없으면 빈 문자열 — 키 미설정이면 버튼을 아예 안 그린다", () => {
    // 깨진 링크가 메일로 나가는 것보다 버튼이 없는 게 낫다.
    expect(fulltextButton(null)).toBe("")
  })

  it("링크가 있으면 그 주소를 가리키는 앵커를 만든다", () => {
    const html = fulltextButton("https://example.com/api/journal/fulltext?p=x&t=y")
    expect(html).toContain('href="https://example.com/api/journal/fulltext?p=x&amp;t=y"')
    expect(html).toContain("원문")
  })

  it("이미지를 쓰지 않는다 — Gmail 이미지 차단 상태에서도 보여야 한다", () => {
    expect(fulltextButton("https://example.com/x")).not.toContain("<img")
  })
})
