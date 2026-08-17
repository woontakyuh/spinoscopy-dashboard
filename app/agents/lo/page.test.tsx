// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import LoPage from "./page"

vi.mock("@/components/layout/TopBar", () => ({
  TopBar: () => <header>Lo</header>,
}))
vi.mock("@/components/layout/AgentChat", () => ({
  AgentChat: ({
    api,
    formatMessage,
  }: {
    api?: string
    formatMessage?: (text: string) => string
  }) => (
    <div
      data-chat-api={api}
      data-formatted-preview={formatMessage?.("답변 [citation:notion:training:one]")}
    >
      Lo coach
    </div>
  ),
}))
vi.mock("@/components/sensei/SenseiDashboard", () => ({
  SenseiDashboard: ({ onNavigate }: { onNavigate: (tab: string) => void }) => (
    <section>
      Character dashboard
      <button type="button" onClick={() => onNavigate("map")}>Open gameplan map</button>
    </section>
  ),
}))
vi.mock("@/components/sensei/SenseiCalendar", () => ({
  SenseiCalendar: () => <section>Training calendar</section>,
}))
vi.mock("@/components/sensei/SenseiCapture", () => ({
  SenseiCapture: () => <section>Training capture</section>,
}))
vi.mock("@/components/lo/HomeOverview", () => ({
  HomeOverview: () => <section>Home overview</section>,
}))
vi.mock("@/components/lo/ConceptsFeed", () => ({
  ConceptsFeed: () => <section>Concept memory</section>,
}))
vi.mock("@/components/lo/NavMapWrapper", () => ({
  NavMapWrapper: () => <section>Skill connections</section>,
}))
vi.mock("@/components/lo/CompetitionsView", () => ({
  CompetitionsView: () => <section>Competitions view</section>,
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <LoPage />
    </QueryClientProvider>,
  )
}

function stubLoPageFetch() {
  vi.stubGlobal("fetch", vi.fn((input: string) => {
    if (input === "/api/notion/sensei/stats") {
      return Promise.resolve({ ok: true, json: async () => ({ stats: null }) })
    }
    if (input === "/api/notion/sensei") {
      return Promise.resolve({ ok: true, json: async () => [] })
    }
    throw new Error(`Unexpected request: ${input}`)
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Lo legacy feature regression", () => {
  it("keeps all seven Lo navigation surfaces", () => {
    stubLoPageFetch()

    renderPage()

    for (const label of ["Home", "Character", "Skills", "Training", "Competitions", "Concepts", "Memory"]) {
      expect(screen.getByRole("button", { name: new RegExp(label, "i") })).toBeVisible()
    }
    expect(screen.getByText("Lo coach")).toBeVisible()
    expect(screen.getByText("Lo coach")).toHaveAttribute("data-chat-api", "/api/lo/conversation")
    expect(screen.getByText("Lo coach")).toHaveAttribute("data-formatted-preview", "답변")
    expect(screen.getByText("Home overview")).toBeVisible()
  })

  it("restores character, skill connections, and training capture", () => {
    stubLoPageFetch()

    renderPage()

    fireEvent.click(screen.getByRole("button", { name: /character/i }))
    expect(screen.getByText("Character dashboard")).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: /skills/i }))
    expect(screen.getByText("Skill connections")).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: /training/i }))
    expect(screen.getByText("Training calendar")).toBeVisible()
    expect(screen.queryByText("Training capture")).not.toBeInTheDocument()
    expect(screen.getByText("날짜를 선택해")).toBeVisible()
  })

  it("restores competitions and concept memory", () => {
    stubLoPageFetch()

    renderPage()

    fireEvent.click(screen.getByRole("button", { name: /competitions/i }))
    expect(screen.getByText("Competitions view")).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: /concepts/i }))
    expect(screen.getByText("Concept memory")).toBeVisible()
  })

  it("routes character game-plan navigation to the Skills tab", () => {
    stubLoPageFetch()

    renderPage()

    fireEvent.click(screen.getByRole("button", { name: /character/i }))
    fireEvent.click(screen.getByRole("button", { name: /open gameplan map/i }))

    expect(screen.getByText("Skill connections")).toBeVisible()
  })
})
