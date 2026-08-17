// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SenseiCalendar } from "@/components/sensei/SenseiCalendar"
import type { SenseiEntry } from "@/lib/types/sensei"

const entries: SenseiEntry[] = [
  {
    id: "class-entry",
    title: "하프가드 수업",
    sessionType: "class",
    date: "2026-08-12",
    instructor: "조준용",
    gym: "DT Wire",
    classTags: ["하프가드"],
    sparringTags: [],
    studyTags: [],
    note: "",
    url: "",
  },
  {
    id: "sparring-entry",
    title: "하프가드 스파링",
    sessionType: "openmat",
    date: "2026-08-13",
    instructor: "",
    gym: "DT Wire",
    classTags: [],
    sparringTags: ["언더훅", "NoGi"],
    studyTags: [],
    note: "",
    url: "",
  },
  {
    id: "study-entry",
    title: "프레임 공부",
    sessionType: "study",
    date: "2026-08-12",
    instructor: "",
    gym: "",
    classTags: [],
    sparringTags: [],
    studyTags: ["프레임"],
    note: "",
    url: "",
  },
]

describe("SenseiCalendar", () => {
  it("shows class, sparring, and study keywords inside the training day", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-17T09:00:00+09:00"))
    const onDateSelect = vi.fn()

    render(
      <SenseiCalendar
        entries={entries}
        selectedDate={null}
        onDateSelect={onDateSelect}
        activeFilter={null}
        onFilterChange={vi.fn()}
      />,
    )

    const classKeyword = screen.getByText("하프가드")
    expect(classKeyword).toBeVisible()
    expect(classKeyword.parentElement?.className).not.toContain("hidden")
    expect(screen.getByText("언더훅")).toBeVisible()
    expect(screen.getByText("프레임")).toBeVisible()
    expect(screen.getByRole("button", { name: /8월 12일/ })).toHaveTextContent("Gi")
    expect(screen.getByRole("button", { name: /8월 13일/ })).toHaveTextContent("No-Gi")

    fireEvent.click(screen.getByRole("button", { name: /8월 12일/ }))
    expect(onDateSelect).toHaveBeenCalledWith("2026-08-12")

    vi.useRealTimers()
  })
})
