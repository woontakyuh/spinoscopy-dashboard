"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { platformLabel } from "@/lib/radar/socialSources"
import type { SocialFeedResponse, SocialItem, SocialSummarizeResponse } from "@/lib/types/social"

const PLATFORM_STYLE: Record<SocialItem["platform"], { border: string; text: string }> = {
  threads: { border: "border-zinc-400/40", text: "text-foreground/90" },
  x: { border: "border-sky-500/40", text: "text-sky-300" },
}

function SocialCard({ item }: { item: SocialItem }) {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const style = PLATFORM_STYLE[item.platform]

  async function handleSummarize() {
    setLoading(true)
    try {
      const res = await fetch("/api/social-feed/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.text }),
      })
      if (!res.ok) throw new Error("요약 실패")
      const data = (await res.json()) as SocialSummarizeResponse
      setSummary(data.summary)
    } catch {
      setSummary("요약에 실패했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border border-border rounded-lg p-3 bg-muted/50 space-y-2 card-hover">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className={`text-[10px] shrink-0 ${style.border} ${style.text}`}>
          {platformLabel(item.platform)}
        </Badge>
        <span className="text-foreground/90">@{item.account}</span>
        {item.postedAt && <span>· {item.postedAt.slice(0, 10)}</span>}
      </div>

      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className="block text-foreground text-sm whitespace-pre-wrap hover:text-blue-300 transition-colors"
      >
        {item.text}
      </a>

      {summary && (
        <p className="text-foreground/90 text-xs bg-card/60 rounded-md px-2.5 py-1.5 whitespace-pre-wrap">
          {summary}
        </p>
      )}

      {item.lang !== "ko" && (
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 border-border text-foreground/90 hover:text-foreground"
            disabled={loading || !!summary}
            onClick={handleSummarize}
          >
            {loading ? "요약 중..." : summary ? "요약 완료" : "한글 요약"}
          </Button>
        </div>
      )}
    </div>
  )
}

export function SocialColumn() {
  const [visibleCount, setVisibleCount] = useState(20)

  const socialQuery = useQuery({
    queryKey: ["social-feed"],
    queryFn: async () => {
      const res = await fetch("/api/social-feed")
      if (!res.ok) throw new Error("소셜 피드 조회 실패")
      return res.json() as Promise<SocialFeedResponse>
    },
    staleTime: 5 * 60 * 1000,
  })

  const items: SocialItem[] = socialQuery.data?.items ?? []

  return (
    <div className="space-y-2">
      <div className="hidden md:flex items-center gap-2 pb-1 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">소셜</h3>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>

      {socialQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={`social-skel-${String(i)}`} className="border border-border rounded-lg p-3 bg-muted/50 space-y-2">
              <Skeleton className="h-3 w-1/3 bg-muted" />
              <Skeleton className="h-4 w-full bg-muted" />
              <Skeleton className="h-4 w-2/3 bg-muted" />
            </div>
          ))}
        </div>
      ) : socialQuery.isError ? (
        <div className="border border-border rounded-xl p-4 bg-card">
          <p className="text-red-400 text-sm">오류: {(socialQuery.error as Error).message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 text-xs border-border text-foreground/90"
            onClick={() => socialQuery.refetch()}
          >
            재시도
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="border border-border rounded-xl p-4 bg-card">
          <EmptyState icon="💬" message="소셜 글이 아직 없습니다." />
        </div>
      ) : (
        <div className="space-y-3">
          {items.slice(0, visibleCount).map((item) => (
            <SocialCard key={item.id} item={item} />
          ))}
          {items.length > visibleCount && (
            <div className="flex justify-center pt-2 pb-4">
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-border text-muted-foreground hover:text-foreground"
                onClick={() => setVisibleCount((prev) => prev + 20)}
              >
                더보기 ({items.length - visibleCount}개 남음)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
