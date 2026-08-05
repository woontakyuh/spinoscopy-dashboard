"use client"

import { useQuery } from "@tanstack/react-query"
import { MemoryCandidateQueue } from "@/components/lo-v2/MemoryCandidateQueue"

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

interface DurableMemory {
  pageId: string
  name: string
  content: string
  category: string | null
  source: {
    kind: string | null
    reference: string | null
  }
}

interface LoDashboardResponse {
  memory: {
    status: "ready" | "empty" | "error"
    data: DurableMemory[] | null
    error?: string
  }
}

const RELATION_LABELS: { key: keyof ConceptNote["related_count"]; label: string }[] = [
  { key: "positions", label: "positions" },
  { key: "transitions", label: "transitions" },
  { key: "techniques", label: "techniques" },
  { key: "archetypes", label: "archetypes" },
  { key: "competitions", label: "competitions" },
]

export function MemoryView() {
  const conceptsQuery = useQuery<ConceptNote[]>({
    queryKey: ["concept-notes"],
    queryFn: async () => {
      const response = await fetch("/api/notion/concept-notes")
      if (!response.ok) throw new Error("Concept Memory is unavailable")
      return response.json()
    },
    retry: false,
    staleTime: 60_000,
  })
  const dashboardQuery = useQuery<LoDashboardResponse>({
    queryKey: ["lo-dashboard"],
    queryFn: async () => {
      const response = await fetch("/api/lo/dashboard")
      if (!response.ok) throw new Error("Durable Memory is unavailable")
      return response.json()
    },
    retry: false,
    staleTime: 60_000,
  })

  const durableMemory = dashboardQuery.data?.memory
  const durableMemoryError = dashboardQuery.isError || durableMemory?.status === "error"

  return (
    <div className="space-y-4">
      <MemoryCandidateQueue />
      <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-xl border border-border bg-muted/20 p-4" aria-labelledby="concept-memory-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="concept-memory-heading" className="text-sm font-semibold text-foreground">Concept Memory</h2>
          {conceptsQuery.data && <span className="text-xs text-muted-foreground">{conceptsQuery.data.length} notes</span>}
        </div>

        {conceptsQuery.isLoading ? (
          <p className="text-xs text-muted-foreground" role="status">Loading Concept Memory...</p>
        ) : conceptsQuery.isError || !conceptsQuery.data ? (
          <p className="text-xs text-destructive" role="alert">Unable to load Concept Memory.</p>
        ) : conceptsQuery.data.length === 0 ? (
          <p className="text-xs text-muted-foreground">There are no concept memories.</p>
        ) : (
          <ul className="space-y-2" aria-label="Concept Memory records">
            {conceptsQuery.data.map((concept) => (
              <li key={concept.id} className="rounded-lg border border-border bg-background/60 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 text-sm font-medium text-foreground">{concept.title}</h3>
                  <time className="shrink-0 text-[11px] text-muted-foreground">{concept.date ?? "No date"}</time>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Type: {concept.type.join(" · ") || "Uncategorized"}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{relationCounts(concept.related_count)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-muted/20 p-4" aria-labelledby="durable-memory-heading">
        <h2 id="durable-memory-heading" className="mb-3 text-sm font-semibold text-foreground">Durable Memory</h2>

        {dashboardQuery.isLoading ? (
          <p className="text-xs text-muted-foreground" role="status">Loading Durable Memory...</p>
        ) : durableMemoryError || !durableMemory ? (
          <p className="text-xs text-destructive" role="alert">Unable to load Durable Memory.</p>
        ) : durableMemory.data === null || durableMemory.data.length === 0 ? (
          <p className="text-xs text-muted-foreground">There are no durable memories.</p>
        ) : (
          <ul className="space-y-2" aria-label="Durable Memory records">
            {durableMemory.data.map((memory) => (
              <li key={memory.pageId} className="rounded-lg border border-border bg-background/60 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 text-sm font-medium text-foreground">{memory.name || "Untitled memory"}</h3>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{memory.category ?? "uncategorized"}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{memory.content || "No durable memory content was captured."}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Source: {sourceLabel(memory.source)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  )
}

function relationCounts(counts: ConceptNote["related_count"]): string {
  return RELATION_LABELS.map(({ key, label }) => `${counts[key]} ${label}`).join(" · ")
}

function sourceLabel(source: DurableMemory["source"]): string {
  if (source.kind && source.reference) return `${source.kind} · ${source.reference}`
  return source.kind ?? source.reference ?? "Not recorded"
}
