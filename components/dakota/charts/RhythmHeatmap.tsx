"use client"

import { RHYTHM_BANDS, RHYTHM_WEEKDAY_LABELS, type RhythmCell } from "@/lib/dakota-ledger/stats"
import { ChartEmpty, ChartPanel } from "./ChartPanel"
import { useChartTokens } from "./useChartTokens"

// 순차(sequential) 램프: 단일 blue hue, 값이 커질수록 표면 대비가 커지도록 설계했다
// (dataviz 스킬 validate_palette.js --ordinal 통과: monotone L, 인접 스텝 ΔL >= 0.06,
// 옅은 끝도 표면 대비 >= 2:1). 다크/라이트 표면이 서로 반대로 밝기 때문에 두 램프의
// 방향이 다르다 — 다크 표면에서는 값이 클수록 밝아지고(튀어 보이고), 라이트 표면에서는
// 값이 클수록 어두워진다(짙어 보인다). 0건은 램프에 넣지 않고 카드 배경색 그대로 둔다.
// text는 각 배경 스텝에 대해 WCAG 대비가 더 큰 쪽(흰색/짙은 네이비)을 골라 미리 짝지었다.
const DARK_SEQUENTIAL_STEPS: { bg: string; text: string }[] = [
  { bg: "#0a56a6", text: "#ffffff" },
  { bg: "#206abe", text: "#ffffff" },
  { bg: "#337dd7", text: "#07162b" },
  { bg: "#4491f0", text: "#07162b" },
  { bg: "#5ca6ff", text: "#07162b" },
  { bg: "#79bcff", text: "#07162b" },
  { bg: "#a1d1ff", text: "#07162b" },
]
const LIGHT_SEQUENTIAL_STEPS: { bg: string; text: string }[] = [
  { bg: "#7eb4f9", text: "#07162b" },
  { bg: "#659fe9", text: "#07162b" },
  { bg: "#4c8bd9", text: "#07162b" },
  { bg: "#3378ca", text: "#ffffff" },
  { bg: "#1762b6", text: "#ffffff" },
  { bg: "#004fa1", text: "#ffffff" },
  { bg: "#003c87", text: "#ffffff" },
]

function stepFor(count: number, max: number, isDark: boolean): { bg: string; text: string } | null {
  if (count === 0 || max === 0) return null
  const steps = isDark ? DARK_SEQUENTIAL_STEPS : LIGHT_SEQUENTIAL_STEPS
  const ratio = count / max
  const index = Math.min(steps.length - 1, Math.floor(ratio * (steps.length - 1)))
  return steps[index]
}

export function RhythmHeatmap({ cells }: { cells: RhythmCell[] }) {
  const total = cells.reduce((sum, c) => sum + c.count, 0)
  const max = cells.reduce((m, c) => Math.max(m, c.count), 0)
  const tokens = useChartTokens()

  return (
    <ChartPanel title="리듬" subtitle="요일 x 시간대 세션 밀도">
      {total === 0 ? (
        <ChartEmpty message="이 기간에 표시할 세션이 없습니다." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="w-8 text-left text-muted-foreground" />
                {RHYTHM_BANDS.map((band) => (
                  <th key={band} className="px-1 pb-1.5 text-center font-medium text-muted-foreground">
                    {band}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RHYTHM_WEEKDAY_LABELS.map((weekday) => (
                <tr key={weekday}>
                  <td className="pr-1.5 text-muted-foreground">{weekday}</td>
                  {RHYTHM_BANDS.map((band) => {
                    const cell = cells.find((c) => c.weekdayLabel === weekday && c.band === band)
                    const count = cell?.count ?? 0
                    const step = stepFor(count, max, tokens.isDark)
                    return (
                      <td key={band} className="p-0.5">
                        <div
                          title={`${weekday} ${band}: ${count}건`}
                          className="flex h-9 items-center justify-center text-[10px] tabular-nums"
                          style={{ backgroundColor: step?.bg ?? tokens.surface, color: step?.text ?? "var(--muted-foreground)" }}
                        >
                          {count > 0 ? count : ""}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartPanel>
  )
}
