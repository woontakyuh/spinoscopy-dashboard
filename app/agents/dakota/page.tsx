"use client"

import { useQuery } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { AgentGreeter } from "@/components/layout/AgentGreeter"
import { PresentationList } from "@/components/dakota/PresentationList"
import { TodoHistory } from "@/components/dakota/TodoHistory"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

interface TodoItem { due: string | null; status: string }

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
  const dueToday = todos.filter((t) => t.due && t.due.slice(0, 10) === today).length
  const overdue = todos.filter((t) => t.due && t.due.slice(0, 10) < today).length

  let message: string
  if (todos.length === 0) {
    message = "오늘 할 일이 비어있어요. 여유 있는 하루 보내세요."
  } else if (overdue > 0) {
    message = `오늘 할 일 ${dueToday}건, 밀린 항목 ${overdue}건이 있어요. 우선 처리하시죠.`
  } else {
    message = `오늘 처리할 항목 ${dueToday}건. 함께 정리해드릴게요.`
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Dakota" icon="/dakota.png" />
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
