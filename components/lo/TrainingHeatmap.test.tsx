// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TrainingHeatmap } from "@/components/lo/TrainingHeatmap"
import type { SenseiEntry } from "@/lib/types/sensei"

const TODAY = "2026-08-17"

function trainingEntry(id: string, date = TODAY): SenseiEntry {
  return {
    id,
    title: "하프가드 수업",
    sessionType: "class",
    date,
    instructor: "",
    gym: "DT Wire",
    classTags: ["하프가드"],
    sparringTags: [],
    studyTags: [],
    note: "",
    url: "",
  }
}

describe("TrainingHeatmap", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-17T09:00:00+09:00"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("summarizes recent physical training and opens the Training tab", () => {
    const onOpenTraining = vi.fn()

    render(
      <TrainingHeatmap
        entries={[trainingEntry("session-1"), trainingEntry("session-2")]}
        onOpenTraining={onOpenTraining}
      />,
    )

    const heatmap = screen.getByRole("button", {
      name: "훈련 활동 달력, 최근 1년 1일 2회",
    })
    expect(heatmap).toHaveTextContent("최근 1년")
    expect(screen.getByTitle(`${TODAY} · 2회`)).toBeVisible()

    fireEvent.click(heatmap)
    expect(onOpenTraining).toHaveBeenCalledOnce()
  })

  it("renders a left-aligned GitHub-style year with month labels and hover detail", () => {
    render(
      <TrainingHeatmap
        entries={[
          trainingEntry("session-1", "2026-08-10"),
          trainingEntry("session-2"),
        ]}
      />,
    )

    const calendar = screen.getByTestId("training-heatmap-calendar")
    const days = calendar.querySelectorAll("[data-heatmap-day]")

    expect(days).toHaveLength(366)
    expect(screen.getByTitle("2025-08-17 · 0회")).toBeVisible()
    expect(screen.queryByTitle("2025-08-16 · 0회")).not.toBeInTheDocument()
    expect(screen.getByTitle(`${TODAY} · 1회`)).toBeVisible()
    expect(screen.getByTestId("heatmap-month-2025-09")).toHaveTextContent("9월")
    expect(calendar).toHaveClass("mr-auto")

    fireEvent.mouseEnter(screen.getByTitle("2026-08-10 · 1회"))
    const tooltip = screen.getByRole("tooltip")
    expect(tooltip).toHaveTextContent("2026년 8월 10일")
    // 날짜·회수만이 아니라 그날 무슨 수업이었는지가 나와야 한다
    expect(tooltip).toHaveTextContent("수업 · Gi")
    expect(tooltip).toHaveTextContent("하프가드 수업")

    fireEvent.mouseLeave(screen.getByTitle("2026-08-10 · 1회"))
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })
})

describe("TrainingHeatmap 툴팁 내용", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-17T09:00:00+09:00")) })
  afterEach(() => { vi.useRealTimers() })

  it("같은 날 여러 기록이면 몸으로 한 세션이 먼저, 공부는 뒤에 온다", () => {
    const study: SenseiEntry = { ...trainingEntry("s", "2026-08-10"), id: "s", sessionType: "study", title: "하프가드 프레임 공부", classTags: [], studyTags: ["프레임"] }
    const nogi: SenseiEntry = { ...trainingEntry("n", "2026-08-10"), id: "n", title: "노기 백테이크", classTags: ["NoGi", "백"] }
    render(<TrainingHeatmap entries={[study, nogi]} />)
    fireEvent.mouseEnter(screen.getByTitle("2026-08-10 · 1회"))
    const text = screen.getByRole("tooltip").textContent ?? ""
    expect(text.indexOf("노기 백테이크")).toBeLessThan(text.indexOf("하프가드 프레임 공부"))
    expect(text).toContain("수업 · NoGi")
    expect(text).toContain("공부")
  })

  it("기록 없는 날은 그렇게 말한다", () => {
    render(<TrainingHeatmap entries={[trainingEntry("x")]} />)
    fireEvent.mouseEnter(screen.getByTitle("2026-08-10 · 0회"))
    expect(screen.getByRole("tooltip")).toHaveTextContent("기록 없음")
  })
})
