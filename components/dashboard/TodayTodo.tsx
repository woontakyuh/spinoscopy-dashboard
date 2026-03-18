"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
  const res = await fetch("/api/jarvis/todo?status=active")
  if (!res.ok) throw new Error("할 일 로딩 실패")
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

async function createQuickTodo(params: { name: string; priority: string; category: string }): Promise<void> {
  const res = await fetch("/api/jarvis/todo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      due: todayInSeoul(),
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

const PRIORITIES = ["High", "Medium", "Low"] as const
const CATEGORIES = ["일상업무", "가족", "학회", "연구", "임상", "AI"] as const

export function TodayTodo() {
  const queryClient = useQueryClient()
  const [quickName, setQuickName] = useState("")
  const [quickAddError, setQuickAddError] = useState<string | null>(null)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [quickPriority, setQuickPriority] = useState<string>("Medium")
  const [quickCategory, setQuickCategory] = useState<string>("일상업무")
  const today = todayInSeoul()

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
      // 애니메이션 후 캐시에서 제거
      await new Promise((r) => setTimeout(r, 800))
      queryClient.setQueryData<TodoItem[]>(["dashboard-todo-active"], (old) =>
        (old ?? []).filter((t) => t.page_id !== pageId)
      )
      setCompletedIds((prev) => {
        const next = new Set(prev)
        next.delete(pageId)
        return next
      })
      // Notion 반영 시간 확보 후 refetch
      await new Promise((r) => setTimeout(r, 2000))
      await queryClient.invalidateQueries({ queryKey: ["dashboard-todo-active"] })
      await queryClient.invalidateQueries({ queryKey: ["jarvis-todos"] })
      await queryClient.invalidateQueries({ queryKey: ["jarvis-todo-history"] })
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
    mutationFn: (params: { name: string; priority: string; category: string }) => createQuickTodo(params),
    onSuccess: async () => {
      setQuickName("")
      setQuickPriority("Medium")
      setQuickCategory("일상업무")
      setQuickAddError(null)
      await queryClient.invalidateQueries({ queryKey: ["dashboard-todo-active"] })
      await queryClient.invalidateQueries({ queryKey: ["jarvis-todos"] })
      await queryClient.refetchQueries({ queryKey: ["dashboard-todo-active"] })
      await queryClient.refetchQueries({ queryKey: ["jarvis-todos"] })
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
      await createMutation.mutateAsync({ name, priority: quickPriority, category: quickCategory })
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
    <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">오늘 할일</h3>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-11 w-full bg-zinc-800" />
          <Skeleton className="h-11 w-full bg-zinc-800" />
        </div>
      ) : error ? (
        <p className="text-red-400 text-sm">할 일을 불러오지 못했습니다.</p>
      ) : (todos ?? []).length === 0 ? (
        <p className="text-zinc-500 text-sm">오늘 처리할 할 일이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {(todos ?? []).map((todo) => {
            const isDone = completedIds.has(todo.page_id)
            return (
              <label
                key={todo.page_id}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2 transition-all duration-500 ${
                  isDone
                    ? "border-green-700/50 bg-green-900/20 opacity-60"
                    : "border-zinc-700 bg-zinc-800"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 accent-green-500"
                  checked={isDone}
                  onChange={() => {
                    if (!isDone) completeMutation.mutate(todo.page_id)
                  }}
                  disabled={isDone}
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm truncate transition-all duration-500 ${
                    isDone ? "line-through text-zinc-500" : "text-zinc-100"
                  }`}>
                    {todo.name}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {isDone ? (
                      <span className="text-xs text-green-400">완료</span>
                    ) : (
                      <>
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
                                onClick={(e) => {
                                  e.stopPropagation()
                                  priorityMutation.mutate({ pageId: todo.page_id, priority: p })
                                }}
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
                                onClick={(e) => {
                                  e.stopPropagation()
                                  categoryMutation.mutate({ pageId: todo.page_id, category: c })
                                }}
                                className="text-zinc-100 focus:bg-zinc-700"
                              >
                                <Badge variant="outline" className={categoryBadgeClass(c)}>{c}</Badge>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {todo.due && todo.due.slice(0, 10) !== today && (
                          <span className="text-xs text-zinc-500">Due {todo.due.slice(0, 10)}</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
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
            className="bg-zinc-800 border-zinc-700 text-zinc-100"
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
                    : "border-zinc-700 text-zinc-500"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="px-2 py-0.5 text-xs rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200">
                {quickCategory}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-zinc-800 border-zinc-700">
              {CATEGORIES.map((c) => (
                <DropdownMenuItem
                  key={c}
                  onClick={() => setQuickCategory(c)}
                  className="text-zinc-100 focus:bg-zinc-700"
                >
                  {c}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </form>
      {quickAddErrorMessage && (
        <p className="mt-2 text-xs text-red-300">오류: {quickAddErrorMessage}</p>
      )}
    </div>
  )
}
