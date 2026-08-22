// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { useQuery } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AssetDailyChart } from "./AssetDailyChart"

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({
    data: undefined,
    isLoading: true,
    isError: false,
  })),
}))

describe("AssetDailyChart default period", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockClear()
  })

  it("requests six months when no period override is provided", () => {
    // Given / When
    render(<AssetDailyChart symbol="BTC" title="Bitcoin" />)

    // Then
    expect(vi.mocked(useQuery).mock.calls[0]?.[0].queryKey).toEqual([
      "vault-asset-chart",
      "BTC",
      "6M",
      "1d",
    ])
  })
})
