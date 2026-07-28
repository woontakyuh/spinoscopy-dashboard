/**
 * Surface 백필: 이미 적재된 Session Log 행 중 Surface가 비어 있는 것들에
 * "Hermes"를 채운다. Surface를 도입하기 전까지의 모든 행은 Hermes 세션이었으므로
 * (Dashboard/Claude Desktop 수집은 이 PR에서 처음 생긴다) 이 값이 항상 맞다.
 *
 * 멱등: 이미 Surface가 있는 행은 건드리지 않는다. 재실행해도 쓰기가 0건이다.
 * --dry-run: 조회만 하고 몇 건을 채울지 로그로 보여준 뒤 아무것도 쓰지 않는다.
 */
import { notionRequest } from "../lib/notion/client"

const SESSION_LOG_DB_ID_KEY = "NOTION_DAKOTA_SESSION_LOG_DB_ID"

interface SessionLogPage {
  id: string
  properties: {
    Surface?: { select?: { name: string } | null }
    Name?: { title?: Array<{ plain_text?: string }> }
  }
}

interface QueryResponse {
  results: SessionLogPage[]
  has_more: boolean
  next_cursor: string | null
}

function pageName(page: SessionLogPage): string {
  return (page.properties.Name?.title ?? []).map((t) => t.plain_text ?? "").join("").trim()
}

async function findRowsMissingSurface(dbId: string): Promise<SessionLogPage[]> {
  const missing: SessionLogPage[] = []
  let cursor: string | null = null
  do {
    const res: QueryResponse = await notionRequest<QueryResponse>(`/databases/${dbId}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    })
    for (const page of res.results) {
      if (!page.properties.Surface?.select?.name) missing.push(page)
    }
    // dakota-ledger-sync.ts와 같은 이유로 조용히 멈추지 않고 던진다: has_more인데
    // next_cursor가 없으면 다음 실행이 이번에 못 본 나머지를 영영 놓친다.
    if (res.has_more) {
      if (!res.next_cursor) {
        throw new Error("Notion 페이지네이션 오류: has_more=true인데 next_cursor가 없습니다 (Surface backfill)")
      }
      cursor = res.next_cursor
    } else {
      cursor = null
    }
  } while (cursor)
  return missing
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const dbId = process.env[SESSION_LOG_DB_ID_KEY]
  if (!dbId) throw new Error(`${SESSION_LOG_DB_ID_KEY} is not configured`)

  const missing = await findRowsMissingSurface(dbId)
  console.log(`Surface 없는 행 ${missing.length}건${dryRun ? " · DRY RUN" : ""}`)
  if (missing.length === 0 || dryRun) return

  for (const page of missing) {
    await notionRequest(`/pages/${page.id}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { Surface: { select: { name: "Hermes" } } } }),
    })
    console.log(`  Surface=Hermes -> ${pageName(page) || page.id}`)
  }
  console.log("완료")
}

export function isMainModule(argv1: string | undefined): boolean {
  return argv1?.endsWith("dakota-ledger-backfill-surface.ts") ?? false
}

if (isMainModule(process.argv[1])) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
