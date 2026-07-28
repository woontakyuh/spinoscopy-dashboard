"use client"

import { useEffect, useState, type CSSProperties } from "react"

/**
 * recharts에 넘길 실제 색상 값들. app/globals.css의 디자인 토큰(--card, --border, ...)을
 * 런타임에 계산된 값(concrete color, 예: "oklch(0.99 0.005 85)")으로 해석한 결과다.
 *
 * recharts는 stroke/fill/tick.fill 같은 값을 SVG presentation attribute로 그대로 꽂는다.
 * "var(--card)" 같은 문자열은 그 자리에서 해석되지 않으므로 var()가 아니라 반드시
 * getComputedStyle로 얻은 구체 색상 문자열을 넘겨야 한다.
 */
export interface ChartTokens {
  /** 패널/차트 배경과 동일한 색 — 파이 조각 stroke처럼 배경과 맞물려야 하는 자리에 쓴다. */
  surface: string
  /** 그리드 라인, 축 색상. */
  grid: string
  /** 축 눈금, 보조 텍스트 색상. */
  mutedText: string
  /** 툴팁 배경. */
  tooltipBg: string
  /** 툴팁 테두리. */
  tooltipBorder: string
  /** 툴팁 라벨(제목) 텍스트 색상. */
  tooltipLabel: string
  /** 현재 .dark 클래스가 적용되어 있는지. 다크 전용 시퀀셜 램프 등을 고를 때 쓴다. */
  isDark: boolean
}

/** 각 토큰이 읽어올 CSS 커스텀 프로퍼티 이름. app/globals.css의 :root / .dark 선언과 짝을 이룬다. */
export const CHART_TOKEN_VARS: Record<Exclude<keyof ChartTokens, "isDark">, string> = {
  surface: "--card",
  grid: "--border",
  mutedText: "--muted-foreground",
  tooltipBg: "--popover",
  tooltipBorder: "--border",
  tooltipLabel: "--popover-foreground",
}

/**
 * 마운트 전(SSR)이나 컨텍스트가 없을 때 쓰는 안전한 기본값.
 * ThemeToggle의 기본 테마가 dark이므로("stored || 'dark'") 다크 값으로 맞춰 두면
 * 하이드레이션 직후 실제 값으로 교체될 때 깜빡임이 최소화된다.
 */
export const FALLBACK_CHART_TOKENS: ChartTokens = {
  surface: "#282623",
  grid: "#3f3f3f",
  mutedText: "#9c9792",
  tooltipBg: "#282623",
  tooltipBorder: "#3f3f3f",
  tooltipLabel: "#f8f5ef",
  isDark: true,
}

/**
 * 순수 함수: "토큰 이름 -> CSS 커스텀 프로퍼티" 매핑을 실제 값으로 바꾼다.
 * DOM에 의존하지 않도록 값을 읽는 함수(readVar)를 주입받는다 — 유닛 테스트는
 * 이 함수만 가짜 readVar로 검증하면 되고, DOM(getComputedStyle)은 필요 없다.
 */
export function buildChartTokens(readVar: (cssVarName: string) => string, isDark: boolean): ChartTokens {
  const read = (name: string, fallback: string): string => {
    const value = readVar(name).trim()
    return value.length > 0 ? value : fallback
  }

  return {
    surface: read(CHART_TOKEN_VARS.surface, FALLBACK_CHART_TOKENS.surface),
    grid: read(CHART_TOKEN_VARS.grid, FALLBACK_CHART_TOKENS.grid),
    mutedText: read(CHART_TOKEN_VARS.mutedText, FALLBACK_CHART_TOKENS.mutedText),
    tooltipBg: read(CHART_TOKEN_VARS.tooltipBg, FALLBACK_CHART_TOKENS.tooltipBg),
    tooltipBorder: read(CHART_TOKEN_VARS.tooltipBorder, FALLBACK_CHART_TOKENS.tooltipBorder),
    tooltipLabel: read(CHART_TOKEN_VARS.tooltipLabel, FALLBACK_CHART_TOKENS.tooltipLabel),
    isDark,
  }
}

/** recharts <Tooltip>에 그대로 펼쳐 넣을 수 있는 스타일 프리셋. */
export function chartTooltipStyle(tokens: ChartTokens): CSSProperties {
  return {
    background: tokens.tooltipBg,
    border: `1px solid ${tokens.tooltipBorder}`,
    borderRadius: 4,
    fontSize: 12,
  }
}

export function chartTooltipLabelStyle(tokens: ChartTokens): CSSProperties {
  return { color: tokens.tooltipLabel, marginBottom: 4 }
}

/**
 * 라이트/다크 전환에 반응하는 차트 색상 토큰 훅.
 * <html> 요소의 class 속성을 MutationObserver로 지켜보다가 .dark 토글이 일어나면
 * (ThemeToggle이 document.documentElement.classList.toggle("dark", ...)로 전환한다)
 * 다시 계산해 리렌더를 유도한다 — 새로고침 없이 차트 색이 즉시 바뀐다.
 */
export function useChartTokens(): ChartTokens {
  const [tokens, setTokens] = useState<ChartTokens>(FALLBACK_CHART_TOKENS)

  useEffect(() => {
    const root = document.documentElement

    function resolve() {
      const computed = getComputedStyle(root)
      const isDark = root.classList.contains("dark")
      setTokens(buildChartTokens((name) => computed.getPropertyValue(name), isDark))
    }

    resolve()

    const observer = new MutationObserver(resolve)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  return tokens
}
