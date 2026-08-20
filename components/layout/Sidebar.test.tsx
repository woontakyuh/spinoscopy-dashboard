// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Sidebar } from "./Sidebar"

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}))

describe("Sidebar", () => {
  it("keeps the desktop agent navigation pinned to the viewport", () => {
    // Given
    render(<Sidebar />)

    // When
    const desktopNavigation = screen.getByRole("complementary")

    // Then
    expect(desktopNavigation).toHaveClass(
      "fixed",
      "inset-y-0",
      "left-0",
      "h-dvh",
    )
  })

  it("keeps the mobile agent navigation above the device safe area", () => {
    // Given
    render(<Sidebar />)

    // When
    const mobileNavigation = screen.getAllByRole("navigation").at(-1)

    // Then
    expect(mobileNavigation).toHaveClass(
      "pb-[max(0.375rem,env(safe-area-inset-bottom))]",
    )
  })
})
