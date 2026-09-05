import { describe, it, expect } from "vitest"
import { summarizeEntry, ruleSetOf, isPhysicalSession } from "./sessionLabels"
import { entryTags, entryHasTag } from "./trainingEntry"
import type { SenseiEntry } from "@/lib/types/sensei"

const e = (o: Partial<SenseiEntry>): SenseiEntry => ({
  id: "1", title: "", sessionType: "class", date: "2026-08-10", instructor: "", gym: "",
  classTags: [], sparringTags: [], studyTags: [], note: "", url: "", ...o,
})

describe("summarizeEntry", () => {
  it("노션 제목이 내용을 담고 있으면 그대로", () => {
    expect(summarizeEntry(e({ title: "★루프초크 — 싯업가드 패스의 피니시" }))).toBe("★루프초크 — 싯업가드 패스의 피니시")
  })
  it("제목이 날짜뿐이면 태그로 대신한다 (Gi/NoGi 태그는 뺀다)", () => {
    expect(summarizeEntry(e({ title: "주짓수 2026-08-28", classTags: ["NoGi", "HG", "HalfPass"] }))).toBe("HG · HalfPass")
  })
  it("태그도 없으면 제목이라도 돌려준다", () => {
    expect(summarizeEntry(e({ title: "주짓수 2026-08-28" }))).toBe("주짓수 2026-08-28")
  })
})

describe("ruleSetOf / isPhysicalSession", () => {
  it("NoGi 태그로 가른다", () => {
    expect(ruleSetOf(e({ classTags: ["NoGi"] }))).toBe("NoGi")
    expect(ruleSetOf(e({ sparringTags: ["NoGi"] }))).toBe("NoGi")
    expect(ruleSetOf(e({}))).toBe("Gi")
  })
  it("공부·승급에는 룰셋이 없다", () => {
    expect(ruleSetOf(e({ sessionType: "study" }))).toBeNull()
    expect(isPhysicalSession(e({ sessionType: "promotion" }))).toBe(false)
    expect(isPhysicalSession(e({ sessionType: "openmat" }))).toBe(true)
  })
})

describe("entryTags / entryHasTag", () => {
  it("수업·스파링·공부 태그를 합치고 룰셋 표기와 중복은 뺀다", () => {
    expect(entryTags(e({ classTags: ["NoGi", "HG", "hg"], sparringTags: ["백"], studyTags: ["HG", "Gi"] }))).toEqual(["HG", "백"])
  })
  it("대소문자·공백 무시하고 태그를 찾는다", () => {
    expect(entryHasTag(e({ classTags: ["HalfPass"] }), " halfpass ")).toBe(true)
    expect(entryHasTag(e({ classTags: ["HalfPass"] }), "DLR")).toBe(false)
  })
})
