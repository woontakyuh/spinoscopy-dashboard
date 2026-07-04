import { describe, it, expect } from "vitest"
import { ablyAuthHeader, ABLY_CHANNEL, ABLY_EVENT } from "./ably"

describe("ablyAuthHeader", () => {
  it("키를 base64 Basic 헤더로 만든다", () => {
    // "app.key:secret" → base64
    expect(ablyAuthHeader("app.key:secret")).toBe(
      "Basic " + Buffer.from("app.key:secret").toString("base64")
    )
  })
})

describe("상수", () => {
  it("채널/이벤트명 고정", () => {
    expect(ABLY_CHANNEL).toBe("fulltext-trigger")
    expect(ABLY_EVENT).toBe("request")
  })
})
