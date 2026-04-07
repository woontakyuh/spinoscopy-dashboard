"use client"

import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import type { JournalArticle, InterestLevel } from "@/lib/types/journal"

interface ArticleDetailProps {
  article: JournalArticle
  onBack: () => void
}

const INTEREST_CYCLE: InterestLevel[] = ["🔴 필독", "🟡 관심", "⚪ 참고"]

function interestStyle(interest: string) {
  if (interest.includes("필독")) return "bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30"
  if (interest.includes("관심")) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40 hover:bg-yellow-500/30"
  return "bg-zinc-500/20 text-muted-foreground border-zinc-500/40 hover:bg-zinc-500/30"
}

export function ArticleDetail({ article, onBack }: ArticleDetailProps) {
  const queryClient = useQueryClient()
  const [currentInterest, setCurrentInterest] = useState<InterestLevel>(article.interest)
  const [currentRead, setCurrentRead] = useState(article.read)
  const [koreanTranslation, setKoreanTranslation] = useState<string | null>(null)
  const [oneLiner, setOneLiner] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)
  const [summarizing, setSummarizing] = useState(false)

  useEffect(() => {
    void article.page_id
    setKoreanTranslation(null)
    setOneLiner(null)
    setTranslating(false)
    setSummarizing(false)
  }, [article.page_id])

  const toggleReadMutation = useMutation({
    mutationFn: async (read: boolean) => {
      const res = await fetch("/api/notion/journal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: article.page_id, action: "toggleRead", value: read }),
      })
      if (!res.ok) throw new Error("업데이트 실패")
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["journal"] }),
  })

  const updateInterestMutation = useMutation({
    mutationFn: async (interest: InterestLevel) => {
      const res = await fetch("/api/notion/journal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: article.page_id, action: "updateInterest", value: interest }),
      })
      if (!res.ok) throw new Error("업데이트 실패")
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["journal"] }),
  })

  function handleToggleRead() {
    const next = !currentRead
    setCurrentRead(next)
    toggleReadMutation.mutate(next)
  }

  function handleCycleInterest() {
    const idx = INTEREST_CYCLE.indexOf(currentInterest)
    const next = INTEREST_CYCLE[(idx + 1) % INTEREST_CYCLE.length]
    setCurrentInterest(next)
    updateInterestMutation.mutate(next)
  }

  async function handleTranslate() {
    if (!article.abstract || translating) return
    setTranslating(true)
    try {
      const res = await fetch("/api/notion/journal/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abstract: article.abstract, mode: "translate" }),
      })

      const data = (await res.json()) as { translation?: string; error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? "번역 실패")
      }

      if (typeof data.translation !== "string" || !data.translation.trim()) {
        throw new Error("번역 결과가 비어 있습니다")
      }

      setKoreanTranslation(data.translation.trim())
    } catch (error) {
      console.error(error)
    } finally {
      setTranslating(false)
    }
  }

  async function handleSummarize() {
    if (!article.abstract || summarizing) return
    setSummarizing(true)
    try {
      const res = await fetch("/api/notion/journal/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abstract: article.abstract, mode: "summarize" }),
      })

      const data = (await res.json()) as { summary?: string; error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? "요약 실패")
      }

      if (typeof data.summary !== "string" || !data.summary.trim()) {
        throw new Error("요약 결과가 비어 있습니다")
      }

      setOneLiner(data.summary.trim())
    } catch (error) {
      console.error(error)
    } finally {
      setSummarizing(false)
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-muted-foreground text-sm hover:text-foreground transition-colors"
      >
        ← 목록
      </button>

      <div>
        <h2 className="text-foreground text-lg font-semibold leading-snug">{article.title}</h2>
        <p className="text-muted-foreground text-sm mt-1">{article.authors}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {article.journal_name && (
          <Badge variant="outline" className="text-xs border-border text-foreground/90">
            {article.journal_name}
          </Badge>
        )}
        {article.volume && (
          <span className="text-muted-foreground text-xs">Vol.{article.volume}</span>
        )}
        {article.issue && (
          <span className="text-muted-foreground text-xs">No.{article.issue}</span>
        )}
        {article.pub_date && (
          <span className="text-muted-foreground text-xs">{article.pub_date}</span>
        )}
        {article.pub_type && (
          <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
            {article.pub_type}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleCycleInterest}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${interestStyle(currentInterest)}`}
        >
          {currentInterest}
        </button>

        <button
          type="button"
          onClick={handleToggleRead}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            currentRead
              ? "bg-green-500/20 text-green-400 border-green-500/40"
              : "bg-muted text-muted-foreground border-border hover:bg-muted"
          }`}
        >
          {currentRead ? "✓ 읽음" : "읽지 않음"}
        </button>
      </div>

      <Separator className="bg-muted" />

      {article.summary && (
        <div>
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-1.5">한글 요약</p>
          <p className="text-foreground/90 text-sm leading-relaxed">{article.summary}</p>
        </div>
      )}

      {article.abstract && (
        <div className="space-y-3">
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-1.5">Abstract</p>
            <p className="text-muted-foreground text-sm leading-relaxed">{article.abstract}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleTranslate}
              disabled={translating}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-foreground/90 border border-border hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {translating ? "번역 중..." : koreanTranslation ? "번역 완료" : "한글 번역"}
            </button>

            <button
              type="button"
              onClick={handleSummarize}
              disabled={summarizing}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-foreground/90 border border-border hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {summarizing ? "요약 중..." : oneLiner ? "요약 완료" : "한줄 요약"}
            </button>
          </div>

          {koreanTranslation && (
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-1.5">한글 번역</p>
              <p className="text-foreground/90 text-sm leading-relaxed">{koreanTranslation}</p>
            </div>
          )}

          {oneLiner && (
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-1.5">한줄 요약</p>
              <p className="text-foreground/90 text-sm leading-relaxed">{oneLiner}</p>
            </div>
          )}
        </div>
      )}

      <Separator className="bg-muted" />

      {article.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {article.keywords.map((kw) => (
            <Badge key={kw} variant="outline" className="text-[10px] border-border text-muted-foreground">
              {kw}
            </Badge>
          ))}
        </div>
      )}

      {article.categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {article.categories.map((cat) => (
            <Badge key={cat} variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">
              {cat}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        {article.doi_url && (
          <a
            href={article.doi_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-foreground/90 border border-border hover:bg-muted transition-colors"
          >
            DOI ↗
          </a>
        )}
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-foreground/90 border border-border hover:bg-muted transition-colors"
        >
          Notion에서 열기 ↗
        </a>
      </div>
    </div>
  )
}
