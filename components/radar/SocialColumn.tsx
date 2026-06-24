"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import type { SocialFeedResponse, SocialItem, SocialSummarizeResponse } from "@/lib/types/social"

// 핸들 → 안정적인 아바타 색
function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return `hsl(${h} 55% 45%)`
}

function Avatar({ account, platform }: { account: string; platform: SocialItem["platform"] }) {
  return (
    <div
      className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold relative"
      style={{ background: avatarColor(account) }}
    >
      {account.replace(/[^a-zA-Z0-9]/g, "").charAt(0).toUpperCase() || "·"}
      <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-background flex items-center justify-center text-[9px] leading-none border border-border">
        {platform === "x" ? "𝕏" : "@"}
      </span>
    </div>
  )
}

// ─── Threads: 원문 그대로 (네이티브 피드 느낌) ───
function ThreadsCard({ item }: { item: SocialItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="flex gap-3 px-1 py-3.5 border-b border-border/70 hover:bg-muted/30 transition-colors"
    >
      <Avatar account={item.account} platform={item.platform} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-semibold text-foreground truncate">{item.account}</span>
          {item.postedAt && <span className="text-muted-foreground text-xs shrink-0">· {item.postedAt.slice(5)}</span>}
        </div>
        <p className="mt-1 text-[13.5px] leading-relaxed text-foreground/95 whitespace-pre-wrap break-words">
          {item.text}
        </p>
      </div>
    </a>
  )
}

// ─── X: 한글 요약 자동 표시 (원문은 토글) ───
function XCard({ item }: { item: SocialItem }) {
  const [showOriginal, setShowOriginal] = useState(false)
  const sum = useQuery({
    queryKey: ["social-sum", item.id],
    queryFn: async () => {
      const res = await fetch("/api/social-feed/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.text }),
      })
      if (!res.ok) throw new Error("요약 실패")
      return (await res.json()) as SocialSummarizeResponse
    },
    staleTime: Infinity,
    retry: 1,
  })

  return (
    <div className="flex gap-3 px-1 py-3.5 border-b border-border/70">
      <Avatar account={item.account} platform={item.platform} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-semibold text-foreground truncate">@{item.account}</span>
          <span className="text-[10px] text-sky-300 border border-sky-500/40 rounded px-1">한글요약</span>
          {item.postedAt && <span className="text-muted-foreground text-xs shrink-0 ml-auto">{item.postedAt.slice(5)}</span>}
        </div>

        {sum.isLoading ? (
          <div className="mt-2 space-y-1.5">
            <Skeleton className="h-3 w-full bg-muted" />
            <Skeleton className="h-3 w-4/5 bg-muted" />
          </div>
        ) : sum.isError ? (
          <p className="mt-1 text-[13.5px] leading-relaxed text-foreground/95 whitespace-pre-wrap break-words">{item.text}</p>
        ) : (
          <p className="mt-1 text-[13.5px] leading-relaxed text-foreground/95 whitespace-pre-wrap break-words">
            {sum.data?.summary}
          </p>
        )}

        <div className="mt-1.5 flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
          >
            {showOriginal ? "원문 접기" : "원문 보기"}
          </button>
          <a href={item.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
            X에서 열기 ↗
          </a>
        </div>
        {showOriginal && (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground bg-card/60 rounded-md px-2.5 py-1.5 whitespace-pre-wrap break-words">
            {item.text}
          </p>
        )}
      </div>
    </div>
  )
}

export function SocialColumn() {
  const [visibleCount, setVisibleCount] = useState(25)

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
        <div className="space-y-3 pt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={`social-skel-${String(i)}`} className="flex gap-3">
              <Skeleton className="w-9 h-9 rounded-full bg-muted shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/3 bg-muted" />
                <Skeleton className="h-3 w-full bg-muted" />
                <Skeleton className="h-3 w-2/3 bg-muted" />
              </div>
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
        <div>
          {items.slice(0, visibleCount).map((item) =>
            item.platform === "x" ? <XCard key={item.id} item={item} /> : <ThreadsCard key={item.id} item={item} />
          )}
          {items.length > visibleCount && (
            <div className="flex justify-center pt-3 pb-4">
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-border text-muted-foreground hover:text-foreground"
                onClick={() => setVisibleCount((prev) => prev + 25)}
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
