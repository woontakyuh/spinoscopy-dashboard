import { stat } from "node:fs/promises"
import path from "node:path"

import { z } from "zod"

import { getGraphNeighborhood } from "@/lib/lo/graph"
import { loadBjjGraph } from "@/lib/lo/graph/server"
import { listBjjTrainingSessions, listFitnessRecords } from "@/lib/notion/loFitness"
import { createLoMemory, listLoMemories } from "@/lib/notion/loMemory"
import { getLoProfile } from "@/lib/notion/loProfile"
import type {
  BjjEvidence,
  BjjGameFlow,
  BjjGraphReadModel,
  SourceCitation,
} from "@/lib/types/lo-graph"
import {
  LO_MEMORY_CATEGORIES,
  LO_MEMORY_SOURCE_KINDS,
  type LoBjjTrainingQuery,
  type LoBjjTrainingSession,
  type LoFitnessRecord,
  type LoMemory,
  type LoMemoryCreateInput,
  type LoMemoryQuery,
  type LoProfile,
} from "@/lib/types/lo-v2"

export const LO_TOOL_NAMES = [
  "lo.profile.get",
  "lo.training.recent",
  "lo.fitness.trends",
  "lo.graph.neighborhood",
  "lo.graph.flow.compare",
  "lo.memory.search",
  "lo.memory.save",
  "lo.sync.status",
] as const

export type LoToolName = (typeof LO_TOOL_NAMES)[number]
export type LoDashboardSectionStatus = "ready" | "empty" | "error"
export type LoCitationSource = "notion" | "bjj"

export interface LoCitation {
  /** Stable ID for citation references in a single dashboard or tool response. */
  id: string
  source: LoCitationSource
  label: string
  href?: string
  path?: string
  line?: number
  excerpt?: string
  capturedAt?: string
}

export interface LoDashboardSection<T> {
  status: LoDashboardSectionStatus
  data: T | null
  citations: LoCitation[]
  error?: string
}

export const LO_DASHBOARD_VERSION = "v1"

/** The only Fitness Log measurements that leave the server through this surface. */
export const LO_FITNESS_METRIC_ALLOWLIST = ["weightKg", "bodyFatPercent", "smmKg", "pushUps"] as const
export type LoFitnessTrendMetric = (typeof LO_FITNESS_METRIC_ALLOWLIST)[number]

export interface LoFitnessTrendPoint {
  date: string
  value: number
  citationId: string
}

export interface LoFitnessTrend {
  metric: LoFitnessTrendMetric
  latest: LoFitnessTrendPoint
  baseline: LoFitnessTrendPoint
  delta: number
  direction: "up" | "down" | "flat"
  points: LoFitnessTrendPoint[]
}

export interface LoFitnessRecordView {
  pageId: string
  date: string | null
  recordType: LoFitnessRecord["recordType"]
  metrics: Pick<LoFitnessRecord["metrics"], LoFitnessTrendMetric>
}

export interface LoFitnessSnapshotView {
  currentRegimen: LoFitnessRecordView | null
  latestDailyLog: LoFitnessRecordView | null
}

export interface LoFitnessDashboardData {
  /** No readiness formula is implemented, so this is deliberately never inferred. */
  readiness: null
  readinessAssessment: "not_assessed"
  snapshot: LoFitnessSnapshotView
  trends: LoFitnessTrend[]
}

export interface LoSyncSourceStatus {
  id: "profile" | "training" | "fitness" | "graph" | "memory"
  status: LoDashboardSectionStatus
  checkedAt: string
  lastUpdatedAt?: string
  error?: string
}

export interface LoSyncStatus {
  sources: LoSyncSourceStatus[]
}

export interface LoDashboardSource extends LoSyncSourceStatus {
  kind: LoCitationSource
  citationIds: string[]
}

export interface LoDashboardData {
  version: typeof LO_DASHBOARD_VERSION
  generatedAt: string
  profile: LoDashboardSection<LoProfile>
  training: LoDashboardSection<LoBjjTrainingSession[]>
  fitness: LoDashboardSection<LoFitnessDashboardData>
  graph: LoDashboardSection<BjjGraphReadModel>
  /** No legend source is currently citeable, so this remains explicitly empty. */
  legends: LoDashboardSection<never[]>
  memory: LoDashboardSection<LoMemory[]>
  sync: LoDashboardSection<LoSyncStatus>
  sources: LoDashboardSource[]
  citationIdsBySubject: Record<string, string[]>
  graphDiagnostics: BjjGraphReadModel["diagnostics"]
  citations: LoCitation[]
}

export interface LoToolDefinition {
  name: LoToolName
  description: string
  inputSchema: Record<string, unknown>
}

export interface LoToolResult<T = unknown> {
  tool: LoToolName
  data: T
  citations: LoCitation[]
}

export interface LoDashboardDependencies {
  now: () => Date
  getProfile: () => Promise<LoProfile>
  listTraining: (options: LoBjjTrainingQuery) => Promise<LoBjjTrainingSession[]>
  listFitnessRecords: (limit?: number) => Promise<LoFitnessRecord[]>
  listMemories: (options: LoMemoryQuery) => Promise<LoMemory[]>
  createMemory: (input: LoMemoryCreateInput) => Promise<LoMemory>
  loadGraph: () => Promise<BjjGraphReadModel>
}

const POSITION_ID = /^[a-z0-9][a-z0-9_-]{0,119}$/
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
const RESTRICTED_HEALTH_DETAIL = /\b(?:medication|medicine|injection|inject(?:ion|ed)?|dose|dosage|mounjaro|tirzepatide|semaglutide|ozempic|wegovy|zepbound|saxenda|victoza)\b|마운자로|주사|투약|약물|복용량/i

const profileInputSchema = z.object({}).strict()
const recentTrainingInputSchema = z.object({
  limit: z.number().int().min(1).max(20).default(10),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: "from must be on or before to",
  path: ["to"],
})
const fitnessTrendsInputSchema = z.object({
  limit: z.number().int().min(2).max(90).default(30),
  metrics: z.array(z.enum(LO_FITNESS_METRIC_ALLOWLIST)).min(1).max(LO_FITNESS_METRIC_ALLOWLIST.length).default([...LO_FITNESS_METRIC_ALLOWLIST]),
}).strict()
const graphNeighborhoodInputSchema = z.object({
  positionId: z.string().regex(POSITION_ID, "positionId must be a graph identifier, not a path"),
  evidenceLimit: z.number().int().min(1).max(50).default(10),
}).strict()
const graphFlowComparisonInputSchema = z.object({
  leftFlowId: z.string().regex(POSITION_ID, "leftFlowId must be a graph identifier, not a path"),
  rightFlowId: z.string().regex(POSITION_ID, "rightFlowId must be a graph identifier, not a path"),
}).strict().refine((value) => value.leftFlowId !== value.rightFlowId, {
  message: "leftFlowId and rightFlowId must differ",
  path: ["rightFlowId"],
})
const memorySearchInputSchema = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(20).default(10),
  category: z.enum(LO_MEMORY_CATEGORIES).optional(),
  minImportance: z.number().int().min(1).max(5).optional(),
}).strict()
const memorySaveInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(2_000),
  category: z.enum(LO_MEMORY_CATEGORIES),
  importance: z.number().int().min(1).max(5).optional(),
  source: z.object({
    kind: z.enum(LO_MEMORY_SOURCE_KINDS),
    reference: z.string().trim().min(1).max(500),
    capturedAt: z.string().regex(ISO_TIMESTAMP, "source.capturedAt must be an ISO UTC timestamp"),
  }).strict(),
}).strict()
const syncStatusInputSchema = z.object({}).strict()

const toolSchemas = {
  "lo.profile.get": profileInputSchema,
  "lo.training.recent": recentTrainingInputSchema,
  "lo.fitness.trends": fitnessTrendsInputSchema,
  "lo.graph.neighborhood": graphNeighborhoodInputSchema,
  "lo.graph.flow.compare": graphFlowComparisonInputSchema,
  "lo.memory.search": memorySearchInputSchema,
  "lo.memory.save": memorySaveInputSchema,
  "lo.sync.status": syncStatusInputSchema,
} as const

const toolDescriptions: Record<LoToolName, string> = {
  "lo.profile.get": "Read the governed Lo profile and its Notion citation.",
  "lo.training.recent": "Read a bounded, date-filtered set of recent BJJ Training sessions.",
  "lo.fitness.trends": "Calculate bounded Fitness Log measurement trends from dated daily records.",
  "lo.graph.neighborhood": "Read one BJJ graph position, its one-hop edges, and bounded related evidence.",
  "lo.graph.flow.compare": "Compare two named BJJ game flows without reading arbitrary files.",
  "lo.memory.search": "Search active durable Lo Memory facts; transcripts are neither read nor returned.",
  "lo.memory.save": "Explicitly persist one distilled durable Lo Memory fact with source metadata.",
  "lo.sync.status": "Report the current availability and observed freshness of governed Lo sources.",
}

const toolCallSchema = z.object({
  name: z.enum(LO_TOOL_NAMES),
  input: z.unknown(),
}).strict()

/**
 * Lists the only operations exposed through the gateway. The JSON schemas are
 * serializable so a remote caller never has to infer accepted fields from text.
 */
export function listLoToolDefinitions(): LoToolDefinition[] {
  return LO_TOOL_NAMES.map((name) => ({
    name,
    description: toolDescriptions[name],
    inputSchema: z.toJSONSchema(toolSchemas[name]),
  }))
}

/** Creates an isolated, injectable service for the dashboard API and Mac gateway. */
export function createLoDashboardService(overrides: Partial<LoDashboardDependencies> = {}) {
  const dependencies: LoDashboardDependencies = { ...defaultDependencies(), ...overrides }

  async function getDashboard(): Promise<LoDashboardData> {
    const checkedAt = dependencies.now().toISOString()
    const [profile, training, fitness, graph, memory] = await Promise.all([
      resolveSection(() => dependencies.getProfile(), profileCitations, null),
      resolveSection(async () => filterRestrictedTraining(await dependencies.listTraining({ limit: 12 })), trainingCitations, []),
      resolveSection(() => dependencies.listFitnessRecords(), fitnessCitations, []),
      resolveSection(() => dependencies.loadGraph(), (model) => graphCitations(model), null),
      resolveSection(async () => filterRestrictedMemories(await dependencies.listMemories({ limit: 20 })), memoryCitations, []),
    ])

    const fitnessData = fitness.data === null ? null : {
      readiness: null,
      readinessAssessment: "not_assessed" as const,
      snapshot: fitnessSnapshot(fitness.data),
      trends: buildFitnessTrends(fitness.data, [...LO_FITNESS_METRIC_ALLOWLIST], 30),
    }
    const fitnessSection: LoDashboardSection<LoFitnessDashboardData> = {
      status: fitness.status === "ready" && fitnessData && fitnessData.trends.length === 0 ? "empty" : fitness.status,
      data: fitnessData,
      citations: fitness.citations,
      ...(fitness.error ? { error: fitness.error } : {}),
    }

    const sourceSections = [profile, training, fitnessSection, graph, memory]
    const sources = [
      dashboardSource("profile", "notion", profile, checkedAt, profile.data?.trainingStartDate),
      dashboardSource("training", "notion", training, checkedAt, latestTrainingDate(training.data)),
      dashboardSource("fitness", "notion", fitnessSection, checkedAt, fitnessData?.snapshot.latestDailyLog?.date ?? undefined),
      dashboardSource("graph", "bjj", graph, checkedAt),
      dashboardSource("memory", "notion", memory, checkedAt, latestMemoryEdit(memory.data)),
    ]
    const syncData: LoSyncStatus = {
      sources: sources.map((source) => ({
        id: source.id,
        status: source.status,
        checkedAt: source.checkedAt,
        ...(source.lastUpdatedAt ? { lastUpdatedAt: source.lastUpdatedAt } : {}),
        ...(source.error ? { error: source.error } : {}),
      })),
    }
    const syncStatus: LoDashboardSectionStatus = sourceSections.every((section) => section.status === "error")
      ? "error"
      : "ready"
    const sync: LoDashboardSection<LoSyncStatus> = {
      status: syncStatus,
      data: syncData,
      citations: uniqueCitations(sourceSections.flatMap((section) => section.citations)),
      ...(syncStatus === "error" ? { error: "All Lo sources are unavailable" } : {}),
    }
    const legends: LoDashboardSection<never[]> = { status: "empty", data: [], citations: [] }

    return {
      version: LO_DASHBOARD_VERSION,
      generatedAt: checkedAt,
      profile,
      training,
      fitness: fitnessSection,
      graph,
      legends,
      memory,
      sync,
      sources,
      citationIdsBySubject: subjectCitationIds(profile, training, fitness.data, graph, memory),
      graphDiagnostics: graph.data?.diagnostics ?? [],
      citations: uniqueCitations([...sync.citations]),
    }
  }

  async function executeTool(call: unknown): Promise<LoToolResult> {
    const { name, input } = toolCallSchema.parse(call)

    switch (name) {
      case "lo.profile.get": {
        profileInputSchema.parse(input)
        const value = await dependencies.getProfile()
        return toolResult(name, value, profileCitations(value))
      }
      case "lo.training.recent": {
        const options = recentTrainingInputSchema.parse(input)
        const sessions = filterRestrictedTraining(await dependencies.listTraining(options))
        return toolResult(name, sessions, trainingCitations(sessions))
      }
      case "lo.fitness.trends": {
        const options = fitnessTrendsInputSchema.parse(input)
        const records = await dependencies.listFitnessRecords(options.limit)
        const trends = buildFitnessTrends(records, options.metrics, options.limit)
        return toolResult(name, {
          readiness: null,
          readinessAssessment: "not_assessed" as const,
          snapshot: fitnessSnapshot(records),
          trends,
        }, fitnessCitations(records))
      }
      case "lo.graph.neighborhood": {
        const options = graphNeighborhoodInputSchema.parse(input)
        const model = await dependencies.loadGraph()
        const neighborhood = getGraphNeighborhood(model, options.positionId)
        if (!neighborhood) throw new Error(`Unknown graph position: ${options.positionId}`)
        const relatedIds = new Set([neighborhood.position.id, ...neighborhood.techniques.map((technique) => technique.id)])
        const evidence = model.evidence
          .filter((item) => item.subjectIds.some((id) => relatedIds.has(id)))
          .sort(sortEvidenceNewestFirst)
          .slice(0, options.evidenceLimit)
        return toolResult(name, { neighborhood, evidence }, graphCitations([
          ...neighborhood.citations,
          ...evidence.map((item) => item.citation),
        ]))
      }
      case "lo.graph.flow.compare": {
        const options = graphFlowComparisonInputSchema.parse(input)
        const model = await dependencies.loadGraph()
        const left = flowById(model, options.leftFlowId)
        const right = flowById(model, options.rightFlowId)
        const leftPositionIds = sortedFlowIds(left.branches.flatMap((branch) => branch.positionIds))
        const rightPositionIds = sortedFlowIds(right.branches.flatMap((branch) => branch.positionIds))
        const leftTechniqueIds = sortedFlowIds(left.branches.flatMap((branch) => branch.techniqueIds))
        const rightTechniqueIds = sortedFlowIds(right.branches.flatMap((branch) => branch.techniqueIds))
        return toolResult(name, {
          left,
          right,
          sharedPositionIds: intersection(leftPositionIds, rightPositionIds),
          leftOnlyPositionIds: difference(leftPositionIds, rightPositionIds),
          rightOnlyPositionIds: difference(rightPositionIds, leftPositionIds),
          sharedTechniqueIds: intersection(leftTechniqueIds, rightTechniqueIds),
          leftOnlyTechniqueIds: difference(leftTechniqueIds, rightTechniqueIds),
          rightOnlyTechniqueIds: difference(rightTechniqueIds, leftTechniqueIds),
        }, graphCitations([
          left.citation,
          right.citation,
          ...left.branches.map((branch) => branch.citation),
          ...right.branches.map((branch) => branch.citation),
        ]))
      }
      case "lo.memory.search": {
        const options = memorySearchInputSchema.parse(input)
        const memories = filterRestrictedMemories(await dependencies.listMemories({
          status: "active",
          limit: 100,
          ...(options.category ? { category: options.category } : {}),
          ...(options.minImportance === undefined ? {} : { minImportance: options.minImportance }),
        }))
        const matches = searchMemories(memories, options.query, options.limit)
        return toolResult(name, matches, memoryCitations(matches))
      }
      case "lo.memory.save": {
        const inputData = memorySaveInputSchema.parse(input)
        const created = await dependencies.createMemory(inputData)
        return toolResult(name, created, memoryCitations([created]))
      }
      case "lo.sync.status": {
        syncStatusInputSchema.parse(input)
        const dashboard = await getDashboard()
        return toolResult(name, dashboard.sync.data, dashboard.sync.citations)
      }
    }
  }

  return { getDashboard, executeTool }
}

/** Default service used by the Next.js route. */
export async function getLoDashboard(): Promise<LoDashboardData> {
  return createLoDashboardService().getDashboard()
}

function defaultDependencies(): LoDashboardDependencies {
  return {
    now: () => new Date(),
    getProfile: getLoProfile,
    listTraining: listBjjTrainingSessions,
    listFitnessRecords,
    listMemories: listLoMemories,
    createMemory: createLoMemory,
    loadGraph: async () => loadBjjGraph(await bjjGraphRoot()),
  }
}

/** The graph root is deployment configuration, never a dashboard or tool input. */
async function bjjGraphRoot(): Promise<string> {
  const root = process.env.BJJ_GRAPH_ROOT?.trim()
  if (!root) throw new Error("BJJ_GRAPH_ROOT is not configured")
  if (!path.isAbsolute(root)) throw new Error("BJJ_GRAPH_ROOT must be an absolute directory")
  try {
    if (!(await stat(root)).isDirectory()) throw new Error("not a directory")
  } catch {
    throw new Error("BJJ_GRAPH_ROOT must reference an accessible directory")
  }
  return root
}

async function resolveSection<T>(
  load: () => Promise<T>,
  citationsFor: (data: T) => LoCitation[],
  emptyValue: T | null,
): Promise<LoDashboardSection<T>> {
  try {
    const data = await load()
    return {
      status: isEmpty(data) ? "empty" : "ready",
      data,
      citations: citationsFor(data),
    }
  } catch (error) {
    return {
      status: "error",
      data: emptyValue,
      citations: [],
      error: errorMessage(error),
    }
  }
}

function isEmpty(value: unknown): boolean {
  return value === null || (Array.isArray(value) && value.length === 0)
}

function fitnessSnapshot(records: readonly LoFitnessRecord[]): LoFitnessSnapshotView {
  const currentRegimen = records.find((record) => record.recordType === "Current regimen") ?? null
  const latestDailyLog = records
    .filter((record) => record.recordType === "Daily log")
    .sort((left, right) => (right.date ?? "").localeCompare(left.date ?? ""))[0] ?? null
  return {
    currentRegimen: currentRegimen ? fitnessRecordView(currentRegimen) : null,
    latestDailyLog: latestDailyLog ? fitnessRecordView(latestDailyLog) : null,
  }
}

function fitnessRecordView(record: LoFitnessRecord): LoFitnessRecordView {
  return {
    pageId: record.pageId,
    date: record.date,
    recordType: record.recordType,
    metrics: {
      weightKg: record.metrics.weightKg,
      bodyFatPercent: record.metrics.bodyFatPercent,
      smmKg: record.metrics.smmKg,
      pushUps: record.metrics.pushUps,
    },
  }
}

function buildFitnessTrends(
  records: readonly LoFitnessRecord[],
  metrics: readonly LoFitnessTrendMetric[],
  limit: number,
): LoFitnessTrend[] {
  const dailyRecords = records
    .filter((record) => record.recordType === "Daily log" && record.date)
    .sort((left, right) => (left.date ?? "").localeCompare(right.date ?? ""))

  return metrics.flatMap((metric): LoFitnessTrend[] => {
    const points = dailyRecords
      .flatMap((record): LoFitnessTrendPoint[] => {
        const value = record.metrics[metric]
        return record.date !== null && value !== null ? [{
          date: record.date,
          value,
          citationId: fitnessCitation(record).id,
        }] : []
      })
      .slice(-limit)
    if (points.length < 2) return []
    const baseline = points[0]
    const latest = points[points.length - 1]
    const delta = roundTrendDelta(latest.value - baseline.value)
    return [{
      metric,
      latest,
      baseline,
      delta,
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      points,
    }]
  })
}

function roundTrendDelta(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function filterRestrictedTraining(sessions: readonly LoBjjTrainingSession[]): LoBjjTrainingSession[] {
  return sessions.filter((session) => !hasRestrictedHealthDetail([
    session.url,
    session.name,
    session.instructor,
    session.gym,
    ...session.classTags,
    ...session.sparringTags,
    ...session.studyTags,
    session.note,
    session.todayFocus,
    session.videoUrl,
    session.videoTitle,
  ]))
}

function filterRestrictedMemories(memories: readonly LoMemory[]): LoMemory[] {
  return memories.filter((memory) => !hasRestrictedHealthDetail([
    memory.url,
    memory.name,
    memory.content,
    memory.source.reference,
  ]))
}

function hasRestrictedHealthDetail(values: readonly (string | null)[]): boolean {
  return values.some((value) => value !== null && RESTRICTED_HEALTH_DETAIL.test(value))
}

function profileCitations(profile: LoProfile): LoCitation[] {
  return [{
    id: `notion:profile:${profile.pageId}`,
    source: "notion",
    label: `Lo Profile: ${profile.name}`,
    href: profile.url,
  }]
}

function trainingCitations(sessions: readonly LoBjjTrainingSession[]): LoCitation[] {
  return sessions.map((session) => ({
    id: `notion:training:${session.pageId}`,
    source: "notion" as const,
    label: `BJJ Training: ${session.name || session.pageId}`,
    href: session.url,
    ...(session.date ? { capturedAt: session.date } : {}),
  }))
}

function fitnessCitation(record: LoFitnessRecord): LoCitation {
  return {
    id: `notion:fitness:${record.pageId}`,
    source: "notion",
    label: `Fitness Log: ${record.date ?? "undated"}`,
    ...(record.date ? { capturedAt: record.date } : {}),
  }
}

function fitnessCitations(records: readonly LoFitnessRecord[]): LoCitation[] {
  return records.map(fitnessCitation)
}

function memoryCitations(memories: readonly LoMemory[]): LoCitation[] {
  return memories.map((memory) => ({
    id: `notion:memory:${memory.pageId}`,
    source: "notion" as const,
    label: `Lo Memory: ${memory.name || memory.pageId}`,
    href: memory.url,
    capturedAt: memory.lastEditedAt,
  }))
}

function graphCitations(value: BjjGraphReadModel | readonly SourceCitation[]): LoCitation[] {
  const citations = isBjjGraphReadModel(value) ? value.citations : value
  return citations.map((citation) => ({
    id: citation.id,
    source: "bjj" as const,
    label: `${citation.path}:L${citation.line}`,
    path: citation.path,
    line: citation.line,
    ...(citation.excerpt ? { excerpt: citation.excerpt } : {}),
  }))
}

function isBjjGraphReadModel(value: BjjGraphReadModel | readonly SourceCitation[]): value is BjjGraphReadModel {
  return !Array.isArray(value)
}

function dashboardSource<T>(
  id: LoSyncSourceStatus["id"],
  kind: LoCitationSource,
  section: LoDashboardSection<T>,
  checkedAt: string,
  lastUpdatedAt?: string,
): LoDashboardSource {
  return {
    ...syncSource(id, section, checkedAt, lastUpdatedAt),
    kind,
    citationIds: section.citations.map((citation) => citation.id).sort((left, right) => left.localeCompare(right)),
  }
}

function syncSource<T>(
  id: LoSyncSourceStatus["id"],
  section: LoDashboardSection<T>,
  checkedAt: string,
  lastUpdatedAt?: string,
): LoSyncSourceStatus {
  return {
    id,
    status: section.status,
    checkedAt,
    ...(lastUpdatedAt ? { lastUpdatedAt } : {}),
    ...(section.error ? { error: section.error } : {}),
  }
}

function subjectCitationIds(
  profile: LoDashboardSection<LoProfile>,
  training: LoDashboardSection<LoBjjTrainingSession[]>,
  fitnessRecords: readonly LoFitnessRecord[] | null,
  graph: LoDashboardSection<BjjGraphReadModel>,
  memory: LoDashboardSection<LoMemory[]>,
): Record<string, string[]> {
  const entries = new Map<string, Set<string>>()
  const add = (subject: string, citations: readonly LoCitation[] | readonly SourceCitation[]) => {
    const existing = entries.get(subject) ?? new Set<string>()
    for (const citation of citations) existing.add(citation.id)
    entries.set(subject, existing)
  }

  if (profile.data) add("profile", profile.citations)
  for (const session of training.data ?? []) add(`training:${session.pageId}`, trainingCitations([session]))
  for (const record of fitnessRecords ?? []) add(`fitness:${record.pageId}`, [fitnessCitation(record)])
  for (const item of memory.data ?? []) add(`memory:${item.pageId}`, memoryCitations([item]))

  const model = graph.data
  if (model) {
    for (const position of model.positions) add(`graph:position:${position.id}`, [position.source])
    for (const technique of model.techniques) add(`graph:technique:${technique.id}`, [technique.source])
    for (const transition of model.transitions) add(`graph:transition:${transition.id}`, [transition.citation])
    for (const branch of model.branches) add(`graph:branch:${branch.id}`, [branch.citation])
    for (const evidence of model.evidence) add(`graph:evidence:${evidence.id}`, [evidence.citation])
    for (const flow of model.gameFlows) {
      add(`graph:flow:${flow.id}`, [flow.citation])
      for (const branch of flow.branches) add(`graph:flow-branch:${branch.id}`, [branch.citation])
    }
    for (const rating of model.playerRatings) add(`graph:rating:${rating.id}`, [rating.citation])
  }

  return Object.fromEntries([...entries.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([subject, citations]) => [subject, [...citations].sort((left, right) => left.localeCompare(right))]))
}

function latestTrainingDate(sessions: readonly LoBjjTrainingSession[] | null): string | undefined {
  return sessions?.map((session) => session.date).filter((date): date is string => Boolean(date))
    .sort((left, right) => right.localeCompare(left))[0]
}

function latestMemoryEdit(memories: readonly LoMemory[] | null): string | undefined {
  return memories?.map((memory) => memory.lastEditedAt).sort((left, right) => right.localeCompare(left))[0]
}

function uniqueCitations(citations: readonly LoCitation[]): LoCitation[] {
  const byId = new Map<string, LoCitation>()
  for (const citation of citations) {
    if (!byId.has(citation.id)) byId.set(citation.id, citation)
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id))
}

function toolResult<T>(tool: LoToolName, data: T, citations: readonly LoCitation[]): LoToolResult<T> {
  return { tool, data, citations: uniqueCitations(citations) }
}

function flowById(graph: BjjGraphReadModel, flowId: string): BjjGameFlow {
  const flow = graph.gameFlows.find((item) => item.id === flowId)
  if (!flow) throw new Error(`Unknown graph flow: ${flowId}`)
  return flow
}

function sortedFlowIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right))
}

function intersection(left: readonly string[], right: readonly string[]): string[] {
  const rightIds = new Set(right)
  return left.filter((id) => rightIds.has(id))
}

function difference(left: readonly string[], right: readonly string[]): string[] {
  const rightIds = new Set(right)
  return left.filter((id) => !rightIds.has(id))
}

function sortEvidenceNewestFirst(left: BjjEvidence, right: BjjEvidence): number {
  return `${right.date ?? ""}:${right.id}`.localeCompare(`${left.date ?? ""}:${left.id}`)
}

function searchMemories(memories: readonly LoMemory[], query: string, limit: number): LoMemory[] {
  const needle = normalizeSearch(query)
  return memories
    .map((memory) => ({ memory, score: memoryScore(memory, needle) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score
      || right.memory.lastEditedAt.localeCompare(left.memory.lastEditedAt)
      || left.memory.pageId.localeCompare(right.memory.pageId))
    .slice(0, limit)
    .map((item) => item.memory)
}

function memoryScore(memory: LoMemory, needle: string): number {
  const name = normalizeSearch(memory.name)
  const content = normalizeSearch(memory.content)
  const source = normalizeSearch(memory.source.reference ?? "")
  if (name.startsWith(needle)) return 3
  if (name.includes(needle)) return 2
  if (content.includes(needle) || source.includes(needle)) return 1
  return 0
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
