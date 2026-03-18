"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

async function fetchActiveTodos(): Promise<TodoItem[]> {
  const res = await fetch("/api/jarvis/todo?status=active")
  if (!res.ok) throw new Error("할 일 로딩 실패")
  return res.json()
}

async function fetchDoneTodos(fromDate?: string): Promise<TodoItem[]> {
  const params = new URLSearchParams({ status: "Done" })
  if (fromDate) params.set("from_date", fromDate)
  const res = await fetch(`/api/jarvis/todo?${params}`)
  if (!res.ok) throw new Error("히스토리 로딩 실패")
  return res.json()
}

async function patchTodo(payload: { page_id: string; status?: string; priority?: string; category?: string }): Promise<void> {
  const res = await fetch("/api/jarvis/todo", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const data = await res.json() as { error?: string }
    throw new Error(data.error ?? "업데이트 실패")
  }
}

const PRIORITIES = ["High", "Medium", "Low"] as const
const CATEGORIES = ["일상업무", "가족", "학회", "연구", "임상", "AI"] as const

const PERIOD_LABELS: Record<Period, string> = {
  week: "이번 주",
  month: "이번 달",
  all: "전체",
}

export function TodoHistory() {
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState<Period>("month")
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const fromDate = getFromDate(period)

  // 할 일 (active)
  const { data: activeTodos, isLoading: activeLoading } = useQuery({
    queryKey: ["jarvis-todos"],
    queryFn: fetchActiveTodos,
    refetchInterval: 60000,
  })

  // 한 일 (done)
  const { data: doneTodos, isLoading: doneLoading } = useQuery({
    queryKey: ["jarvis-todo-history", period],
    queryFn: () => fetchDoneTodos(fromDate),
  })

  const completeMutation = useMutation({
    mutationFn: (pageId: string) => {
      setCompletedIds((prev) => new Set(prev).add(pageId))
      return patchTodo({ page_id: pageId, status: "Done" })
    },
    onSuccess: async (_data, pageId) => {
      await new Promise((r) => setTimeout(r, 600))
      setCompletedIds((prev) => {
        const next = new Set(prev)
        next.delete(pageId)
        return next
      })
      await queryClient.invalidateQueries({ queryKey: ["jarvis-todos"] })
      await queryClient.invalidateQueries({ queryKey: ["jarvis-todo-history"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard-todo-active"] })
    },
    onError: (_err, pageId) => {
      setCompletedIds((prev) => {
        const next = new Set(prev)
        next.delete(pageId)
        return next
      })
    },
  })

  const priorityMutation = useMutation({
    mutationFn: ({ pageId, priority }: { pageId: string; priority: string }) =>
      patchTodo({ page_id: pageId, priority }),
    onMutate: async ({ pageId, priority }) => {
      await queryClient.cancelQueries({ queryKey: ["jarvis-todos"] })
      const previous = queryClient.getQueryData<TodoItem[]>(["jarvis-todos"])
      queryClient.setQueryData<TodoItem[]>(["jarvis-todos"], (old) =>
        (old ?? []).map((t) => (t.page_id === pageId ? { ...t, priority } : t))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["jarvis-todos"], context.previous)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["jarvis-todos"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard-todo-active"] })
    },
  })

  const categoryMutation = useMutation({
    mutationFn: ({ pageId, category }: { pageId: string; category: string }) =>
      patchTodo({ page_id: pageId, category }),
    onMutate: async ({ pageId, category }) => {
      await queryClient.cancelQueries({ queryKey: ["jarvis-todos"] })
      const previous = queryClient.getQueryData<TodoItem[]>(["jarvis-todos"])
      queryClient.setQueryData<TodoItem[]>(["jarvis-todos"], (old) =>
        (old ?? []).map((t) => (t.page_id === pageId ? { ...t, category } : t))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["jarvis-todos"], context.previous)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["jarvis-todos"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard-todo-active"] })
    },
  })

  const isLoading = activeLoading || doneLoading

  return (
    <div className="space-y-4">
      {/* 완료율 + 주간 트렌드 */}
      <TodoStatsCards activeTodos={activeTodos ?? []} doneTodos={doneTodos ?? []} />

      {/* 할 일 / 한 일 나란히 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

      {/* ── 할 일 (Active) ── */}
      <section className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
          할 일
        </h3>
        {activeLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-11 bg-zinc-800" />
            <Skeleton className="h-11 bg-zinc-800" />
          </div>
        ) : (activeTodos ?? []).length === 0 ? (
          <p className="text-zinc-500 text-sm">진행 중인 할 일이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {(activeTodos ?? []).map((todo) => {
              const isDone = completedIds.has(todo.page_id)
              return (
                <div
                  key={todo.page_id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all duration-500 ${
                    isDone
                      ? "border-green-700/50 bg-green-900/20 opacity-60"
                      : "border-zinc-700 bg-zinc-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-green-500 shrink-0"
                    checked={isDone}
                    onChange={() => { if (!isDone) completeMutation.mutate(todo.page_id) }}
                    disabled={isDone}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${isDone ? "line-through text-zinc-500" : "text-zinc-100"}`}>
                      {todo.name}
                    </p>
                  </div>
                  {!isDone && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button>
                            <Badge variant="outline" className={`${priorityBadgeClass(todo.priority)} cursor-pointer hover:opacity-80`}>
                              {todo.priority}
                            </Badge>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-zinc-800 border-zinc-700">
                          {PRIORITIES.map((p) => (
                            <DropdownMenuItem
                              key={p}
                              onClick={() => priorityMutation.mutate({ pageId: todo.page_id, priority: p })}
                              className="text-zinc-100 focus:bg-zinc-700"
                            >
                              <Badge variant="outline" className={priorityBadgeClass(p)}>{p}</Badge>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button>
                            <Badge variant="outline" className={`${categoryBadgeClass(todo.category)} cursor-pointer hover:opacity-80`}>
                              {todo.category}
                            </Badge>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-zinc-800 border-zinc-700">
                          {CATEGORIES.map((c) => (
                            <DropdownMenuItem
                              key={c}
                              onClick={() => categoryMutation.mutate({ pageId: todo.page_id, category: c })}
                              className="text-zinc-100 focus:bg-zinc-700"
                            >
                              <Badge variant="outline" className={categoryBadgeClass(c)}>{c}</Badge>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {todo.due && (
                        <span className="text-xs text-zinc-500">{todo.due.slice(5)}</span>
                      )}
                    </div>
                  )}
                  {isDone && <span className="text-xs text-green-400">완료</span>}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── 한 일 (Done) ── */}
      <section className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
            한 일
          </h3>
          <div className="flex gap-1">
            {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`px-2 py-0.5 text-xs rounded ${
                  period === key
                    ? "bg-zinc-700 text-zinc-100"
                    : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {doneLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-11 bg-zinc-800" />
            <Skeleton className="h-11 bg-zinc-800" />
          </div>
        ) : (doneTodos ?? []).length === 0 ? (
          <p className="text-zinc-500 text-sm">완료된 할일이 없습니다.</p>
        ) : (
          <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
            {(doneTodos ?? []).map((todo) => (
              <div key={todo.page_id} className="flex items-center gap-2 rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-300 truncate">{todo.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-zinc-500">{todo.completed_at ?? todo.created_at}</span>
                    <span className="text-xs text-zinc-600">{calcDuration(todo.created_at, todo.completed_at)}</span>
                  </div>
                </div>
                <Badge variant="outline" className={`${priorityBadgeClass(todo.priority)} text-[10px] px-1.5`}>
                  {todo.priority}
                </Badge>
                <Badge variant="outline" className={`${categoryBadgeClass(todo.category)} text-[10px] px-1.5`}>
                  {todo.category}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      </div>
    </div>
  )
}
