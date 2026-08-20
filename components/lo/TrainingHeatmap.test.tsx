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
    expect(screen.getByRole("tooltip")).toHaveTextContent("2026년 8월 10일 · 1회")

    fireEvent.mouseLeave(screen.getByTitle("2026-08-10 · 1회"))
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })
})
