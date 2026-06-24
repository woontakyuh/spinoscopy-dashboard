import { describe, it, expect } from "vitest"
import { parseTsjDate, extractPii, parseTsjCitation } from "./journalSite"

describe("parseTsjDate", () => {
  it("parses 'Published online: June 24, 2026'", () => {
    expect(parseTsjDate("Published online: June 24, 2026")).toBe("2026-06-24")
  })
  it("parses bare 'May 6, 2026'", () => {
    expect(parseTsjDate("May 6, 2026")).toBe("2026-05-06")
  })
  it("returns null on garbage", () => {
    expect(parseTsjDate("Full-Text")).toBeNull()
  })
})

describe("extractPii", () => {
  it("pulls PII from a fulltext href", () => {
    expect(extractPii("/article/S1529-9430(26)00191-9/fulltext")).toBe("S1529-9430(26)00191-9")
  })
  it("returns null when absent", () => {
    expect(extractPii("/issue/whatever")).toBeNull()
  })
})

describe("parseTsjCitation", () => {
  it("builds a ScrapedArticle from raw DOM fields", () => {
    const raw = {
      title: "Quantifying Postural Recovery After Lumbar Decompression",
      href: "/article/S1529-9430(26)00191-9/fulltext",
      innerText:
        "Quantifying Postural Recovery After Lumbar Decompression\nRam Haddas,Prasanth Romiyo,Ye Shu\nPublished online: June 24, 2026\nFull-Text",
    }
    expect(parseTsjCitation(raw)).toEqual({
      title: "Quantifying Postural Recovery After Lumbar Decompression",
      authors: "Ram Haddas, Prasanth Romiyo, Ye Shu",
      url: "https://www.thespinejournalonline.com/article/S1529-9430(26)00191-9/fulltext",
      pii: "S1529-9430(26)00191-9",
      postedAt: "2026-06-24",
      journalName: "The Spine Journal",
    })
  })
  it("returns null when no PII (e.g. menu link)", () => {
    expect(parseTsjCitation({ title: "x", href: "/issue/y", innerText: "x" })).toBeNull()
  })
})
