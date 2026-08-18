import { describe, expect, it } from "vitest"
import {
  buildEvidenceFinishTransitions,
  mergeEvidenceFinishTransitions,
} from "@/lib/sensei/evidenceFinishConnections"
import { POSITIONS } from "@/lib/sensei/skillConnections"
import type { SenseiEntry, Transition } from "@/lib/types/sensei"

function trainingEntry(
  id: string,
  overrides: Partial<SenseiEntry>,
): SenseiEntry {
  return {
    id,
    title: id,
    sessionType: "class",
    date: "2026-07-27",
    instructor: "",
    gym: "",
    classTags: [],
    sparringTags: [],
    studyTags: [],
    note: "",
    url: "",
    ...overrides,
  }
}

const EVIDENCE_ENTRIES = [
  trainingEntry("half-kimura-class", {
    classTags: ["DLR", "Lasso", "Omoplata"],
    sparringTags: ["Lasso", "HG"],
    note: "하프가드에서 언더훅 단일 엔진 한계 진단, 기무라 제2엔진 분기 트리 신설.",
  }),
  trainingEntry("back-bowarrow", {
    date: "2026-07-06",
    classTags: ["HQ"],
    sparringTags: ["HG"],
    note: `${"앞 문맥 ".repeat(30)}백 → 보우앤애로우 초크 성공${" 뒤 문맥".repeat(30)}.`,
  }),
  trainingEntry("separate-tag-groups", {
    date: "2026-07-30",
    classTags: ["DLR", "Armbar"],
    sparringTags: ["Lasso", "HG"],
    note: "RDLR 키스오브드래곤 후 백 잡고 보우앤애로우, RDLR 카운터, 암바·스트레이트 암바.",
  }),
  trainingEntry("half-kimura-discussion", {
    sessionType: "study",
    date: "2026-08-11",
    studyTags: ["심층논의", "교본", "HG", "Kimura"],
  }),
] satisfies readonly SenseiEntry[]

describe("evidence finish connections", () => {
  it("derives finishes only from co-recorded training and discussion evidence", () => {
    const transitions = buildEvidenceFinishTransitions(
      EVIDENCE_ENTRIES,
      [],
      POSITIONS,
    )
    const halfKimura = transitions.find(
      (transition) =>
        transition.from === "hg" &&
        transition.to === "kimura",
    )

    expect(halfKimura?.evidence).toMatchObject({
      count: 2,
      kinds: expect.arrayContaining(["class", "study", "discussion", "research"]),
    })
    expect(
      transitions.some(
        (transition) =>
          transition.from === "back_top" &&
          transition.to === "bowarrow",
      ),
    ).toBe(true)
    expect(
      transitions.some(
        (transition) =>
          transition.from === "hg" &&
          transition.to === "armb",
      ),
    ).toBe(false)
    expect(
      transitions.some(
        (transition) =>
          transition.from === "back_top" &&
          transition.to === "armb",
      ),
    ).toBe(false)
    const backBowarrow = transitions.find(
      (transition) =>
        transition.from === "back_top" &&
        transition.to === "bowarrow",
    )
    expect(
      backBowarrow?.evidence?.snippets.every(
        (snippet) =>
          /(?:back|백)/i.test(snippet) &&
          /(?:bow|보우|보앤)/i.test(snippet),
      ),
    ).toBe(true)
    expect(
      backBowarrow?.evidence?.snippets.some(
        (snippet) => snippet.startsWith("…") && snippet.endsWith("…"),
      ),
    ).toBe(true)
  })

  it("enriches existing transitions without duplicating their edge", () => {
    const evidenceTransitions = buildEvidenceFinishTransitions(
      EVIDENCE_ENTRIES,
      [],
      POSITIONS,
    )
    const base = [{
      from: "back_top",
      to: "bowarrow",
      action: "보우앤아로우",
      actionEn: "Bow and Arrow",
      type: "submission",
      ruleSet: "gi",
    }] satisfies readonly Transition[]

    const merged = mergeEvidenceFinishTransitions(base, evidenceTransitions)

    expect(
      merged.filter(
        (transition) =>
          transition.from === "back_top" &&
          transition.to === "bowarrow",
      ),
    ).toHaveLength(1)
    expect(
      merged.find(
        (transition) =>
          transition.from === "back_top" &&
          transition.to === "bowarrow",
        )?.evidence?.count,
    ).toBe(2)
  })
})
