import { describe, expect, it } from "vitest"
import { buildEvidencePositionTransitions } from "@/lib/sensei/evidencePositionConnections"
import { POSITIONS } from "@/lib/sensei/skillConnections"
import type { SenseiEntry } from "@/lib/types/sensei"

function entry(
  id: string,
  title: string,
  note: string,
  classTags: string[],
): SenseiEntry {
  return {
    id,
    title,
    note,
    classTags,
    sessionType: "class",
    date: "2026-07-16",
    instructor: "",
    gym: "",
    sparringTags: [],
    studyTags: [],
    url: "",
  }
}

describe("evidence position connections", () => {
  it("derives nearby HQ pass branches without distant-arrow false positives", () => {
    const transitions = buildEvidencePositionTransitions([
      entry(
        "hq-branches",
        "패스 그립 선점 → 니슬라이드/스매시",
        "갈래 1 니슬라이드. 갈래 2 스매시.",
        ["HQ", "KCP"],
      ),
      entry(
        "half-pass-analysis",
        "하프 패스 순서 분석",
        "일반 패스는 다리→골반→상체지만 하프가드는 상체 제압이 먼저다. HQ 패스 실패는 다른 원인이다.",
        ["HalfPass"],
      ),
      entry(
        "unrelated-research",
        "남은 연구",
        "오버언더 패스 대응 문서가 없다. SLX→X가드 전환 지점도 잘렸다.",
        ["Torreando"],
      ),
    ], POSITIONS)

    expect(
      transitions.map(({ from, to }) => `${from}:${to}`),
    ).toEqual(["hq:kcp", "hq:smash"])
    expect(
      transitions.every((transition) =>
        transition.evidence?.snippets.every((snippet) =>
          snippet.includes("본부 자세 기록"),
        ),
      ),
    ).toBe(true)
  })
})
