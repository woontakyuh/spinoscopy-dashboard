import type {
  FinishEvidenceKind,
  Position,
  SenseiEntry,
  Transition,
} from "@/lib/types/sensei"
import { POSITION_EVIDENCE_ALIASES } from "@/lib/sensei/evidenceFinishAliases"
import {
  findEvidenceMatches,
  type EvidenceMatch,
} from "@/lib/sensei/evidenceTextMatching"

interface EvidenceAccumulator {
  source: Position
  target: Position
  documentIds: Set<string>
  kinds: Set<FinishEvidenceKind>
  dates: Set<string>
  snippets: string[]
}

const MAX_CUE_DISTANCE = 36

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

function entrySegments(entry: SenseiEntry): string[] {
  return [entry.title, ...entry.note.split(/[\n.!?。]+/)]
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 1)
}

function nearestCueIndex(segment: string, target: EvidenceMatch): number | null {
  const indexes = [...segment.matchAll(/→|->|갈래|연결|진입|에서/g)]
    .map((match) => match.index)
  const nearest = indexes.reduce<number | null>((closest, index) => {
    if (Math.abs(index - target.index) > MAX_CUE_DISTANCE) return closest
    if (closest === null) return index
    return Math.abs(index - target.index) < Math.abs(closest - target.index)
      ? index
      : closest
  }, null)
  return nearest
}

function evidenceSnippet(
  source: Position,
  segment: string,
  target: EvidenceMatch,
): string {
  const start = Math.max(0, target.index - 55)
  const end = Math.min(segment.length, target.index + target.length + 80)
  const prefix = start > 0 ? "…" : ""
  const suffix = end < segment.length ? "…" : ""
  return `${source.nameKr} 기록 · ${prefix}${segment.slice(start, end).trim()}${suffix}`
}

export function buildEvidencePositionTransitions(
  entries: readonly SenseiEntry[],
  positions: readonly Position[],
): Transition[] {
  const passingPositions = positions.filter(
    (position) => position.layer === "passing",
  )
  const positionById = new Map(
    passingPositions.map((position) => [position.id, position]),
  )
  const accumulators = new Map<string, EvidenceAccumulator>()

  for (const entry of entries) {
    const tagCorpus = [
      ...entry.classTags,
      ...entry.studyTags,
      ...entry.sparringTags,
    ].join(" ")
    const contextIds = new Set(
      passingPositions.flatMap((position) =>
        findEvidenceMatches(
          tagCorpus,
          position,
          POSITION_EVIDENCE_ALIASES,
        ).map((match) => match.id),
      ),
    )
    if (contextIds.size === 0) continue

    const documentPairs = new Map<string, string>()
    for (const segment of entrySegments(entry)) {
      const segmentMatches = passingPositions.flatMap((position) =>
        findEvidenceMatches(
          segment,
          position,
          POSITION_EVIDENCE_ALIASES,
        ),
      )
      const segmentIds = new Set(segmentMatches.map((match) => match.id))
      if (segmentIds.size === 0) continue

      for (const targetMatch of segmentMatches) {
        const targetId = targetMatch.id
        const cueIndex = nearestCueIndex(segment, targetMatch)
        if (cueIndex === null) continue

        const directSourceIds = new Set(
          segmentMatches
            .filter((match) =>
              match.id !== targetId &&
              match.index < cueIndex,
            )
            .map((match) => match.id),
        )
        const fallbackSourceIds = [...contextIds].filter(
          (positionId) => !segmentIds.has(positionId),
        )
        const sourceIds = directSourceIds.size === 1
          ? [...directSourceIds]
          : fallbackSourceIds
        if (sourceIds.length !== 1) continue

        const sourceId = sourceIds[0]
        if (targetId === sourceId) continue
        const source = positionById.get(sourceId)
        const targetPosition = positionById.get(targetId)
        if (!source || !targetPosition) continue
        const key = `${sourceId}:${targetId}`
        const snippet = evidenceSnippet(source, segment, targetMatch)
        const existing = documentPairs.get(key)
        if (!existing || snippet.length > existing.length) {
          documentPairs.set(key, snippet)
        }
      }
    }

    for (const [key, snippet] of documentPairs) {
      const [sourceId, targetId] = key.split(":")
      const source = positionById.get(sourceId)
      const target = positionById.get(targetId)
      if (!source || !target) continue

      const accumulator = accumulators.get(key) ?? {
        source,
        target,
        documentIds: new Set<string>(),
        kinds: new Set<FinishEvidenceKind>(),
        dates: new Set<string>(),
        snippets: [],
      }
      accumulator.documentIds.add(entry.id)
      entryKinds(entry).forEach((kind) => accumulator.kinds.add(kind))
      if (entry.date) accumulator.dates.add(entry.date)
      if (!accumulator.snippets.includes(snippet) && accumulator.snippets.length < 3) {
        accumulator.snippets.push(snippet)
      }
      accumulators.set(key, accumulator)
    }
  }

  return [...accumulators.values()]
    .map((accumulator) => ({
      from: accumulator.source.id,
      to: accumulator.target.id,
      action: `${accumulator.source.nameKr} ${accumulator.target.nameKr}`,
      actionEn: `${accumulator.source.name} ${accumulator.target.name}`,
      type: "pass" as const,
      ruleSet: accumulator.target.ruleSet,
      evidence: {
        count: accumulator.documentIds.size,
        kinds: [...accumulator.kinds].sort(),
        dates: [...accumulator.dates].sort().reverse(),
        snippets: accumulator.snippets,
      },
      source: "evidence" as const,
    }))
    .sort((left, right) =>
      `${left.from}:${left.to}`.localeCompare(`${right.from}:${right.to}`),
    )
}
