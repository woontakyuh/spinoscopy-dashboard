import { describe, expect, it } from "vitest"
import { AGENT_REGISTRY, getAgentDefinition, isRegisteredAgentId } from "./registry"

describe("agent registry", () => {
  it("uses the same current Sonnet tier for every interactive agent", () => {
    expect(Object.values(AGENT_REGISTRY).map((agent) => agent.model)).toEqual([
      "claude-sonnet-5", "claude-sonnet-5", "claude-sonnet-5",
      "claude-sonnet-5", "claude-sonnet-5", "claude-sonnet-5",
    ])
  })

  it("accepts only known specialist IDs", () => {
    expect(isRegisteredAgentId("brian")).toBe(true)
    expect(isRegisteredAgentId("not-a-real-agent")).toBe(false)
    expect(getAgentDefinition("andrej").capabilities).toContain("ai-workflow")
  })
})
