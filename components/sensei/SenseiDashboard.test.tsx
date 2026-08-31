// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SenseiDashboard } from "@/components/sensei/SenseiDashboard"
import type { Archetype, BjjStats } from "@/lib/types/sensei"

const GAUGES = [
  { key: "guard", label: "Guard", value: 62 },
  { key: "passing", label: "Passing", value: 47 },
  { key: "control", label: "Control", value: 55 },
  { key: "finishing", label: "Submission", value: 71 },
  { key: "takedowns", label: "Standing", value: 38 },
  { key: "legLocks", label: "Leg Locks", value: 29 },
] as const

const GI_ATTRIBUTES = {
  guard: 62,
  passing: 47,
  control: 55,
  finishing: 71,
  takedowns: 38,
  legLocks: 29,
}

// NoGi values differ from Gi so the gauge assertions fail if the wrong mode is read.
const NOGI_ATTRIBUTES = {
  guard: 51,
  passing: 44,
  control: 60,
  finishing: 66,
  takedowns: 33,
  legLocks: 41,
}

const STATS: BjjStats = {
  level: 12,
  totalSessions: 480,
  xpCurrent: 120,
  xpToNext: 300,
  belt: "blue",
  beltStripes: 3,
  trainingStartDate: "2019-11-27",
  trainingMonths: 74,
  gi: { attributes: GI_ATTRIBUTES, ovr: 58, ovrRole: "Guard Player", closestArchetype: null },
  nogi: { attributes: NOGI_ATTRIBUTES, ovr: 54, ovrRole: "Leg Locker", closestArchetype: null },
  combined: { attributes: GI_ATTRIBUTES, ovr: 56, ovrRole: "All-Rounder", closestArchetype: null },
  playstyle: "Half Guard Specialist",
  recentFocus: ["Half Guard"],
  streaks: { current: 4, best: 9 },
  daysSinceLastSession: 2,
  giRatio: 0.6,
  sessions2026: 92,
  sessions2026Gi: 55,
  sessions2026Nogi: 37,
  attendanceRate: 0.8,
  lastCeremonyDate: "2026-03-20",
  completedCycles: [],
  inProgressCycles: [],
}

const ARCHETYPES: Archetype[] = [
  {
    name: "Roger Gracie",
    flag: "Brazil",
    nickname: "The GOAT",
    team: "Gracie Barra",
    stats: { guard: 88, passing: 92, control: 95, finishing: 96, takedowns: 74, legLocks: 45 },
    tags: ["Cross Collar", "Mount Pressure"],
    playstyle: "Fundamental Pressure",
    ruleSet: "gi",
    category: "gi-legend",
    gameplan: [
      { position: "Closed Guard", action: "Break the posture", next: [] },
      { position: "Mount", action: "Cross collar choke", next: [] },
    ],
  },
  {
    name: "Gordon Ryan",
    flag: "🇺🇸",
    nickname: "The King",
    team: "New Wave",
    stats: { guard: 90, passing: 94, control: 97, finishing: 95, takedowns: 70, legLocks: 92 },
    tags: ["Body Lock", "Back Take"],
    playstyle: "Systematic Control",
    ruleSet: "nogi",
    category: "nogi",
    gameplan: [{ position: "Closed Guard", action: "Body lock pass", next: [] }],
  },
  {
    name: "Mikey Musumeci",
    flag: "🇯🇵",
    nickname: "Darth Rigatoni",
    team: "ZR Team",
    stats: { guard: 96, passing: 70, control: 78, finishing: 88, takedowns: 52, legLocks: 97 },
    tags: ["Heel Hook"],
    playstyle: "Leg Lock Wizard",
    ruleSet: "both",
    category: "special",
    gameplan: [{ position: "Closed Guard", action: "Enter the heel hook", next: [] }],
  },
]

vi.mock("@/lib/sensei/useSenseiData", () => ({
  useSenseiData: () => ({
    archetypes: ARCHETYPES,
    positions: [
      {
        id: "closed-guard",
        name: "Closed Guard",
        nameKr: "클로즈드 가드",
        layer: "guard",
        family: "closed",
        perspective: "bottom",
        ruleSet: "common",
      },
      {
        id: "mount",
        name: "Mount",
        nameKr: "마운트",
        layer: "control",
        perspective: "top",
        ruleSet: "common",
      },
    ],
    transitions: [],
    source: "fallback",
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}))

function renderDashboard() {
  const onNavigate = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <SenseiDashboard onNavigate={onNavigate} />
    </QueryClientProvider>,
  )

  return { onNavigate }
}

describe("SenseiDashboard", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ stats: STATS, tagFrequencies: { "Half Guard": 6 }, studyTagFrequencies: {} }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    )
  })

  it("shows numeric values on main attribute gauges", async () => {
    renderDashboard()

    const panel = await screen.findByTestId("attribute-gauges")

    expect(within(panel).getAllByRole("meter")).toHaveLength(GAUGES.length)
    for (const gauge of GAUGES) {
      const el = within(panel).getByTestId(`attr-gauge-${gauge.key}`)
      expect(within(el).getByText(String(gauge.value))).toBeVisible()
      expect(el).toHaveAttribute("aria-valuenow", String(gauge.value))
      expect(el).toHaveAttribute("aria-valuemin", "0")
      expect(el).toHaveAttribute("aria-valuemax", "100")
      expect(el.getAttribute("aria-label")).toMatch(new RegExp(`${gauge.label}.*${gauge.value}`))
    }
  })

  it("renders readable full athlete identity and detail sections", async () => {
    const { onNavigate } = renderDashboard()

    const roster = await screen.findByTestId("athlete-roster")
    for (const athlete of ARCHETYPES) {
      const card = within(roster).getByRole("button", { name: new RegExp(athlete.name) })
      expect(within(card).getByText(athlete.name)).toBeVisible()
      expect(within(card).getByTestId("athlete-flag")).toHaveRole("img")
    }

    fireEvent.click(within(roster).getByRole("button", { name: /Roger Gracie/ }))

    const detail = screen.getByTestId("athlete-detail")

    const identity = within(detail).getByRole("region", { name: "선수 정보" })
    expect(within(identity).getByRole("heading", { name: /Roger Gracie/ })).toBeVisible()
    expect(within(identity).getByRole("img", { name: "Brazil flag" })).toBeVisible()
    expect(identity).toHaveTextContent("The GOAT")
    expect(identity).toHaveTextContent("Gracie Barra")

    const style = within(detail).getByRole("region", { name: "스타일" })
    expect(style).toHaveTextContent("Fundamental Pressure")
    const guardRow = within(style).getByTestId("compare-row-guard")
    expect(guardRow).toHaveTextContent("62")
    expect(guardRow).toHaveTextContent("88")
    expect(within(style).getByTestId("athlete-mini-radar")).toBeInTheDocument()

    const strengths = within(detail).getByRole("region", { name: "시그니처 강점" })
    expect(within(strengths).getByText("Cross Collar")).toBeVisible()
    expect(within(strengths).getByText("Mount Pressure")).toBeVisible()

    const gameplan = within(detail).getByRole("region", { name: "게임플랜" })
    expect(gameplan).toHaveTextContent("Break the posture")
    fireEvent.click(within(gameplan).getByRole("button", { name: /Map/ }))
    expect(onNavigate).toHaveBeenCalledWith("map")
  })
})
