"use client"

import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"

// Phase 1: 피드 placeholder + API 시도 → 404면 empty state.
// Phase 3에서 Concept Notes DB 풀 구현 (filter chips + 리스트).

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

const TYPE_COLORS: Record<string, string> = {
  메타: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  운영: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  전략: "bg-green-500/15 text-green-700 dark:text-green-300",
  철학: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  피지컬: "bg-red-500/15 text-red-700 dark:text-red-300",
  멘탈: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
}

export function ConceptsFeed() {
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

  return (
    <div className="space-y-4">
      {/* Filter chips (all + 6 types) */}
      <div className="flex flex-wrap gap-2">
        <Chip label="All" active />
        {TYPES.map((t) => (
          <Chip key={t} label={t} />
        ))}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground/70 text-[13px] p-6 text-center">
          Loading…
        </div>
      ) : error || !data ? (
        <EmptyState
          icon="📝"
          message="Concept Notes DB가 아직 ClinicalPipeline integration에 연결되지 않았거나 비어있습니다. claude.ai의 Lo에서 노트를 추가하면 여기 나타납니다."
        />
      ) : data.length === 0 ? (
        <EmptyState
          icon="📝"
          message="아직 Concept Note가 없습니다. claude.ai Lo 프로젝트에서 작성해 주세요."
        />
      ) : (
        <div className="space-y-2">
          {data.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] border transition-colors cursor-default ${
        active
          ? "bg-foreground/10 border-foreground/20 text-foreground"
          : "bg-transparent border-border text-muted-foreground"
      }`}
    >
      {label}
    </span>
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
        <span className="text-[11px] text-muted-foreground/70 shrink-0">
          {note.date ?? ""}
        </span>
      </div>
    </div>
  )
}
