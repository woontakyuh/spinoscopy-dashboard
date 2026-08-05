import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  LO_COACHING_MEMORY,
  LO_PERSONA,
  formatLoAnswerForDisplay,
  loPersonaInstructions,
} from "./persona"

describe("Lo persona contract", () => {
  it("defines Leandro Lo as Tak's Korean banmal older-brother coach", () => {
    expect(LO_PERSONA.identity).toBe("lo-inspired-ai-coach")
    expect(LO_PERSONA.inspiration).toBe("leandro-lo")
    expect(LO_PERSONA.userAddress).toBe("Tak")
    expect(LO_PERSONA.language).toBe("ko")
    expect(LO_PERSONA.register).toBe("banmal")
    expect(LO_PERSONA.relationship).toBe("older-brother-coach")
    expect(LO_PERSONA.forbiddenAddresses).toContain("형")
  })

  it("preserves the existing BJJ coaching memory rules", () => {
    expect(LO_COACHING_MEMORY.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "game-system",
        "repo-cross-check",
        "curriculum-first",
        "owned-assets",
        "diagnostic-questions",
      ]),
    )
  })

  it("keeps repo-only coaching memory out of surfaces without repo tools", () => {
    expect(loPersonaInstructions().join("\n")).not.toContain("교본 60강")
    expect(loPersonaInstructions({ includeRepoContext: true }).join("\n")).toContain("교본 60강")
  })

  it("keeps the TypeScript projection in parity with canonical LO.md", () => {
    const canonical = readFileSync(path.join(process.cwd(), "LO.md"), "utf8")

    expect(canonical).toContain(`persona-version: ${LO_PERSONA.personaVersion}`)
    expect(canonical).toContain("[D2]")
    expect(canonical).toContain("[D3]")
    expect(canonical).toContain("[A1]")
    expect(canonical).toContain("[F1]")
    for (const rule of LO_COACHING_MEMORY) {
      expect(canonical).toContain(`[rule:${rule.id}]`)
    }
  })

  it("removes internal citation IDs without damaging the conversation text", () => {
    expect(formatLoAnswerForDisplay(
      "하프가드가 중심이야. [citation:notion:training:one]\n\n다음은 백테이크야. [citation:file:bjj:two]",
    )).toBe("하프가드가 중심이야.\n\n다음은 백테이크야.")
  })
})
