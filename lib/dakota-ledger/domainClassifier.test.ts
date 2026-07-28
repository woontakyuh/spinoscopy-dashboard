import { describe, expect, it, vi } from "vitest"
import { buildDomainClassificationPrompt, classifyDomains } from "./domainClassifier"

describe("buildDomainClassificationPrompt", () => {
  it("key와 text를 나열하고 9개 도메인을 명시한다", () => {
    const prompt = buildDomainClassificationPrompt([{ key: "todo:1", text: "택배 발송" }])
    expect(prompt).toContain("todo:1")
    expect(prompt).toContain("택배 발송")
    expect(prompt).toContain("Strategy")
    expect(prompt).toContain("Operations")
  })
})

describe("classifyDomains", () => {
  it("batchSize 단위로 나눠 classifier를 호출하고 결과를 하나의 맵으로 합친다", async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ key: `k${i}`, text: `항목 ${i}` }))
    const classifier = vi.fn().mockImplementation(async (prompt: string) => {
      // 이 배치에 포함된 key만 응답한다
      const keys = [...prompt.matchAll(/- (k\d+) \|/g)].map((m) => m[1])
      return { items: keys.map((key) => ({ key, domain: "Operations" as const })) }
    })

    const result = await classifyDomains(items, classifier, 2)

    expect(classifier).toHaveBeenCalledTimes(3) // ceil(5/2)
    expect(result.size).toBe(5)
    expect(result.get("k0")).toBe("Operations")
    expect(result.get("k4")).toBe("Operations")
  })

  it("빈 입력이면 classifier를 호출하지 않는다", async () => {
    const classifier = vi.fn()
    const result = await classifyDomains([], classifier, 40)
    expect(classifier).not.toHaveBeenCalled()
    expect(result.size).toBe(0)
  })
})
