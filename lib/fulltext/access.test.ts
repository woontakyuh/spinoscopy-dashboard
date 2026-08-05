import { describe, it, expect } from "vitest"
import { isNoAccessJournal, NO_ACCESS_REASON } from "./access"

describe("isNoAccessJournal", () => {
  // Notion 의 Journal Name select 에 TSJ 와 "The Spine Journal" 이 둘 다 존재한다.
  it("TSJ 는 두 표기 모두 막는다", () => {
    expect(isNoAccessJournal("TSJ")).toBe(true)
    expect(isNoAccessJournal("The Spine Journal")).toBe(true)
  })

  it("대소문자·공백에 흔들리지 않는다", () => {
    expect(isNoAccessJournal("  tsj ")).toBe(true)
    expect(isNoAccessJournal("the spine journal")).toBe(true)
  })

  it("접근 가능한 저널은 막지 않는다", () => {
    for (const j of ["Spine", "JNS Spine", "ESJ", "Eur Spine J", "GSJ", "Neurospine"]) {
      expect(isNoAccessJournal(j)).toBe(false)
    }
  })

  it("빈 값이면 막지 않는다 — 모르는 건 일단 시도한다", () => {
    expect(isNoAccessJournal("")).toBe(false)
    expect(isNoAccessJournal(null)).toBe(false)
    expect(isNoAccessJournal(undefined)).toBe(false)
  })

  it("사유 문구에 저널명이 들어간다", () => {
    expect(NO_ACCESS_REASON("TSJ")).toContain("TSJ")
  })
})
