import { describe, it, expect } from "vitest"
import { toMultiSelectOptions } from "./pipeline"

describe("toMultiSelectOptions", () => {
  it("splits a comma-joined keyword into separate options (Notion 400 regression)", () => {
    const input = ["Degenerative lumbar diseases,Gait analysis, Biomarkers, Machine Learning, Wearable sensors"]
    expect(toMultiSelectOptions(input)).toEqual([
      { name: "Degenerative lumbar diseases" },
      { name: "Gait analysis" },
      { name: "Biomarkers" },
      { name: "Machine Learning" },
      { name: "Wearable sensors" },
    ])
  })

  it("trims, drops empties, and dedups case-insensitively", () => {
    expect(toMultiSelectOptions(["AI", " ai ", "", "  ", "MIS"])).toEqual([
      { name: "AI" },
      { name: "MIS" },
    ])
  })

  it("passes through clean single keywords unchanged", () => {
    expect(toMultiSelectOptions(["Endoscopy", "PROM"])).toEqual([
      { name: "Endoscopy" },
      { name: "PROM" },
    ])
  })

  it("caps option names at 100 chars", () => {
    const long = "x".repeat(150)
    expect(toMultiSelectOptions([long])[0].name).toHaveLength(100)
  })
})
