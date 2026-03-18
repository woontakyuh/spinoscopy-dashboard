// components/jarvis/TodoHistory.tsx
"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { TodoStatsCards } from "./TodoStatsCards"
import type { TodoItem } from "@/lib/notion/todo"

type Period = "week" | "month" | "all"

function getFromDate(period: Period): string | undefined {
  if (period === "all") return undefined
  const now = new Date()
  if (period === "week") {
    now.setDate(now.getDate() - 7)
  } else {
    now.setMonth(now.getMonth() - 1)
  }
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

function priorityBadgeClass(priority: string): string {
  if (priority === "High") return "border-red-400/50 text-red-300"
  if (priority === "Medium") return "border-yellow-400/50 text-yellow-300"
  return "border-zinc-600 text-zinc-300"
}

function categoryBadgeClass(category: string): string {
  switch (category) {
    case "가족": return "border-green-400/50 text-green-300"
    case "학회": return "border-purple-400/50 text-purple-300"
    case "연구": return "border-blue-400/50 text-blue-300"
    case "임상": return "border-orange-400/50 text-orange-300"
    case "AI": return "border-cyan-400/50 text-cyan-300"
    default: return "border-zinc-600 text-zinc-400"
  }
}

function calcDuration(createdAt: string, completedAt: string | null): string {
  if (!completedAt) return "-"
  const created = new Date(createdAt)
  const completed = new Date(completedAt)
  const days = Math.max(0, Math.round((completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)))
  if (days === 0) return "당일"
  return `${days}일`
}

async function fetchDoneTodos(fromDate?: string): Promise<TodoItem[]> {
  const params = new URLSearchParams({ status: "Done" })
  if (fromDate) params.set("from_date", fromDate)
  const res = await fetch(`/api/jarvis/todo?${params}`)
  if (!res.ok) throw new Error("히스토리 로딩 실패")
  return res.json()
}

const PERIOD_LABELS: Record<Period, string> = {
  week: "이번 주",
  month: "이번 달",
  all: "전체",
}

export function TodoHistory() {
  const [period, setPeriod] = useState<Period>("month")
  const fromDate = getFromDate(period)

  const { data: todos, isLoading, error } = useQuery({
    queryKey: ["jarvis-todo-history", period],
    queryFn: () => fetchDoneTodos(fromDate),
  })

  return (
    <div className="space-y-4">
      {/* 기간 필터 */}
      <div className="flex gap-1">
        {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`px-3 py-1 text-sm rounded ${
              period === key
                ? "bg-zinc-700 text-zinc-100"
                : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-16 bg-zinc-800" />
            <Skeleton className="h-16 bg-zinc-800" />
            <Skeleton className="h-16 bg-zinc-800" />
          </div>
          <Skeleton className="h-40 bg-zinc-800" />
        </div>
      ) : error ? (
        <p className="text-red-400 text-sm">히스토리를 불러오지 못했습니다.</p>
      ) : (todos ?? []).length === 0 ? (
        <p className="text-zinc-500 text-sm">완료된 할일이 없습니다.</p>
      ) : (
        <>
          {/* 통계 카드 */}
          <TodoStatsCards todos={todos!} />

          {/* 테이블 */}
          <div className="rounded-lg border border-zinc-700 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-700 hover:bg-transparent">
                  <TableHead className="text-zinc-400">할일</TableHead>
                  <TableHead className="text-zinc-400">카테고리</TableHead>
                  <TableHead className="text-zinc-400">우선순위</TableHead>
                  <TableHead className="text-zinc-400">입력일</TableHead>
                  <TableHead className="text-zinc-400">완료일</TableHead>
                  <TableHead className="text-zinc-400">소요</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(todos ?? []).map((todo) => (
                  <TableRow key={todo.page_id} className="border-zinc-700">
                    <TableCell className="text-zinc-100 max-w-[200px] truncate">{todo.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={categoryBadgeClass(todo.category)}>
                        {todo.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={priorityBadgeClass(todo.priority)}>
                        {todo.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-400 text-sm">{todo.created_at}</TableCell>
                    <TableCell className="text-zinc-400 text-sm">{todo.completed_at ?? "-"}</TableCell>
                    <TableCell className="text-zinc-400 text-sm">{calcDuration(todo.created_at, todo.completed_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
