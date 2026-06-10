import { describe, it, expect } from "vitest"
import { maskPatientName } from "@/lib/utils"

describe("maskPatientName", () => {
  it("masks the middle of a 3-char name", () => {
    expect(maskPatientName("김철수")).toBe("김O수")
  })

  it("masks every middle char of a longer name", () => {
    expect(maskPatientName("남궁민수")).toBe("남OO수")
  })

  it("masks the last char of a 2-char name", () => {
    expect(maskPatientName("홍길")).toBe("홍O")
  })

  it("leaves single-char names untouched", () => {
    expect(maskPatientName("김")).toBe("김")
  })

  it("returns empty string for null/undefined/empty", () => {
    expect(maskPatientName(null)).toBe("")
    expect(maskPatientName(undefined)).toBe("")
    expect(maskPatientName("")).toBe("")
  })

  it("trims surrounding whitespace before masking", () => {
    expect(maskPatientName("  김철수  ")).toBe("김O수")
  })
})
