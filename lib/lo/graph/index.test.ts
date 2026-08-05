import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  buildBjjGraph,
  getGraphNeighborhood,
  parseBjjFrontmatter,
} from "@/lib/lo/graph/index"
import { loadBjjGraph } from "@/lib/lo/graph/server"
import type { MarkdownSourceFile } from "@/lib/types/lo-graph"

const fixtureFiles: MarkdownSourceFile[] = [
  {
    path: "positions/hg.md",
    content: `---
id: hg
name: Half Guard
name_kr: 하프 가드
layer: guard
family: half
perspective: bottom
ruleset: common
curriculum_lessons: [47, 48]
---

# 하프 가드

**내 게임에서의 역할**: 척추 — 홈 포지션 (코요테 하프)

## 나가는 전이

- **언더훅 백테이크** (transition) → [[back_top|백 컨트롤]] — 조건: 언더훅 확보
`,
  },
  {
    path: "positions/back_top.md",
    content: `---
id: back_top
name: Back Control
name_kr: 백 컨트롤
layer: control
perspective: top
ruleset: common
---

# 백 컨트롤
`,
  },
  {
    path: "techniques/hg-underhook-backtake.md",
    content: `---
id: hg-underhook-backtake
from: hg
to: back_top
ruleset: common
status: adopted
source: own-game
evidence:
  - "2026-07-06 sparring success"
---

# 언더훅 백테이크
`,
  },
  {
    path: "techniques/hg-counter.md",
    content: `---
id: hg-counter
from: hg
to: [back_top, hg]
ruleset: gi
status: testing
source: class
branches:
  - if: "상대가 앞으로 민다"
    then: back_top
  - if: "상대가 뒤로 빠진다"
    then: hg
---

# 하프가드 카운터
`,
  },
  {
    path: "log/2026-07-06.md",
    content: `# Sparring

| 포지션 | 기술 | 결과 | 비고 |
| --- | --- | --- | --- |
| hg | 언더훅 백테이크 | ✅ 성공 | [[partner-test|테스트 상대]] |
`,
  },
  {
    path: "partners/test.md",
    content: `---
id: partner-test
name: 테스트 상대
type: sparring-partner
---

# 테스트 상대
`,
  },
  {
    path: "strategy/gi.md",
    content: `# 전략 — Gi (A-game 척추)

## 척추 경로 (adopted)

\`\`\`
스탠딩 ──가드풀──▶ 하프가드 정착 (코요테 홈)
   코요테 하프 ──┬─ 언더훅 백테이크 ──▶ 백 컨트롤
\`\`\`
`,
  },
  {
    path: "ratings/current.md",
    content: `---
id: guard-retention
name: Guard retention
score: 72
scale: 100
dimension: defense
---
`,
  },
]

describe("BJJ graph parser and index", () => {
  it("parses the observed frontmatter schema, including scalar arrays and branch mappings", () => {
    const parsed = parseBjjFrontmatter(fixtureFiles[3].content, fixtureFiles[3].path)

    expect(parsed.diagnostics).toEqual([])
    expect(parsed.data.to).toEqual(["back_top", "hg"])
    expect(parsed.data.branches).toEqual([
      { if: "상대가 앞으로 민다", then: "back_top" },
      { if: "상대가 뒤로 빠진다", then: "hg" },
    ])
  })

  it("reports malformed technique metadata without discarding the rest of the graph", () => {
    const graph = buildBjjGraph([
      ...fixtureFiles,
      {
        path: "techniques/malformed.md",
        content: `---
id: malformed
from:
to: [does-not-exist]
ruleset: karate
status: invented
source: test
---

# Broken`,
      },
    ])

    expect(graph.positions.map((position) => position.id)).toEqual(["back_top", "hg"])
    expect(graph.techniques.map((technique) => technique.id)).not.toContain("malformed")
    expect(graph.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["missing-required-field", "invalid-ruleset", "invalid-technique-status"]),
    )
  })

  it("indexes directed neighbors, counter branches, sparring evidence, and explicit player ratings", () => {
    const graph = buildBjjGraph(fixtureFiles)
    const neighborhood = getGraphNeighborhood(graph, "hg")

    expect(neighborhood?.outgoing.map((edge) => edge.value.id)).toEqual([
      "transition:hg:back_top:1",
      "hg-counter",
      "hg-underhook-backtake",
    ])
    expect(neighborhood?.relatedPositions.map((position) => position.id)).toEqual(["back_top"])
    expect(graph.techniques.find((technique) => technique.id === "hg-counter")).toMatchObject({
      isCounter: true,
      toIds: ["back_top", "hg"],
    })
    expect(graph.branches.map((branch) => branch.targetId)).toEqual(["back_top", "hg"])
    expect(graph.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: "2026-07-06",
          outcome: "success",
          subjectIds: ["hg", "hg-underhook-backtake"],
          playerIds: ["partner-test"],
        }),
      ]),
    )
    expect(graph.playerRatings).toEqual([
      expect.objectContaining({ id: "guard-retention", score: 72, scale: 100, dimension: "defense" }),
    ])
  })

  it("extracts the adopted Gi A-game flow from the strategy document", () => {
    const graph = buildBjjGraph(fixtureFiles)
    const flow = graph.gameFlows.find((item) => item.id === "gi-a-game-spine")

    expect(flow).toMatchObject({ ruleset: "gi", status: "adopted" })
    expect(flow?.branches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          positionIds: expect.arrayContaining(["hg"]),
          techniqueIds: ["hg-underhook-backtake"],
        }),
      ]),
    )
  })

  it("has deterministic ordering regardless of source-file enumeration order", () => {
    expect(buildBjjGraph(fixtureFiles)).toEqual(buildBjjGraph([...fixtureFiles].reverse()))
  })

  it("indexes representative canonical BJJ positions, techniques, strategy, and log evidence", async () => {
    const graph = await loadBjjGraph(path.resolve(process.cwd(), "../BJJ"))

    expect(graph.positions.find((position) => position.id === "hg")).toMatchObject({
      name: "Half Guard",
      nameKr: "하프 가드",
    })
    expect(graph.techniques.find((technique) => technique.id === "hg-no-underhook-branches")).toMatchObject({
      fromId: "hg",
      toIds: ["side_top", "kimura", "closed", "dlr"],
      status: "testing",
    })
    expect(graph.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: "2026-07-06",
          outcome: "success",
          subjectIds: expect.arrayContaining(["back_top", "back-bowarrow"]),
        }),
      ]),
    )
    expect(graph.gameFlows.find((flow) => flow.id === "gi-a-game-spine")).toBeDefined()
  })
})
