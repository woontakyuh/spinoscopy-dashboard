import { describe, it, expect } from "vitest"
import {
  DEMO_HOST,
  DEMO_AGENT_IDS,
  isDemoHost,
  isAllowedAgentPath,
  isValidDashboardPassword,
} from "./demo"

describe("isDemoHost", () => {
  it("matches the demo host with or without port", () => {
    expect(isDemoHost("dashboard1.takmd.com")).toBe(true)
    expect(isDemoHost("dashboard1.takmd.com:443")).toBe(true)
  })
  it("rejects the main host and empties", () => {
    expect(isDemoHost("takmd.com")).toBe(false)
    expect(isDemoHost("localhost:4321")).toBe(false)
    expect(isDemoHost(null)).toBe(false)
    expect(isDemoHost(undefined)).toBe(false)
  })
})

describe("DEMO constants", () => {
  it("are exactly elon and brian on the demo host", () => {
    expect(DEMO_AGENT_IDS).toEqual(["elon", "brian"])
    expect(DEMO_HOST).toBe("dashboard1.takmd.com")
  })
})

describe("isAllowedAgentPath", () => {
  it("allows non-agent paths", () => {
    expect(isAllowedAgentPath("/")).toBe(true)
    expect(isAllowedAgentPath("/login")).toBe(true)
  })
  it("allows only elon and brian agent pages", () => {
    expect(isAllowedAgentPath("/agents/elon")).toBe(true)
    expect(isAllowedAgentPath("/agents/brian")).toBe(true)
    expect(isAllowedAgentPath("/agents/brian/anything")).toBe(true)
  })
  it("blocks other agent pages", () => {
    expect(isAllowedAgentPath("/agents/warren")).toBe(false)
    expect(isAllowedAgentPath("/agents/lo")).toBe(false)
    expect(isAllowedAgentPath("/agents/andrej")).toBe(false)
    expect(isAllowedAgentPath("/agents/dakota")).toBe(false)
  })
})

describe("isValidDashboardPassword", () => {
  it("accepts either the dashboard or demo password", () => {
    expect(isValidDashboardPassword("main", "main", "demo")).toBe(true)
    expect(isValidDashboardPassword("demo", "main", "demo")).toBe(true)
  })
  it("rejects wrong or empty input", () => {
    expect(isValidDashboardPassword("nope", "main", "demo")).toBe(false)
    expect(isValidDashboardPassword("", "main", "demo")).toBe(false)
    expect(isValidDashboardPassword("demo", "main", undefined)).toBe(false)
  })
})
