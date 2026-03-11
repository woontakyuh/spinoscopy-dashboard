"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

interface TodoItem {
  page_id: string
  name: string
  due: string | null
  status: string
  priority: string
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

async function patchTodo(payload: { page_id: string; status?: string }): Promise<void> {
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

async function createQuickTodo(name: string): Promise<void> {
  const res = await fetch("/api/jarvis/todo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      due: todayInSeoul(),
      status: "To Do",
      priority: "Medium",
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

export function TodayTodo() {
  const queryClient = useQueryClient()
  const [quickName, setQuickName] = useState("")
  const [quickAddError, setQuickAddError] = useState<string | null>(null)
  const today = todayInSeoul()

  const { data: todos, isLoading, error } = useQuery({
    queryKey: ["dashboard-todo-active"],
    queryFn: fetchActiveTodos,
    refetchInterval: 60000,
  })

  const completeMutation = useMutation({
    mutationFn: (pageId: string) => patchTodo({ page_id: pageId, status: "Done" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard-todo-active"] })
      await queryClient.invalidateQueries({ queryKey: ["jarvis-todos"] })
    },
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => createQuickTodo(name),
    onSuccess: async () => {
      setQuickName("")
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

    if (createMutation.isPending) {
      return
    }

    setQuickAddError(null)
    const name = quickName.trim()
    if (!name) {
      setQuickAddError("할 일을 입력하세요.")
      return
    }

    try {
      await createMutation.mutateAsync(name)
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
          {(todos ?? []).map((todo) => (
            <label
              key={todo.page_id}
              className="flex items-start gap-3 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={false}
                onChange={() => completeMutation.mutate(todo.page_id)}
                disabled={completeMutation.isPending}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-100 truncate">{todo.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="outline" className={priorityBadgeClass(todo.priority)}>
                    {todo.priority}
                  </Badge>
                  {todo.due && todo.due.slice(0, 10) !== today && (
                    <span className="text-xs text-zinc-500">Due {todo.due.slice(0, 10)}</span>
                  )}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}

      <form onSubmit={handleQuickAdd} className="mt-4 flex gap-2">
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
      </form>
      {quickAddErrorMessage && (
        <p className="mt-2 text-xs text-red-300">오류: {quickAddErrorMessage}</p>
      )}
    </div>
  )
}
