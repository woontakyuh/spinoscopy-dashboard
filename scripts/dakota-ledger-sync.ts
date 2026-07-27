import { classifySessions, groupByDay, toSeoulDate } from "../lib/dakota-ledger/classify"
import { createAnthropicPromoter, effectiveOrigin, promoteDay } from "../lib/dakota-ledger/promote"
import { readSessions } from "../lib/dakota-ledger/sessionSource"
import { createOperation, getOperations, updateOperation } from "../lib/notion/operations"
import { createSessionLog, listExistingSessionKeys } from "../lib/notion/sessionLog"

const DAY_SECONDS = 86_400

/** YYYY-MM-DD (KST 자정)을 epoch 초로 바꾼다. */
function seoulMidnightEpoch(date: string): number {
  return Date.parse(`${date}T00:00:00+09:00`) / 1000
}

export function parseArgs(argv: string[]): { since: number; dryRun: boolean } {
  const dryRun = argv.includes("--dry-run")
  const idx = argv.indexOf("--since")
  if (idx === -1) return { since: 0, dryRun }

  const value = argv[idx + 1] ?? ""
  if (value === "today") return { since: seoulMidnightEpoch(toSeoulDate(new Date().toISOString())), dryRun }
  if (value === "yesterday") {
    return { since: seoulMidnightEpoch(toSeoulDate(new Date().toISOString())) - DAY_SECONDS, dryRun }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { since: seoulMidnightEpoch(value), dryRun }

  throw new Error(`--since 값을 해석할 수 없습니다: "${value}" (YYYY-MM-DD | today | yesterday)`)
}

async function main() {
  const { since, dryRun } = parseArgs(process.argv.slice(2))
  const dbPath = process.env.HERMES_STATE_DB ?? `${process.env.HOME}/.hermes/state.db`

  const raw = readSessions(dbPath, since)
  const existingKeys = dryRun ? new Set<string>() : await listExistingSessionKeys()
  const fresh = raw.filter((s) => !existingKeys.has(s.sessionKey))

  console.log(`대상 ${raw.length}건 · 기적재 제외 후 ${fresh.length}건${dryRun ? " · DRY RUN" : ""}`)
  if (fresh.length === 0) return

  const days = groupByDay(classifySessions(fresh))
  console.log(`활동일 ${days.length}일`)

  const promoter = createAnthropicPromoter()
  let operations = await getOperations()

  for (const day of days) {
    const result = await promoteDay(day, operations, promoter)
    console.log(`[${day.date}] 세션 ${result.sessions.length} · 신규 과제 ${result.operations.length}`)

    if (dryRun) {
      for (const s of result.sessions) console.log(`   - ${s.domain} | ${s.outcome} | ${s.name}`)
      for (const o of result.operations) console.log(`   + 신규 과제: ${o.domain} | ${o.name}`)
      continue
    }

    // 신규 과제 생성 -> ref를 실제 page_id로 치환
    const refToPageId = new Map<string, string>()
    for (const op of result.operations) {
      const created = await createOperation({
        name: op.name, domain: op.domain, tags: op.tags,
        type: op.type, status: op.status, priority: op.priority,
        context: op.context, action_taken: op.actionTaken,
        result: op.result, next_action: op.nextAction,
        started_at: day.date, last_touched: day.date,
      })
      refToPageId.set(op.ref, created.page_id)
    }

    // 기존 과제 page_id 집합. operationRef가 방금 만든 신규 과제(refToPageId)도,
    // 기존 과제 목록(knownPageIds)도 아니면 LLM이 지어낸 값이므로 null로 떨군다 —
    // 그대로 Notion에 넘기면 존재하지 않는 relation 대상이라 API 호출이 실패한다.
    const knownPageIds = new Set(operations.map((o) => o.page_id))

    // 세션 로그 적재
    const touched = new Map<string, { count: number; msgs: number }>()
    for (const s of result.sessions) {
      const source = day.sessions.find((d) => d.sessionKey === s.sessionKey)!
      let pageId: string | null = null
      if (s.operationRef) {
        const mapped = refToPageId.get(s.operationRef)
        if (mapped) {
          pageId = mapped
        } else if (knownPageIds.has(s.operationRef)) {
          pageId = s.operationRef
        } else {
          console.log(`   ! 알 수 없는 operationRef "${s.operationRef}" (세션 ${s.sessionKey}) → null로 처리`)
        }
      }

      await createSessionLog({
        name: s.name, date: source.startedAt, channel: source.channel,
        // 휴리스틱이 아니라 LLM 강등이 반영된 실효 Origin을 기록한다
        origin: effectiveOrigin(source.origin, s.originOverride),
        agent: s.agent, domain: s.domain, tags: s.tags,
        summary: s.summary, outcome: s.outcome, msgCount: source.messageCount,
        sessionKey: s.sessionKey, operationPageId: pageId,
      })

      if (pageId) {
        const prev = touched.get(pageId) ?? { count: 0, msgs: 0 }
        touched.set(pageId, { count: prev.count + 1, msgs: prev.msgs + source.messageCount })
      }
    }

    // 과제 집계·Last Touched 갱신
    for (const [pageId, delta] of touched) {
      const before = operations.find((o) => o.page_id === pageId)
      await updateOperation(pageId, {
        last_touched: day.date,
        session_count: (before?.session_count ?? 0) + delta.count,
        msg_total: (before?.msg_total ?? 0) + delta.msgs,
      })
    }

    // 다음 날 판정에 신규 과제가 보이도록 갱신
    operations = await getOperations()
  }

  console.log("완료")
}

if (process.argv[1]?.includes("dakota-ledger-sync")) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
