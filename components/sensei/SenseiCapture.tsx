"use client"

import { useState, useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { SenseiEntry, StructuredBjjNote } from "@/lib/types/sensei"

interface CreateSenseiResult {
  success: boolean
  pageId: string
  structured: StructuredBjjNote
  appended?: boolean
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

interface SenseiCaptureProps {
  selectedDate?: string | null
}

export function SenseiCapture({ selectedDate }: SenseiCaptureProps) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayIso)

  useEffect(() => {
    if (selectedDate) setDate(selectedDate)
  }, [selectedDate])

  const [instructor, setInstructor] = useState("조준용")
  const [classInput, setClassInput] = useState("")
  const [sparringInput, setSparringInput] = useState("")

  // Study track state
  const [studyInput, setStudyInput] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
  const [videoTitle, setVideoTitle] = useState("")
  const [todayFocus, setTodayFocus] = useState("")
  const [focusApplied, setFocusApplied] = useState(false)
  const [studyOpen, setStudyOpen] = useState(true)

  const [lastSaved, setLastSaved] = useState<CreateSenseiResult | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const hasInput = classInput.trim() || sparringInput.trim() || studyInput.trim() || videoUrl.trim() || todayFocus.trim()

  // YouTube oEmbed auto-title
  useEffect(() => {
    if (!videoUrl.match(/youtu\.?be/)) return
    if (videoTitle) return // 이미 제목 있으면 스킵
    const url = `https://noembed.com/embed?url=${encodeURIComponent(videoUrl)}`
    fetch(url).then((r) => r.json()).then((d) => {
      if (d.title) setVideoTitle(d.title)
    }).catch(() => {})
  }, [videoUrl, videoTitle])

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
        body: JSON.stringify({
          classInput, sparringInput, studyInput, date,
          instructor: classInput.trim() ? instructor : undefined,
          videoUrl: videoUrl.trim() || undefined,
          videoTitle: videoTitle.trim() || undefined,
          todayFocus: todayFocus.trim() || undefined,
          focusApplied,
        }),
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
      setStudyInput("")
      setVideoUrl("")
      setVideoTitle("")
      setTodayFocus("")
      setFocusApplied(false)
      queryClient.invalidateQueries({ queryKey: ["sensei-entries"] })
      queryClient.invalidateQueries({ queryKey: ["sensei-stats"] })
    },
  })

  return (
    <div className="space-y-4">
      <div className="border border-border rounded-xl p-4 bg-card space-y-4">
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs text-foreground/80">
          공부 · 수업 · 스파링 중 <strong>하나만 입력해도</strong> 저장됩니다. 같은 날짜에 이미 기록이 있으면 자동으로 같은 노트에 추가돼요.
        </div>

        {/* 날짜 + 지도자 */}
        <div className="flex items-center gap-3 flex-wrap">
          <label htmlFor="sensei-date" className="text-foreground/90 text-sm font-medium shrink-0">수련일</label>
          <input id="sensei-date" type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border bg-muted text-foreground px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark]" />
          <label htmlFor="sensei-instructor" className="text-foreground/90 text-sm font-medium shrink-0 ml-2">지도자</label>
          <select id="sensei-instructor" value={instructor} onChange={(e) => setInstructor(e.target.value)}
            className="rounded-lg border border-border bg-muted text-foreground px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark]">
            <option value="조준용">조준용</option>
            <option value="김진우">김진우</option>
          </select>
        </div>

        {/* ═══ 📖 공부 (아코디언) ═══ */}
        <div className="border border-border/50 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setStudyOpen(!studyOpen)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span className="text-foreground/90 text-sm font-medium">공부</span>
            <span className="ml-auto text-muted-foreground/70 text-xs">{studyOpen ? "▼" : "▶"}</span>
          </button>

          {studyOpen && (
            <div className="px-3 pb-3 space-y-2">
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="🔗 영상 URL (YouTube 등)"
                className="w-full rounded-lg border border-border bg-muted text-foreground placeholder:text-muted-foreground px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
              />
              <input
                type="text"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                placeholder="📺 영상 제목 (URL 입력 시 자동추출)"
                className="w-full rounded-lg border border-border bg-muted text-foreground placeholder:text-muted-foreground px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
              />
              <input
                type="text"
                value={todayFocus}
                onChange={(e) => setTodayFocus(e.target.value)}
                placeholder="🎯 오늘의 초점 (예: 하프가드 스윕 진입 — 스파링에서 써볼 것)"
                className="w-full rounded-lg border border-border bg-muted text-foreground placeholder:text-muted-foreground px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
              />
              <label className="flex items-center gap-2 text-sm text-muted-foreground px-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={focusApplied}
                  onChange={(e) => setFocusApplied(e.target.checked)}
                  className="rounded border-border bg-muted text-green-500 focus:ring-green-500"
                />
                오늘 수업/스파링에서 적용함
              </label>
              <textarea
                value={studyInput}
                onChange={(e) => setStudyInput(e.target.value)}
                placeholder="영상에서 배운 내용, 메모 (자연어로 자유롭게)"
                className="w-full min-h-16 rounded-lg border border-border bg-muted text-foreground placeholder:text-muted-foreground p-3 text-sm outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          )}
        </div>

        {/* ═══ 📝 수업 ═══ */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            <label htmlFor="sensei-class" className="text-foreground/90 text-sm font-medium">수업</label>
          </div>
          <textarea
            id="sensei-class"
            value={classInput}
            onChange={(e) => setClassInput(e.target.value)}
            placeholder="오늘 수업 내용 (드릴, 테크닉 등)"
            className="w-full min-h-24 rounded-lg border border-border bg-muted text-foreground placeholder:text-muted-foreground p-3 text-sm outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* ═══ ⚔️ 스파링 ═══ */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <label htmlFor="sensei-sparring" className="text-foreground/90 text-sm font-medium">스파링</label>
          </div>
          <textarea
            id="sensei-sparring"
            value={sparringInput}
            onChange={(e) => setSparringInput(e.target.value)}
            placeholder="스파링 메모 (상대, 잘된 점, 개선 포인트 등)"
            className="w-full min-h-24 rounded-lg border border-border bg-muted text-foreground placeholder:text-muted-foreground p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {createMutation.isError && (
          <p className="text-red-400 text-sm">오류: {createMutation.error.message}</p>
        )}

        <Button
          type="button"
          className="w-full bg-orange-600 hover:bg-orange-500 text-white min-h-[44px] touch-manipulation"
          disabled={createMutation.isPending || !hasInput}
          onClick={() => createMutation.mutate()}
          onPointerDown={(e) => { if (!createMutation.isPending && hasInput) { e.preventDefault(); createMutation.mutate() } }}
        >
          {createMutation.isPending ? "정리 중..." : "Sensei로 정리 후 Notion 저장"}
        </Button>

        {/* 저장 결과 */}
        {lastSaved && (
          <div className="rounded-lg border border-border bg-muted/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-green-400 text-xs">{lastSaved.appended ? "기존 기록에 추가 완료" : "저장 완료"}</p>
              <a href={`https://www.notion.so/${lastSaved.pageId.replace(/-/g, "")}`} target="_blank" rel="noreferrer" className="text-blue-300 text-xs hover:underline">
                Notion 열기
              </a>
            </div>
            <p className="text-foreground text-sm font-medium">{lastSaved.structured.title}</p>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className={`text-[10px] ${
                lastSaved.structured.sessionType === "study" ? "border-green-500/40 text-green-300"
                : lastSaved.structured.sessionType === "promotion" ? "border-yellow-500/40 text-yellow-300"
                : lastSaved.structured.sessionType === "openmat" ? "border-green-500/40 text-green-300"
                : "border-purple-500/40 text-purple-300"
              }`}>
                {lastSaved.structured.sessionType === "study" ? "Study"
                : lastSaved.structured.sessionType === "promotion" ? "승급식"
                : lastSaved.structured.sessionType === "openmat" ? "Open Mat" : "Class"}
              </Badge>
              <Badge variant="outline" className="text-[10px] border-border text-foreground/90">{lastSaved.structured.date}</Badge>
            </div>
            <div className="flex flex-wrap gap-1">
              {lastSaved.structured.classTags.map((tag) => (
                <Badge key={`preview-class-${tag}`} variant="outline" className="text-[10px] border-orange-500/40 text-orange-300">Class: {tag}</Badge>
              ))}
              {lastSaved.structured.sparringTags.map((tag) => (
                <Badge key={`preview-spar-${tag}`} variant="outline" className="text-[10px] border-blue-500/40 text-blue-300">Sparring: {tag}</Badge>
              ))}
              {(lastSaved.structured.studyTags || []).map((tag) => (
                <Badge key={`preview-study-${tag}`} variant="outline" className="text-[10px] border-green-500/40 text-green-300">Study: {tag}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══ 최근 수련 기록 ═══ */}
      <div className="border border-border rounded-xl p-4 bg-card space-y-3">
        <p className="text-foreground/90 text-sm font-medium">최근 수련 기록</p>
        {entriesQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">불러오는 중...</p>
        ) : entriesQuery.isError ? (
          <p className="text-red-400 text-sm">오류: {(entriesQuery.error as Error).message}</p>
        ) : (entriesQuery.data ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">기록이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {(entriesQuery.data ?? []).map((entry) => {
              const isExpanded = expandedId === entry.id
              return (
                <div key={entry.id} className="border border-border rounded-lg bg-muted/50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedId((prev) => prev === entry.id ? null : entry.id)}
                    className="w-full text-left p-3 hover:bg-muted/60 transition-colors cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground text-sm">{isExpanded ? "▼" : "▶"}</span>
                      <p className="text-foreground text-sm font-medium">{entry.title}</p>
                      <Badge variant="outline" className={`text-[10px] ${
                        entry.sessionType === "study" ? "border-green-500/40 text-green-300"
                        : entry.sessionType === "promotion" ? "border-yellow-500/40 text-yellow-300"
                        : entry.sessionType === "openmat" ? "border-green-500/40 text-green-300"
                        : "border-purple-500/40 text-purple-300"
                      }`}>
                        {entry.sessionType === "study" ? "Study"
                        : entry.sessionType === "promotion" ? "승급식"
                        : entry.sessionType === "openmat" ? "Open Mat" : "Class"}
                      </Badge>
                      {entry.date && <Badge variant="outline" className="text-[10px] border-border text-foreground/90">{entry.date}</Badge>}
                      {entry.videoUrl && <span className="text-[10px]" title="영상 공부">🎥</span>}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2 border-t border-border">
                      <div className="flex flex-wrap gap-1 pt-2">
                        {entry.gym && <Badge variant="outline" className="text-[10px] border-border text-foreground/90">{entry.gym}</Badge>}
                        {entry.instructor && <Badge variant="outline" className="text-[10px] border-border text-foreground/90">{entry.instructor}</Badge>}
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {entry.classTags.map((tag) => (
                          <Badge key={`class-${entry.id}-${tag}`} variant="outline" className="text-[10px] border-orange-500/40 text-orange-300">Class: {tag}</Badge>
                        ))}
                        {entry.sparringTags.map((tag) => (
                          <Badge key={`spar-${entry.id}-${tag}`} variant="outline" className="text-[10px] border-blue-500/40 text-blue-300">Sparring: {tag}</Badge>
                        ))}
                        {(entry.studyTags || []).map((tag) => (
                          <Badge key={`study-${entry.id}-${tag}`} variant="outline" className="text-[10px] border-green-500/40 text-green-300">Study: {tag}</Badge>
                        ))}
                      </div>

                      {/* Video link */}
                      {entry.videoUrl && (
                        <a href={entry.videoUrl} target="_blank" rel="noreferrer" className="text-green-400 text-xs hover:underline flex items-center gap-1">
                          🎥 {entry.videoTitle || "영상 보기"}
                        </a>
                      )}

                      {/* Today Focus */}
                      {entry.todayFocus && (
                        <p className="text-muted-foreground text-xs">
                          🎯 {entry.todayFocus} {entry.focusApplied ? "✅" : "⬜"}
                        </p>
                      )}

                      {entry.note && <p className="text-foreground/90 text-xs whitespace-pre-wrap">{entry.note}</p>}

                      {entry.url && (
                        <div className="pt-2 border-t border-border">
                          <a href={entry.url} target="_blank" rel="noreferrer" className="text-blue-300 text-xs hover:underline">
                            Notion에서 열기 ↗
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
