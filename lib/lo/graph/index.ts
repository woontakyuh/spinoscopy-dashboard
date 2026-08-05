import type {
  BjjEvidence,
  BjjGameFlow,
  BjjGameFlowBranch,
  BjjGraphEdge,
  BjjGraphReadModel,
  BjjPlayerRating,
  BjjPosition,
  BjjRuleset,
  BjjTechnique,
  EvidenceOutcome,
  FrontmatterObject,
  FrontmatterValue,
  GraphDiagnostic,
  GraphNeighborhood,
  MarkdownSourceFile,
  ParsedFrontmatter,
  PositionTransition,
  SourceCitation,
  TechniqueBranch,
  TechniqueStatus,
} from "@/lib/types/lo-graph"

const RULESETS = new Set<BjjRuleset>(["common", "gi", "nogi"])
const TECHNIQUE_STATUSES = new Set<TechniqueStatus>(["hypothesis", "testing", "adopted", "shelved"])

type ParsedDocument = {
  path: string
  category: string
  frontmatter: ParsedFrontmatter
}

type Partner = {
  id: string
  name: string
  path: string
}

type EntityAliases = {
  positions: Map<string, string[]>
  techniques: Map<string, string[]>
}

/**
 * Parses the intentionally small YAML subset used by the BJJ repository.
 * It accepts scalars, inline scalar lists, scalar lists, and lists of shallow
 * mappings (the observed technique branch shape). It deliberately does not
 * attempt to execute or coerce general YAML.
 */
export function parseBjjFrontmatter(content: string, sourcePath: string): ParsedFrontmatter {
  const lines = content.replace(/\r\n?/g, "\n").split("\n")
  const diagnostics: GraphDiagnostic[] = []
  const data: Record<string, FrontmatterValue> = {}
  const fieldLines: Record<string, number[]> = {}

  if (lines[0] !== "---") {
    return { data, body: lines.join("\n"), bodyLine: 1, fieldLines, diagnostics }
  }

  const end = lines.findIndex((line, index) => index > 0 && line === "---")
  if (end === -1) {
    diagnostics.push(diagnostic(
      "error",
      "unclosed-frontmatter",
      "Frontmatter starts with --- but has no closing delimiter.",
      sourcePath,
      1,
    ))
    return { data, body: lines.slice(1).join("\n"), bodyLine: 2, fieldLines, diagnostics }
  }

  let activeListKey: string | undefined
  let activeObject: FrontmatterObject | undefined

  for (let index = 1; index < end; index += 1) {
    const line = lines[index]
    const lineNumber = index + 1
    if (!line.trim() || line.trimStart().startsWith("#")) continue

    const listItem = /^\s{2,}-\s+(.*)$/.exec(line)
    if (listItem) {
      if (!activeListKey || !Array.isArray(data[activeListKey])) {
        diagnostics.push(diagnostic(
          "error",
          "orphaned-frontmatter-list-item",
          "A frontmatter list item does not belong to a list field.",
          sourcePath,
          lineNumber,
          line,
        ))
        continue
      }

      const item = listItem[1]
      const mapping = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(item)
      if (mapping) {
        const object: FrontmatterObject = {
          [mapping[1]]: parseObjectScalar(mapping[2], sourcePath, lineNumber, diagnostics),
        }
        ;(data[activeListKey] as FrontmatterObject[]).push(object)
        activeObject = object
      } else {
        ;(data[activeListKey] as string[]).push(parseScalar(item, sourcePath, lineNumber, diagnostics) as string)
        activeObject = undefined
      }
      fieldLines[activeListKey].push(lineNumber)
      continue
    }

    const nestedField = /^\s{4,}([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line)
    if (nestedField && activeObject) {
      activeObject[nestedField[1]] = parseObjectScalar(nestedField[2], sourcePath, lineNumber, diagnostics)
      continue
    }

    const field = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line)
    if (!field) {
      diagnostics.push(diagnostic(
        "error",
        "invalid-frontmatter-line",
        "Expected a frontmatter key followed by a colon.",
        sourcePath,
        lineNumber,
        line,
      ))
      activeListKey = undefined
      activeObject = undefined
      continue
    }

    const [, key, rawValue] = field
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      diagnostics.push(diagnostic(
        "warning",
        "duplicate-frontmatter-key",
        `The frontmatter key "${key}" is declared more than once; the last declaration is used.`,
        sourcePath,
        lineNumber,
        line,
      ))
    }
    fieldLines[key] = [lineNumber]
    if (rawValue === "") {
      data[key] = []
      activeListKey = key
      activeObject = undefined
    } else {
      data[key] = parseScalar(rawValue, sourcePath, lineNumber, diagnostics)
      activeListKey = undefined
      activeObject = undefined
    }
  }

  return {
    data,
    body: lines.slice(end + 1).join("\n"),
    bodyLine: end + 2,
    fieldLines,
    diagnostics,
  }
}

/** Builds a deterministic, serializable graph read model from repository files. */
export function buildBjjGraph(sourceFiles: readonly MarkdownSourceFile[]): BjjGraphReadModel {
  const diagnostics: GraphDiagnostic[] = []
  const documents = sourceFiles
    .map((file) => ({
      path: normalizePath(file.path),
      category: normalizePath(file.path).split("/")[0] ?? "",
      frontmatter: parseBjjFrontmatter(file.content, normalizePath(file.path)),
    }))
    .sort((left, right) => left.path.localeCompare(right.path))

  for (const document of documents) diagnostics.push(...document.frontmatter.diagnostics)

  const positionDocuments = documents.filter((document) => document.category === "positions")
  const techniqueDocuments = documents.filter((document) => document.category === "techniques")
  const partnerDocuments = documents.filter((document) => document.category === "partners")
  const ratingDocuments = documents.filter((document) => document.category === "ratings")
  const logDocuments = documents.filter((document) => document.category === "log")
  const strategyDocuments = documents.filter((document) => document.category === "strategy")

  const positions: BjjPosition[] = []
  const positionDocumentsById = new Map<string, ParsedDocument>()
  const positionAliases = new Map<string, string[]>()
  for (const document of positionDocuments) {
    const position = parsePosition(document, diagnostics)
    if (!position) continue
    if (positionDocumentsById.has(position.id)) {
      diagnostics.push(diagnostic(
        "error",
        "duplicate-position-id",
        `Position id "${position.id}" is declared more than once.`,
        document.path,
        lineFor(document.frontmatter, "id"),
      ))
      continue
    }
    positions.push(position)
    positionDocumentsById.set(position.id, document)
    positionAliases.set(position.id, aliasesForPosition(position, document.frontmatter.body))
  }
  positions.sort(sortById)

  const partners = parsePartners(partnerDocuments, diagnostics)
  const techniques: BjjTechnique[] = []
  const branches: TechniqueBranch[] = []
  const techniqueAliases = new Map<string, string[]>()
  const techniqueDocumentsById = new Map<string, ParsedDocument>()
  for (const document of techniqueDocuments) {
    const parsed = parseTechnique(document, diagnostics)
    if (!parsed) continue
    if (techniqueDocumentsById.has(parsed.technique.id)) {
      diagnostics.push(diagnostic(
        "error",
        "duplicate-technique-id",
        `Technique id "${parsed.technique.id}" is declared more than once.`,
        document.path,
        lineFor(document.frontmatter, "id"),
      ))
      continue
    }
    techniques.push(parsed.technique)
    branches.push(...parsed.branches)
    techniqueDocumentsById.set(parsed.technique.id, document)
    techniqueAliases.set(parsed.technique.id, aliasesForTechnique(parsed.technique))
  }
  techniques.sort(sortById)
  branches.sort(sortById)

  const transitions = positionDocuments.flatMap((document) => {
    const id = stringValue(document.frontmatter.data, "id")
    return id && positionDocumentsById.has(id)
      ? parsePositionTransitions(id, document)
      : []
  }).sort(sortById)

  validatePositionReferences(positions, transitions, techniques, branches, diagnostics)

  const aliases: EntityAliases = { positions: positionAliases, techniques: techniqueAliases }
  const evidence = [
    ...parseTechniqueEvidence(techniques, techniqueDocumentsById),
    ...parseLogEvidence(logDocuments, partners, aliases),
  ].sort(sortById)
  const gameFlows = parseGameFlows(strategyDocuments, aliases).sort(sortById)
  const playerRatings = parsePlayerRatings(ratingDocuments, diagnostics).sort(sortById)

  const citations = uniqueCitations([
    ...positions.map((position) => position.source),
    ...techniques.map((technique) => technique.source),
    ...transitions.map((transition) => transition.citation),
    ...branches.map((branch) => branch.citation),
    ...evidence.map((item) => item.citation),
    ...gameFlows.flatMap((flow) => [flow.citation, ...flow.branches.map((branch) => branch.citation)]),
    ...playerRatings.map((rating) => rating.citation),
    ...diagnostics.map((item) => item.citation),
  ])

  return {
    positions,
    techniques,
    transitions,
    branches,
    evidence,
    gameFlows,
    playerRatings,
    citations,
    diagnostics: diagnostics.sort(sortDiagnostics),
  }
}

/** Returns all one-hop graph edges and source citations around a position. */
export function getGraphNeighborhood(graph: BjjGraphReadModel, positionId: string): GraphNeighborhood | null {
  const position = graph.positions.find((item) => item.id === positionId)
  if (!position) return null

  const outgoing: BjjGraphEdge[] = [
    ...graph.transitions
      .filter((transition) => transition.fromId === positionId)
      .map((value) => ({ type: "transition" as const, value })),
    ...graph.techniques
      .filter((technique) => technique.fromId === positionId)
      .map((value) => ({ type: "technique" as const, value })),
  ].sort(sortGraphEdges)
  const incoming: BjjGraphEdge[] = [
    ...graph.transitions
      .filter((transition) => transition.toId === positionId)
      .map((value) => ({ type: "transition" as const, value })),
    ...graph.techniques
      .filter((technique) => technique.toIds.includes(positionId))
      .map((value) => ({ type: "technique" as const, value })),
  ].sort(sortGraphEdges)

  const relatedIds = new Set<string>()
  for (const edge of [...outgoing, ...incoming]) {
    if (edge.type === "transition") {
      const relatedId = edge.value.fromId === positionId ? edge.value.toId : edge.value.fromId
      if (relatedId !== positionId) relatedIds.add(relatedId)
    } else {
      if (edge.value.fromId !== positionId) relatedIds.add(edge.value.fromId)
      for (const targetId of edge.value.toIds) {
        if (targetId !== positionId) relatedIds.add(targetId)
      }
    }
  }

  const techniques = uniqueById([
    ...outgoing.filter(isTechniqueEdge).map((edge) => edge.value),
    ...incoming.filter(isTechniqueEdge).map((edge) => edge.value),
  ]).sort(sortById)

  return {
    position,
    incoming,
    outgoing,
    relatedPositions: graph.positions.filter((item) => relatedIds.has(item.id)).sort(sortById),
    techniques,
    citations: uniqueCitations([
      position.source,
      ...outgoing.map((edge) => edge.type === "transition" ? edge.value.citation : edge.value.source),
      ...incoming.map((edge) => edge.type === "transition" ? edge.value.citation : edge.value.source),
    ]),
  }
}

function parsePosition(document: ParsedDocument, diagnostics: GraphDiagnostic[]): BjjPosition | null {
  const { data } = document.frontmatter
  const id = requiredString(data, "id", document, diagnostics)
  const name = requiredString(data, "name", document, diagnostics)
  const nameKr = requiredString(data, "name_kr", document, diagnostics)
  const layer = requiredString(data, "layer", document, diagnostics)
  const ruleset = requiredRuleset(data, document, diagnostics)
  if (!id || !name || !nameKr || !layer || !ruleset) return null

  const curriculumLessons = stringList(data, "curriculum_lessons")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value))

  return {
    id,
    name,
    nameKr,
    layer,
    family: stringValue(data, "family"),
    parentId: stringValue(data, "parent"),
    perspective: stringValue(data, "perspective"),
    ruleset,
    curriculumLessons,
    source: citation(document.path, lineFor(document.frontmatter, "id")),
  }
}

function parseTechnique(
  document: ParsedDocument,
  diagnostics: GraphDiagnostic[],
): { technique: BjjTechnique; branches: TechniqueBranch[] } | null {
  const { data } = document.frontmatter
  const id = requiredString(data, "id", document, diagnostics)
  const fromId = requiredString(data, "from", document, diagnostics)
  const toIds = stringList(data, "to")
  if (toIds.length === 0) {
    diagnostics.push(diagnostic(
      "error",
      "missing-required-field",
      "Technique metadata requires a non-empty " + '"to"' + " field.",
      document.path,
      lineFor(document.frontmatter, "to"),
    ))
  }
  const ruleset = requiredRuleset(data, document, diagnostics)
  const status = requiredTechniqueStatus(data, document, diagnostics)
  const sourceId = requiredString(data, "source", document, diagnostics)
  if (!id || !fromId || toIds.length === 0 || !ruleset || !status || !sourceId) return null

  const source = citation(document.path, lineFor(document.frontmatter, "id"))
  const name = titleFromBody(document.frontmatter.body) ?? id
  const explicitBranches = objectList(data, "branches")
  const branches = explicitBranches.length > 0
    ? explicitBranches.flatMap((branch, index) => {
      const targetId = branch.then ?? branch.to
      if (!targetId) {
        diagnostics.push(diagnostic(
          "error",
          "invalid-technique-branch",
          `Technique branch ${index + 1} requires a "then" or "to" target.`,
          document.path,
          lineFor(document.frontmatter, "branches", index + 1),
        ))
        return []
      }
      return [{
        id: `branch:${id}:${index + 1}`,
        techniqueId: id,
        targetId,
        condition: branch.if,
        label: branch.label,
        citation: citation(document.path, lineFor(document.frontmatter, "branches", index + 1)),
      }]
    })
    : toIds.length > 1
      ? toIds.map((targetId, index) => ({
        id: `branch:${id}:${index + 1}`,
        techniqueId: id,
        targetId,
        citation: source,
      }))
      : []

  const technique: BjjTechnique = {
    id,
    name,
    fromId,
    toIds,
    branches,
    ruleset,
    status,
    sourceId,
    firstLearned: stringValue(data, "first_learned"),
    instructor: stringValue(data, "instructor"),
    isCounter: /\bcounter\b|카운터/i.test(`${name}\n${document.frontmatter.body}`),
    source,
  }
  return { technique, branches }
}

function parsePositionTransitions(positionId: string, document: ParsedDocument): PositionTransition[] {
  const lines = document.frontmatter.body.split("\n")
  const transitions: PositionTransition[] = []
  let inOutgoingSection = false
  const occurrences = new Map<string, number>()

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^##\s+/.test(line)) {
      inOutgoingSection = /^##\s+나가는 전이/.test(line)
      continue
    }
    if (!inOutgoingSection) continue

    const match = /^-\s+\*\*(.+?)\*\*\s+\(([^)]+)\)\s*→\s*\[\[([^|\]]+)(?:\|[^\]]+)?\]\](?:\s+—\s*(.*))?$/.exec(line)
    if (!match) continue

    const [, label, rawKind, toId, tail] = match
    const kinds = rawKind.split(",").map((part) => part.trim())
    const status = kinds.find((kind): kind is TechniqueStatus => TECHNIQUE_STATUSES.has(kind as TechniqueStatus))
    const kind = kinds.find((item) => !TECHNIQUE_STATUSES.has(item as TechniqueStatus)) ?? "transition"
    const key = `${positionId}:${toId}`
    const occurrence = (occurrences.get(key) ?? 0) + 1
    occurrences.set(key, occurrence)
    const condition = tail?.replace(/^조건:\s*/, "").trim() || undefined
    transitions.push({
      id: `transition:${positionId}:${toId}:${occurrence}`,
      fromId: positionId,
      toId,
      label: label.trim(),
      kind,
      status,
      condition,
      citation: citation(document.path, document.frontmatter.bodyLine + index),
    })
  }
  return transitions
}

function parseTechniqueEvidence(
  techniques: readonly BjjTechnique[],
  documentsById: ReadonlyMap<string, ParsedDocument>,
): BjjEvidence[] {
  const evidence: BjjEvidence[] = []
  for (const technique of techniques) {
    const document = documentsById.get(technique.id)
    if (!document) continue
    const entries = stringList(document.frontmatter.data, "evidence")
    for (let index = 0; index < entries.length; index += 1) {
      const text = entries[index]
      evidence.push({
        id: `evidence:technique:${technique.id}:${index + 1}`,
        kind: "technique",
        date: dateFromText(text),
        outcome: outcomeFromText(text),
        text,
        subjectIds: [technique.id],
        playerIds: [],
        citation: citation(document.path, lineFor(document.frontmatter, "evidence", index + 1), text),
      })
    }
  }
  return evidence
}

function parseLogEvidence(
  documents: readonly ParsedDocument[],
  partners: readonly Partner[],
  aliases: EntityAliases,
): BjjEvidence[] {
  const evidence: BjjEvidence[] = []
  const partnerByPathStem = new Map(partners.map((partner) => [fileStem(partner.path), partner.id]))

  for (const document of documents) {
    const lines = document.frontmatter.body.split("\n")
    const date = dateFromText(fileStem(document.path))
    let sequence = 0
    for (let index = 0; index < lines.length; index += 1) {
      if (!isMarkdownTableRow(lines[index])) continue
      const headers = tableCells(lines[index]).map(normalizeSearch)
      const positionIndex = headers.findIndex((header) => header === "포지션" || header === "position")
      const techniqueIndex = headers.findIndex((header) => header === "기술" || header === "technique")
      const resultIndex = headers.findIndex((header) => header === "결과" || header === "result" || header === "outcome")
      if (positionIndex === -1 || techniqueIndex === -1 || resultIndex === -1) continue
      if (!isMarkdownTableDivider(lines[index + 1] ?? "")) continue

      index += 2
      while (index < lines.length && isMarkdownTableRow(lines[index])) {
        const cells = tableCells(lines[index])
        if (cells.length <= Math.max(positionIndex, techniqueIndex, resultIndex)) {
          index += 1
          continue
        }
        const text = cells.join(" | ")
        const subjectIds = uniqueStrings([
          ...findEntityIds(cells[positionIndex], aliases.positions),
          ...findEntityIds(cells[techniqueIndex], aliases.techniques),
        ])
        const playerIds = findPlayerIds(text, partnerByPathStem, partners)
        sequence += 1
        evidence.push({
          id: `evidence:log:${fileStem(document.path)}:${sequence}`,
          kind: "log",
          date,
          outcome: outcomeFromText(cells[resultIndex]),
          text,
          subjectIds,
          playerIds,
          citation: citation(document.path, document.frontmatter.bodyLine + index, lines[index]),
        })
        index += 1
      }
      index -= 1
    }
  }
  return evidence
}

function parseGameFlows(documents: readonly ParsedDocument[], aliases: EntityAliases): BjjGameFlow[] {
  const flows: BjjGameFlow[] = []
  for (const document of documents) {
    const ruleset = fileStem(document.path).toLowerCase() === "nogi" ? "nogi" : "gi"
    const lines = document.frontmatter.body.split("\n")
    let headingLine = -1
    for (let index = 0; index < lines.length; index += 1) {
      if (/^##\s+.*(척추 경로|a-game|a game)/i.test(lines[index])) {
        headingLine = index
        break
      }
    }
    if (headingLine === -1) continue

    const branches: BjjGameFlowBranch[] = []
    let inCodeFence = false
    for (let index = headingLine + 1; index < lines.length; index += 1) {
      const line = lines[index]
      if (line.trim().startsWith("```")) {
        inCodeFence = !inCodeFence
        continue
      }
      if (!inCodeFence && /^##\s+/.test(line)) break
      if (!inCodeFence || !line.includes("▶")) continue
      const positionIds = findEntityIds(line, aliases.positions)
      const techniqueIds = findEntityIds(line, aliases.techniques)
      branches.push({
        id: `flow:${fileStem(document.path)}:${branches.length + 1}`,
        text: line.trim(),
        positionIds,
        techniqueIds,
        citation: citation(document.path, document.frontmatter.bodyLine + index, line),
      })
    }
    if (branches.length === 0) continue

    const id = `${fileStem(document.path)}-a-game-spine`
    flows.push({
      id,
      name: `${ruleset === "nogi" ? "No-Gi" : "Gi"} A-game spine`,
      ruleset,
      status: /adopted/i.test(lines[headingLine]) ? "adopted" : "testing",
      branches,
      citation: citation(document.path, document.frontmatter.bodyLine + headingLine, lines[headingLine]),
    })
  }
  return flows
}

function parsePlayerRatings(documents: readonly ParsedDocument[], diagnostics: GraphDiagnostic[]): BjjPlayerRating[] {
  const ratings: BjjPlayerRating[] = []
  const ids = new Set<string>()
  for (const document of documents) {
    const id = requiredString(document.frontmatter.data, "id", document, diagnostics)
    const name = stringValue(document.frontmatter.data, "name") ?? stringValue(document.frontmatter.data, "label")
    const rawScore = stringValue(document.frontmatter.data, "score") ?? stringValue(document.frontmatter.data, "rating")
    const score = rawScore === undefined ? Number.NaN : Number(rawScore)
    const rawScale = stringValue(document.frontmatter.data, "scale")
    const scale = rawScale === undefined ? 100 : Number(rawScale)
    if (!name) {
      diagnostics.push(diagnostic("error", "missing-required-field", "Player rating metadata requires a name or label.", document.path, 1))
    }
    if (!Number.isFinite(score) || !Number.isFinite(scale) || scale <= 0 || score < 0 || score > scale) {
      diagnostics.push(diagnostic("error", "invalid-player-rating", "Player rating score must be between zero and its positive scale.", document.path, lineFor(document.frontmatter, "score")))
    }
    if (!id || !name || !Number.isFinite(score) || !Number.isFinite(scale) || scale <= 0 || score < 0 || score > scale) continue
    if (ids.has(id)) {
      diagnostics.push(diagnostic("error", "duplicate-player-rating-id", `Player rating id "${id}" is declared more than once.`, document.path, lineFor(document.frontmatter, "id")))
      continue
    }
    ids.add(id)
    ratings.push({
      id,
      name,
      score,
      scale,
      dimension: stringValue(document.frontmatter.data, "dimension"),
      citation: citation(document.path, lineFor(document.frontmatter, "id")),
    })
  }
  return ratings
}

function parsePartners(documents: readonly ParsedDocument[], diagnostics: GraphDiagnostic[]): Partner[] {
  const partners: Partner[] = []
  const ids = new Set<string>()
  for (const document of documents) {
    const id = requiredString(document.frontmatter.data, "id", document, diagnostics)
    const name = requiredString(document.frontmatter.data, "name", document, diagnostics)
    if (!id || !name || ids.has(id)) continue
    ids.add(id)
    partners.push({ id, name, path: document.path })
  }
  return partners.sort(sortById)
}

function validatePositionReferences(
  positions: readonly BjjPosition[],
  transitions: readonly PositionTransition[],
  techniques: readonly BjjTechnique[],
  branches: readonly TechniqueBranch[],
  diagnostics: GraphDiagnostic[],
): void {
  const ids = new Set(positions.map((position) => position.id))
  for (const transition of transitions) {
    if (!ids.has(transition.toId)) {
      diagnostics.push(diagnostic(
        "warning",
        "unresolved-position-reference",
        `Transition "${transition.id}" points to unknown position "${transition.toId}".`,
        transition.citation.path,
        transition.citation.line,
      ))
    }
  }
  for (const technique of techniques) {
    if (!ids.has(technique.fromId)) {
      diagnostics.push(diagnostic(
        "warning",
        "unresolved-position-reference",
        `Technique "${technique.id}" starts at unknown position "${technique.fromId}".`,
        technique.source.path,
        technique.source.line,
      ))
    }
    for (const targetId of technique.toIds) {
      if (!ids.has(targetId)) {
        diagnostics.push(diagnostic(
          "warning",
          "unresolved-position-reference",
          `Technique "${technique.id}" points to unknown position "${targetId}".`,
          technique.source.path,
          technique.source.line,
        ))
      }
    }
  }
  for (const branch of branches) {
    if (!ids.has(branch.targetId)) {
      diagnostics.push(diagnostic(
        "warning",
        "unresolved-position-reference",
        `Technique branch "${branch.id}" points to unknown position "${branch.targetId}".`,
        branch.citation.path,
        branch.citation.line,
      ))
    }
  }
}

function aliasesForPosition(position: BjjPosition, body: string): string[] {
  const aliases = [position.id, position.name, position.nameKr]
  const roleLine = body.split("\n").find((line) => line.includes("내 게임에서의 역할"))
  const roleAlias = roleLine ? /\(([^():]+)(?::[^)]*)?\)/.exec(roleLine)?.[1] : undefined
  if (roleAlias) aliases.push(roleAlias)
  return uniqueStrings(aliases.filter((alias) => normalizeSearch(alias).length >= 2))
}

function aliasesForTechnique(technique: BjjTechnique): string[] {
  const title = technique.name.trim()
  const conciseTitle = title.split(/[（(]/, 1)[0].trim()
  return uniqueStrings([technique.id, title, conciseTitle].filter((alias) => normalizeSearch(alias).length >= 2))
}

function findEntityIds(text: string, aliases: ReadonlyMap<string, string[]>): string[] {
  const normalized = normalizeSearch(text)
  const matches = [...aliases.entries()]
    .filter(([, values]) => values.some((value) => normalized.includes(normalizeSearch(value))))
    .map(([id]) => id)
  return matches.sort((left, right) => left.localeCompare(right))
}

function findPlayerIds(
  text: string,
  partnerByPathStem: ReadonlyMap<string, string>,
  partners: readonly Partner[],
): string[] {
  const ids = new Set<string>()
  for (const match of text.matchAll(/\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/g)) {
    const partner = partners.find((item) => item.id === match[1])
    if (partner) ids.add(partner.id)
  }
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const pathStem = fileStem(match[1].replace(/^\.\.\/partners\//, ""))
    const partnerId = partnerByPathStem.get(pathStem)
    if (partnerId) ids.add(partnerId)
  }
  const normalized = normalizeSearch(text)
  for (const partner of partners) {
    if (normalized.includes(normalizeSearch(partner.name))) ids.add(partner.id)
  }
  return [...ids].sort((left, right) => left.localeCompare(right))
}

function parseScalar(
  raw: string,
  sourcePath: string,
  line: number,
  diagnostics: GraphDiagnostic[],
): string | string[] {
  const value = raw.trim()
  if (value.startsWith("[") && value.endsWith("]")) {
    const items = value.slice(1, -1).split(",").map((item) => item.trim()).filter(Boolean)
    return items.map((item) => parseScalar(item, sourcePath, line, diagnostics) as string)
  }
  if (value.startsWith('"')) {
    if (value.length < 2 || !value.endsWith('"')) {
      diagnostics.push(diagnostic("error", "malformed-quoted-scalar", "Quoted scalar is missing its closing quote.", sourcePath, line, raw))
      return value.slice(1)
    }
    return value.slice(1, -1).replace(/\\"/g, '"')
  }
  return value
}

function parseObjectScalar(
  raw: string,
  sourcePath: string,
  line: number,
  diagnostics: GraphDiagnostic[],
): string {
  const value = parseScalar(raw, sourcePath, line, diagnostics)
  if (typeof value === "string") return value
  diagnostics.push(diagnostic(
    "error",
    "invalid-frontmatter-branch-value",
    "Nested branch values must be scalar strings.",
    sourcePath,
    line,
    raw,
  ))
  return value.join(",")
}

function requiredString(
  data: Record<string, FrontmatterValue>,
  key: string,
  document: ParsedDocument,
  diagnostics: GraphDiagnostic[],
): string | undefined {
  const value = stringValue(data, key)
  if (value) return value
  diagnostics.push(diagnostic(
    "error",
    "missing-required-field",
    `Metadata requires a non-empty "${key}" field.`,
    document.path,
    lineFor(document.frontmatter, key),
  ))
  return undefined
}

function requiredRuleset(
  data: Record<string, FrontmatterValue>,
  document: ParsedDocument,
  diagnostics: GraphDiagnostic[],
): BjjRuleset | undefined {
  const value = requiredString(data, "ruleset", document, diagnostics)
  if (!value) return undefined
  if (RULESETS.has(value as BjjRuleset)) return value as BjjRuleset
  diagnostics.push(diagnostic(
    "error",
    "invalid-ruleset",
    `Ruleset "${value}" must be one of common, gi, or nogi.`,
    document.path,
    lineFor(document.frontmatter, "ruleset"),
  ))
  return undefined
}

function requiredTechniqueStatus(
  data: Record<string, FrontmatterValue>,
  document: ParsedDocument,
  diagnostics: GraphDiagnostic[],
): TechniqueStatus | undefined {
  const value = requiredString(data, "status", document, diagnostics)
  if (!value) return undefined
  if (TECHNIQUE_STATUSES.has(value as TechniqueStatus)) return value as TechniqueStatus
  diagnostics.push(diagnostic(
    "error",
    "invalid-technique-status",
    `Technique status "${value}" is not supported.`,
    document.path,
    lineFor(document.frontmatter, "status"),
  ))
  return undefined
}

function stringValue(data: Record<string, FrontmatterValue>, key: string): string | undefined {
  const value = data[key]
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function stringList(data: Record<string, FrontmatterValue>, key: string): string[] {
  const value = data[key]
  if (typeof value === "string") return value.trim() ? [value.trim()] : []
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
}

function objectList(data: Record<string, FrontmatterValue>, key: string): FrontmatterObject[] {
  const value = data[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is FrontmatterObject => typeof item === "object" && !Array.isArray(item))
}

function lineFor(frontmatter: ParsedFrontmatter, key: string, offset = 0): number {
  return frontmatter.fieldLines[key]?.[offset] ?? frontmatter.fieldLines[key]?.[0] ?? 1
}

function titleFromBody(body: string): string | undefined {
  return body.split("\n").map((line) => /^#\s+(.+)$/.exec(line)?.[1]?.trim()).find(Boolean)
}

function isMarkdownTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line)
}

function isMarkdownTableDivider(line: string): boolean {
  return /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line)
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim())
}

function outcomeFromText(text: string): EvidenceOutcome {
  if (/✅|성공/.test(text)) return "success"
  if (/❌|실패/.test(text)) return "failure"
  return "observation"
}

function dateFromText(text: string): string | undefined {
  return /\b(\d{4}-\d{2}-\d{2})\b/.exec(text)?.[1]
}

function citation(path: string, line: number, excerpt?: string): SourceCitation {
  return {
    id: `bjj:${path}#L${line}`,
    path,
    line,
    ...(excerpt ? { excerpt: excerpt.trim() } : {}),
  }
}

function diagnostic(
  severity: GraphDiagnostic["severity"],
  code: string,
  message: string,
  path: string,
  line: number,
  excerpt?: string,
): GraphDiagnostic {
  return { severity, code, message, citation: citation(path, line, excerpt) }
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "")
}

function fileStem(value: string): string {
  return normalizePath(value).split("/").pop()?.replace(/\.md$/i, "") ?? value
}

function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function uniqueCitations(citations: readonly SourceCitation[]): SourceCitation[] {
  const byId = new Map<string, SourceCitation>()
  for (const item of citations) {
    const previous = byId.get(item.id)
    if (!previous || (!previous.excerpt && item.excerpt)) byId.set(item.id, item)
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id))
}

function uniqueById<T extends { id: string }>(values: readonly T[]): T[] {
  const byId = new Map<string, T>()
  for (const value of values) byId.set(value.id, value)
  return [...byId.values()]
}

function sortById<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id)
}

function sortDiagnostics(left: GraphDiagnostic, right: GraphDiagnostic): number {
  return `${left.severity}:${left.citation.id}:${left.code}`.localeCompare(`${right.severity}:${right.citation.id}:${right.code}`)
}

function sortGraphEdges(left: BjjGraphEdge, right: BjjGraphEdge): number {
  if (left.type !== right.type) return left.type === "transition" ? -1 : 1
  return left.value.id.localeCompare(right.value.id)
}

function isTechniqueEdge(edge: BjjGraphEdge): edge is Extract<BjjGraphEdge, { type: "technique" }> {
  return edge.type === "technique"
}
