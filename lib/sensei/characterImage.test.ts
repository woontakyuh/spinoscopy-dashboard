import { describe, it, expect } from "vitest"
import { characterImageSrc, resolveBeltArt } from "./characterImage"

describe("characterImage", () => {
  it("아트가 있는 벨트는 그대로 매핑한다", () => {
    expect(characterImageSrc("blue")).toBe("/characters/tak-blue.webp")
  })

  it("아트가 없는 상위 벨트는 가장 높은 하위 벨트로 폴백한다", () => {
    expect(resolveBeltArt("purple")).toBe("blue")
    expect(resolveBeltArt("black")).toBe("blue")
  })

  it("하위에 아트가 없으면 상위 아트라도 쓴다", () => {
    expect(resolveBeltArt("white")).toBe("blue")
  })

  it("알 수 없는 벨트 값도 이미지를 돌려준다", () => {
    expect(characterImageSrc("coral")).toBe("/characters/tak-blue.webp")
  })
})
