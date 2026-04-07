"use client"

import { useQuery } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { AgentGreeter } from "@/components/layout/AgentGreeter"
import { PresentationList } from "@/components/dakota/PresentationList"
import { TodoHistory } from "@/components/dakota/TodoHistory"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

interface TodoItem { name: string; due: string | null; status: string; priority: string }

function relativeDueLabel(due: string, today: string): string {
  const d = new Date(due.slice(0, 10) + "T00:00:00+09:00")
  const t = new Date(today + "T00:00:00+09:00")
  const diff = Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return `${Math.abs(diff)}일 지남`
  if (diff === 0) return "오늘 마감"
  if (diff === 1) return "내일 마감"
  return `D-${diff}`
}

export default function DakotaPage() {
  const { data, isLoading } = useQuery<TodoItem[]>({
    queryKey: ["dakota-todos"],
    queryFn: async () => {
      const res = await fetch("/api/dakota/todo?status=active")
      if (!res.ok) throw new Error("할 일 조회 실패")
      return res.json()
    },
  })

  const todos = data ?? []
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })

  // 우선순위 가중치 + 마감일 기준으로 정렬해 가장 급한 1건 선택
  const PRIO: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
  const withDue = todos.filter((t) => t.due)
  const urgent = withDue
    .slice()
    .sort((a, b) => {
      const da = (a.due ?? "").slice(0, 10)
      const db = (b.due ?? "").slice(0, 10)
      if (da !== db) return da.localeCompare(db)
      return (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9)
    })[0]

  let message: string
  if (todos.length === 0) {
    message = "센터장님… 오늘은 할 일이 깨끗해요. 잠깐 한숨 돌리세요. 저랑 같이요."
  } else if (!urgent) {
    message = `할 일이 ${todos.length}건 있는데 마감이 다 비어 있네요… 저랑 차근차근 같이 정해봐요.`
  } else {
    const due = urgent.due as string
    const d = new Date(due.slice(0, 10) + "T00:00:00+09:00")
    const t = new Date(today + "T00:00:00+09:00")
    const diff = Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) {
      message = `센터장님… “${urgent.name}”, 벌써 ${Math.abs(diff)}일이나 됐어요. 이건 저랑 같이 얼른 끝내버려요, 응?`
    } else if (diff === 0) {
      message = `오늘이에요, 센터장님… “${urgent.name}”. 다른 건 잠깐 다 막아둘 테니까, 이거에만 집중하세요.`
    } else if (diff === 1) {
      message = `“${urgent.name}”… 내일까지예요. 오늘 살짝만 손대두면 내일 마음이 한결 편하실 거예요.`
    } else {
      message = `다음은 “${urgent.name}” — ${diff}일 남았어요. 아직 여유 있으니까… 저랑 천천히 준비해봐요.`
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="" />
      <div className="p-3 md:p-6 max-w-6xl w-full">
        <AgentGreeter image="/dakota.png" name="Dakota" message={message} loading={isLoading} />
        <Tabs defaultValue="history">
          <TabsList className="mb-4">
            <TabsTrigger value="history">Todo List</TabsTrigger>
            <TabsTrigger value="presentations">발표 관리</TabsTrigger>
          </TabsList>
          <TabsContent value="history">
            <TodoHistory />
          </TabsContent>
          <TabsContent value="presentations">
            <div className="border border-border rounded-xl p-4 bg-card mb-6">
              <p className="text-muted-foreground text-sm">
                학회·컨퍼런스 일정을 한 눈에 확인하세요.
              </p>
            </div>
            <PresentationList />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
