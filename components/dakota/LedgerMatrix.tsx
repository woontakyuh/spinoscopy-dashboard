"use client"

import { useState } from "react"
import type { OperationItem } from "@/lib/notion/operations"
import { DOMAIN_CHART_COLOR, DOMAIN_LABEL, MATRIX_STATUS_LABEL, MATRIX_STATUS_ORDER } from "./operationLabels"

const NAME_CAP = 5

interface Cell {
  domain: string
  status: OperationItem["status"]
  ops: OperationItem[]
}

function buildCells(operations: OperationItem[]): { domains: string[]; rows: OperationItem["status"][]; cells: Map<string, Cell> } {
  const domainCounts = new Map<string, number>()
  for (const op of operations) domainCounts.set(op.domain, (domainCounts.get(op.domain) ?? 0) + 1)

  const domains = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([domain]) => domain)

  const archivedHasData = operations.some((op) => op.status === "Archived")
  const rows = MATRIX_STATUS_ORDER.filter((status) => status !== "Archived" || archivedHasData)

  const cells = new Map<string, Cell>()
  for (const domain of domains) {
    for (const status of rows) {
      cells.set(`${domain}:${status}`, { domain, status, ops: [] })
    }
  }
  for (const op of operations) {
    const cell = cells.get(`${op.domain}:${op.status}`)
    if (cell) cell.ops.push(op)
  }

  return { domains, rows, cells }
}

function MatrixCell({ cell, onSelect }: { cell: Cell; onSelect: (op: OperationItem) => void }) {
  const [expanded, setExpanded] = useState(false)
  if (cell.ops.length === 0) return <td className="border-l border-zinc-900 px-3 py-2 align-top text-zinc-700">–</td>

  const shown = expanded ? cell.ops : cell.ops.slice(0, NAME_CAP)
  const hidden = cell.ops.length - shown.length

  return (
    <td className="border-l border-zinc-900 px-3 py-2 align-top">
      <p className="tabular-nums text-zinc-300">{cell.ops.length}</p>
      <ul className="mt-1 space-y-0.5">
        {shown.map((op) => (
          <li key={op.page_id}>
            <button
              onClick={() => onSelect(op)}
              title={op.name}
              className="block max-w-[160px] truncate text-left text-[11px] text-zinc-500 hover:text-white hover:underline"
            >
              {op.name}
            </button>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button onClick={() => setExpanded(true)} className="mt-0.5 text-[11px] text-zinc-600 hover:text-zinc-300">
          +{hidden}
        </button>
      )}
      {expanded && cell.ops.length > NAME_CAP && (
        <button onClick={() => setExpanded(false)} className="mt-0.5 block text-[11px] text-zinc-600 hover:text-zinc-300">
          접기
        </button>
      )}
    </td>
  )
}

export function LedgerMatrix({ operations, onSelect }: { operations: OperationItem[]; onSelect: (op: OperationItem) => void }) {
  if (operations.length === 0) {
    return <p className="border border-zinc-800 px-4 py-8 text-center text-sm text-zinc-600">이 기간에 기록이 없습니다.</p>
  }

  const { domains, rows, cells } = buildCells(operations)

  return (
    <div className="overflow-x-auto border border-zinc-800">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-500">
            <th className="sticky left-0 z-10 whitespace-nowrap bg-zinc-950 px-3 py-2.5 text-left font-medium">상태</th>
            {domains.map((domain) => (
              <th key={domain} className="whitespace-nowrap border-l border-zinc-900 px-3 py-2.5 text-left font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 shrink-0" style={{ backgroundColor: DOMAIN_CHART_COLOR[domain] ?? DOMAIN_CHART_COLOR.Training }} />
                  {DOMAIN_LABEL[domain] ?? domain}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((status) => (
            <tr key={status} className="border-b border-zinc-900 last:border-0">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-zinc-950 px-3 py-2.5 font-medium text-zinc-300">
                {MATRIX_STATUS_LABEL[status]}
              </td>
              {domains.map((domain) => (
                <MatrixCell key={domain} cell={cells.get(`${domain}:${status}`)!} onSelect={onSelect} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
