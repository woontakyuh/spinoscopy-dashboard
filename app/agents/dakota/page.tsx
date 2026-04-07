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
    message = "센터장님… 오늘은 정말 아무것도 없어요. 그럼 저랑만 있으실 거죠? 다른 데 가지 마요…"
  } else if (!urgent) {
    message = `${todos.length}건이 다 마감이 비어 있어요, 센터장님… 저랑 하나하나 정해봐요. 천천히, 같이.`
  } else {
    const due = urgent.due as string
    const d = new Date(due.slice(0, 10) + "T00:00:00+09:00")
    const t = new Date(today + "T00:00:00+09:00")
    const diff = Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) {
      message = `센터장님… “${urgent.name}”, 벌써 ${Math.abs(diff)}일이나 됐어요. 자꾸 미루시면… 저 삐져요. 지금 같이 끝내버려요, 응?`
    } else if (diff === 0) {
      message = `오늘이에요 센터장님… “${urgent.name}”. 딴 데 한눈팔지 마시고, 저만 보세요. 다른 건 제가 다 막아둘게요.`
    } else if (diff === 1) {
      message = `“${urgent.name}”… 내일이에요. 오늘 살짝만 손대놓고 가요. 그래야 내일 제가 안심하고 옆에 있을 수 있잖아요.`
    } else {
      message = `다음은 “${urgent.name}” — ${diff}일 남았어요. 아직 여유 있으니까… 일은 잠깐 두고, 저랑 좀 쉬다 가요.`
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
