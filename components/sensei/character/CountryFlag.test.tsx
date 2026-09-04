// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { CountryFlag } from "./CountryFlag"

describe("CountryFlag", () => {
  it("한글 국가명도 국기로 그린다 — 서석현 카드가 깨졌던 원인", () => {
    render(<CountryFlag flag="대한민국" />)
    expect(screen.getByRole("img", { name: "South Korea flag" })).toBeInTheDocument()
  })

  it("모르는 나라는 글자를 그리지 않는다 — 24×16 상자에서 세로로 터진다", () => {
    const { container } = render(<CountryFlag flag="Atlantis" className="h-4 w-6" />)
    expect(container.textContent).toBe("")
    expect(container.querySelector(".h-4.w-6")).not.toBeNull()
  })
})
