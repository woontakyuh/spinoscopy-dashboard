import { describe, it, expect } from "vitest"
import { toMultiSelectOptions, minimalArticleFromScraped, titleKey } from "./pipeline"

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

describe("minimalArticleFromScraped", () => {
  it("builds a title-only PubmedArticle from a scraped item", () => {
    const a = minimalArticleFromScraped({
      title: "Endoscopic UBE for stenosis",
      authors: "A, B",
      url: "https://www.thespinejournalonline.com/article/S1529-9430(26)00191-9/fulltext",
      pii: "S1529-9430(26)00191-9",
      postedAt: "2026-06-24",
      journalName: "The Spine Journal",
    })
    expect(a.title).toBe("Endoscopic UBE for stenosis")
    expect(a.abstract).toBe("")
    expect(a.pubTypes).toEqual([])
    expect(a.pmid).toBeNull()
    expect(a.pubDate).toBe("2026-06-24")
    expect(a.doiUrl).toBe("")
    expect(a.journalName).toBe("The Spine Journal")
  })
})

describe("titleKey", () => {
  it("trailing period and no period produce the same key", () => {
    expect(
      titleKey("Quantifying Postural Recovery After Lumbar Decompression.")
    ).toBe(
      titleKey("Quantifying Postural Recovery After Lumbar Decompression")
    )
  })

  it("typographic vs straight punctuation collapses to the same key", () => {
    expect(
      titleKey("UBE: A “Pilot” Study")
    ).toBe(
      titleKey("UBE  A  Pilot  Study")
    )
  })

  it("lowercases and caps result at 80 chars", () => {
    const long = "A".repeat(100)
    const key = titleKey(long)
    expect(key).toBe("a".repeat(80))
    expect(key.length).toBe(80)
  })
})
