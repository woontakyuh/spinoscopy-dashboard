import { anthropic } from "@ai-sdk/anthropic"
import { generateObject } from "ai"
import { z } from "zod"
import type { OperationItem } from "@/lib/notion/operations"
import { buildDayContext } from "./classify"
import { LEDGER_DOMAINS, type DaySessions, type LedgerDomain, type LedgerOrigin } from "./types"

const promotedSessionSchema = z.object({
  sessionKey: z.string(),
  name: z.string(),
  summary: z.string(),
  domain: z.enum(LEDGER_DOMAINS as [LedgerDomain, ...LedgerDomain[]]),
  tags: z.array(z.string()),
  outcome: z.enum(["완료", "진행", "보류", "단발조회"]),
  agent: z.enum(["dakota", "elon", "brian", "andrej", "warren", "lo"]),
  operationRef: z.string().nullable(),
  /**
   * 휴리스틱이 지시/논의로 봤지만 본문상 명백한 에이전트 실행이면 "수행"을 넣는다.
   * 강등 전용이다 — 수행을 지시/논의로 올리는 방향은 enforceRules가 무시한다.
   */
  originOverride: z.enum(["수행"]).nullable(),
})

const promotedOperationSchema = z.object({
  ref: z.string(),
  name: z.string(),
  domain: z.enum(LEDGER_DOMAINS as [LedgerDomain, ...LedgerDomain[]]),
  tags: z.array(z.string()),
  type: z.enum(["Decision", "Execution", "Research", "Automation", "Draft"]),
  status: z.enum(["Inbox", "In Progress", "Waiting", "Completed", "Archived"]),
  priority: z.enum(["High", "Medium", "Low"]),
  context: z.string(),
  actionTaken: z.string(),
  result: z.string(),
  nextAction: z.string(),
})

export const promotionSchema = z.object({
  operations: z.array(promotedOperationSchema),
  sessions: z.array(promotedSessionSchema),
})

export type PromotedSession = z.infer<typeof promotedSessionSchema>
export type PromotedOperation = z.infer<typeof promotedOperationSchema>
export type PromotionResult = z.infer<typeof promotionSchema>

export type Promoter = (prompt: string) => Promise<PromotionResult>

export function buildPrompt(day: DaySessions, existing: OperationItem[]): string {
  const existingList = existing.length
    ? existing.map((o) => `- ${o.page_id} | ${o.name} | ${o.domain} | ${o.status}`).join("\n")
    : "(없음)"

  return `당신은 척추신경외과 의사 Tak 센터장의 운영 장부를 정리합니다.
아래는 하루치 에이전트 세션 기록입니다. 이것을 과제(Operation)와 세션 로그(Session)로 정리하세요.

## 규칙
1. Origin이 "지시" 또는 "논의"인 세션만 신규 과제를 만들 수 있습니다.
2. Origin이 "수행"인 세션은 신규 과제를 만들 수 없습니다. 기존 과제(아래 목록)에만 연결하고, 마땅한 과제가 없으면 operationRef를 null로 두세요.
3. 이미 존재하는 과제에 해당하면 새로 만들지 말고 그 page_id를 operationRef에 넣으세요.
4. 신규 과제를 만들 때는 ref를 "new:1", "new:2" 형식으로 붙이고, 그 과제에 속한 세션의 operationRef에 같은 값을 넣으세요.
5. 단순 조회·잡담이면 outcome을 "단발조회"로 하고 operationRef를 null로 두세요.
6. domain은 다음 9개 중 하나입니다: ${LEDGER_DOMAINS.join(", ")}. 투자·시장·지출은 Finance, BJJ·운동은 Training입니다.
7. tags는 domain을 가로지르는 성격을 넣습니다. 예: 연구 과제인데 AI 성격이면 tags에 "AI".
8. name은 한국어 한 줄, summary는 한국어 3~5줄로 씁니다.
9. 입력에 있는 sessionKey만 사용하세요. 없는 키를 지어내지 마세요.
10. 각 세션에는 이미 Origin(지시/논의/수행)이 붙어 있습니다. 그런데 지시나 논의로 붙은 것 중 본문을 보면 명백히 에이전트에게 내린 실행 프롬프트인 경우가 있습니다(정형화된 영어 명령문, 페르소나 지정, 산출물 형식 지정 등). 그런 세션은 originOverride에 "수행"을 넣으세요. 그 외에는 전부 null입니다. 수행으로 붙은 것을 지시나 논의로 되돌리는 값은 넣을 수 없습니다.

## 기존 과제 (page_id | 이름 | domain | status)
${existingList}

## 오늘의 세션
${buildDayContext(day)}`
}

/**
 * 세션의 실효 Origin. LLM은 지시/논의를 수행으로 강등만 할 수 있고,
 * 수행을 지시/논의로 올릴 수는 없다. 휴리스틱이 놓친 디스패치를 LLM이 잡되,
 * 휴리스틱이 이미 수행으로 판정한 것은 LLM이 되돌리지 못하게 한다.
 */
export function effectiveOrigin(
  heuristic: LedgerOrigin,
  override: "수행" | null
): LedgerOrigin {
  return override === "수행" ? "수행" : heuristic
}

/** LLM 출력이 규칙을 어겼을 때 코드로 강제한다. */
export function enforceRules(day: DaySessions, result: PromotionResult): PromotionResult {
  const originByKey = new Map(day.sessions.map((s) => [s.sessionKey, s.origin]))

  const sessions = result.sessions
    .filter((s) => originByKey.has(s.sessionKey))
    .map((s) => {
      const origin = effectiveOrigin(originByKey.get(s.sessionKey)!, s.originOverride)
      // 규칙 2: 수행 세션은 신규 과제를 만들 수 없다.
      // "new:" 접두사 자체가 신규 과제 참조임을 나타내므로, LLM이 그 ref에 해당하는
      // operations 항목을 빠뜨렸더라도(=operations 배열에 없어도) 참조 형태만으로 판정한다.
      if (origin === "수행" && s.operationRef?.startsWith("new:")) {
        return { ...s, operationRef: null }
      }
      return s
    })

  const usedRefs = new Set(sessions.map((s) => s.operationRef).filter(Boolean) as string[])
  const operations = result.operations.filter((o) => usedRefs.has(o.ref))

  return { operations, sessions }
}

export async function promoteDay(
  day: DaySessions,
  existing: OperationItem[],
  promoter: Promoter
): Promise<PromotionResult> {
  const raw = await promoter(buildPrompt(day, existing))
  return enforceRules(day, raw)
}

export function createAnthropicPromoter(): Promoter {
  const model = process.env.DAKOTA_LEDGER_MODEL ?? "claude-sonnet-5"
  return async (prompt: string) => {
    const { object } = await generateObject({
      model: anthropic(model),
      schema: promotionSchema,
      prompt,
    })
    return object
  }
}
