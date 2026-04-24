// AI API 비용 로깅. streamText onFinish 에서 호출 → Vercel Log 에 JSON 한 줄.
// 나중에 Vercel Dashboard 또는 `vercel logs` 에서 tag=ai-usage 로 필터·집계.

interface ModelRates {
  input: number // USD per million input tokens
  output: number // USD per million output tokens
  cacheWrite: number // 캐시 생성 (보통 input × 1.25)
  cacheRead: number // 캐시 히트 (보통 input × 0.1)
}

// 2026-04 기준 Anthropic 공식가. 바뀌면 여기만 수정.
const RATES: Record<string, ModelRates> = {
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  "claude-opus-4-7": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
}

export interface UsageEvent {
  agent: string
  model: string
  inputTokens: number // AI SDK usage.inputTokens (fresh, 캐시 제외)
  outputTokens: number
  cacheReadTokens: number // 캐시에서 읽은 토큰
  cacheWriteTokens: number // 이 요청으로 캐시에 쓴 토큰
  stepCount: number
  latencyMs: number
  toolNames?: string[] // 호출된 툴 이름들 (어느 툴이 비용 유발하는지 파악)
}

export function calculateCostUsd(event: UsageEvent): number {
  const rates = RATES[event.model]
  if (!rates) return 0
  const inputCost = (event.inputTokens * rates.input) / 1_000_000
  const outputCost = (event.outputTokens * rates.output) / 1_000_000
  const cacheReadCost = (event.cacheReadTokens * rates.cacheRead) / 1_000_000
  const cacheWriteCost = (event.cacheWriteTokens * rates.cacheWrite) / 1_000_000
  return inputCost + outputCost + cacheReadCost + cacheWriteCost
}

export function logUsage(event: UsageEvent): void {
  const costUsd = calculateCostUsd(event)
  // 하나의 JSON 줄. Vercel Log / jq 로 쉽게 파싱.
  // tag "ai-usage" 로 필터하면 AI 관련 엔트리만 추출 가능.
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      tag: "ai-usage",
      ts: new Date().toISOString(),
      agent: event.agent,
      model: event.model,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      cacheReadTokens: event.cacheReadTokens,
      cacheWriteTokens: event.cacheWriteTokens,
      stepCount: event.stepCount,
      latencyMs: event.latencyMs,
      toolNames: event.toolNames ?? [],
      costUsd: Number(costUsd.toFixed(6)),
    }),
  )
}
