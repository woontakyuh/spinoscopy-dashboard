// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SenseiEntry } from "@/lib/types/sensei"
import { TrainingView } from "@/components/lo/TrainingView"

const entries: SenseiEntry[] = [
  {
    id: "training-1",
    title: "하프가드 수업",
    sessionType: "class",
    date: "2026-08-12",
    instructor: "조준용",
    gym: "DT Wire",
    classTags: ["하프가드", "언더훅"],
    sparringTags: [],
    studyTags: [],
    todayFocus: "하프가드 언더훅",
    focusApplied: true,
    note: "",
    url: "",
  },
  {
    id: "training-study",
    title: "하프가드 프레임 공부",
    sessionType: "study",
    date: "2026-08-12",
    instructor: "",
    gym: "",
    classTags: [],
    sparringTags: [],
    studyTags: ["프레임", "니쉴드"],
    videoTitle: "Half Guard Frames",
    todayFocus: "프레임 먼저 세우기",
    note: "유튜브 영상을 보고 프레임 순서를 정리함",
    url: "",
  },
  {
    id: "training-2",
    title: "오픈매트",
    sessionType: "openmat",
    date: "2026-08-05",
    instructor: "",
    gym: "DT Wire",
    classTags: [],
    sparringTags: ["하프가드", "NoGi"],
    studyTags: [],
    note: "",
    url: "",
  },
]

describe("TrainingView", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-17T09:00:00+09:00"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("makes the calendar the primary surface and keeps summaries secondary", () => {
    render(<TrainingView entries={entries} />)

    expect(screen.getByRole("heading", { name: "훈련 캘린더" })).toBeVisible()
    expect(screen.getByText(/훈련 기록/)).toBeVisible()
    expect(screen.queryByText("새 훈련 기록")).not.toBeInTheDocument()
    expect(screen.getByText("이번 달 3회")).toBeVisible()
  })

  it("shows class, sparring, and study details for the selected date", () => {
    render(<TrainingView entries={entries} />)

    fireEvent.click(screen.getByRole("button", { name: /8월 12일/ }))

    expect(screen.getByRole("heading", { name: "8월 12일 상세" })).toBeVisible()
    expect(screen.getByText("하프가드 수업")).toBeVisible()
    expect(screen.getByText("언더훅")).toBeVisible()
    expect(screen.getByText("하프가드 프레임 공부")).toBeVisible()
    expect(screen.getByText("프레임")).toBeVisible()
    expect(screen.getByText("유튜브 영상을 보고 프레임 순서를 정리함")).toBeVisible()
  })

  it("shows Gi and No-Gi for physical training records", () => {
    render(<TrainingView entries={entries} />)

    expect(screen.getAllByText("Gi").length).toBeGreaterThan(0)
    expect(screen.getAllByText("No-Gi").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: /8월 5일/ }))
    expect(screen.getByRole("heading", { name: "8월 5일 상세" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "오픈매트" })).toBeVisible()
    expect(screen.getAllByText("No-Gi").length).toBeGreaterThan(0)
  })

  it("isolates one category when its top filter is toggled", () => {
    render(<TrainingView entries={entries} />)

    const sparringFilter = screen.getByRole("button", { name: "스파링 필터" })
    expect(sparringFilter).toHaveAttribute("aria-pressed", "false")

    fireEvent.click(sparringFilter)

    expect(sparringFilter).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("heading", { name: "8월 5일 상세" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "오픈매트" })).toBeVisible()
    expect(screen.queryByText("하프가드 수업")).not.toBeInTheDocument()
    expect(screen.queryByText("하프가드 프레임 공부")).not.toBeInTheDocument()

    fireEvent.click(sparringFilter)

    expect(sparringFilter).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("heading", { name: "8월 12일 상세" })).toBeVisible()
  })
})
