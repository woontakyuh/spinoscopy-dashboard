// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import WarrenPage from "./page"

vi.mock("@/components/layout/TopBar", () => ({
  TopBar: () => <header>Warren</header>,
}))

vi.mock("@/components/layout/AgentChat", () => ({
  AgentChat: () => <div data-testid="agent-chat" />,
}))

vi.mock("@/components/vault/VaultDashboard", () => ({
  VaultDashboard: () => <div data-testid="vault-dashboard" />,
}))

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <WarrenPage />
    </QueryClientProvider>,
  )
}

describe("Warren desktop layout", () => {
  it("uses the full available content width on ultrawide screens", () => {
    // Given / When
    renderPage()
    const content = screen.getByTestId("agent-chat").parentElement

    // Then
    expect(content).not.toBeNull()
    expect(content).toHaveClass("w-full")
    expect(content?.className).not.toContain("max-w-")
  })
})
