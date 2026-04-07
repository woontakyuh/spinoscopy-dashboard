"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"

interface TodoItem {
  page_id: string
  name: string
  due: string | null
  status: string
  priority: string
  category: string
  notes: string
  url: string
}

function todayInSeoul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

async function fetchActiveTodos(): Promise<TodoItem[]> {
  const res = await fetch("/api/dakota/todo?status=active")
  if (!res.ok) throw new Error("할 일 로딩 실패")
  return res.json()
}

async function patchTodo(payload: { page_id: string; name?: string; status?: string; priority?: string; category?: string; due?: string | null }): Promise<void> {
  const res = await fetch("/api/dakota/todo", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const data = await res.json() as { error?: string }
    throw new Error(data.error ?? "업데이트 실패")
  }
}

async function createQuickTodo(params: { name: string; priority: string; category: string; due: string }): Promise<void> {
  const res = await fetch("/api/dakota/todo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      due: params.due,
      status: "To Do",
      priority: params.priority,
      category: params.category,
    }),
  })

  if (!res.ok) {
    const data = await res.json() as { error?: string }
    throw new Error(data.error ?? "생성 실패")
  }
}

function priorityBadgeClass(priority: string): string {
  if (priority === "High") return "border-red-400/50 text-red-300"
  if (priority === "Medium") return "border-yellow-400/50 text-yellow-300"
  return "border-border text-foreground/90"
}

function categoryBadgeClass(category: string): string {
  switch (category) {
    case "가족": return "border-green-400/50 text-green-300"
    case "학회": return "border-purple-400/50 text-purple-300"
    case "연구": return "border-blue-400/50 text-blue-300"
    case "임상": return "border-orange-400/50 text-orange-300"
    case "AI": return "border-cyan-400/50 text-cyan-300"
    default: return "border-border text-muted-foreground"
  }
}

const PRIORITIES = ["High", "Medium", "Low"] as const
const CATEGORIES = ["일상업무", "가족", "학회", "연구", "임상", "AI"] as const

type DuePreset = "today" | "3days" | "week" | "custom"

const DUE_LABELS: Record<DuePreset, string> = {
  today: "당일",
  "3days": "3일",
  week: "이번주",
  custom: "커스텀",
}

function getDueDate(preset: DuePreset): string {
  const d = new Date()
  if (preset === "3days") d.setDate(d.getDate() + 3)
  else if (preset === "week") d.setDate(d.getDate() + (7 - d.getDay()))
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

function formatDueRelative(dueStr: string, today: string): { label: string; color: string } | null {
  if (!dueStr) return null
  const due = dueStr.slice(0, 10)
  const dueDate = new Date(due + "T00:00:00+09:00")
  const todayDate = new Date(today + "T00:00:00+09:00")
  const diffDays = Math.round((dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < -1) return { label: `D+${Math.abs(diffDays)}`, color: "text-red-400" }
  if (diffDays === -1) return { label: "D+1", color: "text-red-400" }
  if (diffDays === 0) return { label: "Today", color: "text-blue-400" }
  if (diffDays === 1) return { label: "D-1", color: "text-amber-400" }
  if (diffDays === 2) return { label: "D-2", color: "text-amber-400" }
  if (diffDays === 3) return { label: "3day", color: "text-muted-foreground" }
  if (diffDays <= 7) return { label: "1wk", color: "text-muted-foreground" }
  return { label: `${diffDays}d`, color: "text-muted-foreground/70" }
}


export function TodayTodo() {
  const queryClient = useQueryClient()
  const [quickName, setQuickName] = useState("")
  const [quickAddError, setQuickAddError] = useState<string | null>(null)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [quickPriority, setQuickPriority] = useState<string>("Medium")
  const [quickCategory, setQuickCategory] = useState<string>("일상업무")
  const [quickDue, setQuickDue] = useState<DuePreset>("today")
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const today = todayInSeoul()

  const renameMutation = useMutation({
    mutationFn: ({ pageId, name }: { pageId: string; name: string }) =>
      patchTodo({ page_id: pageId, name }),
    onSuccess: () => {
      setEditingId(null)
      queryClient.invalidateQueries({ queryKey: ["dashboard-todo-active"] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (pageId: string) => {
      setCompletedIds((prev) => new Set(prev).add(pageId))
      const res = await fetch("/api/dakota/todo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: pageId }),
      })
      if (!res.ok) throw new Error("삭제 실패")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-todo-active"] })
      queryClient.invalidateQueries({ queryKey: ["dakota-todos"] })
    },
  })

  const { data: todos, isLoading, error } = useQuery({
    queryKey: ["dashboard-todo-active"],
    queryFn: fetchActiveTodos,
    refetchInterval: 60000,
  })

  const completeMutation = useMutation({
    mutationFn: (pageId: string) => {
      setCompletedIds((prev) => new Set(prev).add(pageId))
      return patchTodo({ page_id: pageId, status: "Done" })
    },
    onMutate: async (pageId) => {
      // 낙관적으로 목록에서 제거
      await queryClient.cancelQueries({ queryKey: ["dashboard-todo-active"] })
      const previous = queryClient.getQueryData<TodoItem[]>(["dashboard-todo-active"])
      return { previous }
    },
    onSuccess: async (_data, pageId) => {
      // 즉시 캐시에서 제거
      queryClient.setQueryData<TodoItem[]>(["dashboard-todo-active"], (old) =>
        (old ?? []).filter((t) => t.page_id !== pageId)
      )
      // completedIds는 유지 — refetch 시 아직 Done 미반영된 항목 재표시 방지
      // Notion 반영 시간 충분히 확보 후 refetch
      await new Promise((r) => setTimeout(r, 5000))
      await queryClient.invalidateQueries({ queryKey: ["dashboard-todo-active"] })
      await queryClient.invalidateQueries({ queryKey: ["dakota-todos"] })
      await queryClient.invalidateQueries({ queryKey: ["dakota-todo-history"] })
    },
    onError: (_err, pageId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["dashboard-todo-active"], context.previous)
      }
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
      await queryClient.cancelQueries({ queryKey: ["dashboard-todo-active"] })
      const previous = queryClient.getQueryData<TodoItem[]>(["dashboard-todo-active"])
      queryClient.setQueryData<TodoItem[]>(["dashboard-todo-active"], (old) =>
        (old ?? []).map((t) => (t.page_id === pageId ? { ...t, priority } : t))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["dashboard-todo-active"], context.previous)
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard-todo-active"] })
    },
  })

  const dueMutation = useMutation({
    mutationFn: ({ pageId, due }: { pageId: string; due: string | null }) =>
      patchTodo({ page_id: pageId, due }),
    onMutate: async ({ pageId, due }) => {
      await queryClient.cancelQueries({ queryKey: ["dashboard-todo-active"] })
      const previous = queryClient.getQueryData<TodoItem[]>(["dashboard-todo-active"])
      queryClient.setQueryData<TodoItem[]>(["dashboard-todo-active"], (old) =>
        (old ?? []).map((t) => (t.page_id === pageId ? { ...t, due } : t))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["dashboard-todo-active"], context.previous)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard-todo-active"] })
    },
  })

  const categoryMutation = useMutation({
    mutationFn: ({ pageId, category }: { pageId: string; category: string }) =>
      patchTodo({ page_id: pageId, category }),
    onMutate: async ({ pageId, category }) => {
      await queryClient.cancelQueries({ queryKey: ["dashboard-todo-active"] })
      const previous = queryClient.getQueryData<TodoItem[]>(["dashboard-todo-active"])
      queryClient.setQueryData<TodoItem[]>(["dashboard-todo-active"], (old) =>
        (old ?? []).map((t) => (t.page_id === pageId ? { ...t, category } : t))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["dashboard-todo-active"], context.previous)
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard-todo-active"] })
    },
  })

  const createMutation = useMutation({
    mutationFn: (params: { name: string; priority: string; category: string; due: string }) => createQuickTodo(params),
    onSuccess: async () => {
      setQuickName("")
      setQuickPriority("Medium")
      setQuickCategory("일상업무")
      setQuickDue("today")
      setCustomDate(undefined)
      setQuickAddError(null)
      await queryClient.invalidateQueries({ queryKey: ["dashboard-todo-active"] })
      await queryClient.invalidateQueries({ queryKey: ["dakota-todos"] })
      await queryClient.refetchQueries({ queryKey: ["dashboard-todo-active"] })
      await queryClient.refetchQueries({ queryKey: ["dakota-todos"] })
    },
    onError: (mutationError) => {
      const message = mutationError instanceof Error ? mutationError.message : "할 일 생성 중 오류가 발생했습니다."
      setQuickAddError(message)
    },
  })

  const handleQuickAdd = async (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (createMutation.isPending) return
    setQuickAddError(null)
    const name = quickName.trim()
    if (!name) {
      setQuickAddError("할 일을 입력하세요.")
      return
    }
    try {
      const due = quickDue === "custom" && customDate
        ? customDate.toLocaleDateString("en-CA")
        : getDueDate(quickDue)
      await createMutation.mutateAsync({ name, priority: quickPriority, category: quickCategory, due })
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : "할 일 생성 중 오류가 발생했습니다."
      setQuickAddError(message)
    }
  }

  const mutationErrorMessage = createMutation.isError
    ? createMutation.error instanceof Error
      ? createMutation.error.message
      : "할 일 생성 중 오류가 발생했습니다."
    : null
  const quickAddErrorMessage = quickAddError ?? mutationErrorMessage

  return (
    <div className="border border-border rounded-xl bg-card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider">오늘 할일</h3>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-11 w-full bg-muted" />
          <Skeleton className="h-11 w-full bg-muted" />
        </div>
      ) : error ? (
        <p className="text-red-400 text-sm">할 일을 불러오지 못했습니다.</p>
      ) : (todos ?? []).length === 0 ? (
        <EmptyState icon="✅" message="오늘 처리할 할 일이 없습니다." />
      ) : (
        <div className="space-y-2">
          {(todos ?? []).filter(t => !completedIds.has(t.page_id)).map((todo) => {
            return (
              <label
                key={todo.page_id}
                className="flex items-start gap-3 rounded-lg border px-3 py-2 transition-all duration-500 border-border bg-muted"
              >
                <input
                  type="checkbox"
                  className="mt-1 accent-green-500"
                  checked={false}
                  onChange={() => completeMutation.mutate(todo.page_id)}
                />
                <div className="min-w-0 flex-1" onClick={(e) => e.preventDefault()}>
                  {editingId === todo.page_id ? (
                    <input
                      autoFocus
                      className="text-sm w-full bg-muted border border-border rounded px-1.5 py-0.5 text-foreground outline-none focus:border-blue-500"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const trimmed = editingName.trim()
                          if (trimmed && trimmed !== todo.name) {
                            renameMutation.mutate({ pageId: todo.page_id, name: trimmed })
                          } else {
                            setEditingId(null)
                          }
                        }
                        if (e.key === "Escape") setEditingId(null)
                      }}
                      onBlur={() => {
                        const trimmed = editingName.trim()
                        if (trimmed && trimmed !== todo.name) {
                          renameMutation.mutate({ pageId: todo.page_id, name: trimmed })
                        } else {
                          setEditingId(null)
                        }
                      }}
                    />
                  ) : (
                    <p
                      className="text-sm truncate text-foreground cursor-text hover:text-foreground"
                      onClick={() => { setEditingId(todo.page_id); setEditingName(todo.name) }}
                    >
                      {todo.name}
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-2">
                    <>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button>
                              <Badge variant="outline" className={`${priorityBadgeClass(todo.priority)} cursor-pointer hover:opacity-80`}>
                                {todo.priority}
                              </Badge>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-muted border-border">
                            {PRIORITIES.map((p) => (
                              <DropdownMenuItem
                                key={p}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  priorityMutation.mutate({ pageId: todo.page_id, priority: p })
                                }}
                                className="text-foreground focus:bg-muted"
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
                          <DropdownMenuContent className="bg-muted border-border">
                            {CATEGORIES.map((c) => (
                              <DropdownMenuItem
                                key={c}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  categoryMutation.mutate({ pageId: todo.page_id, category: c })
                                }}
                                className="text-foreground focus:bg-muted"
                              >
                                <Badge variant="outline" className={categoryBadgeClass(c)}>{c}</Badge>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button type="button" onClick={(e) => e.stopPropagation()}>
                              {todo.due ? (() => {
                                const rel = formatDueRelative(todo.due, today)
                                return rel ? (
                                  <span className={`text-xs font-medium num cursor-pointer hover:underline ${rel.color}`}>{rel.label}</span>
                                ) : null
                              })() : (
                                <span className="text-xs text-muted-foreground/70 hover:text-foreground cursor-pointer">+ 마감</span>
                              )}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-card border-border" align="start" onClick={(e) => e.stopPropagation()}>
                            <Calendar
                              mode="single"
                              selected={todo.due ? new Date(todo.due.slice(0, 10) + "T00:00:00+09:00") : undefined}
                              onSelect={(date) => {
                                if (!date) return
                                const iso = date.toLocaleDateString("en-CA")
                                dueMutation.mutate({ pageId: todo.page_id, due: iso })
                              }}
                            />
                            {todo.due && (
                              <div className="border-t border-border p-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    dueMutation.mutate({ pageId: todo.page_id, due: null })
                                  }}
                                  className="w-full text-xs text-muted-foreground hover:text-red-400 py-1"
                                >
                                  마감 제거
                                </button>
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                      </>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); deleteMutation.mutate(todo.page_id) }}
                  className="shrink-0 mt-0.5 p-1 rounded hover:bg-red-900/30 text-muted-foreground/70 hover:text-red-400 transition-colors"
                  title="삭제"
                >
                  <span className="text-xs">✕</span>
                </button>
              </label>
            )
          })}
        </div>
      )}

      <form onSubmit={handleQuickAdd} className="mt-4 space-y-2">
        <div className="flex gap-2">
          <Input
            value={quickName}
            onChange={(event) => setQuickName(event.target.value)}
            placeholder="새 할일 빠르게 추가"
            className="bg-muted border-border text-foreground"
            disabled={createMutation.isPending}
          />
          <Button
            type="submit"
            size="sm"
            disabled={createMutation.isPending}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            {createMutation.isPending ? "추가 중..." : "추가"}
          </Button>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setQuickPriority(p)}
                className={`px-2 py-0.5 text-xs rounded border ${
                  quickPriority === p
                    ? priorityBadgeClass(p) + " border-current"
                    : "border-border text-muted-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="px-2 py-0.5 text-xs rounded border border-border text-muted-foreground hover:text-foreground">
                {quickCategory}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-muted border-border">
              {CATEGORIES.map((c) => (
                <DropdownMenuItem
                  key={c}
                  onClick={() => setQuickCategory(c)}
                  className="text-foreground focus:bg-muted"
                >
                  {c}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex gap-1 ml-auto">
            {(["today", "3days", "week"] as DuePreset[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => { setQuickDue(d); setCustomDate(undefined) }}
                className={`px-2 py-0.5 text-xs rounded border ${
                  quickDue === d
                    ? "border-blue-400/50 text-blue-300"
                    : "border-border text-muted-foreground"
                }`}
              >
                {DUE_LABELS[d]}
              </button>
            ))}
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`px-2 py-0.5 text-xs rounded border ${
                    quickDue === "custom"
                      ? "border-blue-400/50 text-blue-300"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {quickDue === "custom" && customDate
                    ? customDate.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
                    : "커스텀"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-card border-border" align="end">
                <Calendar
                  mode="single"
                  selected={customDate}
                  onSelect={(date) => {
                    setCustomDate(date)
                    setQuickDue("custom")
                    setCalendarOpen(false)
                  }}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </form>
      {quickAddErrorMessage && (
        <p className="mt-2 text-xs text-red-300">오류: {quickAddErrorMessage}</p>
      )}
    </div>
  )
}
