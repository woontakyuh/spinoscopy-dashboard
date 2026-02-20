"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select"
import type { JournalFilter, JournalStats } from "@/lib/types/journal"

const JOURNALS = ["전체", "ESJ", "GSJ", "JNS Spine", "Neurospine", "Spine", "TSJ"]
const INTEREST_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "🔴 필독", label: "🔴 필독" },
  { value: "🟡 관심", label: "🟡 관심" },
  { value: "⚪ 참고", label: "⚪ 참고" },
]
const READ_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "false", label: "안 읽음" },
  { value: "true", label: "읽음" },
]

interface ArticleFilterProps {
  filter: JournalFilter
  onFilterChange: (f: JournalFilter) => void
  stats?: JournalStats
}

export function ArticleFilter({ filter, onFilterChange, stats }: ArticleFilterProps) {
  const [searchInput, setSearchInput] = useState(filter.search ?? "")

  const categoryOptions = stats
    ? Object.entries(stats.by_category)
        .sort(([, a], [, b]) => b - a)
        .map(([cat]) => cat)
    : []

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== (filter.search ?? "")) {
        onFilterChange({ ...filter, search: searchInput || undefined, cursor: undefined })
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [searchInput])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="논문 제목 검색..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="w-48 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 h-8 text-sm"
      />

      <Select
        value={filter.interest ?? "all"}
        onValueChange={(v) =>
          onFilterChange({ ...filter, interest: v as JournalFilter["interest"], cursor: undefined })
        }
      >
        <SelectTrigger className="w-28 bg-zinc-800 border-zinc-700 text-zinc-300 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-zinc-800 border-zinc-700">
          {INTEREST_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-zinc-300 text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filter.journal ?? "all"}
        onValueChange={(v) =>
          onFilterChange({ ...filter, journal: v === "전체" ? "all" : v, cursor: undefined })
        }
      >
        <SelectTrigger className="w-32 bg-zinc-800 border-zinc-700 text-zinc-300 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-zinc-800 border-zinc-700">
          {JOURNALS.map((j) => (
            <SelectItem key={j} value={j} className="text-zinc-300 text-xs">
              {j}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {categoryOptions.length > 0 && (
        <Select
          value={filter.category ?? "all"}
          onValueChange={(v) =>
            onFilterChange({ ...filter, category: v === "전체" ? "all" : v, cursor: undefined })
          }
        >
          <SelectTrigger className="w-32 bg-zinc-800 border-zinc-700 text-zinc-300 h-8 text-xs">
            <SelectValue placeholder="카테고리" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="all" className="text-zinc-300 text-xs">전체</SelectItem>
            {categoryOptions.map((cat) => (
              <SelectItem key={cat} value={cat} className="text-zinc-300 text-xs">
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={
          filter.read === true ? "true" : filter.read === false ? "false" : "all"
        }
        onValueChange={(v) =>
          onFilterChange({
            ...filter,
            read: v === "true" ? true : v === "false" ? false : "all",
            cursor: undefined,
          })
        }
      >
        <SelectTrigger className="w-24 bg-zinc-800 border-zinc-700 text-zinc-300 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-zinc-800 border-zinc-700">
          {READ_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-zinc-300 text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
