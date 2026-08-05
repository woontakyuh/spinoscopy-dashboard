import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  LO_TOOL_NAMES,
  createLoDashboardService,
  listLoToolDefinitions,
} from "./index"
import type { BjjGraphReadModel } from "@/lib/types/lo-graph"
import type {
  LoBjjTrainingSession,
  LoFitnessRecord,
  LoMemory,
  LoProfile,
} from "@/lib/types/lo-v2"

const profile: LoProfile = {
  pageId: "profile-1",
  url: "https://notion.so/profile-1",
  name: "Tak",
  belt: "blue",
  stripes: 3,
  trainingStartDate: "2019-11-27",
  gym: "DT Wire",
  instructor: "Coach",
  avatarUrl: null,
  promotionHistory: [],
  role: "student",
  baseStats: {
    gi: { guard: 72, passing: 48, control: 55, finishing: 41, takedowns: 30, legLocks: 24 },
    nogi: { guard: 70, passing: 46, control: 53, finishing: 39, takedowns: 32, legLocks: 29 },
  },
}

const training: LoBjjTrainingSession[] = [
  {
    pageId: "training-1",
    url: "https://notion.so/training-1",
    name: "Half guard class",
    date: "2026-08-03",
    sessionType: "class",
    sessionTypeRaw: "class",
    instructor: "Coach",
    gym: "DT Wire",
    classTags: ["Half guard"],
    sparringTags: ["Underhook"],
    studyTags: [],
    note: "Won inside position.",
    todayFocus: "Underhook",
    focusApplied: true,
    videoUrl: null,
    videoTitle: null,
  },
]

function fitnessRecord(pageId: string, date: string, weightKg: number, bodyFatPercent: number): LoFitnessRecord {
  return {
    pageId,
    url: `https://notion.so/${pageId}`,
    day: date,
    date,
    recordType: "Daily log",
    manager: "Lo",
    metrics: {
      weightKg,
      bodyFatPercent,
      smmKg: 32.1,
      muscleMassKg: null,
      fatFreeMassKg: null,
      bodyFatMassKg: null,
      boneMassKg: null,
      mineralMassKg: null,
      visceralFatLevel: null,
      bmi: null,
      bmrKcal: null,
      obesityDegreePercent: null,
      pushUps: 100,
      dailyTarget: 120,
    },
    workout: "BJJ",
    meals: null,
    notes: null,
    challenge: null,
    dailyMedication: null,
    dailySupplements: null,
    mounjaroDose: null,
    injectionStatus: null,
    injectionSite: null,
    pushUpSets: null,
    lastConfirmed: null,
  }
}

const fitness = [
  fitnessRecord("fitness-2", "2026-08-03", 74.2, 16.8),
  fitnessRecord("fitness-1", "2026-08-01", 75, 17.2),
]

const memory: LoMemory = {
  pageId: "memory-1",
  url: "https://notion.so/memory-1",
  name: "Half guard priority",
  content: "Prioritize the underhook before attacking.",
  category: "rule",
  status: "active",
  importance: 5,
  source: {
    kind: "bjj_training",
    reference: "training-1",
    capturedAt: "2026-08-03T08:00:00.000Z",
  },
  supersedes: null,
  supersededBy: null,
  supersededAt: null,
  createdAt: "2026-08-03T08:00:00.000Z",
  lastEditedAt: "2026-08-03T08:00:00.000Z",
}

const bjjCitation = {
  id: "bjj:positions/half-guard.md#L2",
  path: "positions/half-guard.md",
  line: 2,
}

const graph: BjjGraphReadModel = {
  positions: [
    {
      id: "half-guard",
      name: "Half Guard",
      nameKr: "하프 가드",
      layer: "guard",
      ruleset: "common",
      curriculumLessons: [],
      source: bjjCitation,
    },
    {
      id: "back-control",
      name: "Back Control",
      nameKr: "백 컨트롤",
      layer: "control",
      ruleset: "common",
      curriculumLessons: [],
      source: { ...bjjCitation, id: "bjj:positions/back-control.md#L2", path: "positions/back-control.md" },
    },
  ],
  techniques: [
    {
      id: "underhook-back-take",
      name: "Underhook back take",
      fromId: "half-guard",
      toIds: ["back-control"],
      branches: [],
      ruleset: "common",
      status: "adopted",
      sourceId: "class",
      isCounter: false,
      source: { ...bjjCitation, id: "bjj:techniques/underhook.md#L2", path: "techniques/underhook.md" },
    },
  ],
  transitions: [],
  branches: [],
  evidence: [
    {
      id: "evidence:1",
      kind: "log",
      date: "2026-08-03",
      outcome: "success",
      text: "Underhook worked.",
      subjectIds: ["half-guard", "underhook-back-take"],
      playerIds: [],
      citation: { ...bjjCitation, id: "bjj:log/2026-08-03.md#L5", path: "log/2026-08-03.md", line: 5 },
    },
  ],
  gameFlows: [
    {
      id: "gi-a-game-spine",
      name: "Gi A-game spine",
      ruleset: "gi",
      status: "adopted",
      branches: [
        {
          id: "flow:gi:1",
          text: "Half guard to back control",
          positionIds: ["half-guard", "back-control"],
          techniqueIds: ["underhook-back-take"],
          citation: { ...bjjCitation, id: "bjj:strategy/gi.md#L5", path: "strategy/gi.md", line: 5 },
        },
      ],
      citation: { ...bjjCitation, id: "bjj:strategy/gi.md#L3", path: "strategy/gi.md", line: 3 },
    },
    {
      id: "nogi-a-game-spine",
      name: "No-Gi A-game spine",
      ruleset: "nogi",
      status: "testing",
      branches: [
        {
          id: "flow:nogi:1",
          text: "Half guard to wrestle up",
          positionIds: ["half-guard"],
          techniqueIds: [],
          citation: { ...bjjCitation, id: "bjj:strategy/nogi.md#L5", path: "strategy/nogi.md", line: 5 },
        },
      ],
      citation: { ...bjjCitation, id: "bjj:strategy/nogi.md#L3", path: "strategy/nogi.md", line: 3 },
    },
  ],
  playerRatings: [],
  citations: [bjjCitation],
  diagnostics: [],
}

function createService() {
  return createLoDashboardService({
    now: () => new Date("2026-08-04T12:00:00.000Z"),
    getProfile: vi.fn().mockResolvedValue(profile),
    listTraining: vi.fn().mockResolvedValue(training),
    listFitnessRecords: vi.fn().mockResolvedValue(fitness),
    listMemories: vi.fn().mockResolvedValue([memory]),
    createMemory: vi.fn().mockResolvedValue(memory),
    loadGraph: vi.fn().mockResolvedValue(graph),
  })
}

describe("Lo dashboard data service", () => {
  it("assembles bounded dashboard data from every governed source with source citations", async () => {
    const service = createService()

    const dashboard = await service.getDashboard()

    expect(dashboard.version).toBe("v1")
    expect(dashboard.generatedAt).toBe("2026-08-04T12:00:00.000Z")
    expect(dashboard.profile).toMatchObject({ status: "ready", data: { pageId: "profile-1" } })
    expect(dashboard.training).toMatchObject({ status: "ready", data: [expect.objectContaining({ pageId: "training-1" })] })
    expect(dashboard.fitness.data?.trends).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metric: "weightKg",
        latest: expect.objectContaining({ date: "2026-08-03", value: 74.2 }),
        delta: -0.8,
      }),
    ]))
    expect(dashboard.fitness.data).toMatchObject({ readiness: null, readinessAssessment: "not_assessed" })
    expect(dashboard.fitness.data?.snapshot.latestDailyLog).not.toHaveProperty("dailyMedication")
    expect(dashboard.fitness.data?.snapshot.latestDailyLog).not.toHaveProperty("injectionStatus")
    expect(dashboard.graph).toMatchObject({ status: "ready", data: expect.objectContaining({ positions: expect.any(Array) }) })
    expect(dashboard.graphDiagnostics).toEqual([])
    expect(dashboard.legends).toEqual({ status: "empty", data: [], citations: [] })
    expect(dashboard.memory).toMatchObject({ status: "ready", data: [expect.objectContaining({ pageId: "memory-1" })] })
    expect(dashboard.citations.map((citation) => citation.id)).toEqual(expect.arrayContaining([
      "notion:profile:profile-1",
      "notion:training:training-1",
      "notion:fitness:fitness-2",
      "notion:memory:memory-1",
      "bjj:positions/half-guard.md#L2",
    ]))
    expect(dashboard.sync.data?.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "profile", status: "ready" }),
      expect.objectContaining({ id: "graph", status: "ready" }),
    ]))
    expect(dashboard.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "profile", status: "ready", citationIds: ["notion:profile:profile-1"] }),
      expect.objectContaining({ id: "graph", status: "ready" }),
    ]))
    expect(dashboard.citationIdsBySubject).toMatchObject({
      profile: ["notion:profile:profile-1"],
      "training:training-1": ["notion:training:training-1"],
      "graph:position:half-guard": ["bjj:positions/half-guard.md#L2"],
    })
  })

  it("does not expose medication or injection details through source citations", async () => {
    const medicationTraining: LoBjjTrainingSession = {
      ...training[0],
      name: "Tirzepatide injection planning",
      url: "https://notion.so/tirzepatide-injection-planning",
    }
    const medicationFitness: LoFitnessRecord = {
      ...fitnessRecord("fitness-medication", "2026-08-04", 74, 16.5),
      day: "Mounjaro 5 mg injection",
      url: "https://notion.so/mounjaro-5-mg-injection",
      dailyMedication: "Mounjaro",
      mounjaroDose: "5",
      injectionStatus: "completed",
      injectionSite: "abdomen",
    }
    const medicationMemory: LoMemory = {
      ...memory,
      name: "Mounjaro tracking",
      content: "Injection history",
      url: "https://notion.so/mounjaro-tracking",
      source: { ...memory.source, reference: "tirzepatide" },
    }
    const service = createLoDashboardService({
      now: () => new Date("2026-08-04T12:00:00.000Z"),
      getProfile: vi.fn().mockResolvedValue(profile),
      listTraining: vi.fn().mockResolvedValue([medicationTraining]),
      listFitnessRecords: vi.fn().mockResolvedValue([medicationFitness]),
      listMemories: vi.fn().mockResolvedValue([medicationMemory]),
      createMemory: vi.fn().mockResolvedValue(memory),
      loadGraph: vi.fn().mockResolvedValue(graph),
    })

    const dashboard = await service.getDashboard()

    expect(dashboard.training).toEqual({ status: "empty", data: [], citations: [] })
    expect(dashboard.memory).toEqual({ status: "empty", data: [], citations: [] })
    expect(dashboard.fitness.citations).toEqual([{
      id: "notion:fitness:fitness-medication",
      source: "notion",
      label: "Fitness Log: 2026-08-04",
      capturedAt: "2026-08-04",
    }])
    expect(JSON.stringify(dashboard)).not.toMatch(/mounjaro|tirzepatide|injection/i)
  })

  it("keeps a source failure local while returning the other dashboard sections and sync status", async () => {
    const service = createLoDashboardService({
      now: () => new Date("2026-08-04T12:00:00.000Z"),
      getProfile: vi.fn().mockRejectedValue(new Error("profile unavailable")),
      listTraining: vi.fn().mockResolvedValue(training),
      listFitnessRecords: vi.fn().mockResolvedValue(fitness),
      listMemories: vi.fn().mockResolvedValue([]),
      createMemory: vi.fn().mockResolvedValue(memory),
      loadGraph: vi.fn().mockResolvedValue(graph),
    })

    const dashboard = await service.getDashboard()

    expect(dashboard.profile).toEqual({ status: "error", data: null, citations: [], error: "profile unavailable" })
    expect(dashboard.training.status).toBe("ready")
    expect(dashboard.sync.data?.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "profile", status: "error", error: "profile unavailable" }),
    ]))
  })

  it("loads the canonical graph only from the configured absolute BJJ_GRAPH_ROOT", async () => {
    vi.stubEnv("BJJ_GRAPH_ROOT", path.resolve(process.cwd(), "../BJJ"))
    const service = createLoDashboardService({
      now: () => new Date("2026-08-04T12:00:00.000Z"),
      getProfile: vi.fn().mockResolvedValue(profile),
      listTraining: vi.fn().mockResolvedValue(training),
      listFitnessRecords: vi.fn().mockResolvedValue(fitness),
      listMemories: vi.fn().mockResolvedValue([]),
      createMemory: vi.fn().mockResolvedValue(memory),
    })

    const dashboard = await service.getDashboard()

    expect(dashboard.graph).toMatchObject({
      status: "ready",
      data: expect.objectContaining({ positions: expect.arrayContaining([
        expect.objectContaining({ id: "hg" }),
      ]) }),
    })
  })

  it("reports an explicit graph section error when BJJ_GRAPH_ROOT is missing", async () => {
    vi.stubEnv("BJJ_GRAPH_ROOT", "")
    const service = createLoDashboardService({
      now: () => new Date("2026-08-04T12:00:00.000Z"),
      getProfile: vi.fn().mockResolvedValue(profile),
      listTraining: vi.fn().mockResolvedValue(training),
      listFitnessRecords: vi.fn().mockResolvedValue(fitness),
      listMemories: vi.fn().mockResolvedValue([]),
      createMemory: vi.fn().mockResolvedValue(memory),
    })

    const dashboard = await service.getDashboard()

    expect(dashboard.graph).toEqual({
      status: "error",
      data: null,
      citations: [],
      error: "BJJ_GRAPH_ROOT is not configured",
    })
    expect(dashboard.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "graph", status: "error", error: "BJJ_GRAPH_ROOT is not configured" }),
    ]))
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("Lo bounded tool contracts", () => {
  it("publishes only the allowed structured tools", () => {
    expect(LO_TOOL_NAMES).toEqual([
      "lo.profile.get",
      "lo.training.recent",
      "lo.fitness.trends",
      "lo.graph.neighborhood",
      "lo.graph.flow.compare",
      "lo.memory.search",
      "lo.memory.save",
      "lo.sync.status",
    ])
    expect(listLoToolDefinitions().map((tool) => tool.name)).toEqual(LO_TOOL_NAMES)
    expect(listLoToolDefinitions().every((tool) => tool.inputSchema.type === "object")).toBe(true)
  })

  it("retrieves a bounded recent-training result with current-request citations", async () => {
    const service = createService()

    const result = await service.executeTool({ name: "lo.training.recent", input: { limit: 1 } })

    expect(result).toMatchObject({
      tool: "lo.training.recent",
      data: [expect.objectContaining({ pageId: "training-1" })],
      citations: [expect.objectContaining({ id: "notion:training:training-1" })],
    })
    await expect(service.executeTool({ name: "lo.training.recent", input: { limit: 21 } })).rejects.toThrow(/limit/)
  })

  it("returns graph neighborhoods and compares named flows without accepting filesystem paths", async () => {
    const service = createService()

    const neighborhood = await service.executeTool({
      name: "lo.graph.neighborhood",
      input: { positionId: "half-guard", evidenceLimit: 5 },
    })
    expect(neighborhood).toMatchObject({
      data: expect.objectContaining({
        neighborhood: expect.objectContaining({ position: expect.objectContaining({ id: "half-guard" }) }),
        evidence: [expect.objectContaining({ id: "evidence:1" })],
      }),
      citations: expect.arrayContaining([expect.objectContaining({ id: "bjj:positions/half-guard.md#L2" })]),
    })

    const comparison = await service.executeTool({
      name: "lo.graph.flow.compare",
      input: { leftFlowId: "gi-a-game-spine", rightFlowId: "nogi-a-game-spine" },
    })
    expect(comparison.data).toMatchObject({
      sharedPositionIds: ["half-guard"],
      leftOnlyPositionIds: ["back-control"],
      rightOnlyPositionIds: [],
    })
    await expect(service.executeTool({
      name: "lo.graph.neighborhood",
      input: { positionId: "../../secrets" },
    })).rejects.toThrow(/positionId/)
  })

  it("searches and explicitly saves distilled memory facts with citations, not transcript fields", async () => {
    const createMemory = vi.fn().mockResolvedValue(memory)
    const service = createLoDashboardService({
      now: () => new Date("2026-08-04T12:00:00.000Z"),
      getProfile: vi.fn().mockResolvedValue(profile),
      listTraining: vi.fn().mockResolvedValue(training),
      listFitnessRecords: vi.fn().mockResolvedValue(fitness),
      listMemories: vi.fn().mockResolvedValue([memory]),
      createMemory,
      loadGraph: vi.fn().mockResolvedValue(graph),
    })

    const search = await service.executeTool({ name: "lo.memory.search", input: { query: "UNDERHOOK", limit: 5 } })
    expect(search).toMatchObject({
      data: [expect.objectContaining({ pageId: "memory-1" })],
      citations: [expect.objectContaining({ id: "notion:memory:memory-1" })],
    })

    const save = await service.executeTool({
      name: "lo.memory.save",
      input: {
        name: "Half guard priority",
        content: "Prioritize the underhook before attacking.",
        category: "rule",
        importance: 5,
        source: {
          kind: "gateway",
          reference: "operator-note-1",
          capturedAt: "2026-08-04T12:00:00.000Z",
        },
      },
    })
    expect(createMemory).toHaveBeenCalledWith(expect.objectContaining({ name: "Half guard priority" }))
    expect(save.citations).toEqual([expect.objectContaining({ id: "notion:memory:memory-1" })])
    await expect(service.executeTool({
      name: "lo.memory.save",
      input: {
        name: "Bad save",
        content: "This must fail.",
        category: "rule",
        source: { kind: "gateway", reference: "operator", capturedAt: "2026-08-04T12:00:00.000Z" },
        transcript: "do not retain conversations",
      },
    })).rejects.toThrow(/transcript/)
  })
})
