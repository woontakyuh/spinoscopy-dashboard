import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
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
  const newRefs = new Set(result.operations.map((o) => o.ref))

  // 부수 수정: LLM이 같은 sessionKey를 두 번 내면 두 행이 적재돼 집계가 두 배가 된다.
  // Map은 같은 키를 다시 set해도 마지막 값으로 덮이므로, 키당 마지막 등장만 남는다.
  const dedupedByKey = new Map<string, PromotedSession>()
  for (const s of result.sessions) dedupedByKey.set(s.sessionKey, s)
  const deduped = [...dedupedByKey.values()]

  // I1: "수행 세션은 신규 과제를 만들 수 없다"는 이 배치에서 지시/논의 세션이 실제로
  // 참조한 신규 과제까지 막는 게 아니다. 그런 과제는 지시/논의 세션이 "만든" 것이고,
  // 수행 세션은 거기 "붙는" 것뿐이다 — 지시 1건 + 수행 24건이 같은 날 같은 신규 과제를
  // 만드는 게 이 기능이 존재하는 이유인 시나리오다.
  const backedByRealOrigin = new Set(
    deduped
      .filter((s) => originByKey.has(s.sessionKey))
      .filter((s) => effectiveOrigin(originByKey.get(s.sessionKey)!, s.originOverride) !== "수행" && s.operationRef)
      .map((s) => s.operationRef!)
  )

  const sessions = deduped
    .filter((s) => originByKey.has(s.sessionKey))
    .map((s) => {
      const origin = effectiveOrigin(originByKey.get(s.sessionKey)!, s.originOverride)
      // 규칙 2: 수행 세션은 신규 과제를 "만들" 수 없다 (지시/논의가 만든 신규 과제에 붙는 것은 허용).
      //
      // 판정을 두 겹으로 건다. 어느 하나도 다른 하나를 포함하지 못한다:
      //  - newRefs 멤버십은 operations에 없는 매달린 ref("new:1"만 있고 과제는 없음)를 놓친다.
      //  - "new:" 접두사는 LLM이 규약을 어기고 ref를 "op-new-1" 식으로 낸 경우를 놓친다.
      // 둘 중 하나라도 걸리면 신규로 본다.
      const ref = s.operationRef
      const isNewRef = ref !== null && (newRefs.has(ref) || ref.startsWith("new:"))
      if (origin === "수행" && isNewRef && !backedByRealOrigin.has(ref!)) {
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

/** codex의 JSONL 이벤트 스트림에서 최종 agent_message 본문을 뽑는다. */
export function extractAgentMessage(jsonl: string): string {
  let last: string | null = null
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue
    let event: { type?: string; item?: { type?: string; text?: string } }
    try {
      event = JSON.parse(line)
    } catch {
      continue // codex는 사람용 로그 줄을 섞어 낸다
    }
    if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) {
      last = event.item.text
    }
  }
  if (!last) throw new Error(`codex 응답에서 agent_message를 찾지 못했습니다:\n${jsonl.slice(-800)}`)
  return last
}

export function createCodexPromoter(): Promoter {
  const bin = process.env.CODEX_BIN ?? "codex"
  // launchd가 하루 5회 + 야간 실행으로 겹쳐 돌 수 있고 backfill은 수 분씩 걸린다.
  // 내용은 결정적이지만 고정 공유 경로면 한 프로세스의 writeFileSync가 다른
  // 프로세스의 codex read와 경합해 잘린 스키마를 읽는 간헐적 실패가 난다.
  // PID로 파일명을 분리해 프로세스 간 경합을 없앤다.
  const schemaPath = path.join(os.tmpdir(), `dakota-ledger-schema.${process.pid}.json`)
  writeFileSync(schemaPath, JSON.stringify(z.toJSONSchema(promotionSchema, { target: "draft-7" })))

  const args = [
    "exec", "--json", "--ignore-user-config",
    "--output-schema", schemaPath,
    "--skip-git-repo-check", "--sandbox", "read-only",
  ]
  const model = process.env.DAKOTA_LEDGER_MODEL
  if (model) args.push("--model", model)

  return async (prompt: string) => {
    const stdout = execFileSync(bin, [...args, prompt], {
      stdio: ["ignore", "pipe", "pipe"],   // stdin 차단이 핵심
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      // I2: codex 호출이 멈추면 launchd의 다음 겹침 창이 아직 살아있는 이 프로세스와
      // 동시에 돌아 세션 로그·과제가 두 번 적힌다. 타임아웃으로 멈춘 호출을 죽여야
      // 다음 실행이 겹치기 전에 이 프로세스가 끝난다.
      timeout: 5 * 60 * 1000,
    })
    const message = extractAgentMessage(stdout)
    let parsed: unknown
    try {
      parsed = JSON.parse(message)
    } catch (e) {
      const preview = message.length > 300 ? `${message.slice(0, 300)}…` : message
      throw new Error(`codex agent_message가 JSON이 아닙니다: ${(e as Error).message}\n본문: ${preview}`)
    }
    return promotionSchema.parse(parsed)
  }
}
