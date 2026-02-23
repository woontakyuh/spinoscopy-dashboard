"use client"

import { useState } from "react"
import { TopBar } from "@/components/layout/TopBar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ScheduleCreateInput, ScheduleCreateResult } from "@/lib/types/schedule"

const CATEGORY_OPTIONS = ["Conf", "Spine", "AI", "Workshop", "Lecture", "Meeting", "Webinar"] as const

export default function JarvisPage() {
  const [form, setForm] = useState<ScheduleCreateInput>({
    name: "",
    date_start: "",
    date_end: "",
    place: "",
    category: "Spine",
    society: [],
    topic: "",
    link: "",
    abstract_deadline: "",
  })
  const [societyText, setSocietyText] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScheduleCreateResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const payload: ScheduleCreateInput = {
        name: form.name.trim(),
        date_start: form.date_start,
        date_end: form.date_end || undefined,
        place: form.place?.trim() || undefined,
        category: form.category || "Spine",
        society: societyText
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
        topic: form.topic?.trim() || undefined,
        link: form.link?.trim() || undefined,
        abstract_deadline: form.abstract_deadline || undefined,
      }

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
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "알 수 없는 오류"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="📋 Jarvis" />
      <div className="p-3 md:p-6 max-w-4xl w-full space-y-4">
        <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
          <p className="text-zinc-300 text-sm">일정을 Notion과 Google Calendar에 동시 등록합니다.</p>
        </div>

        <Card className="bg-zinc-900 border-zinc-700 gap-4">
          <CardHeader>
            <CardTitle className="text-zinc-100 text-base">일정 등록</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="name" className="text-zinc-300">이름</Label>
                <Input
                  id="name"
                  required
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date_start" className="text-zinc-300">시작일</Label>
                <Input
                  id="date_start"
                  type="date"
                  required
                  value={form.date_start}
                  onChange={(event) => setForm((prev) => ({ ...prev, date_start: event.target.value }))}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date_end" className="text-zinc-300">종료일</Label>
                <Input
                  id="date_end"
                  type="date"
                  value={form.date_end}
                  onChange={(event) => setForm((prev) => ({ ...prev, date_end: event.target.value }))}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="place" className="text-zinc-300">장소</Label>
                <Input
                  id="place"
                  value={form.place}
                  onChange={(event) => setForm((prev) => ({ ...prev, place: event.target.value }))}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-300">분류</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
                >
                  <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-zinc-100">
                    <SelectValue placeholder="분류 선택" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                    {CATEGORY_OPTIONS.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="society" className="text-zinc-300">학회명</Label>
                <Input
                  id="society"
                  value={societyText}
                  onChange={(event) => setSocietyText(event.target.value)}
                  placeholder="예: NASS, KSSS"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="topic" className="text-zinc-300">발표 주제</Label>
                <Input
                  id="topic"
                  value={form.topic}
                  onChange={(event) => setForm((prev) => ({ ...prev, topic: event.target.value }))}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="link" className="text-zinc-300">링크</Label>
                <Input
                  id="link"
                  type="url"
                  value={form.link}
                  onChange={(event) => setForm((prev) => ({ ...prev, link: event.target.value }))}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="abstract_deadline" className="text-zinc-300">초록 마감</Label>
                <Input
                  id="abstract_deadline"
                  type="date"
                  value={form.abstract_deadline}
                  onChange={(event) => setForm((prev) => ({ ...prev, abstract_deadline: event.target.value }))}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>

              <div className="md:col-span-2">
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {loading ? "등록 중..." : "일정 등록"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

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
      </div>
    </div>
  )
}
