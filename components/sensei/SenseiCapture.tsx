"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { SenseiEntry, StructuredBjjNote } from "@/lib/types/sensei"

interface CreateSenseiResult {
  success: boolean
  pageId: string
  structured: StructuredBjjNote
}

function todayIso() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

export function SenseiCapture() {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayIso)
  const [classInput, setClassInput] = useState("")
  const [sparringInput, setSparringInput] = useState("")
  const [lastSaved, setLastSaved] = useState<CreateSenseiResult | null>(null)

  const hasInput = classInput.trim() || sparringInput.trim()

  const entriesQuery = useQuery({
    queryKey: ["sensei-entries"],
    queryFn: async () => {
      const res = await fetch("/api/notion/sensei")
      if (!res.ok) throw new Error("수련 기록 조회 실패")
      return res.json() as Promise<SenseiEntry[]>
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notion/sensei", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classInput, sparringInput, date }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "저장 실패" }))
        throw new Error(body.error ?? "저장 실패")
      }
      return res.json() as Promise<CreateSenseiResult>
    },
    onSuccess: (result) => {
      setLastSaved(result)
      setClassInput("")
      setSparringInput("")
      queryClient.invalidateQueries({ queryKey: ["sensei-entries"] })
    },
  })

  return (
    <div className="space-y-4">
      <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900 space-y-4">
        <div className="flex items-center gap-3">
          <label htmlFor="sensei-date" className="text-zinc-300 text-sm font-medium shrink-0">
            수련일
          </label>
          <input
            id="sensei-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-800 text-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark]"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            <label htmlFor="sensei-class" className="text-zinc-300 text-sm font-medium">수업</label>
          </div>
          <textarea
            id="sensei-class"
            value={classInput}
            onChange={(e) => setClassInput(e.target.value)}
            placeholder="오늘 수업 내용 (드릴, 테크닉 등)"
            className="w-full min-h-24 rounded-lg border border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 p-3 text-sm outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <label htmlFor="sensei-sparring" className="text-zinc-300 text-sm font-medium">스파링</label>
          </div>
          <textarea
            id="sensei-sparring"
            value={sparringInput}
            onChange={(e) => setSparringInput(e.target.value)}
            placeholder="스파링 메모 (상대, 잘된 점, 개선 포인트 등)"
            className="w-full min-h-24 rounded-lg border border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {createMutation.isError && (
          <p className="text-red-400 text-sm">오류: {createMutation.error.message}</p>
        )}

        <Button
          type="button"
          className="w-full bg-orange-600 hover:bg-orange-500 text-white"
          disabled={createMutation.isPending || !hasInput}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending ? "정리 중..." : "Sensei로 정리 후 Notion 저장"}
        </Button>

        {lastSaved && (
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-green-400 text-xs">저장 완료</p>
              <a
                href={`https://www.notion.so/${lastSaved.pageId.replace(/-/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="text-blue-300 text-xs hover:underline"
              >
                Notion 열기
              </a>
            </div>
            <p className="text-white text-sm font-medium">{lastSaved.structured.title}</p>
            <div className="flex flex-wrap gap-1">
              <Badge
                variant="outline"
                className={`text-[10px] ${lastSaved.structured.sessionType === "openmat" ? "border-green-500/40 text-green-300" : "border-purple-500/40 text-purple-300"}`}
              >
                {lastSaved.structured.sessionType === "openmat" ? "Open Mat" : "Class"}
              </Badge>
              <Badge variant="outline" className="text-[10px] border-zinc-600 text-zinc-300">
                {lastSaved.structured.date}
              </Badge>
              <Badge variant="outline" className="text-[10px] border-zinc-600 text-zinc-300">
                {lastSaved.structured.instructor}
              </Badge>
              <Badge variant="outline" className="text-[10px] border-zinc-600 text-zinc-300">
                {lastSaved.structured.gym}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1">
              {lastSaved.structured.classTags.map((tag) => (
                <Badge key={`preview-class-${tag}`} variant="outline" className="text-[10px] border-orange-500/40 text-orange-300">
                  Class: {tag}
                </Badge>
              ))}
              {lastSaved.structured.sparringTags.map((tag) => (
                <Badge key={`preview-spar-${tag}`} variant="outline" className="text-[10px] border-blue-500/40 text-blue-300">
                  Sparring: {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900 space-y-3">
        <p className="text-zinc-300 text-sm font-medium">최근 수련 기록</p>
        {entriesQuery.isLoading ? (
          <p className="text-zinc-500 text-sm">불러오는 중...</p>
        ) : entriesQuery.isError ? (
          <p className="text-red-400 text-sm">오류: {(entriesQuery.error as Error).message}</p>
        ) : (entriesQuery.data ?? []).length === 0 ? (
          <p className="text-zinc-500 text-sm">기록이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {(entriesQuery.data ?? []).map((entry) => (
              <div key={entry.id} className="border border-zinc-700 rounded-lg p-3 bg-zinc-800/50 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-white text-sm font-medium">{entry.title}</p>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${entry.sessionType === "openmat" ? "border-green-500/40 text-green-300" : "border-purple-500/40 text-purple-300"}`}
                  >
                    {entry.sessionType === "openmat" ? "Open Mat" : "Class"}
                  </Badge>
                  {entry.date && <Badge variant="outline" className="text-[10px] border-zinc-600 text-zinc-300">{entry.date}</Badge>}
                  {entry.instructor && <Badge variant="outline" className="text-[10px] border-zinc-600 text-zinc-300">{entry.instructor}</Badge>}
                </div>

                <div className="flex flex-wrap gap-1">
                  {entry.classTags.map((tag) => (
                    <Badge key={`class-${entry.id}-${tag}`} variant="outline" className="text-[10px] border-orange-500/40 text-orange-300">
                      Class: {tag}
                    </Badge>
                  ))}
                  {entry.sparringTags.map((tag) => (
                    <Badge key={`spar-${entry.id}-${tag}`} variant="outline" className="text-[10px] border-blue-500/40 text-blue-300">
                      Sparring: {tag}
                    </Badge>
                  ))}
                </div>

                {entry.note && <p className="text-zinc-300 text-xs whitespace-pre-wrap">{entry.note}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
