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

interface TodoItem {
  page_id: string
  name: string
  due: string | null
  status: string
  priority: string
  notes: string
  url: string
}

interface TodoFormState {
  name: string
  due: string
  priority: string
  notes: string
}

interface TodoUpdatePayload {
  page_id: string
  name?: string
  due?: string | null
  status?: string
  priority?: string
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
  error?: string
}

type ScheduleStage = "input" | "confirm" | "result"

async function fetchTodos(statusFilter: string): Promise<TodoItem[]> {
  const query = statusFilter === "all" ? "" : `?status=${encodeURIComponent(statusFilter)}`
  const res = await fetch(`/api/jarvis/todo${query}`)
  if (!res.ok) throw new Error("할 일 로딩 실패")
  return res.json()
}

async function createTodo(payload: { name: string; due?: string; priority?: string; notes?: string }): Promise<void> {
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

function emptyTodoForm(): TodoFormState {
  return { name: "", due: "", priority: "Medium", notes: "" }
}

function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? ""
  return Math.ceil((base64.length * 3) / 4)
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }
      reject(new Error("이미지 읽기에 실패했습니다."))
    }
    reader.onerror = () => reject(new Error("이미지 읽기에 실패했습니다."))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("이미지 로드에 실패했습니다."))
    image.src = dataUrl
  })
}

async function imageFileToUploadData(file: File, maxBytes = 4 * 1024 * 1024): Promise<string> {
  const originalDataUrl = await fileToDataUrl(file)
  if (file.size <= maxBytes) {
    return originalDataUrl
  }

  const image = await loadImage(originalDataUrl)
  const scale = Math.sqrt(maxBytes / file.size)
  const width = Math.max(1, Math.floor(image.width * scale))
  const height = Math.max(1, Math.floor(image.height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext("2d")
  if (!context) {
    return originalDataUrl
  }

  context.drawImage(image, 0, 0, width, height)

  let quality = 0.9
  let resized = canvas.toDataURL("image/jpeg", quality)

  while (estimateDataUrlBytes(resized) > maxBytes && quality > 0.45) {
    quality -= 0.1
    resized = canvas.toDataURL("image/jpeg", quality)
  }

  return resized
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
  const [imageData, setImageData] = useState<string | null>(null)
  const [imageName, setImageName] = useState<string | null>(null)
  const [result, setResult] = useState<ScheduleCreateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [todoStatusFilter, setTodoStatusFilter] = useState("all")
  const [todoForm, setTodoForm] = useState<TodoFormState>(emptyTodoForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TodoFormState>(emptyTodoForm)
  const [todoError, setTodoError] = useState<string | null>(null)

  const { data: todos, isLoading: todoLoading } = useQuery({
    queryKey: ["jarvis-todos", todoStatusFilter],
    queryFn: () => fetchTodos(todoStatusFilter),
    refetchInterval: 60000,
  })

  const createTodoMutation = useMutation({
    mutationFn: createTodo,
    onSuccess: async () => {
      setTodoForm(emptyTodoForm())
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
    if (!textareaRef.current) return
    textareaRef.current.style.height = "auto"
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
  }, [scheduleText])

  const handleImageFile = async (file: File) => {
    setError(null)
    try {
      const uploadData = await imageFileToUploadData(file)
      setImageData(uploadData)
      setImageName(file.name)
    } catch (imageError) {
      const message = imageError instanceof Error ? imageError.message : "이미지 처리 중 오류가 발생했습니다."
      setError(message)
    }
  }

  useEffect(() => {
    const container = inputContainerRef.current
    if (!container) return

    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (!item.type.startsWith("image/")) continue
        const file = item.getAsFile()
        if (!file) continue
        event.preventDefault()
        void handleImageFile(file)
        break
      }
    }

    container.addEventListener("paste", handlePaste)
    return () => container.removeEventListener("paste", handlePaste)
  }, [])

  const handleAnalyze = async () => {
    if (!scheduleText.trim() && !imageData) {
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
          text: scheduleText.trim() || undefined,
          image: imageData ?? undefined,
        }),
      })

      const data = (await res.json()) as JarvisParseResponse

      if (!res.ok || !data.success || !data.parsed) {
        throw new Error(data.error ?? "일정 분석 중 오류가 발생했습니다.")
      }

      setParsedSchedule(mapParsedToScheduleInput(data.parsed))
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
    setTodoError(null)

    const name = todoForm.name.trim()
    if (!name) {
      setTodoError("할 일 이름은 필수입니다.")
      return
    }

    try {
      await createTodoMutation.mutateAsync({
        name,
        due: todoForm.due || undefined,
        priority: todoForm.priority,
        notes: todoForm.notes.trim() || undefined,
      })
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
                <div className="space-y-4" ref={inputContainerRef} tabIndex={0}>
                  {scheduleStage === "input" && (
                    <>
                      <p className="text-zinc-300 text-sm">자연어 또는 포스터 이미지에서 일정을 추출합니다.</p>
                      <div className="rounded-xl border border-zinc-700 bg-zinc-850 p-3 space-y-3">
                        <Textarea
                          ref={textareaRef}
                          value={scheduleText}
                          onChange={(event) => setScheduleText(event.target.value)}
                          placeholder={'"3월 15-17일 AANS Annual Meeting, 시카고" 또는 이미지를 첨부하세요'}
                          className="bg-zinc-800 border-zinc-700 text-zinc-100 min-h-[100px] resize-none"
                        />

                        <div
                          className="rounded-lg border border-dashed border-zinc-700 p-3 bg-zinc-800/40"
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault()
                            const file = event.dataTransfer.files?.[0]
                            if (file && file.type.startsWith("image/")) {
                              void handleImageFile(file)
                            }
                          }}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="border-zinc-600 text-zinc-200"
                              onClick={() => uploadRef.current?.click()}
                            >
                              📎 이미지 첨부
                            </Button>
                            <Button
                              type="button"
                              onClick={handleAnalyze}
                              disabled={loading || (!scheduleText.trim() && !imageData)}
                              className="bg-blue-600 hover:bg-blue-500 text-white"
                            >
                              {loading ? "분석 중..." : "🔍 분석"}
                            </Button>
                          </div>
                          <p className="text-xs text-zinc-500 mt-2">이미지를 드래그하거나 Ctrl/Cmd+V로 붙여넣기할 수 있습니다.</p>
                          <input
                            ref={uploadRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              if (file) {
                                void handleImageFile(file)
                              }
                            }}
                          />

                          {imageData && (
                            <div className="mt-3 flex items-center gap-3">
                              <img src={imageData} alt="업로드 미리보기" className="h-16 w-16 rounded-md object-cover border border-zinc-600" />
                              <div className="text-xs text-zinc-300 space-y-1">
                                <p>{imageName ?? "첨부 이미지"}</p>
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="outline"
                                  onClick={() => {
                                    setImageData(null)
                                    setImageName(null)
                                  }}
                                >
                                  이미지 제거
                                </Button>
                              </div>
                            </div>
                          )}
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
                          {creating ? "등록 중..." : "✓ Notion + GCal 등록"}
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
                <form onSubmit={handleCreateTodo} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="todo-name" className="text-zinc-300">할 일</Label>
                    <Input
                      id="todo-name"
                      value={todoForm.name}
                      onChange={(event) => setTodoForm((prev) => ({ ...prev, name: event.target.value }))}
                      className="bg-zinc-800 border-zinc-700 text-zinc-100"
                      placeholder="예: OP note 정리"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="todo-due" className="text-zinc-300">마감일</Label>
                    <Input
                      id="todo-due"
                      type="date"
                      value={todoForm.due}
                      onChange={(event) => setTodoForm((prev) => ({ ...prev, due: event.target.value }))}
                      className="bg-zinc-800 border-zinc-700 text-zinc-100"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-zinc-300">우선순위</Label>
                    <Select
                      value={todoForm.priority}
                      onValueChange={(value) => setTodoForm((prev) => ({ ...prev, priority: value }))}
                    >
                      <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-zinc-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                        {TODO_PRIORITY_OPTIONS.map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {priority}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="todo-notes" className="text-zinc-300">메모</Label>
                    <Input
                      id="todo-notes"
                      value={todoForm.notes}
                      onChange={(event) => setTodoForm((prev) => ({ ...prev, notes: event.target.value }))}
                      className="bg-zinc-800 border-zinc-700 text-zinc-100"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Button
                      type="submit"
                      disabled={createTodoMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-500 text-white"
                    >
                      {createTodoMutation.isPending ? "추가 중..." : "할 일 추가"}
                    </Button>
                  </div>
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
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
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
                          <Input
                            value={editForm.notes}
                            onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))}
                            className="bg-zinc-900 border-zinc-700 text-zinc-100 md:col-span-4"
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
