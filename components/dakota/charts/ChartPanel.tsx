"use client"

import type { ReactNode } from "react"

export function ChartPanel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="border border-border bg-card p-4">
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
      </header>
      {children}
    </section>
  )
}

/** 데이터가 너무 적어 차트로는 오해를 부를 때 쓰는 평문 대체. */
export function ChartEmpty({ message }: { message: string }) {
  return <p className="flex h-40 items-center justify-center px-4 text-center text-xs text-muted-foreground/70">{message}</p>
}
