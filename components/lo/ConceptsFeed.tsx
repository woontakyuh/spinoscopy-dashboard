"use client"

import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"

interface ConceptNote {
  id: string
  title: string
  date: string | null
  type: string[]
  related_count: {
    positions: number
    transitions: number
    techniques: number
    archetypes: number
    competitions: number
  }
}

const TYPES = ["메타", "운영", "전략", "철학", "피지컬", "멘탈"] as const
type TypeFilter = (typeof TYPES)[number] | "all"

const TYPE_COLORS: Record<string, string> = {
  메타: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  운영: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  전략: "bg-green-500/15 text-green-700 dark:text-green-300",
  철학: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  피지컬: "bg-red-500/15 text-red-700 dark:text-red-300",
  멘탈: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
}

export function ConceptsFeed() {
  const [filter, setFilter] = useState<TypeFilter>("all")

  const { data, isLoading, error } = useQuery<ConceptNote[]>({
    queryKey: ["concept-notes"],
    queryFn: async () => {
      const res = await fetch("/api/notion/concept-notes")
      if (!res.ok) throw new Error("not available yet")
      return res.json()
    },
    retry: false,
    staleTime: 60_000,
  })

  const filtered = useMemo(() => {
    if (!data) return []
    if (filter === "all") return data
    return data.filter((n) => n.type.includes(filter))
  }, [data, filter])

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        <Chip label="All" active={filter === "all"} onClick={() => setFilter("all")} />
        {TYPES.map((t) => (
          <Chip
            key={t}
            label={t}
            colorClass={TYPE_COLORS[t]}
            active={filter === t}
            onClick={() => setFilter(t)}
          />
        ))}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground/70 text-[13px] p-6 text-center">Loading…</div>
      ) : error || !data ? (
        <EmptyState
          icon="📝"
          message="Concept Notes DB가 아직 ClinicalPipeline integration에 연결되지 않았거나 비어있습니다. claude.ai의 Lo에서 노트를 추가하면 여기 나타납니다."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="📝"
          message={
            filter === "all"
              ? "아직 Concept Note가 없습니다. claude.ai Lo 프로젝트에서 작성해 주세요."
              : `"${filter}" 타입 노트가 없습니다.`
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({
  label,
  active,
  onClick,
  colorClass,
}: {
  label: string
  active: boolean
  onClick: () => void
  colorClass?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
        active
          ? colorClass
            ? `${colorClass} border-transparent`
            : "bg-foreground/10 border-foreground/20 text-foreground"
          : "bg-transparent border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  )
}

function NoteCard({ note }: { note: ConceptNote }) {
  const relations = [
    note.related_count.positions && `${note.related_count.positions} pos`,
    note.related_count.transitions && `${note.related_count.transitions} trans`,
    note.related_count.techniques && `${note.related_count.techniques} tech`,
    note.related_count.archetypes && `${note.related_count.archetypes} arch`,
    note.related_count.competitions && `${note.related_count.competitions} comp`,
  ].filter(Boolean)

  return (
    <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {note.type.map((t) => (
              <Badge key={t} className={`${TYPE_COLORS[t] ?? ""} border-0 text-[11px] px-1.5 py-0`}>
                {t}
              </Badge>
            ))}
            <span className="font-medium text-foreground text-[13px]">{note.title}</span>
          </div>
          {relations.length > 0 && (
            <div className="text-[11px] text-muted-foreground">→ {relations.join(" · ")}</div>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground/70 shrink-0">{note.date ?? ""}</span>
      </div>
    </div>
  )
}
