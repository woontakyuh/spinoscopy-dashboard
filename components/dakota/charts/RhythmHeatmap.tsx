"use client"

import { RHYTHM_BANDS, RHYTHM_WEEKDAY_LABELS, type RhythmCell } from "@/lib/dakota-ledger/stats"
import { ChartEmpty, ChartPanel } from "./ChartPanel"

// 순차(sequential) 램프: blue, light -> dark (dataviz 스킬 100~700 스텝 중 일부).
const SEQUENTIAL_STEPS = ["#18181b", "#0d366b", "#104281", "#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5"]

function stepFor(count: number, max: number): string {
  if (count === 0 || max === 0) return SEQUENTIAL_STEPS[0]
  const ratio = count / max
  const index = Math.min(SEQUENTIAL_STEPS.length - 1, 1 + Math.floor(ratio * (SEQUENTIAL_STEPS.length - 2)))
  return SEQUENTIAL_STEPS[index]
}

export function RhythmHeatmap({ cells }: { cells: RhythmCell[] }) {
  const total = cells.reduce((sum, c) => sum + c.count, 0)
  const max = cells.reduce((m, c) => Math.max(m, c.count), 0)

  return (
    <ChartPanel title="리듬" subtitle="요일 x 시간대 세션 밀도">
      {total === 0 ? (
        <ChartEmpty message="이 기간에 표시할 세션이 없습니다." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="w-8 text-left text-zinc-600" />
                {RHYTHM_BANDS.map((band) => (
                  <th key={band} className="px-1 pb-1.5 text-center font-medium text-zinc-500">
                    {band}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RHYTHM_WEEKDAY_LABELS.map((weekday) => (
                <tr key={weekday}>
                  <td className="pr-1.5 text-zinc-500">{weekday}</td>
                  {RHYTHM_BANDS.map((band) => {
                    const cell = cells.find((c) => c.weekdayLabel === weekday && c.band === band)
                    const count = cell?.count ?? 0
                    return (
                      <td key={band} className="p-0.5">
                        <div
                          title={`${weekday} ${band}: ${count}건`}
                          className="flex h-9 items-center justify-center text-[10px] tabular-nums"
                          style={{ backgroundColor: stepFor(count, max), color: count > 0 ? "#fff" : "#52525b" }}
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
