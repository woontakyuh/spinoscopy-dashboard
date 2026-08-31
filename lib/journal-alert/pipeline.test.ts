import { describe, it, expect } from "vitest"
import { toMultiSelectOptions, minimalArticleFromScraped, titleKey, doiKey, articleAlreadyExists, JOURNAL_DIGEST_START, buildPendingDigestQuery, parsePendingDigestPage, loadPendingDigestItems, sendPendingJournalDigest } from "./pipeline"

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

describe("doiKey", () => {
  it("normalizes DOI case + url prefix to the same key (BRS vs brs dup regression)", () => {
    expect(doiKey("https://doi.org/10.1097/BRS.0000000000005777")).toBe(
      doiKey("https://doi.org/10.1097/brs.0000000000005777"),
    )
  })

  it("strips http/https/dx.doi.org prefix and lowercases", () => {
    expect(doiKey("https://dx.doi.org/10.1097/BRS.5777")).toBe("10.1097/brs.5777")
    expect(doiKey("10.1097/BRS.5777")).toBe("10.1097/brs.5777")
  })
})

describe("articleAlreadyExists", () => { it("matches a DOI that differs only by case (crossref stub vs PubMed dup)", () => {
  const existing = new Set([doiKey("https://doi.org/10.1097/brs.0000000000005777")])
  expect(
    articleAlreadyExists(
      { doiUrl: "https://doi.org/10.1097/BRS.0000000000005777", title: "Some Title", pmid: "42348845" },
      existing,
    ),
  ).toBe(true)
})

it("matches by PMID when DOI absent", () => {
  const existing = new Set(["pmid:12345"])
  expect(articleAlreadyExists({ doiUrl: "", title: "X", pmid: "12345" }, existing)).toBe(true)
})

it("matches by title key when DOI/PMID absent", () => {
  const existing = new Set([titleKey("Endoscopic UBE for Stenosis")])
  expect(articleAlreadyExists({ doiUrl: "", title: "Endoscopic UBE for stenosis.", pmid: null as unknown as string }, existing)).toBe(true)
})

it("returns false for a genuinely new article", () => {
  const existing = new Set([doiKey("https://doi.org/10.1/aaa")])
  expect(articleAlreadyExists({ doiUrl: "https://doi.org/10.1/bbb", title: "New", pmid: "999" }, existing)).toBe(false)
}) })

describe("buildPendingDigestQuery", () => {
  it("selects every unalerted page created after unified digest launch", () => {
    const query = buildPendingDigestQuery("next-page")

    expect(query).toEqual({
      page_size: 100,
      filter: {
        and: [
          { property: "Alerted", checkbox: { equals: false } },
          {
            timestamp: "created_time",
            created_time: { on_or_after: JOURNAL_DIGEST_START },
          },
        ],
      },
      start_cursor: "next-page",
    })
  })
})

describe("parsePendingDigestPage", () => { it("keeps the stored interest and mailing fields", () => {
  const page = {
    id: "page-1",
    properties: {
      Title: { title: [{ plain_text: "UBE decompression outcomes" }] },
      Author: { rich_text: [{ plain_text: "Kim, Lee" }] },
      "Journal Name": { select: { name: "TSJ" } },
      DOI: { url: "https://doi.org/10.1/example" },
      "Publication Date": { date: { start: "2026-08-31" } },
      관심도: { select: { name: "🟡 관심" } },
    },
  }

  expect(parsePendingDigestPage(page)).toEqual({
    pageId: "page-1",
    title: "UBE decompression outcomes",
    authors: "Kim, Lee",
    journalName: "TSJ",
    doiUrl: "https://doi.org/10.1/example",
    pubDate: "2026-08-31",
    interest: "🟡 관심",
  })
})

it("drops a malformed page without a title", () => {
  expect(parsePendingDigestPage({ id: "page-2", properties: {} })).toBeNull()
}) })

describe("loadPendingDigestItems", () => { it("loads all unalerted pages across Notion pagination", async () => {
  const requestBodies: string[] = []
  const responses: unknown[] = [
    {
      results: [{
        id: "page-red",
        properties: {
          Title: { title: [{ plain_text: "Red paper" }] },
          관심도: { select: { name: "🔴 필독" } },
        },
      }],
      has_more: true,
      next_cursor: "cursor-2",
    },
    {
      results: [{
        id: "page-white",
        properties: {
          Title: { title: [{ plain_text: "White paper" }] },
          관심도: { select: { name: "⚪ 참고" } },
        },
      }],
      has_more: false,
      next_cursor: null,
    },
  ]
  const request = async (_path: string, options: RequestInit = {}): Promise<unknown> => {
    requestBodies.push(String(options.body ?? ""))
    return responses.shift()
  }

  const items = await loadPendingDigestItems("database-id", request)

  expect(items.map((item) => item.title)).toEqual(["Red paper", "White paper"])
  expect(requestBodies).toHaveLength(2)
  expect(requestBodies[1]).toContain('"start_cursor":"cursor-2"')
}) })

describe("sendPendingJournalDigest", () => {
  it("includes every pending interest level in one dry-run digest", async () => {
    const request = async (): Promise<unknown> => ({
      results: [
        { id: "must", properties: { Title: { title: [{ plain_text: "Must" }] }, 관심도: { select: { name: "🔴 필독" } } } },
        { id: "interest", properties: { Title: { title: [{ plain_text: "Interest" }] }, 관심도: { select: { name: "🟡 관심" } } } },
        { id: "reference", properties: { Title: { title: [{ plain_text: "Reference" }] }, 관심도: { select: { name: "⚪ 참고" } } } },
      ],
      has_more: false,
      next_cursor: null,
    })

    const result = await sendPendingJournalDigest("database-id", { dryRun: true, request })

    expect(result.sent).toBe(false)
    expect(result.reason).toBe("dry_run")
    expect(result.shownCount).toBe(3)
  })
})
