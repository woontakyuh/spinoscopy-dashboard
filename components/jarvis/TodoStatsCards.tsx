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
