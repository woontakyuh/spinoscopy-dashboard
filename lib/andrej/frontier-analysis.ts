import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { z } from "zod"

import type {
  AiFrontierEpisodeAnalysis,
  AiFrontierOfficialEpisode,
} from "@/lib/types/ai-frontier-import"

/**
 * 분석은 OpenAI API key가 아니라 로컬 Codex CLI(ChatGPT 구독 OAuth)로만 수행한다.
 * Vercel 같은 서버리스 환경에는 codex가 없으므로 서버 cron은 카탈로그 동기화만 하고,
 * 실제 수집은 맥의 `npm run frontier:backfill`(Hermes 매일 08:30)이 맡는다.
 */
export const ANALYSIS_MODEL = "gpt-6.1-sol"
const ANALYSIS_EFFORT = "medium"
const CODEX_TIMEOUT_MS = 15 * 60_000

export interface CodexRunInput {
  prompt: string
  schemaPath: string
  outputPath: string
  cwd: string
  model: string
}

export type CodexRunner = (input: CodexRunInput) => Promise<void>

interface AnalysisDependencies {
  runCodex?: CodexRunner
  model?: string
}

const conceptSchema = z.object({
  term: z.string().trim().min(1).max(100),
  korean: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(60),
  oneLine: z.string().trim().min(1).max(500),
  intuition: z.string().trim().min(1).max(700),
  whyItMatters: z.string().trim().min(1).max(700),
})

const analysisSchema = z.object({
  summary: z.string().trim().min(1).max(700),
  topics: z.array(z.string().trim().min(1).max(60)).min(1).max(10),
  models: z.array(z.string().trim().min(1).max(60)).max(10),
  people: z.array(z.string().trim().min(1).max(80)).max(12),
  concepts: z.array(conceptSchema).min(3).max(12),
  keyPoints: z.array(z.object({
    heading: z.string().trim().min(1).max(160),
    bullets: z.array(z.string().trim().min(1).max(700)).min(1).max(6),
  })).min(3).max(12),
  insights: z.array(z.string().trim().min(1).max(700)).min(2).max(10),
  mentalModels: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
  factInterpretation: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
  questions: z.array(z.string().trim().min(1).max(500)).min(2).max(8),
})

function boundedString(maxLength: number) {
  return { type: "string", minLength: 1, maxLength, pattern: "\\S" } as const
}

function boundedStringArray(minItems: number, maxItems: number, itemMaxLength: number) {
  return {
    type: "array",
    minItems,
    maxItems,
    items: boundedString(itemMaxLength),
  } as const
}

export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary", "topics", "models", "people", "concepts", "keyPoints",
    "insights", "mentalModels", "factInterpretation", "questions",
  ],
  properties: {
    summary: boundedString(700),
    topics: boundedStringArray(1, 10, 60),
    models: boundedStringArray(0, 10, 60),
    people: boundedStringArray(0, 12, 80),
    concepts: {
      type: "array",
      minItems: 3,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["term", "korean", "category", "oneLine", "intuition", "whyItMatters"],
        properties: {
          term: boundedString(100),
          korean: boundedString(100),
          category: boundedString(60),
          oneLine: boundedString(500),
          intuition: boundedString(700),
          whyItMatters: boundedString(700),
        },
      },
    },
    keyPoints: {
      type: "array",
      minItems: 3,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "bullets"],
        properties: {
          heading: boundedString(160),
          bullets: boundedStringArray(1, 6, 700),
        },
      },
    },
    insights: boundedStringArray(2, 10, 700),
    mentalModels: boundedStringArray(1, 8, 700),
    factInterpretation: boundedStringArray(1, 8, 700),
    questions: boundedStringArray(2, 8, 500),
  },
} as const

const INSTRUCTIONS = `당신은 AI 기술 인터뷰와 팟캐스트를 정리하는 한국어 리서치 에디터입니다.
반드시 제공된 공식 전사본만 근거로 분석하세요. 사실을 만들지 마세요.
영문 전사는 자연스러운 한국어로 요약하되 고유명사와 기술 용어는 정확히 보존하세요.
출연진은 전사 화자 이름만 적고, 회사·모델명은 People에 넣지 마세요.
Topics와 Models는 짧은 태그로, Concepts는 재사용 가능한 영문 표제어로 작성하세요.
핵심 내용, 통찰, 직관, 사실과 해석의 경계를 서로 중복하지 않게 정리하세요.
모든 설명은 차분하고 구체적인 한국어로 작성하세요.`

export type AiFrontierAnalysisFailurePhase =
  | "config"
  | "transport"
  | "http"
  | "response-shape"
  | "output-json"
  | "analysis-schema"

export class AiFrontierAnalysisError extends Error {
  readonly name = "AiFrontierAnalysisError"

  constructor(
    readonly phase: AiFrontierAnalysisFailurePhase,
    readonly status: number | null,
    readonly retryable: boolean
  ) {
    super("AI Frontier Episode 분석에 실패했습니다.")
  }
}

/** 구독 OAuth만 쓰도록 API key 계열 환경변수를 자식 프로세스에서 제거한다. */
export function codexChildEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const child = { ...env }
  for (const key of ["OPENAI_API_KEY", "CODEX_API_KEY", "OPENAI_BASE_URL"]) delete child[key]
  return child
}

export const runCodexCli: CodexRunner = ({ prompt, schemaPath, outputPath, cwd, model }) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.env.CODEX_BIN ?? "codex", [
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox", "read-only",
      "--color", "never",
      "-m", model,
      "-c", `model_reasoning_effort="${ANALYSIS_EFFORT}"`,
      "-c", 'forced_login_method="chatgpt"',
      "--output-schema", schemaPath,
      "-o", outputPath,
      "-",
    ], { cwd, env: codexChildEnv(), stdio: ["pipe", "ignore", "pipe"] })

    let stderr = ""
    const timer = setTimeout(() => child.kill("SIGTERM"), CODEX_TIMEOUT_MS)
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000)
    })
    child.on("error", () => {
      clearTimeout(timer)
      reject(new AiFrontierAnalysisError("config", null, false))
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) return resolve()
      const error = new AiFrontierAnalysisError("transport", null, true)
      Object.defineProperty(error, "detail", { value: stderr.trim().slice(-500), enumerable: false })
      reject(error)
    })
    child.stdin.end(prompt)
  })

const ARRAY_LIMITS = {
  topics: 10, models: 10, people: 12, concepts: 12, keyPoints: 12,
  insights: 10, mentalModels: 8, factInterpretation: 8, questions: 8,
} as const

/** 모델이 개수 상한을 넘겨도 버리지 않고 앞에서부터 잘라 계약에 맞춘다. */
export function clampAnalysisArrays(output: unknown): unknown {
  if (!output || typeof output !== "object" || Array.isArray(output)) return output
  const clamped: Record<string, unknown> = { ...(output as Record<string, unknown>) }
  for (const [key, limit] of Object.entries(ARRAY_LIMITS)) {
    const value = clamped[key]
    if (Array.isArray(value)) clamped[key] = value.slice(0, limit)
  }
  const keyPoints = clamped.keyPoints
  if (Array.isArray(keyPoints)) {
    clamped.keyPoints = keyPoints.map((point) =>
      point && typeof point === "object" && Array.isArray((point as { bullets?: unknown }).bullets)
        ? { ...point, bullets: (point as { bullets: unknown[] }).bullets.slice(0, 6) }
        : point
    )
  }
  return clamped
}

export function buildAnalysisPrompt(episode: AiFrontierOfficialEpisode): string {
  return [
    INSTRUCTIONS,
    "",
    "도구나 셸 명령을 쓰지 말고, 아래 JSON 입력만 읽은 뒤 지정된 JSON 스키마에 맞는 최종 답만 출력하세요.",
    "개수 상한: topics·models·insights 10개, people 12개, concepts·keyPoints 3~12개(각 bullets 1~6개), mentalModels·factInterpretation·questions 8개, summary 700자 이내.",
    "",
    JSON.stringify({
      episode: {
        source: episode.source,
        reference: episode.reference,
        episodeNumber: episode.episodeNumber,
        title: episode.name,
        officialUrl: episode.officialUrl,
        published: episode.published,
      },
      transcript: episode.transcript,
    }),
  ].join("\n")
}

export async function analyzeAiFrontierEpisode(
  episode: AiFrontierOfficialEpisode,
  dependencies: AnalysisDependencies = {}
): Promise<AiFrontierEpisodeAnalysis> {
  const runCodex = dependencies.runCodex ?? runCodexCli
  const dir = await mkdtemp(join(tmpdir(), "ai-frontier-"))
  const schemaPath = join(dir, "schema.json")
  const outputPath = join(dir, "analysis.json")
  try {
    await writeFile(schemaPath, JSON.stringify(ANALYSIS_JSON_SCHEMA))
    try {
      await runCodex({
        prompt: buildAnalysisPrompt(episode),
        schemaPath,
        outputPath,
        cwd: dir,
        model: dependencies.model ?? ANALYSIS_MODEL,
      })
    } catch (error) {
      if (error instanceof AiFrontierAnalysisError) throw error
      throw new AiFrontierAnalysisError("transport", null, true)
    }

    let output: unknown
    try {
      output = JSON.parse(await readFile(outputPath, "utf8"))
    } catch {
      throw new AiFrontierAnalysisError("output-json", null, false)
    }
    const parsed = analysisSchema.safeParse(clampAnalysisArrays(output))
    if (!parsed.success) {
      throw new AiFrontierAnalysisError("analysis-schema", null, false)
    }
    return parsed.data
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
