import { describe, it, expect } from "vitest"
import { buildChartTokens, chartTooltipLabelStyle, chartTooltipStyle, CHART_TOKEN_VARS, FALLBACK_CHART_TOKENS } from "./useChartTokens"

describe("buildChartTokens", () => {
  it("maps each token to its CSS custom property and returns the resolved value", () => {
    const cssVars: Record<string, string> = {
      "--card": "oklch(0.99 0.005 85)",
      "--border": "oklch(0.91 0.006 85)",
      "--muted-foreground": "oklch(0.52 0.010 70)",
      "--popover": "oklch(0.99 0.005 85)",
      "--popover-foreground": "oklch(0.20 0.008 70)",
    }
    const readVar = (name: string) => cssVars[name] ?? ""

    const tokens = buildChartTokens(readVar, false)

    expect(tokens).toEqual({
      surface: "oklch(0.99 0.005 85)",
      grid: "oklch(0.91 0.006 85)",
      mutedText: "oklch(0.52 0.010 70)",
      tooltipBg: "oklch(0.99 0.005 85)",
      tooltipBorder: "oklch(0.91 0.006 85)",
      tooltipLabel: "oklch(0.20 0.008 70)",
      isDark: false,
    })
  })

  it("carries the isDark flag through untouched", () => {
    expect(buildChartTokens(() => "oklch(0 0 0)", true).isDark).toBe(true)
    expect(buildChartTokens(() => "oklch(0 0 0)", false).isDark).toBe(false)
  })

  it("falls back to a safe default when a custom property is missing or blank", () => {
    const tokens = buildChartTokens(() => "", true)
    expect(tokens.surface).toBe(FALLBACK_CHART_TOKENS.surface)
    expect(tokens.grid).toBe(FALLBACK_CHART_TOKENS.grid)
    expect(tokens.mutedText).toBe(FALLBACK_CHART_TOKENS.mutedText)
    expect(tokens.tooltipBg).toBe(FALLBACK_CHART_TOKENS.tooltipBg)
    expect(tokens.tooltipBorder).toBe(FALLBACK_CHART_TOKENS.tooltipBorder)
    expect(tokens.tooltipLabel).toBe(FALLBACK_CHART_TOKENS.tooltipLabel)
  })

  it("trims whitespace the way getComputedStyle().getPropertyValue() returns it", () => {
    const tokens = buildChartTokens(() => "  oklch(0.5 0.1 200)  ", true)
    expect(tokens.surface).toBe("oklch(0.5 0.1 200)")
  })

  it("every declared token (except isDark) has a CSS var mapping", () => {
    const keys = Object.keys(FALLBACK_CHART_TOKENS).filter((k) => k !== "isDark")
    for (const key of keys) {
      expect(CHART_TOKEN_VARS).toHaveProperty(key)
      expect(CHART_TOKEN_VARS[key as keyof typeof CHART_TOKEN_VARS]).toMatch(/^--/)
    }
  })
})

describe("chartTooltipStyle / chartTooltipLabelStyle", () => {
  it("builds a recharts-ready style object from resolved tokens", () => {
    const tokens = buildChartTokens(
      (name) =>
        ({ "--popover": "oklch(0.99 0.005 85)", "--border": "oklch(0.91 0.006 85)", "--popover-foreground": "oklch(0.20 0.008 70)" }[
          name
        ] ?? ""),
      false
    )

    expect(chartTooltipStyle(tokens)).toEqual({
      background: "oklch(0.99 0.005 85)",
      border: "1px solid oklch(0.91 0.006 85)",
      borderRadius: 4,
      fontSize: 12,
    })
    expect(chartTooltipLabelStyle(tokens)).toEqual({ color: "oklch(0.20 0.008 70)", marginBottom: 4 })
  })
})
