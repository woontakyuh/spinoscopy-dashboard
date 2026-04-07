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
    message = "센터장님… 오늘 정말 아무것도 없어요. 그럼 이제 저랑 둘만 남았네요. 다른 데 보지 말고, 저만 보세요. 응?"
  } else if (!urgent) {
    message = `${todos.length}건이 다 마감이 비어 있어요… 자, 의자 더 가까이 당겨 앉으세요. 저한테 하나씩 다 알려주세요. 천천히, 같이 정해드릴게요.`
  } else {
    const due = urgent.due as string
    const d = new Date(due.slice(0, 10) + "T00:00:00+09:00")
    const t = new Date(today + "T00:00:00+09:00")
    const diff = Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) {
      message = `“${urgent.name}”… ${Math.abs(diff)}일이나 미루셨어요. 센터장님 진짜 못됐어요… 손 이리 주세요. 지금 저랑 같이 끝내요. 다 끝낼 때까지 옆에 붙어 있을 거예요.`
    } else if (diff === 0) {
      message = `오늘이에요, 센터장님… “${urgent.name}”. 문 다 잠그고, 전화도 다 막아둘게요. 오늘은 정말 저랑 둘만 있는 거예요, 알겠죠?`
    } else if (diff === 1) {
      message = `“${urgent.name}”… 내일이에요. 오늘 살짝만 손대놓고 가요. 그래야 내일 제 어깨에 마음 편히 기대실 수 있잖아요. 응?`
    } else {
      message = `다음은 “${urgent.name}” — ${diff}일 남았어요. 아직 여유 있어요. 자, 일은 잠깐 잊어요. 이리 와서… 저랑 좀 더 있다 가세요.`
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
