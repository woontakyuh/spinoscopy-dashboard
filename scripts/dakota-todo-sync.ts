/**
 * Dashboard To-Do 완료 항목을 Session Log로 적재한다.
 *
 * Hermes sync(dakota-ledger-sync.ts)와 달리 Operation은 절대 만들거나 건드리지
 * 않는다 — to-do는 활동 기록이지 과제가 아니다. 칸반은 Hermes sync 소유다.
 *
 * Domain은 Category에서 기계적으로 매핑하지 않고 LLM으로 분류한다. 완료 91건 중
 * 90건이 Category=일상업무라 그대로 매핑하면 도메인별 비중 차트가 의미를 잃는다.
 * 원래 Category는 Tags에 남겨 정보 손실은 없다.
 */
import { addCalendarDays, seoulYMD, type SeoulYMD } from "../lib/dakota-ledger/period"
import { classifyDomains, createCodexDomainClassifier } from "../lib/dakota-ledger/domainClassifier"
import { todoSessionKey, todoToSessionLogInput } from "../lib/dakota-ledger/todoIngest"
import type { LedgerDomain } from "../lib/dakota-ledger/types"
import { getAllTodos } from "../lib/notion/todo"
import type { TodoItem } from "../lib/notion/todo"
import { createSessionLog, readSessionLogSnapshot } from "../lib/notion/sessionLog"

function ymdToString({ y, m, d }: SeoulYMD): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

export function parseArgs(argv: string[]): { since: string | null; dryRun: boolean } {
  const dryRun = argv.includes("--dry-run")
  const idx = argv.indexOf("--since")
  if (idx === -1) return { since: null, dryRun }

  const value = argv[idx + 1] ?? ""
  const today = seoulYMD(new Date())
  if (value === "today") return { since: ymdToString(today), dryRun }
  if (value === "yesterday") return { since: ymdToString(addCalendarDays(today, -1)), dryRun }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { since: value, dryRun }

  throw new Error(`--since 값을 해석할 수 없습니다: "${value}" (YYYY-MM-DD | today | yesterday)`)
}

export function completedFromDateFilter(since: string | null): string | undefined {
  return since ? `${since}T00:00:00+09:00` : undefined
}

export function isFreshTodo(todo: Pick<TodoItem, "page_id" | "source_ref">, sessionKeys: Set<string>): boolean {
  if (sessionKeys.has(todoSessionKey(todo.page_id))) return false
  if (todo.source_ref && sessionKeys.has(todo.source_ref)) return false
  return true
}

async function main() {
  const { since, dryRun } = parseArgs(process.argv.slice(2))

  const completedFromDate = completedFromDateFilter(since)
  const all = await getAllTodos({ status: "Done", ...(completedFromDate ? { completedFromDate } : {}) })
  const completed = all.filter((t) => Boolean(t.completed_at))

  const snapshot = await readSessionLogSnapshot()
  const fresh = completed.filter((t) => isFreshTodo(t, snapshot.keys))

  console.log(`완료 to-do 대상 ${completed.length}건 · 기적재 제외 후 ${fresh.length}건${dryRun ? " · DRY RUN" : ""}`)
  if (fresh.length === 0) return

  const classifier = createCodexDomainClassifier()
  const domainMap = await classifyDomains(
    fresh.map((t) => ({ key: t.page_id, text: t.name })),
    classifier
  )

  for (const todo of fresh) {
    let domain = domainMap.get(todo.page_id)
    if (!domain) {
      console.log(`   ! "${todo.name}"의 domain을 분류받지 못했습니다 → Operations로 대체`)
      domain = "Operations" as LedgerDomain
    }

    const input = todoToSessionLogInput(todo, domain)

    if (dryRun) {
      console.log(`   - [Dashboard] ${input.domain} | ${input.name}  (${input.sessionKey})`)
      continue
    }

    await createSessionLog(input)
    console.log(`   + ${input.name}`)
  }

  console.log("완료")
}

export function isMainModule(argv1: string | undefined): boolean {
  return argv1?.endsWith("dakota-todo-sync.ts") ?? false
}

if (isMainModule(process.argv[1])) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
