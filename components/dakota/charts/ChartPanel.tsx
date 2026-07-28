"use client"

import type { ReactNode } from "react"

export function ChartPanel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="border border-zinc-800 bg-zinc-950 p-4">
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>}
      </header>
      {children}
    </section>
  )
}

/** 데이터가 너무 적어 차트로는 오해를 부를 때 쓰는 평문 대체. */
export function ChartEmpty({ message }: { message: string }) {
  return <p className="flex h-40 items-center justify-center px-4 text-center text-xs text-zinc-600">{message}</p>
}

export const CHART_SURFACE = "#09090b"
export const CHART_GRID = "#27272a"
export const CHART_MUTED_TEXT = "#71717a"
export const CHART_TOOLTIP_STYLE = { background: "#18181b", border: "1px solid #27272a", borderRadius: 4, fontSize: 12 }
export const CHART_TOOLTIP_LABEL_STYLE = { color: "#e4e4e7", marginBottom: 4 }
