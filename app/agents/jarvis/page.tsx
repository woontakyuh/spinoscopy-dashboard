"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ScheduleCreateInput, ScheduleCreateResult } from "@/lib/types/schedule"

const CATEGORY_OPTIONS = ["Conf", "Spine", "AI", "Workshop", "Lecture", "Meeting", "Webinar"] as const
const TODO_STATUS_OPTIONS = ["To Do", "In Progress", "Done"] as const
const TODO_PRIORITY_OPTIONS = ["High", "Medium", "Low"] as const
const TODO_CATEGORY_OPTIONS = ["일상업무", "가족", "학회", "연구", "임상"] as const

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

interface TodoEditFormState {
  name: string
  due: string
  priority: string
  category: string
  notes: string
}

interface TodoUpdatePayload {
  page_id: string
  name?: string
  due?: string | null
  status?: string
  priority?: string
  category?: string
  notes?: string
}

interface JarvisParseResponse {
  success: boolean
  parsed?: {
    name: string
    date_start: string
    date_end?: string
    place?: string
    category?: string
    society?: string[]
    topic?: string
    link?: string
    abstract_deadline?: string
  }
  parsed_todo?: {
    name: string
    due?: string
    priority?: "High" | "Medium" | "Low"
    notes?: string
  }
  error?: string
}

type ScheduleStage = "input" | "confirm" | "result"
type ScheduleTarget = "notion" | "gcal"

async function fetchTodos(statusFilter: string): Promise<TodoItem[]> {
  const query = statusFilter === "all" ? "" : `?status=${encodeURIComponent(statusFilter)}`
  const res = await fetch(`/api/jarvis/todo${query}`)
  if (!res.ok) throw new Error("할 일 로딩 실패")
  return res.json()
}

async function createTodo(payload: { name: string; due?: string; priority?: string; category?: string; notes?: string }): Promise<void> {
  const res = await fetch("/api/jarvis/todo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const data = await res.json() as { error?: string }
    throw new Error(data.error ?? "할 일 생성 실패")
  }
}

async function updateTodo(payload: TodoUpdatePayload): Promise<void> {
  const res = await fetch("/api/jarvis/todo", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const data = await res.json() as { error?: string }
    throw new Error(data.error ?? "할 일 수정 실패")
  }
}

async function deleteTodo(pageId: string): Promise<void> {
  const res = await fetch("/api/jarvis/todo", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page_id: pageId }),
  })

  if (!res.ok) {
    const data = await res.json() as { error?: string }
    throw new Error(data.error ?? "할 일 삭제 실패")
  }
}

function statusBadgeClass(status: string): string {
  if (status === "Done") return "border-green-400/40 text-green-300"
  if (status === "In Progress") return "border-blue-400/40 text-blue-300"
  return "border-zinc-600 text-zinc-300"
}

function priorityBadgeClass(priority: string): string {
  if (priority === "High") return "border-red-400/40 text-red-300"
  if (priority === "Medium") return "border-yellow-400/40 text-yellow-300"
  return "border-zinc-600 text-zinc-300"
}

function emptyTodoEditForm(): TodoEditFormState {
  return { name: "", due: "", priority: "Medium", category: "일상업무", notes: "" }
}

function mapParsedToScheduleInput(parsed: NonNullable<JarvisParseResponse["parsed"]>): ScheduleCreateInput {
  return {
    name: parsed.name,
    date_start: parsed.date_start,
    date_end: parsed.date_end ?? "",
    place: parsed.place ?? "",
    category: parsed.category ?? "Conf",
    society: parsed.society ?? [],
    topic: parsed.topic ?? "",
    link: parsed.link ?? "",
    abstract_deadline: parsed.abstract_deadline ?? "",
  }
}

export default function JarvisPage() {
  const queryClient = useQueryClient()

  const [scheduleStage, setScheduleStage] = useState<ScheduleStage>("input")
  const [scheduleText, setScheduleText] = useState("")
  const [parsedSchedule, setParsedSchedule] = useState<ScheduleCreateInput | null>(null)
  const [scheduleEditMode, setScheduleEditMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<ScheduleCreateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [targets, setTargets] = useState<Set<ScheduleTarget>>(new Set(["notion", "gcal"]))
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [todoStatusFilter, setTodoStatusFilter] = useState("all")
  const [todoInput, setTodoInput] = useState("")
  const [todoDueInput, setTodoDueInput] = useState("")
  const [todoPriorityInput, setTodoPriorityInput] = useState("Medium")
  const [todoCategoryInput, setTodoCategoryInput] = useState("일상업무")
  const [todoSuccess, setTodoSuccess] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TodoEditFormState>(emptyTodoEditForm)
  const [todoError, setTodoError] = useState<string | null>(null)

  const { data: todos, isLoading: todoLoading } = useQuery({
    queryKey: ["jarvis-todos", todoStatusFilter],
    queryFn: () => fetchTodos(todoStatusFilter),
    refetchInterval: 60000,
  })

  const createTodoMutation = useMutation({
    mutationFn: createTodo,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["jarvis-todos"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard-todo-active"] })
    },
  })

  const updateTodoMutation = useMutation({
    mutationFn: updateTodo,
    onSuccess: async () => {
      setEditingId(null)
      await queryClient.invalidateQueries({ queryKey: ["jarvis-todos"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard-todo-active"] })
    },
  })

  const deleteTodoMutation = useMutation({
    mutationFn: deleteTodo,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["jarvis-todos"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard-todo-active"] })
    },
  })

  const todoCounts = useMemo(() => {
    const base = { all: 0, "To Do": 0, "In Progress": 0, Done: 0 }
    for (const todo of todos ?? []) {
      base.all += 1
      if (todo.status in base) {
        base[todo.status as keyof typeof base] += 1
      }
    }
    return base
  }, [todos])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const nextValueLength = scheduleText.length
    textarea.style.height = "auto"
    textarea.style.height = `${textarea.scrollHeight}px`
    if (nextValueLength === 0) {
      textarea.style.height = "100px"
    }
  }, [scheduleText])

  useEffect(() => {
    if (!todoSuccess) return
    const timer = window.setTimeout(() => setTodoSuccess(null), 1800)
    return () => window.clearTimeout(timer)
  }, [todoSuccess])

  const handleAnalyze = async () => {
    if (!scheduleText.trim()) {
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch("/api/jarvis/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: scheduleText.trim(),
        }),
      })

      const contentType = res.headers.get("content-type") ?? ""
      if (!contentType.includes("application/json")) {
        throw new Error("서버 응답 오류가 발생했습니다. 잠시 후 다시 시도하세요.")
      }

      const data = (await res.json()) as JarvisParseResponse

      if (!res.ok || !data.success || !data.parsed) {
        throw new Error(data.error ?? "일정 분석 중 오류가 발생했습니다.")
      }

      setParsedSchedule(mapParsedToScheduleInput(data.parsed))
      setTargets(new Set(["notion", "gcal"]))
      setScheduleEditMode(false)
      setScheduleStage("confirm")
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "알 수 없는 오류"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitSchedule = async () => {
    if (!parsedSchedule) {
      return
    }

    if (targets.size === 0) {
      setError("등록 대상을 최소 1개 선택하세요.")
      return
    }

    const payload: ScheduleCreateInput = {
      name: parsedSchedule.name.trim(),
      date_start: parsedSchedule.date_start,
      date_end: parsedSchedule.date_end || undefined,
      place: parsedSchedule.place?.trim() || undefined,
      category: parsedSchedule.category || "Conf",
      society: parsedSchedule.society?.map((item) => item.trim()).filter((item) => item.length > 0),
      topic: parsedSchedule.topic?.trim() || undefined,
      link: parsedSchedule.link?.trim() || undefined,
      abstract_deadline: parsedSchedule.abstract_deadline || undefined,
      targets: Array.from(targets),
    }

    if (!payload.name || !payload.date_start) {
      setError("이름과 시작일은 필수입니다.")
      return
    }

    setCreating(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch("/api/jarvis/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = (await res.json()) as ScheduleCreateResult

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "일정 등록 중 오류가 발생했습니다.")
      }

      setResult(data)
      setScheduleStage("result")
      await queryClient.invalidateQueries({ queryKey: ["dashboard-schedule"] })
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "알 수 없는 오류"
      setError(message)
      setScheduleStage("result")
    } finally {
      setCreating(false)
    }
  }

  const handleCreateTodo = async (event: { preventDefault: () => void }) => {
    event.preventDefault()

    if (createTodoMutation.isPending) {
      return
    }

    setTodoError(null)
    setTodoSuccess(null)

    const rawText = todoInput.trim()
    if (!rawText) {
      setTodoError("할 일을 입력하세요.")
      return
    }

    let payload: { name: string; due?: string; priority?: string; category?: string; notes?: string } = {
      name: rawText,
    }

    try {
      const parseRes = await fetch("/api/jarvis/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText, type: "todo" }),
      })

      if (parseRes.ok) {
        const parseData = (await parseRes.json()) as JarvisParseResponse
        if (parseData.success && parseData.parsed_todo?.name) {
          payload = {
            name: parseData.parsed_todo.name,
            due: parseData.parsed_todo.due,
            priority: parseData.parsed_todo.priority,
            notes: parseData.parsed_todo.notes,
          }
        }
      }
    } catch {
      payload = { name: rawText }
    }

    try {
      const explicitDue = todoDueInput.trim()
      if (explicitDue) {
        payload.due = explicitDue
      }

      payload.priority = todoPriorityInput
      payload.category = todoCategoryInput

      await createTodoMutation.mutateAsync(payload)
      setTodoInput("")
      setTodoDueInput("")
      setTodoPriorityInput("Medium")
      setTodoCategoryInput("일상업무")
      setTodoSuccess("할 일을 추가했습니다.")
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : "알 수 없는 오류"
      setTodoError(message)
    }
  }

  const startEdit = (todo: TodoItem) => {
    setEditingId(todo.page_id)
    setEditForm({
      name: todo.name,
      due: todo.due?.slice(0, 10) ?? "",
      priority: todo.priority,
      category: todo.category || "일상업무",
      notes: todo.notes,
    })
  }

  const saveEdit = async (todo: TodoItem) => {
    setTodoError(null)
    try {
      await updateTodoMutation.mutateAsync({
        page_id: todo.page_id,
        name: editForm.name.trim(),
        due: editForm.due || null,
        priority: editForm.priority,
        category: editForm.category,
        notes: editForm.notes,
      })
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : "알 수 없는 오류"
      setTodoError(message)
    }
  }

  const markDone = async (pageId: string) => {
    setTodoError(null)
    try {
      await updateTodoMutation.mutateAsync({ page_id: pageId, status: "Done" })
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : "알 수 없는 오류"
      setTodoError(message)
    }
  }

  const reopenTodo = async (pageId: string) => {
    setTodoError(null)
    try {
      await updateTodoMutation.mutateAsync({ page_id: pageId, status: "To Do" })
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : "알 수 없는 오류"
      setTodoError(message)
    }
  }

  const removeTodo = async (pageId: string) => {
    setTodoError(null)
    try {
      await deleteTodoMutation.mutateAsync(pageId)
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : "알 수 없는 오류"
      setTodoError(message)
    }
  }

  const updateParsedField = (field: keyof ScheduleCreateInput, value: string) => {
    setParsedSchedule((prev) => {
      if (!prev) return prev
      if (field === "society") {
        return {
          ...prev,
          society: value
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0),
        }
      }
      return { ...prev, [field]: value }
    })
  }

  const toggleTarget = (target: ScheduleTarget) => {
    setTargets((prev) => {
      const next = new Set(prev)
      if (next.has(target)) {
        if (next.size === 1) {
          return prev
        }
        next.delete(target)
      } else {
        next.add(target)
      }
      return next
    })
  }

  const submitScheduleLabel = useMemo(() => {
    const hasNotion = targets.has("notion")
    const hasGcal = targets.has("gcal")
    if (hasNotion && hasGcal) return "✓ Notion + GCal 등록"
    if (hasNotion) return "✓ Notion 등록"
    return "✓ GCal 등록"
  }, [targets])

  const parsedRows = parsedSchedule
    ? [
        { key: "name", label: "이름", value: parsedSchedule.name, type: "text" as const },
        { key: "date_start", label: "시작일", value: parsedSchedule.date_start, type: "date" as const },
        { key: "date_end", label: "종료일", value: parsedSchedule.date_end ?? "", type: "date" as const },
        { key: "place", label: "장소", value: parsedSchedule.place ?? "", type: "text" as const },
        { key: "category", label: "분류", value: parsedSchedule.category ?? "", type: "category" as const },
        {
          key: "society",
          label: "학회",
          value: parsedSchedule.society?.join(", ") ?? "",
          type: "text" as const,
        },
        { key: "topic", label: "주제", value: parsedSchedule.topic ?? "", type: "text" as const },
        { key: "link", label: "링크", value: parsedSchedule.link ?? "", type: "url" as const },
        {
          key: "abstract_deadline",
          label: "초록마감",
          value: parsedSchedule.abstract_deadline ?? "",
          type: "date" as const,
        },
      ].filter((row) => row.value.trim().length > 0 || scheduleEditMode)
    : []

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="📋 Jarvis" />
      <div className="p-3 md:p-6 max-w-5xl w-full space-y-4">
        <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
          <p className="text-zinc-300 text-sm">일정 등록과 할 일 관리를 한 화면에서 처리합니다.</p>
        </div>

        <Tabs defaultValue="schedule" className="space-y-4">
          <TabsList className="bg-zinc-800 border border-zinc-700">
            <TabsTrigger value="schedule">일정 등록</TabsTrigger>
            <TabsTrigger value="todo">할 일 관리</TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="space-y-4">
            <Card className="bg-zinc-900 border-zinc-700 gap-4">
              <CardHeader>
                <CardTitle className="text-zinc-100 text-base">자연어 일정 등록</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {scheduleStage === "input" && (
                    <>
                      <p className="text-zinc-300 text-sm">자연어 입력으로 일정을 등록합니다.</p>
                      <div className="rounded-xl border border-zinc-700 bg-zinc-850 p-3 space-y-3">
                        <Textarea
                          ref={textareaRef}
                          value={scheduleText}
                          onChange={(event) => setScheduleText(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey && scheduleText.trim()) {
                              event.preventDefault()
                              void handleAnalyze()
                            }
                          }}
                          placeholder={'"3월 15-17일 AANS Annual Meeting, 시카고" 처럼 입력하세요'}
                          className="bg-zinc-800 border-zinc-700 text-zinc-100 min-h-[100px] resize-none"
                        />

                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            type="button"
                            onClick={handleAnalyze}
                            disabled={loading || !scheduleText.trim()}
                            className="bg-blue-600 hover:bg-blue-500 text-white"
                          >
                            {loading ? "등록 준비 중..." : "자연어 등록"}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}

                  {scheduleStage === "confirm" && parsedSchedule && (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-zinc-700 bg-zinc-850 p-4 space-y-3">
                        <p className="text-zinc-200 text-sm">분석 결과 (확인 후 등록)</p>
                        <div className="space-y-2">
                          {parsedRows.map((row) => (
                            <div key={row.key} className="grid grid-cols-[100px,1fr] gap-2 items-center">
                              <Label className="text-zinc-400 text-xs">{row.label}</Label>
                              {scheduleEditMode ? (
                                row.type === "category" ? (
                                  <Select
                                    value={parsedSchedule.category || "Conf"}
                                    onValueChange={(value) => updateParsedField("category", value)}
                                  >
                                    <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-zinc-100 h-8">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                                      {CATEGORY_OPTIONS.map((category) => (
                                        <SelectItem key={category} value={category}>
                                          {category}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    type={row.type}
                                    value={row.value}
                                    onChange={(event) => updateParsedField(row.key as keyof ScheduleCreateInput, event.target.value)}
                                    className="h-8 bg-zinc-800 border-zinc-700 text-zinc-100"
                                  />
                                )
                              ) : (
                                <p className="text-zinc-100 text-sm break-all">{row.value}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg border border-zinc-700 bg-zinc-850 p-3">
                        <p className="text-zinc-300 text-xs mb-2">등록 대상</p>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-200">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={targets.has("notion")}
                              onChange={() => toggleTarget("notion")}
                              className="h-4 w-4 rounded border-zinc-600 bg-zinc-800"
                            />
                            Notion
                          </label>
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={targets.has("gcal")}
                              onChange={() => toggleTarget("gcal")}
                              className="h-4 w-4 rounded border-zinc-600 bg-zinc-800"
                            />
                            Google Calendar
                          </label>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setScheduleEditMode((prev) => !prev)}
                        >
                          {scheduleEditMode ? "수정 완료" : "수정"}
                        </Button>
                        <Button
                          type="button"
                          onClick={handleSubmitSchedule}
                          disabled={creating}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                          {creating ? "등록 중..." : submitScheduleLabel}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setScheduleStage("input")}
                        >
                          다시 입력
                        </Button>
                      </div>
                    </div>
                  )}

                  {scheduleStage === "result" && (
                    <div className="space-y-3">
                      {error && (
                        <div className="border border-red-500/40 rounded-xl p-4 bg-red-900/20">
                          <p className="text-red-200 text-sm">오류: {error}</p>
                        </div>
                      )}

                      {result && (
                        <div className="border border-emerald-500/40 rounded-xl p-4 bg-emerald-900/20 space-y-2">
                          <p className="text-emerald-200 text-sm">일정이 처리되었습니다.</p>
                          {result.notion && (
                            <p className="text-zinc-200 text-sm">
                              Notion: <a href={result.notion.url} target="_blank" rel="noreferrer" className="underline text-blue-300">{result.notion.url}</a>
                            </p>
                          )}
                          {result.google_calendar?.eventUrl && (
                            <p className="text-zinc-200 text-sm">
                              Google Calendar: <a href={result.google_calendar.eventUrl} target="_blank" rel="noreferrer" className="underline text-blue-300">{result.google_calendar.eventUrl}</a>
                            </p>
                          )}
                          {result.google_calendar && !result.google_calendar.success && (
                            <p className="text-amber-200 text-sm">Google Calendar: {result.google_calendar.message}</p>
                          )}
                        </div>
                      )}

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setScheduleStage("input")
                          setError(null)
                        }}
                      >
                        새 일정 입력
                      </Button>
                    </div>
                  )}

                  {scheduleStage !== "result" && error && (
                    <div className="border border-red-500/40 rounded-xl p-4 bg-red-900/20">
                      <p className="text-red-200 text-sm">오류: {error}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="todo" className="space-y-4">
            <Card className="bg-zinc-900 border-zinc-700 gap-4">
              <CardHeader>
                <CardTitle className="text-zinc-100 text-base">할 일 추가</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateTodo} className="space-y-3">
                  <div className="flex flex-col md:flex-row gap-2">
                    <Input
                      value={todoInput}
                      onChange={(event) => setTodoInput(event.target.value)}
                      className="bg-zinc-800 border-zinc-700 text-zinc-100"
                      placeholder='"내일까지 OP note 정리" 처럼 자연어로 입력'
                    />
                    <Input
                      type="date"
                      value={todoDueInput}
                      onChange={(event) => setTodoDueInput(event.target.value)}
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 md:w-[170px]"
                    />
                    <Select value={todoPriorityInput} onValueChange={setTodoPriorityInput}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 md:w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                        {TODO_PRIORITY_OPTIONS.map((priority) => (
                          <SelectItem key={priority} value={priority}>{priority}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={todoCategoryInput} onValueChange={setTodoCategoryInput}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 md:w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                        {TODO_CATEGORY_OPTIONS.map((category) => (
                          <SelectItem key={category} value={category}>{category}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="submit"
                      disabled={createTodoMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-500 text-white md:min-w-20"
                    >
                      {createTodoMutation.isPending ? "추가 중..." : "추가"}
                    </Button>
                  </div>
                  {todoSuccess && (
                    <div className="border border-emerald-500/40 rounded-lg px-3 py-2 bg-emerald-900/20">
                      <p className="text-emerald-200 text-xs">{todoSuccess}</p>
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-700 gap-4">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-zinc-100 text-base">할 일 목록</CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="xs" variant={todoStatusFilter === "all" ? "default" : "outline"} onClick={() => setTodoStatusFilter("all")}>All {todoCounts.all}</Button>
                  <Button size="xs" variant={todoStatusFilter === "To Do" ? "default" : "outline"} onClick={() => setTodoStatusFilter("To Do")}>To Do {todoCounts["To Do"]}</Button>
                  <Button size="xs" variant={todoStatusFilter === "In Progress" ? "default" : "outline"} onClick={() => setTodoStatusFilter("In Progress")}>In Progress {todoCounts["In Progress"]}</Button>
                  <Button size="xs" variant={todoStatusFilter === "Done" ? "default" : "outline"} onClick={() => setTodoStatusFilter("Done")}>Done {todoCounts.Done}</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {todoLoading ? (
                  <p className="text-zinc-500 text-sm">로딩 중...</p>
                ) : (todos ?? []).length === 0 ? (
                  <p className="text-zinc-500 text-sm">표시할 할 일이 없습니다.</p>
                ) : (
                  (todos ?? []).map((todo) => (
                    <div key={todo.page_id} className="rounded-lg border border-zinc-700 bg-zinc-800 p-3 space-y-2">
                      {editingId === todo.page_id ? (
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                          <Input
                            value={editForm.name}
                            onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                            className="bg-zinc-900 border-zinc-700 text-zinc-100 md:col-span-2"
                          />
                          <Input
                            type="date"
                            value={editForm.due}
                            onChange={(event) => setEditForm((prev) => ({ ...prev, due: event.target.value }))}
                            className="bg-zinc-900 border-zinc-700 text-zinc-100"
                          />
                          <Select
                            value={editForm.priority}
                            onValueChange={(value) => setEditForm((prev) => ({ ...prev, priority: value }))}
                          >
                            <SelectTrigger className="w-full bg-zinc-900 border-zinc-700 text-zinc-100">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                              {TODO_PRIORITY_OPTIONS.map((priority) => (
                                <SelectItem key={priority} value={priority}>{priority}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={editForm.category}
                            onValueChange={(value) => setEditForm((prev) => ({ ...prev, category: value }))}
                          >
                            <SelectTrigger className="w-full bg-zinc-900 border-zinc-700 text-zinc-100">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                              {TODO_CATEGORY_OPTIONS.map((category) => (
                                <SelectItem key={category} value={category}>{category}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={editForm.notes}
                            onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))}
                            className="bg-zinc-900 border-zinc-700 text-zinc-100 md:col-span-5"
                            placeholder="메모"
                          />
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-zinc-100 text-sm font-medium truncate">{todo.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className={statusBadgeClass(todo.status)}>{todo.status}</Badge>
                              <Badge variant="outline" className={priorityBadgeClass(todo.priority)}>{todo.priority}</Badge>
                              <Badge variant="outline" className="border-zinc-500 text-zinc-300">{todo.category || "일상업무"}</Badge>
                              {todo.due && <span className="text-xs text-zinc-500">Due {todo.due.slice(0, 10)}</span>}
                            </div>
                            {todo.notes && <p className="text-xs text-zinc-400 mt-1">{todo.notes}</p>}
                          </div>
                          <a href={todo.url} target="_blank" rel="noreferrer" className="text-xs text-blue-300 hover:text-blue-200">Notion</a>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        {editingId === todo.page_id ? (
                          <>
                            <Button size="xs" onClick={() => saveEdit(todo)} disabled={updateTodoMutation.isPending}>저장</Button>
                            <Button size="xs" variant="outline" onClick={() => setEditingId(null)}>취소</Button>
                          </>
                        ) : (
                          <>
                            <Button size="xs" variant="outline" onClick={() => startEdit(todo)}>수정</Button>
                            {todo.status === "Done" ? (
                              <Button size="xs" variant="outline" onClick={() => reopenTodo(todo.page_id)} disabled={updateTodoMutation.isPending}>다시 열기</Button>
                            ) : (
                              <Button size="xs" onClick={() => markDone(todo.page_id)} disabled={updateTodoMutation.isPending}>완료</Button>
                            )}
                            <Button size="xs" variant="destructive" onClick={() => removeTodo(todo.page_id)} disabled={deleteTodoMutation.isPending}>삭제</Button>
                            <Select
                              value={todo.status}
                              onValueChange={(value) => updateTodoMutation.mutate({ page_id: todo.page_id, status: value })}
                            >
                              <SelectTrigger className="h-6 px-2 bg-zinc-900 border-zinc-700 text-zinc-200 text-xs w-[130px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                                {TODO_STATUS_OPTIONS.map((status) => (
                                  <SelectItem key={status} value={status}>{status}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {todoError && (
              <div className="border border-red-500/40 rounded-xl p-4 bg-red-900/20">
                <p className="text-red-200 text-sm">오류: {todoError}</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
