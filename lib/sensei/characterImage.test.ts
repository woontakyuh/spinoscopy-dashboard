import { describe, it, expect } from "vitest"
import { characterImageSrc, resolveBeltArt } from "./characterImage"

describe("characterImage", () => {
  it("Gi 는 아트가 있는 벨트를 그대로 매핑한다", () => {
    expect(characterImageSrc("blue", "gi")).toBe("/characters/tak-gi-blue.webp")
  })

  it("NoGi 는 벨트와 무관하게 한 장을 쓴다", () => {
    expect(characterImageSrc("blue", "nogi")).toBe("/characters/tak-nogi.webp")
    expect(characterImageSrc("black", "nogi")).toBe("/characters/tak-nogi.webp")
  })

  it("아트가 없는 상위 벨트는 가장 높은 하위 벨트로 폴백한다", () => {
    expect(resolveBeltArt("purple")).toBe("blue")
    expect(resolveBeltArt("black")).toBe("blue")
    expect(characterImageSrc("purple", "gi")).toBe("/characters/tak-gi-blue.webp")
  })

  it("하위에 아트가 없으면 상위 아트라도 쓴다", () => {
    expect(resolveBeltArt("white")).toBe("blue")
  })

  it("알 수 없는 벨트 값도 이미지를 돌려준다", () => {
    expect(characterImageSrc("coral", "gi")).toBe("/characters/tak-gi-blue.webp")
  })
})

describe("characterImage — 컨디션", () => {
  it("컨디션 전용 아트가 없으면 기본 아트로 떨어진다", () => {
    expect(characterImageSrc("blue", "gi", "rusty")).toBe("/characters/tak-gi-blue.webp")
    expect(characterImageSrc("blue", "nogi", "dormant")).toBe("/characters/tak-nogi.webp")
  })

  it("컨디션을 안 줘도 동작한다", () => {
    expect(characterImageSrc("blue", "gi")).toBe("/characters/tak-gi-blue.webp")
  })
})
