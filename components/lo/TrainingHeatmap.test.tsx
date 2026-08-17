// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TrainingHeatmap } from "@/components/lo/TrainingHeatmap"
import type { SenseiEntry } from "@/lib/types/sensei"

const TODAY = "2026-08-17"

function trainingEntry(id: string): SenseiEntry {
  return {
    id,
    title: "하프가드 수업",
    sessionType: "class",
    date: TODAY,
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
      name: "훈련 활동 달력, 최근 6개월 1일 2회",
    })
    expect(heatmap).toHaveTextContent("최근 6개월")
    expect(screen.getByTitle(`${TODAY} · 2회`)).toBeVisible()

    fireEvent.click(heatmap)
    expect(onOpenTraining).toHaveBeenCalledOnce()
  })
})
