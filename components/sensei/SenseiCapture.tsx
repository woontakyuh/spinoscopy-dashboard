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

export function SenseiCapture() {
  const queryClient = useQueryClient()
  const [rawInput, setRawInput] = useState("")
  const [lastSaved, setLastSaved] = useState<CreateSenseiResult | null>(null)

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
        body: JSON.stringify({ rawInput }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "저장 실패" }))
        throw new Error(body.error ?? "저장 실패")
      }
      return res.json() as Promise<CreateSenseiResult>
    },
    onSuccess: (result) => {
      setLastSaved(result)
      setRawInput("")
      queryClient.invalidateQueries({ queryKey: ["sensei-entries"] })
    },
  })

  return (
    <div className="space-y-4">
      <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900 space-y-3">
        <p className="text-zinc-300 text-sm font-medium">오늘 수련 메모 입력</p>
        <textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder="예) 오늘 라펠가드 드릴, 스파링에서 롱스텝 카운터가 잘 안됨. 조준용 관장님 디테일 정리 필요"
          className="w-full min-h-36 rounded-lg border border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 p-3 text-sm outline-none focus:ring-2 focus:ring-orange-500"
        />
        {createMutation.isError && (
          <p className="text-red-400 text-sm">오류: {createMutation.error.message}</p>
        )}
        <Button
          type="button"
          className="w-full bg-orange-600 hover:bg-orange-500 text-white"
          disabled={createMutation.isPending || !rawInput.trim()}
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
