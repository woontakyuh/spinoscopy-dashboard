"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import type { SocialFeedResponse, SocialItem, SocialSummarizeResponse } from "@/lib/types/social"

function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return `hsl(${h} 55% 45%)`
}

function ThreadsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Threads">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.166 1.43 1.781 3.631 2.695 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.85 13.85 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.9 8.532c.98-1.461 2.568-2.264 4.474-2.264h.04c3.184.02 5.078 1.985 5.262 5.388.106.045.211.092.314.142 1.494.704 2.589 1.768 3.165 3.078.806 1.831.881 4.815-1.515 7.196C18.034 23.099 15.849 23.974 12.21 24h-.024Zm1.063-11.114c-.323 0-.65.01-.984.03-1.84.103-2.991.857-2.949 1.78.043.94 1.32 1.39 2.581 1.282 1.158-.083 2.7-.572 2.958-3.005a10.27 10.27 0 0 0-1.606-.087Z" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="X">
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  )
}

function Avatar({ account, platform, avatarUrl }: { account: string; platform: SocialItem["platform"]; avatarUrl: string }) {
  const [imgError, setImgError] = useState(false)
  return (
    <div
      className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold relative overflow-visible"
      style={avatarUrl && !imgError ? undefined : { background: avatarColor(account) }}
    >
      {avatarUrl && !imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/social-feed/avatar?u=${encodeURIComponent(avatarUrl)}`}
          alt={account}
          className="w-9 h-9 rounded-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      ) : (
        account.replace(/[^a-zA-Z0-9]/g, "").charAt(0).toUpperCase() || "·"
      )}
      <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-background flex items-center justify-center border border-border text-foreground">
        {platform === "x" ? <XIcon className="w-2 h-2" /> : <ThreadsIcon className="w-2.5 h-2.5" />}
      </span>
    </div>
  )
}

function useSummary(item: SocialItem, enabled: boolean) {
  return useQuery({
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
    enabled,
    staleTime: Infinity,
    retry: 1,
  })
}

// ─── Threads: 원문 그대로 + 요약 버튼 ───
function ThreadsCard({ item, avatarUrl }: { item: SocialItem; avatarUrl: string }) {
  const [summarize, setSummarize] = useState(false)
  const sum = useSummary(item, summarize)

  return (
    <div className="flex gap-3 px-1 py-3.5 border-b border-border/70">
      <Avatar account={item.account} platform={item.platform} avatarUrl={avatarUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-semibold text-foreground truncate">@{item.account}</span>
          {item.postedAt && <span className="text-muted-foreground text-xs shrink-0">· {item.postedAt.slice(5)}</span>}
        </div>
        <a href={item.url} target="_blank" rel="noreferrer" className="block">
          <p className="mt-1 text-[13.5px] leading-relaxed text-foreground/95 whitespace-pre-wrap break-words hover:text-blue-300 transition-colors">
            {item.text}
          </p>
        </a>

        {summarize && (
          <div className="mt-2">
            {sum.isLoading ? (
              <Skeleton className="h-8 w-full bg-muted rounded-md" />
            ) : (
              <p className="text-[12.5px] leading-relaxed text-foreground/90 bg-card/70 border-l-2 border-cyan-500/60 rounded-md px-2.5 py-1.5 whitespace-pre-wrap break-words">
                {sum.isError ? "요약 실패" : sum.data?.summary}
              </p>
            )}
          </div>
        )}

        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setSummarize(true)}
            disabled={summarize}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {summarize ? "요약됨" : "✦ 요약"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── X: 한글 요약 자동 표시 (원문은 토글) ───
function XCard({ item, avatarUrl }: { item: SocialItem; avatarUrl: string }) {
  const [showOriginal, setShowOriginal] = useState(false)
  const sum = useSummary(item, true)

  return (
    <div className="flex gap-3 px-1 py-3.5 border-b border-border/70">
      <Avatar account={item.account} platform={item.platform} avatarUrl={avatarUrl} />
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
        ) : (
          <p className="mt-1 text-[13.5px] leading-relaxed text-foreground/95 whitespace-pre-wrap break-words">
            {sum.isError ? item.text : sum.data?.summary}
          </p>
        )}

        <div className="mt-1.5 flex items-center gap-3 text-xs">
          <button type="button" onClick={() => setShowOriginal((v) => !v)} className="text-muted-foreground hover:text-foreground">
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

  // 계정별 최신 아바타 — 오래된 글(아바타 없음)도 같은 계정의 최신 사진을 공유
  const avatarByAccount: Record<string, string> = {}
  for (const it of items) {
    if (it.avatarUrl && !avatarByAccount[it.account]) avatarByAccount[it.account] = it.avatarUrl
  }
  const avatarFor = (it: SocialItem) => avatarByAccount[it.account] || it.avatarUrl

  return (
    <div className="space-y-2">
      <div className="hidden md:flex items-center gap-2 pb-1 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">Social</h3>
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
          <Button variant="outline" size="sm" className="mt-2 text-xs border-border text-foreground/90" onClick={() => socialQuery.refetch()}>
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
            item.platform === "x" ? (
              <XCard key={item.id} item={item} avatarUrl={avatarFor(item)} />
            ) : (
              <ThreadsCard key={item.id} item={item} avatarUrl={avatarFor(item)} />
            )
          )}
          {items.length > visibleCount && (
            <div className="flex justify-center pt-3 pb-4">
              <Button variant="outline" size="sm" className="text-xs border-border text-muted-foreground hover:text-foreground" onClick={() => setVisibleCount((prev) => prev + 25)}>
                더보기 ({items.length - visibleCount}개 남음)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
