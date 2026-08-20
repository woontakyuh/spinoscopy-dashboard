import type {
  FinishEvidenceKind,
  Position,
  SenseiEntry,
  Transition,
  TransitionEvidence,
} from "@/lib/types/sensei"
import {
  FINISH_EVIDENCE_ALIASES,
  POSITION_EVIDENCE_ALIASES,
} from "@/lib/sensei/evidenceFinishAliases"
import {
  buildEvidenceSnippet,
  findEvidenceMatches,
  type EvidenceMatch,
} from "@/lib/sensei/evidenceTextMatching"

export interface ConceptEvidenceNote {
  id: string
  title: string
  date: string | null
  type: string[]
}

interface EvidenceDocument {
  id: string
  date: string | null
  kinds: FinishEvidenceKind[]
  segments: string[]
}

interface EvidenceAccumulator {
  from: Position
  to: Position
  documentIds: Set<string>
  kinds: Set<FinishEvidenceKind>
  dates: Set<string>
  snippets: string[]
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function splitEvidenceText(text: string): string[] {
  return text
    .split(/[\n.!?。]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 1)
}

function entryKinds(entry: SenseiEntry): FinishEvidenceKind[] {
  const kinds = new Set<FinishEvidenceKind>()
  if (entry.sessionType === "class") kinds.add("class")
  if (entry.sessionType === "study") kinds.add("study")
  if (entry.sessionType === "openmat" || entry.sparringTags.length > 0) {
    kinds.add("sparring")
  }

  const corpus = [
    entry.title,
    entry.note,
    ...entry.classTags,
    ...entry.studyTags,
    ...entry.sparringTags,
  ].join(" ")
  if (/심층논의|논의|토론/i.test(corpus)) kinds.add("discussion")
  if (/연구|교본|경기분석|분석|techniques\/|research\//i.test(corpus)) {
    kinds.add("research")
  }
  return [...kinds]
}

function buildEvidenceDocuments(
  entries: readonly SenseiEntry[],
  concepts: readonly ConceptEvidenceNote[],
): EvidenceDocument[] {
  const entryDocuments = entries.map((entry) => ({
    id: `entry:${entry.id}`,
    date: entry.date,
    kinds: entryKinds(entry),
    segments: [
      ...splitEvidenceText(entry.title),
      ...splitEvidenceText(entry.note),
      entry.classTags.join(" "),
      entry.studyTags.join(" "),
      entry.sparringTags.join(" "),
    ].filter(Boolean),
  }))
  const conceptDocuments = concepts.map((concept) => {
    const corpus = `${concept.title} ${concept.type.join(" ")}`
    const kinds: FinishEvidenceKind[] = ["concept", "discussion"]
    if (/연구|교본|분석/i.test(corpus)) kinds.push("research")
    return {
      id: `concept:${concept.id}`,
      date: concept.date,
      kinds: unique(kinds),
      segments: splitEvidenceText(corpus),
    }
  })

  return [...entryDocuments, ...conceptDocuments]
}

function transitionKey(transition: Pick<Transition, "from" | "to" | "type">): string {
  return `${transition.from}:${transition.to}:${transition.type}`
}

function evidenceSummary(accumulator: EvidenceAccumulator): TransitionEvidence {
  return {
    count: accumulator.documentIds.size,
    kinds: [...accumulator.kinds].sort(),
    dates: [...accumulator.dates].sort().reverse(),
    snippets: accumulator.snippets,
  }
}

export function buildEvidenceFinishTransitions(
  entries: readonly SenseiEntry[],
  concepts: readonly ConceptEvidenceNote[],
  positions: readonly Position[],
): Transition[] {
  const sourcePositions = positions.filter(
    (position) => position.layer !== "submission",
  )
  const finishPositions = positions.filter(
    (position) => position.layer === "submission",
  )
  const positionById = new Map(positions.map((position) => [position.id, position]))
  const accumulators = new Map<string, EvidenceAccumulator>()

  for (const document of buildEvidenceDocuments(entries, concepts)) {
    const documentPairs = new Map<string, { from: string; to: string; snippet: string }>()

    for (const segment of document.segments) {
      const sourceMatches = sourcePositions
        .flatMap((position) => findEvidenceMatches(
          segment,
          position,
          POSITION_EVIDENCE_ALIASES,
        ))
      const finishMatches = finishPositions
        .flatMap((position) => findEvidenceMatches(
          segment,
          position,
          FINISH_EVIDENCE_ALIASES,
        ))

      for (const finish of finishMatches) {
        const source = sourceMatches.reduce<EvidenceMatch | null>((closest, candidate) => {
          if (!closest) return candidate
          return Math.abs(candidate.index - finish.index) < Math.abs(closest.index - finish.index)
            ? candidate
            : closest
        }, null)
        if (!source) continue

        const key = `${source.id}:${finish.id}`
        const snippet = buildEvidenceSnippet(segment, source, finish)
        const existingPair = documentPairs.get(key)
        if (!existingPair || snippet.length > existingPair.snippet.length) {
          documentPairs.set(key, {
            from: source.id,
            to: finish.id,
            snippet,
          })
        }
      }
    }

    for (const pair of documentPairs.values()) {
      const from = positionById.get(pair.from)
      const to = positionById.get(pair.to)
      if (!from || !to) continue

      const key = `${pair.from}:${pair.to}`
      const accumulator = accumulators.get(key) ?? {
        from,
        to,
        documentIds: new Set<string>(),
        kinds: new Set<FinishEvidenceKind>(),
        dates: new Set<string>(),
        snippets: [],
      }
      accumulator.documentIds.add(document.id)
      document.kinds.forEach((kind) => accumulator.kinds.add(kind))
      if (document.date) accumulator.dates.add(document.date)
      if (!accumulator.snippets.includes(pair.snippet) && accumulator.snippets.length < 3) {
        accumulator.snippets.push(pair.snippet)
      }
      accumulators.set(key, accumulator)
    }
  }

  return [...accumulators.values()]
    .map((accumulator) => ({
      from: accumulator.from.id,
      to: accumulator.to.id,
      action: `${accumulator.from.nameKr} ${accumulator.to.nameKr}`,
      actionEn: `${accumulator.from.name} ${accumulator.to.name}`,
      type: "submission" as const,
      ruleSet: accumulator.to.ruleSet,
      evidence: evidenceSummary(accumulator),
      source: "evidence" as const,
    }))
    .sort((left, right) => transitionKey(left).localeCompare(transitionKey(right)))
}

export function mergeEvidenceFinishTransitions(
  transitions: readonly Transition[],
  evidenceTransitions: readonly Transition[],
): Transition[] {
  const merged = [...transitions]
  const indexByKey = new Map(
    merged.map((transition, index) => [transitionKey(transition), index]),
  )

  for (const evidenceTransition of evidenceTransitions) {
    const key = transitionKey(evidenceTransition)
    const existingIndex = indexByKey.get(key)
    if (existingIndex === undefined) {
      indexByKey.set(key, merged.length)
      merged.push(evidenceTransition)
      continue
    }

    merged[existingIndex] = {
      ...merged[existingIndex],
      evidence: evidenceTransition.evidence,
    }
  }

  return merged
}
