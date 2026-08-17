// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ClientLayout } from "./ClientLayout"

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}))

vi.mock("./Sidebar", () => ({
  Sidebar: () => <aside />,
}))

describe("ClientLayout", () => {
  it("reserves mobile content space for the fixed agent navigation", () => {
    // Given
    render(<ClientLayout>Dashboard content</ClientLayout>)

    // When
    const main = screen.getByRole("main")

    // Then
    expect(main).toHaveClass(
      "pb-[calc(4rem+env(safe-area-inset-bottom))]",
      "md:pb-0",
    )
  })

  it("offsets desktop content from the fixed agent navigation", () => {
    // Given
    render(<ClientLayout>Dashboard content</ClientLayout>)

    // When
    const main = screen.getByRole("main")

    // Then
    expect(main).toHaveClass("md:ml-16")
  })
})
