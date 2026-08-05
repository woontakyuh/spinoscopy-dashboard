import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getLoFitnessSnapshot, listBjjTrainingSessions, listFitnessRecords } from "./loFitness"

const ORIGINAL_ENV = { ...process.env }

const FITNESS_PAGE = {
  id: "fitness-1",
  url: "https://notion.so/fitness-1",
  properties: {
    Day: { type: "title", title: [{ plain_text: "2026-08-03" }] },
    Date: { type: "date", date: { start: "2026-08-03" } },
    "Record type": { type: "select", select: { name: "Daily log" } },
    Manager: { type: "select", select: { name: "Lo" } },
    "Weight kg": { type: "number", number: 74.2 },
    "Body fat %": { type: "number", number: 16.8 },
    "SMM kg": { type: "number", number: 32.1 },
    "Muscle mass kg": { type: "number", number: 57.3 },
    "Fat-free mass kg": { type: "number", number: 61.7 },
    "Body fat mass kg": { type: "number", number: 12.5 },
    "Bone mass kg": { type: "number", number: 3.2 },
    "Mineral mass kg": { type: "number", number: 3.5 },
    "Visceral fat level": { type: "number", number: 6 },
    "BMI kg/m²": { type: "number", number: 23.1 },
    "BMR kcal": { type: "number", number: 1650 },
    "Obesity degree %": { type: "number", number: 108 },
    "Push-ups": { type: "number", number: 100 },
    "Daily target": { type: "number", number: 120 },
    Workout: { type: "rich_text", rich_text: [{ plain_text: "BJJ" }] },
    Meals: { type: "rich_text", rich_text: [{ plain_text: "Protein-first" }] },
    Notes: { type: "rich_text", rich_text: [{ plain_text: "Good recovery" }] },
    Challenge: { type: "select", select: { name: "Aug 2026 3000 Push-ups" } },
    "Daily medication": { type: "rich_text", rich_text: [] },
    "Daily supplements": { type: "rich_text", rich_text: [] },
    "Mounjaro dose": { type: "rich_text", rich_text: [] },
    "Injection status": { type: "select", select: null },
    "Injection site": { type: "select", select: null },
    "Push-up sets": { type: "rich_text", rich_text: [] },
    "Last confirmed": { type: "date", date: null },
  },
}

const REGIMEN_PAGE = {
  ...FITNESS_PAGE,
  id: "fitness-regimen",
  properties: {
    ...FITNESS_PAGE.properties,
    Day: { type: "title", title: [{ plain_text: "Current health regimen" }] },
    Date: { type: "date", date: null },
    "Record type": { type: "select", select: { name: "Current regimen" } },
    "Daily medication": { type: "rich_text", rich_text: [{ plain_text: "Medication A" }] },
    "Daily supplements": { type: "rich_text", rich_text: [{ plain_text: "Vitamin D" }] },
    "Mounjaro dose": { type: "rich_text", rich_text: [{ plain_text: "5 mg" }] },
    "Last confirmed": { type: "date", date: { start: "2026-08-01" } },
  },
}

const BJJ_PAGE = {
  id: "bjj-1",
  url: "https://notion.so/bjj-1",
  properties: {
    Name: { type: "title", title: [{ plain_text: "Half guard class" }] },
    Date: { type: "date", date: { start: "2026-08-03" } },
    SessionType: { type: "select", select: { name: "class" } },
    Instructor: { type: "select", select: { name: "조준용" } },
    Gym: { type: "select", select: { name: "DT Wire" } },
    Class: { type: "multi_select", multi_select: [{ name: "HalfPass" }] },
    Sparring: { type: "multi_select", multi_select: [{ name: "HG" }] },
    "Study Tags": { type: "multi_select", multi_select: [{ name: "Underhook" }] },
    Note: { type: "rich_text", rich_text: [{ plain_text: "Underhook battle" }] },
    "Today Focus": { type: "rich_text", rich_text: [{ plain_text: "Win inside position" }] },
    "Focus Applied": { type: "checkbox", checkbox: true },
    "Video URL": { type: "url", url: "https://example.com/video" },
    "Video Title": { type: "rich_text", rich_text: [{ plain_text: "Class video" }] },
  },
}

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token"
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.unstubAllGlobals()
})

describe("Fitness Log accessor", () => {
  it("maps Fitness Log measurements and text fields exactly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [FITNESS_PAGE], has_more: false, next_cursor: null }),
    }))

    await expect(listFitnessRecords()).resolves.toEqual([expect.objectContaining({
      pageId: "fitness-1",
      date: "2026-08-03",
      recordType: "Daily log",
      manager: "Lo",
      metrics: expect.objectContaining({ weightKg: 74.2, bodyFatPercent: 16.8, pushUps: 100 }),
      workout: "BJJ",
      meals: "Protein-first",
      notes: "Good recovery",
    })])
  })

  it("returns current regimen and latest daily log from fully paginated Fitness Log data", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [REGIMEN_PAGE], has_more: true, next_cursor: "fitness-next" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [FITNESS_PAGE], has_more: false, next_cursor: null }),
      })
    vi.stubGlobal("fetch", fetchMock)

    await expect(getLoFitnessSnapshot()).resolves.toEqual({
      currentRegimen: expect.objectContaining({
        pageId: "fitness-regimen",
        dailyMedication: "Medication A",
        dailySupplements: "Vitamin D",
        mounjaroDose: "5 mg",
        lastConfirmed: "2026-08-01",
      }),
      latestDailyLog: expect.objectContaining({ pageId: "fitness-1", date: "2026-08-03" }),
    })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).start_cursor).toBe("fitness-next")
  })

  it("throws when Notion omits a required pagination cursor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [FITNESS_PAGE], has_more: true, next_cursor: null }),
    }))

    await expect(listFitnessRecords()).rejects.toThrow(/next_cursor/)
  })
})

describe("BJJ Training accessor", () => {
  it("uses the date window on every page and normalizes a training session", async () => {
    const secondPage = { ...BJJ_PAGE, id: "bjj-2" }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [BJJ_PAGE], has_more: true, next_cursor: "bjj-next" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [secondPage], has_more: false, next_cursor: null }),
      })
    vi.stubGlobal("fetch", fetchMock)

    const sessions = await listBjjTrainingSessions({ from: "2026-08-01", to: "2026-08-31" })

    expect(sessions).toHaveLength(2)
    expect(sessions[0]).toMatchObject({
      pageId: "bjj-1",
      date: "2026-08-03",
      sessionType: "class",
      instructor: "조준용",
      gym: "DT Wire",
      classTags: ["HalfPass"],
      sparringTags: ["HG"],
      studyTags: ["Underhook"],
      focusApplied: true,
    })
    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse(call[1].body).filter).toEqual({
        and: [
          { property: "Date", date: { on_or_after: "2026-08-01" } },
          { property: "Date", date: { on_or_before: "2026-08-31" } },
        ],
      })
    }
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).start_cursor).toBe("bjj-next")
  })

  it("fails loudly when BJJ Training pagination cannot continue", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [BJJ_PAGE], has_more: true, next_cursor: null }),
    }))

    await expect(listBjjTrainingSessions()).rejects.toThrow(/next_cursor/)
  })
})
