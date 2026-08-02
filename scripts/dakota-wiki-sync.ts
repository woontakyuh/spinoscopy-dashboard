/**
 * TakBrain LLM Wiki v2 `.wiki-state.json`을 Notion Dakota Wiki State DB로 옮긴다.
 *
 * 볼트는 Mac mini의 Dropbox 경로에만 있고 Vercel은 파일시스템을 못 읽는다 —
 * 세션 장부가 이미 푼 문제(Mac mini cron -> Notion -> 대시보드가 Notion을 읽음)와
 * 같은 패턴을 따른다. 이 스크립트는 Mac mini에서 크론으로 돈다.
 *
 * 이벤트가 events[] 하나뿐이고 파일도 작아서 --since는 없다 — 매번 파일 전체를
 * 읽어 이벤트 전부를 dedup 대조한다.
 */
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { buildWikiSnapshotRows, parseWikiState, type WikiSnapshotRow } from "../lib/dakota-ledger/wikiState"
import { createWikiSnapshot, listWikiSnapshots } from "../lib/notion/wikiState"

const DEFAULT_WIKI_STATE_PATH = join(
  homedir(),
  "Library/CloudStorage/Dropbox/Tak/Obsidian/TakBrain/ExoBrain/LLM_Wiki_v2/.wiki-state.json"
)

export function parseArgs(argv: string[]): { dryRun: boolean } {
  return { dryRun: argv.includes("--dry-run") }
}

function nameFor(row: WikiSnapshotRow): string {
  const dateOnly = row.date.slice(0, 10)
  return `Wiki ${dateOnly} · ${row.status}`
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2))
  const filePath = process.env.WIKI_STATE_FILE ?? DEFAULT_WIKI_STATE_PATH

  let raw: string
  try {
    raw = await readFile(filePath, "utf8")
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      console.log(`Wiki state 파일이 없습니다 (건너뜀): ${filePath}`)
      return
    }
    throw e
  }

  const state = parseWikiState(JSON.parse(raw))
  const rows = buildWikiSnapshotRows(state)

  const existing = await listWikiSnapshots()
  const existingKeys = new Set(existing.map((s) => s.eventKey))
  const fresh = rows.filter((r) => !existingKeys.has(r.eventKey))

  console.log(`이벤트 ${rows.length}건 · 기적재 제외 후 ${fresh.length}건${dryRun ? " · DRY RUN" : ""}`)
  if (fresh.length === 0) return

  for (const row of fresh) {
    if (dryRun) {
      console.log(
        `   - [${row.status}] ${row.date}  created=${row.created} updated=${row.updated} deleted=${row.deleted}` +
          (row.totalPages !== null ? `  총 ${row.totalPages}페이지` : "")
      )
      continue
    }

    await createWikiSnapshot({
      name: nameFor(row),
      eventKey: row.eventKey,
      date: row.date,
      status: row.status,
      created: row.created,
      updated: row.updated,
      deleted: row.deleted,
      totalPages: row.totalPages,
      totalSources: row.totalSources,
      layers: row.layers,
      kinds: row.kinds,
      compiler: row.compiler,
    })
    console.log(`   + ${row.eventKey}`)
  }

  console.log("완료")
}

export function isMainModule(argv1: string | undefined): boolean {
  return argv1?.endsWith("dakota-wiki-sync.ts") ?? false
}

if (isMainModule(process.argv[1])) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
