// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SenseiCompetition } from "@/components/sensei/SenseiCompetition"

describe("SenseiCompetition", () => {
  beforeEach(() => {
    const storage = new Map<string, string>()
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
    })
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-17T09:00:00+09:00"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("opens a verified event with its registration source", () => {
    render(<SenseiCompetition />)

    const eventChip = screen.getByText("FANTASIA X COS")
    fireEvent.click(eventChip.closest("button")!)

    const sourceLink = screen
      .getAllByRole("link", { name: "공식·등록 페이지 ↗" })
      .find((link) => link.getAttribute("href") === "https://www.flowcomp.co.kr/championship/67")

    expect(sourceLink).toBeVisible()
    expect(screen.getByText("국내 · 일반 접수 8월 14일 마감")).toBeVisible()
  })
})
