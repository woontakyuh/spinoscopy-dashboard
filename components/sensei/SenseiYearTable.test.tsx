// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SenseiYearTable } from "@/components/sensei/SenseiYearTable"
import type { SenseiEntry } from "@/lib/types/sensei"

function entry(over: Partial<SenseiEntry> & { id: string; date: string }): SenseiEntry {
  return {
    title: "제목",
    sessionType: "class",
    instructor: "",
    gym: "",
    note: "",
    classTags: [],
    sparringTags: [],
    studyTags: [],
    focusApplied: false,
    url: "",
    ...over,
  } as SenseiEntry
}

const ENTRIES: SenseiEntry[] = [
  entry({ id: "1", date: "2026-09-17", title: "하프 탑 블록", classTags: ["HG"],
          videoUrl: "https://dropbox.test/reel", videoTitle: "수업 정리 릴 · 하프" }),
  entry({ id: "2", date: "2026-09-16", title: "크로스페이스" }),
  entry({ id: "3", date: "2026-02-06", title: "딥하프 본편" }),
  entry({ id: "4", date: "2025-01-13", title: "작년 수업" }),
]

describe("SenseiYearTable", () => {
  it("해당 연도의 기록만 표로 보여준다", () => {
    render(<SenseiYearTable entries={ENTRIES} selectedDate={null} onDateSelect={vi.fn()} />)

    expect(screen.getByText("2026년")).toBeInTheDocument()
    expect(screen.getByText("3일 기록")).toBeInTheDocument()
    expect(screen.getByText("하프 탑 블록")).toBeInTheDocument()
    expect(screen.getByText("딥하프 본편")).toBeInTheDocument()
    expect(screen.queryByText("작년 수업")).not.toBeInTheDocument()
  })

  it("릴이 있는 날에만 영상 링크를 건다", () => {
    render(<SenseiYearTable entries={ENTRIES} selectedDate={null} onDateSelect={vi.fn()} />)

    const links = screen.getAllByLabelText("수업 정리 영상 열기")
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute("href", "https://dropbox.test/reel")
  })

  it("행을 누르면 그 날짜를 선택한다", () => {
    const onDateSelect = vi.fn()
    render(<SenseiYearTable entries={ENTRIES} selectedDate={null} onDateSelect={onDateSelect} />)

    fireEvent.click(screen.getByText("딥하프 본편"))
    expect(onDateSelect).toHaveBeenCalledWith("2026-02-06")
  })

  it("연도를 이동하면 그 해 기록으로 바뀐다", () => {
    render(<SenseiYearTable entries={ENTRIES} selectedDate={null} onDateSelect={vi.fn()} />)

    fireEvent.click(screen.getByLabelText("이전 해"))
    expect(screen.getByText("2025년")).toBeInTheDocument()
    expect(screen.getByText("작년 수업")).toBeInTheDocument()
    expect(screen.queryByText("하프 탑 블록")).not.toBeInTheDocument()
  })
})
