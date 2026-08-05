// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MemoryView } from "./MemoryView"

const concepts = Array.from({ length: 7 }, (_, index) => ({
  id: `concept-${index + 1}`,
  title: `Concept ${index + 1}`,
  date: `2026-08-0${index + 1}`,
  type: index === 0 ? ["전략"] : ["메타"],
  related_count: index === 0
    ? { positions: 1, transitions: 2, techniques: 3, archetypes: 4, competitions: 5 }
    : { positions: 0, transitions: 0, techniques: 0, archetypes: 0, competitions: 0 },
}))

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryView />
    </QueryClientProvider>,
  )
}

function stubMemoryFetch({
  durableMemory = { status: "empty", data: [] },
  conceptOk = true,
  dashboardOk = true,
}: {
  durableMemory?: { status: string; data: unknown[]; error?: string }
  conceptOk?: boolean
  dashboardOk?: boolean
} = {}) {
  vi.stubGlobal("fetch", vi.fn((input: string) => {
    if (input === "/api/notion/concept-notes") {
      return Promise.resolve({ ok: conceptOk, json: async () => concepts })
    }
    if (input === "/api/lo/dashboard") {
      return Promise.resolve({ ok: dashboardOk, json: async () => ({ memory: durableMemory }) })
    }
    if (input === "/api/lo/memory-candidates") {
      return Promise.resolve({ ok: true, json: async () => ({ candidates: [] }) })
    }
    throw new Error(`Unexpected request: ${input}`)
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("MemoryView", () => {
  it("keeps all seven concept records visible when durable memory is empty", async () => {
    stubMemoryFetch()

    renderView()

    expect(await screen.findByRole("heading", { name: "Concept Memory" })).toBeVisible()
    expect(await screen.findByRole("heading", { name: "Durable Memory" })).toBeVisible()
    for (const concept of concepts) {
      expect(screen.getByText(concept.title)).toBeVisible()
    }
    expect(screen.getByText("Type: 전략")).toBeVisible()
    expect(screen.getByText("2026-08-01")).toBeVisible()
    expect(screen.getByText("1 positions · 2 transitions · 3 techniques · 4 archetypes · 5 competitions")).toBeVisible()
    expect(screen.getByText("There are no durable memories.")).toBeVisible()
    expect(screen.getByText("Concept 7")).toBeVisible()
    expect(fetch).toHaveBeenCalledWith("/api/notion/concept-notes")
    expect(fetch).toHaveBeenCalledWith("/api/lo/dashboard")
  })

  it("renders a durable memory's category, content, and source", async () => {
    stubMemoryFetch({
      durableMemory: {
        status: "ready",
        data: [{
          pageId: "memory-1",
          name: "Half guard priority",
          content: "Prioritize the underhook before attacking.",
          category: "rule",
          source: { kind: "bjj_training", reference: "training-1" },
        }],
      },
    })

    renderView()

    expect(await screen.findByText("Half guard priority")).toBeVisible()
    expect(screen.getByText("rule")).toBeVisible()
    expect(screen.getByText("Prioritize the underhook before attacking.")).toBeVisible()
    expect(screen.getByText("Source: bjj_training · training-1")).toBeVisible()
  })

  it("states concept and durable memory API errors explicitly", async () => {
    stubMemoryFetch({ conceptOk: false, dashboardOk: false })

    renderView()

    expect(await screen.findByText("Unable to load Concept Memory.")).toBeVisible()
    expect(await screen.findByText("Unable to load Durable Memory.")).toBeVisible()
  })
})
