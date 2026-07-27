import path from "node:path"
import { classifySessions, groupByDay, toSeoulDate } from "../lib/dakota-ledger/classify"
import { createCodexPromoter, effectiveOrigin, promoteDay } from "../lib/dakota-ledger/promote"
import { readAllSessions } from "../lib/dakota-ledger/sessionSource"
import { createOperation, getOperations, listAllOperationPageIds, updateOperation } from "../lib/notion/operations"
import { createSessionLog, readSessionLogSnapshot } from "../lib/notion/sessionLog"

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

/**
 * 과제 하나의 누적 집계에 오늘치 델타를 더한 절대값을 계산한다.
 * 델타를 계속 누적하는 게 아니라 base(직전 절대값) + delta를 매번 다시 계산하므로,
 * 다음 런이 스냅샷에서 이 값을 다시 읽으면 크래시 이전 상태로 스스로 바로잡힌다.
 */
export function nextOperationCounts(
  base: { count: number; msgs: number } | undefined,
  delta: { count: number; msgs: number }
): { count: number; msgs: number } {
  const b = base ?? { count: 0, msgs: 0 }
  return { count: b.count + delta.count, msgs: b.msgs + delta.msgs }
}

async function main() {
  const { since, dryRun } = parseArgs(process.argv.slice(2))
  const dbPath = process.env.HERMES_STATE_DB ?? `${process.env.HOME}/.hermes/state.db`
  const jsonDir = process.env.HERMES_SESSIONS_DIR ?? `${path.dirname(dbPath)}/sessions`

  const raw = readAllSessions(dbPath, jsonDir, since)
  // I1: 조회는 읽기이므로 dry-run이어도 무조건 수행한다. 건너뛰는 건 아래 쓰기(create/update)뿐이다.
  const snapshot = await readSessionLogSnapshot()
  const fresh = raw.filter((s) => !snapshot.keys.has(s.sessionKey))

  console.log(`대상 ${raw.length}건 · 기적재 제외 후 ${fresh.length}건${dryRun ? " · DRY RUN" : ""}`)
  if (fresh.length === 0) return

  const days = groupByDay(classifySessions(fresh))
  console.log(`활동일 ${days.length}일`)

  const promoter = createCodexPromoter()
  let operations = await getOperations()
  // I3: 환각 operationRef 가드 전용 전수 목록. Visibility 필터·100건 제한이 없다.
  // dry-run은 쓰기가 없어 가드를 타지 않으므로 조회를 건너뛴다.
  const knownPageIds = dryRun ? new Set<string>() : await listAllOperationPageIds()
  // I2: 과제별 누적 집계. 스냅샷에서 이어받아 절대값을 쓴다.
  const running = new Map(snapshot.byOperation)

  for (const day of days) {
    const result = await promoteDay(day, operations, promoter)
    console.log(`[${day.date}] 세션 ${result.sessions.length} · 신규 과제 ${result.operations.length}`)

    if (dryRun) {
      // 연결 대상을 반드시 보여준다. dry-run의 목적이 "수행 세션이 잡카드를 만들지 않고
      // 기존 과제에 제대로 붙는가"를 확인하는 것이라, ref를 감추면 아무것도 검증할 수 없다.
      const opName = new Map(operations.map((o) => [o.page_id, o.name]))
      for (const s of result.sessions) {
        const ref = s.operationRef
        const link = !ref
          ? "미연결"
          : (opName.get(ref) ?? (ref.startsWith("new:") ? `신규 ${ref}` : `알 수 없음 ${ref}`))
        // enforceRules가 그날에 없는 세션 키를 이미 걸러내므로 항상 찾아진다
        const origin = day.sessions.find((d) => d.sessionKey === s.sessionKey)!.origin
        console.log(`   - [${effectiveOrigin(origin, s.originOverride)}] ${s.domain} | ${s.outcome} | ${s.name}  ->  ${link}`)
      }
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
      knownPageIds.add(created.page_id)
    }

    // operationRef가 이번 런에서 만든 신규 과제(refToPageId)도,
    // 전수 조회한 기존 과제 목록(knownPageIds, I3)도 아니면 LLM이 지어낸 값이므로 null로 떨군다 —
    // 그대로 Notion에 넘기면 존재하지 않는 relation 대상이라 API 호출이 실패한다.

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

    // 과제 집계·Last Touched 갱신. I2: 델타가 아니라 절대값을 쓴다 —
    // 이전 런이 중간에 죽어도 다음 런의 스냅샷이 스스로 바로잡는다.
    for (const [pageId, delta] of touched) {
      const next = nextOperationCounts(running.get(pageId), delta)
      running.set(pageId, next)

      // Started At이 비어 있으면 이번에 처음 관측한 날로 채운다.
      // 날짜 루프가 오름차순이므로 이 값이 우리가 아는 가장 이른 활동일이다.
      // 이게 없으면 기존 과제들은 타임라인 뷰에 시작점이 없어 아예 그려지지 않는다.
      const known = operations.find((o) => o.page_id === pageId)
      const startedAt = known?.started_at ? undefined : day.date

      await updateOperation(pageId, {
        last_touched: day.date,
        session_count: next.count,
        msg_total: next.msgs,
        ...(startedAt ? { started_at: startedAt } : {}),
      })
    }

    // 다음 날 판정에 신규 과제가 보이도록 갱신
    operations = await getOperations()
  }

  console.log("완료")
}

/**
 * 부수 수정: 예전엔 argv[1]?.includes("dakota-ledger-sync")였다. 이건 이 파일뿐 아니라
 * dakota-ledger-sync.test.ts도 매칭해서, 테스트 러너가 이 모듈을 import만 해도 실행 환경에
 * 따라 main()이 함께 돌 위험이 있었다. 확장자까지 정확히 맞춘다.
 */
export function isMainModule(argv1: string | undefined): boolean {
  return argv1?.endsWith("dakota-ledger-sync.ts") ?? false
}

if (isMainModule(process.argv[1])) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
