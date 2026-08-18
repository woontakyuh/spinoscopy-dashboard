// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SenseiNavMap } from "@/components/sensei/SenseiNavMap"

vi.mock("@/lib/sensei/useSenseiData", () => ({
  useSenseiData: () => ({
    positions: [
      {
        id: "hg",
        name: "Half Guard",
        nameKr: "하프 가드",
        layer: "guard",
        family: "half",
        perspective: "bottom",
        ruleSet: "common",
      },
      {
        id: "kshield",
        name: "Knee Shield",
        nameKr: "니쉴드",
        layer: "guard",
        family: "half",
        perspective: "bottom",
        ruleSet: "common",
      },
      {
        id: "dlr",
        name: "De La Riva",
        nameKr: "데라히바",
        layer: "guard",
        family: "open",
        perspective: "bottom",
        ruleSet: "common",
      },
      {
        id: "xg",
        name: "X Guard",
        nameKr: "엑스 가드",
        layer: "guard",
        family: "open",
        perspective: "bottom",
        ruleSet: "common",
      },
      {
        id: "kimura",
        name: "Kimura",
        nameKr: "기무라",
        layer: "submission",
        perspective: "neutral",
        ruleSet: "common",
      },
    ],
    transitions: [
      {
        from: "kshield",
        to: "hg",
        action: "언더훅 회복",
        actionEn: "Recover underhook",
        condition: "상대가 니쉴드를 누를 때",
        type: "transition",
        ruleSet: "common",
      },
      {
        from: "hg",
        to: "dlr",
        action: "데라히바 전환",
        actionEn: "Transition to DLR",
        condition: "상대가 일어설 때",
        type: "transition",
        ruleSet: "common",
      },
      {
        from: "dlr",
        to: "xg",
        action: "엑스가드 진입",
        actionEn: "Enter X guard",
        type: "transition",
        ruleSet: "common",
      },
    ],
  }),
}))

vi.mock("@/lib/sensei/strategies", () => ({
  loadMyStrategies: () => [],
}))

function renderNavMap() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={client}>
      <SenseiNavMap />
    </QueryClientProvider>,
  )
}

function setCompactViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches,
      media: "(max-width: 639px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe("SenseiNavMap", () => {
  beforeEach(() => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      length: 0,
    }
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storage,
    })
    setCompactViewport(false)
    Element.prototype.setPointerCapture = vi.fn()
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        const body = url.includes("/stats")
          ? { stats: {}, tagFrequencies: { HG: 4 } }
          : url.endsWith("/api/notion/sensei")
            ? [{
                id: "half-kimura-class",
                title: "하프가드 기무라",
                sessionType: "class",
                date: "2026-07-27",
                instructor: "",
                gym: "",
                classTags: ["HG", "Kimura"],
                sparringTags: [],
                studyTags: [],
                note: "",
                url: "",
              }]
            : []
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }),
    )
  })

  it("supports keyboard node selection and exposes the inspector on mobile", async () => {
    renderNavMap()

    const node = await screen.findByRole("button", { name: "하프 가드 스킬 보기" })
    fireEvent.keyDown(node, { key: "Enter" })

    expect(screen.getByRole("button", { name: "Focus 모드" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    const inspector = screen.getByTestId("navmap-detail")
    expect(inspector).toHaveAttribute("data-selected-node", "hg")
    expect(inspector).not.toHaveClass("hidden")

    fireEvent.click(within(inspector).getByRole("button", { name: "선택 해제" }))
    expect(screen.queryByTestId("navmap-detail")).not.toBeInTheDocument()
  })

  it("reveals depth-two nodes and opens transition context", async () => {
    renderNavMap()

    fireEvent.click(await screen.findByRole("button", { name: "하프 가드 스킬 보기" }))
    expect(screen.queryByRole("button", { name: "엑스 가드 스킬 보기" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Focus depth 2" }))
    expect(screen.getByRole("button", { name: "엑스 가드 스킬 보기" })).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: "데라히바 전환 전이 보기" }))
    const detail = screen.getByTestId("navmap-transition-detail")
    expect(detail).toHaveTextContent("상대가 일어설 때")
  })

  it("keeps map coordinates in Focus and toggles the selected node back to Map", async () => {
    renderNavMap()

    const halfGuard = await screen.findByRole("button", { name: "하프 가드 스킬 보기" })
    const kneeShield = screen.getByRole("button", { name: "니쉴드 스킬 보기" })
    const halfGuardTransform = halfGuard.getAttribute("transform")
    const kneeShieldTransform = kneeShield.getAttribute("transform")

    fireEvent.click(halfGuard)

    expect(screen.getByRole("button", { name: "Focus 모드" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: "하프 가드 스킬 보기" })).toHaveAttribute(
      "transform",
      halfGuardTransform,
    )
    expect(screen.getByRole("button", { name: "니쉴드 스킬 보기" })).toHaveAttribute(
      "transform",
      kneeShieldTransform,
    )

    fireEvent.click(screen.getByRole("button", { name: "니쉴드 스킬 보기" }))

    expect(screen.getByRole("button", { name: "하프 가드 스킬 보기" })).toHaveAttribute(
      "transform",
      halfGuardTransform,
    )
    expect(screen.getByRole("button", { name: "니쉴드 스킬 보기" })).toHaveAttribute(
      "transform",
      kneeShieldTransform,
    )

    fireEvent.click(screen.getByRole("button", { name: "니쉴드 스킬 보기" }))

    expect(screen.getByRole("button", { name: "Map 모드" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.queryByTestId("navmap-detail")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "엑스 가드 스킬 보기" })).toBeVisible()
    expect(screen.getByRole("button", { name: "하프 가드 스킬 보기" })).toHaveAttribute(
      "transform",
      halfGuardTransform,
    )
  })

  it("enlarges compact Focus nodes around their unchanged coordinates", async () => {
    setCompactViewport(true)
    renderNavMap()

    const halfGuard = await screen.findByRole("button", { name: "하프 가드 스킬 보기" })
    const mapTransform = halfGuard.getAttribute("transform")
    expect(mapTransform).toMatch(/^translate\(.+\) scale\(1\)$/)

    fireEvent.click(halfGuard)

    expect(screen.getByRole("button", { name: "하프 가드 스킬 보기" })).toHaveAttribute(
      "transform",
      mapTransform?.replace("scale(1)", "scale(2.5)"),
    )

    fireEvent.click(screen.getByRole("button", { name: "하프 가드 스킬 보기" }))
    expect(screen.getByRole("button", { name: "하프 가드 스킬 보기" })).toHaveAttribute(
      "transform",
      mapTransform,
    )
  })

  it("shows record evidence on a derived position finish", async () => {
    renderNavMap()

    fireEvent.click(await screen.findByRole("button", { name: "하프 가드 스킬 보기" }))

    const detail = await screen.findByTestId("navmap-detail")
    expect(within(detail).getByText("하프 가드 기무라")).toBeInTheDocument()
    expect(within(detail).getByText("기록 1")).toBeInTheDocument()
  })

  it("pins dragged Map nodes and resets their saved layout", async () => {
    renderNavMap()

    const canvas = screen.getByTestId("sensei-navmap-canvas")
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      width: 1200,
      height: 720,
      x: 0,
      y: 0,
      top: 0,
      right: 1200,
      bottom: 720,
      left: 0,
      toJSON: () => ({}),
    })

    const node = await screen.findByRole("button", { name: "하프 가드 스킬 보기" })
    fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 140, clientY: 120 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })

    expect(node).toHaveAttribute("data-pinned", "true")

    fireEvent.click(screen.getByRole("button", { name: "Reset node layout" }))
    expect(node).not.toHaveAttribute("data-pinned")
  })
})
