/**
 * Claude Desktop 대화 요약(Dakota Conversation Logs, Channel=Claude Desktop)을
 * Session Log로 적재한다. Operation은 만들거나 건드리지 않는다.
 *
 * Domain은 우선 Topics multi_select에서 고정 우선순위로 매핑한다
 * (lib/dakota-ledger/conversationIngest.ts의 mapTopicsToDomain).
 * Topics가 비어 있으면 Title+Summary를 LLM에 넘겨 분류한다.
 */
import { addCalendarDays, seoulYMD, type SeoulYMD } from "../lib/dakota-ledger/period"
import { classifyDomains, createCodexDomainClassifier } from "../lib/dakota-ledger/domainClassifier"
import { conversationRowToSessionLogInput, conversationSessionKey, mapTopicsToDomain } from "../lib/dakota-ledger/conversationIngest"
import type { LedgerDomain } from "../lib/dakota-ledger/types"
import { listConversationRows, type ConversationLogRow } from "../lib/notion/conversationLog"
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

async function main() {
  const { since, dryRun } = parseArgs(process.argv.slice(2))

  const rows = await listConversationRows({
    channel: "Claude Desktop",
    ...(since ? { sinceDate: since } : {}),
  })

  const snapshot = await readSessionLogSnapshot()
  const fresh = rows.filter((r) => !snapshot.keys.has(conversationSessionKey(r.pageId)))

  const withDate = fresh.filter((r) => {
    if (r.date) return true
    console.log(`   ! "${r.title}"에 Date가 없어 건너뜁니다 (${r.pageId})`)
    return false
  })

  console.log(`Claude Desktop 대화 대상 ${rows.length}건 · 기적재/Date없음 제외 후 ${withDate.length}건${dryRun ? " · DRY RUN" : ""}`)
  if (withDate.length === 0) return

  // Topics로 바로 매핑되는 것과, LLM 분류가 필요한 것(Topics 비어 있음)을 나눈다.
  const needsLLM: ConversationLogRow[] = []
  const domainByPageId = new Map<string, LedgerDomain>()
  for (const row of withDate) {
    const domain = mapTopicsToDomain(row.topics)
    if (domain) {
      domainByPageId.set(row.pageId, domain)
    } else {
      needsLLM.push(row)
    }
  }

  if (needsLLM.length > 0) {
    const classifier = createCodexDomainClassifier()
    const classified = await classifyDomains(
      needsLLM.map((r) => ({ key: r.pageId, text: `${r.title}\n${r.summary}` })),
      classifier
    )
    for (const row of needsLLM) {
      const domain = classified.get(row.pageId)
      if (!domain) {
        console.log(`   ! "${row.title}"의 domain을 분류받지 못했습니다 → Operations로 대체`)
      }
      domainByPageId.set(row.pageId, domain ?? ("Operations" as LedgerDomain))
    }
  }

  for (const row of withDate) {
    const domain = domainByPageId.get(row.pageId)!
    const input = conversationRowToSessionLogInput(
      {
        pageId: row.pageId,
        title: row.title,
        date: row.date!,
        summary: row.summary,
        decisions: row.decisions,
        keyFacts: row.keyFacts,
        actionItems: row.actionItems,
        topics: row.topics,
      },
      domain
    )

    if (dryRun) {
      console.log(`   - [Claude Desktop] ${input.domain} | ${input.outcome} | ${input.name}  (${input.sessionKey})`)
      continue
    }

    await createSessionLog(input)
    console.log(`   + ${input.name}`)
  }

  console.log("완료")
}

export function isMainModule(argv1: string | undefined): boolean {
  return argv1?.endsWith("dakota-conversation-sync.ts") ?? false
}

if (isMainModule(process.argv[1])) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
