# Todo Enhancement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 할일 시스템에 우선순위 조정 UI, 카테고리 UI, 할일 트래킹 페이지를 추가한다.

**Architecture:** 기존 Notion DB + API route 인프라 위에 UI를 확장한다. TodayTodo 위젯에 우선순위/카테고리 드롭다운을 추가하고, Jarvis 페이지에 할일 히스토리 탭을 추가한다. Notion DB에 `Completed At` 속성을 추가하여 완료 시점을 기록한다.

**Tech Stack:** Next.js 16, React 19, Notion API, shadcn (DropdownMenu, Table, Tabs, Badge), React Query, Vitest

**Spec:** `docs/superpowers/specs/2026-03-17-todo-enhancement-design.md`

---

## File Structure

```
components/ui/dropdown-menu.tsx          — shadcn 설치 (신규)
lib/notion/todo.ts                       — Notion 통합 수정 (completed_at, created_at)
app/api/jarvis/todo/route.ts             — API route 수정 (Done 처리 시 Completed At)
components/dashboard/TodayTodo.tsx       — 우선순위/카테고리 UI 추가
components/jarvis/TodoHistory.tsx         — 할일 히스토리 탭 (신규)
components/jarvis/TodoStatsCards.tsx      — 요약 통계 카드 (신규)
app/agents/jarvis/page.tsx               — Tabs 추가 (발표 관리 | 할일 히스토리)
```

---

## Task 0: Notion DB 속성 추가 + 의존성 설치

**Files:** `package.json`, `components/ui/dropdown-menu.tsx`

- [ ] **Step 0: Notion DB에 Completed At 속성 추가 (코드 변경 전에 먼저!)**

Notion API로 속성 추가:

```bash
curl -X PATCH "https://api.notion.com/v1/databases/$(grep NOTION_TODO_DB_ID .env.local | cut -d= -f2)" \
  -H "Authorization: Bearer $(grep NOTION_TOKEN .env.local | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d '{"properties": {"Completed At": {"date": {}}}}'
```

Expected: 200 OK

- [ ] **Step 1: shadcn DropdownMenu 설치**

```bash
npx shadcn@latest add dropdown-menu
```

Expected: `components/ui/dropdown-menu.tsx` 생성됨

- [ ] **Step 2: 설치 확인**

```bash
ls components/ui/dropdown-menu.tsx
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json components/ui/dropdown-menu.tsx
git commit -m "chore: add dropdown-menu component for todo enhancement"
```

---

## Task 1: Notion 통합 수정 — completed_at, created_at 지원

**Files:**
- Modify: `lib/notion/todo.ts`

- [ ] **Step 1: NotionPage 인터페이스에 created_time 추가**

`lib/notion/todo.ts`의 `NotionPage` 인터페이스 수정 (line 13-18):

```typescript
// 기존
interface NotionPage {
  id: string
  url: string
  archived?: boolean
  properties: Record<string, NotionProperty>
}

// 변경
interface NotionPage {
  id: string
  url: string
  archived?: boolean
  created_time: string
  properties: Record<string, NotionProperty>
}
```

- [ ] **Step 2: TodoItem 인터페이스에 completed_at, created_at 추가**

`lib/notion/todo.ts`의 `TodoItem` 인터페이스 수정 (line 37-46):

```typescript
// 기존
export interface TodoItem {
  page_id: string
  name: string
  due: string | null
  status: string
  priority: string
  category: string
  notes: string
  url: string
}

// 변경
export interface TodoItem {
  page_id: string
  name: string
  due: string | null
  status: string
  priority: string
  category: string
  notes: string
  url: string
  created_at: string
  completed_at: string | null
}
```

- [ ] **Step 3: toTodoItem()에 created_at, completed_at 매핑 추가**

`lib/notion/todo.ts`의 `toTodoItem` 함수 수정 (line 79-91):

```typescript
// 기존
function toTodoItem(page: NotionPage): TodoItem {
  const properties = page.properties
  return {
    page_id: page.id,
    name: getText(properties.Name),
    due: properties.Due?.date?.start ?? null,
    status: properties.Status?.select?.name ?? "To Do",
    priority: properties.Priority?.select?.name ?? "Medium",
    category: properties.Category?.select?.name ?? "일상업무",
    notes: getText(properties.Notes),
    url: page.url,
  }
}

// 변경
function toTodoItem(page: NotionPage): TodoItem {
  const properties = page.properties
  return {
    page_id: page.id,
    name: getText(properties.Name),
    due: properties.Due?.date?.start ?? null,
    status: properties.Status?.select?.name ?? "To Do",
    priority: properties.Priority?.select?.name ?? "Medium",
    category: properties.Category?.select?.name ?? "일상업무",
    notes: getText(properties.Notes),
    url: page.url,
    created_at: page.created_time.slice(0, 10),
    completed_at: properties["Completed At"]?.date?.start ?? null,
  }
}
```

- [ ] **Step 4: updateTodo()에 Done 처리 시 Completed At 자동 세팅 추가**

`lib/notion/todo.ts`의 `updateTodo` 함수 (line 234-283)에서 status 처리 부분 뒤에 추가:

```typescript
// updateTodo() 함수 내, status 처리 블록 뒤에 추가:
  // Done 처리 시 Completed At 자동 기록
  if (updates.status === "Done") {
    properties["Completed At"] = {
      date: { start: getTodayInSeoul() },
    }
  }
```

구체적으로, 기존 코드:
```typescript
  if (updates.status !== undefined) {
    properties.Status = {
      select: { name: updates.status },
    }
  }
```

변경:
```typescript
  if (updates.status !== undefined) {
    properties.Status = {
      select: { name: updates.status },
    }
    // Done 처리 시 Completed At 자동 기록
    if (updates.status === "Done") {
      properties["Completed At"] = {
        date: { start: getTodayInSeoul() },
      }
    }
  }
```

- [ ] **Step 5: TodoQueryOptions에 completedFromDate 옵션 추가**

`lib/notion/todo.ts`의 `TodoQueryOptions` 인터페이스 (line 66-70):

```typescript
// 기존
interface TodoQueryOptions {
  status?: string
  fromDate?: string
  excludeDone?: boolean
}

// 변경
interface TodoQueryOptions {
  status?: string
  fromDate?: string
  completedFromDate?: string
  excludeDone?: boolean
}
```

`buildQueryFilter` 함수에 `completedFromDate` 필터 추가:

```typescript
// 기존 fromDate 필터 뒤에 추가
  if (options.completedFromDate) {
    filters.push({ property: "Completed At", date: { on_or_after: options.completedFromDate } })
  }
```

- [ ] **Step 6: getAllTodos에 completedFromDate 지원 + Done 히스토리 정렬 추가**

`lib/notion/todo.ts`의 `getAllTodos` 함수에서 status가 "Done"일 때 정렬을 `Completed At` 내림차순으로 변경:

```typescript
// 기존
export async function getAllTodos(options: TodoQueryOptions = {}): Promise<TodoItem[]> {
  const dbId = getTodoDbId()
  const filter = buildQueryFilter(options)

  const response = await notionRequest<NotionQueryResponse>(`/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({
      filter,
      sorts: [
        { property: "Due", direction: "ascending" },
        { timestamp: "last_edited_time", direction: "descending" },
      ],
      page_size: 100,
    }),
  })

  return response.results.map(toTodoItem)
}

// 변경
export async function getAllTodos(options: TodoQueryOptions = {}): Promise<TodoItem[]> {
  const dbId = getTodoDbId()
  const filter = buildQueryFilter(options)

  const sorts = options.status === "Done"
    ? [{ property: "Completed At", direction: "descending" as const }]
    : [
        { property: "Due", direction: "ascending" as const },
        { timestamp: "last_edited_time" as const, direction: "descending" as const },
      ]

  const response = await notionRequest<NotionQueryResponse>(`/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({ filter, sorts, page_size: 100 }),
  })

  return response.results.map(toTodoItem)
}
```

- [ ] **Step 7: API route에서 completedFromDate 파라미터 전달**

`app/api/jarvis/todo/route.ts`의 GET 함수에서 `from_date`를 `completedFromDate`로 전달 (Done 조회 시):

```typescript
// 기존 (line 25-29)
    const todos = await getAllTodos({
      status: status || undefined,
      fromDate: fromDate || undefined,
      excludeDone: !status,
    })

// 변경
    const todos = await getAllTodos({
      status: status || undefined,
      fromDate: status !== "Done" ? (fromDate || undefined) : undefined,
      completedFromDate: status === "Done" ? (fromDate || undefined) : undefined,
      excludeDone: !status,
    })
```

- [ ] **Step 8: Commit**

```bash
git add lib/notion/todo.ts app/api/jarvis/todo/route.ts
git commit -m "feat(todo): add completed_at/created_at support + history query filters"
```

---

## Task 2: TodayTodo 위젯 — 우선순위 조정 + 카테고리 표시

**Files:**
- Modify: `components/dashboard/TodayTodo.tsx`

- [ ] **Step 1: TodoItem 인터페이스에 category 추가**

```typescript
// 기존 (line 10-18)
interface TodoItem {
  page_id: string
  name: string
  due: string | null
  status: string
  priority: string
  notes: string
  url: string
}

// 변경
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
```

- [ ] **Step 2: patchTodo 시그니처 확장**

```typescript
// 기존 (line 30)
async function patchTodo(payload: { page_id: string; status?: string }): Promise<void> {

// 변경
async function patchTodo(payload: { page_id: string; status?: string; priority?: string; category?: string }): Promise<void> {
```

- [ ] **Step 3: 카테고리 색상 매핑 함수 추가**

`priorityBadgeClass` 함수 뒤에 추가:

```typescript
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
```

- [ ] **Step 4: import에 DropdownMenu 추가**

```typescript
// 기존 imports 뒤에 추가
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
```

- [ ] **Step 5: 우선순위 변경 mutation 추가**

`completeMutation` 뒤에 추가:

```typescript
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
```

- [ ] **Step 6: 빠른 추가 폼에 우선순위/카테고리 state 추가**

기존 state 선언 뒤에 추가:

```typescript
  const [quickPriority, setQuickPriority] = useState<string>("Medium")
  const [quickCategory, setQuickCategory] = useState<string>("일상업무")
```

- [ ] **Step 7: createQuickTodo 함수를 우선순위/카테고리 지원하도록 수정**

```typescript
// 기존 (line 43-59)
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
  ...
}

// 변경 — 함수를 컴포넌트 외부에서 파라미터를 받도록 수정
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
```

- [ ] **Step 8: createMutation과 handleQuickAdd 업데이트**

```typescript
  // createMutation 변경
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

  // handleQuickAdd 변경 — mutateAsync 호출 시 params 전달
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
```

- [ ] **Step 9: 할일 항목 렌더링에 우선순위 드롭다운 + 카테고리 뱃지 추가**

기존 뱃지 영역 (line 193-205):
```tsx
                  <div className="mt-1 flex items-center gap-2">
                    {isDone ? (
                      <span className="text-xs text-green-400">완료</span>
                    ) : (
                      <>
                        <Badge variant="outline" className={priorityBadgeClass(todo.priority)}>
                          {todo.priority}
                        </Badge>
                        {todo.due && todo.due.slice(0, 10) !== today && (
                          <span className="text-xs text-zinc-500">Due {todo.due.slice(0, 10)}</span>
                        )}
                      </>
                    )}
                  </div>
```

변경:
```tsx
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
                        <Badge variant="outline" className={categoryBadgeClass(todo.category)}>
                          {todo.category}
                        </Badge>
                        {todo.due && todo.due.slice(0, 10) !== today && (
                          <span className="text-xs text-zinc-500">Due {todo.due.slice(0, 10)}</span>
                        )}
                      </>
                    )}
                  </div>
```

- [ ] **Step 10: 빠른 추가 폼에 우선순위/카테고리 선택 추가**

기존 form (line 214-230):
```tsx
      <form onSubmit={handleQuickAdd} className="mt-4 flex gap-2">
        <Input ... />
        <Button ...>추가</Button>
      </form>
```

변경:
```tsx
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
```

- [ ] **Step 11: 빌드 확인**

```bash
npm run build
```

Expected: 빌드 성공

- [ ] **Step 12: Commit**

```bash
git add components/dashboard/TodayTodo.tsx
git commit -m "feat(todo): add priority dropdown + category badge to TodayTodo widget"
```

---

## Task 3: TodoStatsCards 컴포넌트

**Files:**
- Create: `components/jarvis/TodoStatsCards.tsx`

- [ ] **Step 1: TodoStatsCards 작성**

```tsx
// components/jarvis/TodoStatsCards.tsx
import type { TodoItem } from "@/lib/notion/todo"

interface TodoStatsCardsProps {
  todos: TodoItem[]
}

export function TodoStatsCards({ todos }: TodoStatsCardsProps) {
  const totalCompleted = todos.length

  // 평균 처리 시간 (일)
  const durations = todos
    .filter((t) => t.created_at && t.completed_at)
    .map((t) => {
      const created = new Date(t.created_at)
      const completed = new Date(t.completed_at!)
      return Math.max(0, Math.round((completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)))
    })
  const avgDays = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0

  // 카테고리별 완료 수
  const categoryCount = new Map<string, number>()
  for (const todo of todos) {
    const cat = todo.category || "일상업무"
    categoryCount.set(cat, (categoryCount.get(cat) ?? 0) + 1)
  }
  const topCategory = categoryCount.size > 0
    ? Array.from(categoryCount.entries()).sort((a, b) => b[1] - a[1])[0]
    : null

  const cards = [
    { label: "완료 수", value: `${totalCompleted}건` },
    { label: "평균 처리 시간", value: durations.length > 0 ? `${avgDays}일` : "-" },
    { label: "최다 카테고리", value: topCategory ? `${topCategory[0]} (${topCategory[1]}건)` : "-" },
  ]

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-center">
          <div className="text-lg font-semibold text-zinc-100">{card.value}</div>
          <div className="text-xs text-zinc-500 mt-1">{card.label}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/jarvis/TodoStatsCards.tsx
git commit -m "feat(todo): add TodoStatsCards component for history statistics"
```

---

## Task 4: TodoHistory 컴포넌트

**Files:**
- Create: `components/jarvis/TodoHistory.tsx`

- [ ] **Step 1: TodoHistory 작성**

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add components/jarvis/TodoHistory.tsx
git commit -m "feat(todo): add TodoHistory component with table and stats"
```

---

## Task 5: Jarvis 페이지에 Tabs 추가

**Files:**
- Modify: `app/agents/jarvis/page.tsx`

- [ ] **Step 1: Jarvis 페이지를 Tabs 구조로 수정**

```tsx
// app/agents/jarvis/page.tsx — 전체 교체
"use client"

import { TopBar } from "@/components/layout/TopBar"
import { PresentationList } from "@/components/jarvis/PresentationList"
import { TodoHistory } from "@/components/jarvis/TodoHistory"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

export default function JarvisPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="📋 Jarvis" />
      <div className="p-3 md:p-6 max-w-4xl w-full">
        <Tabs defaultValue="presentations">
          <TabsList className="mb-4">
            <TabsTrigger value="presentations">발표 관리</TabsTrigger>
            <TabsTrigger value="history">할일 히스토리</TabsTrigger>
          </TabsList>
          <TabsContent value="presentations">
            <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900 mb-6">
              <p className="text-zinc-400 text-sm">
                학회·컨퍼런스 일정을 한 눈에 확인하세요.
              </p>
            </div>
            <PresentationList />
          </TabsContent>
          <TabsContent value="history">
            <TodoHistory />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: 빌드 성공

- [ ] **Step 3: Commit**

```bash
git add app/agents/jarvis/page.tsx
git commit -m "feat(todo): add todo history tab to Jarvis page"
```

---

## Task 6: 전체 테스트 + 최종 확인

- [ ] **Step 1: 전체 테스트 실행**

```bash
npm run test
```

Expected: 기존 테스트 모두 PASS (새 코드에 대한 테스트는 기존 패턴상 API/타입 테스트만)

- [ ] **Step 3: 최종 빌드 확인**

```bash
npm run build
```

Expected: 빌드 성공

- [ ] **Step 4: 최종 Commit**

```bash
git add -A
git commit -m "feat(todo): complete todo enhancement - priority, category, history tracking"
```
