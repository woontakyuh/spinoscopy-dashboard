/**
 * AI Frontier·Dwarkesh 미수집 Episode 일괄 수집 (로컬 전용).
 *
 * 분석은 Codex CLI의 ChatGPT 구독 OAuth로 수행하므로 OpenAI API 비용이 들지 않는다.
 * 1) 공식 카탈로그 동기화 → 2) `목록`·`수집 실패` 상태 Episode를 최신순으로 순차 수집.
 * Hermes cron(매일 08:30)이 이 명령을 돌린다.
 *
 *   npm run frontier:backfill              # 전체
 *   npm run frontier:backfill -- --limit 3 # 최대 3개
 *   npm run frontier:backfill -- --no-sync # 카탈로그 동기화 생략
 */
import { importAiFrontierEpisode } from "../lib/andrej/frontier-import"
import { getAiFrontierIndex } from "../lib/notion/ai-frontier"
import { runAiFrontierCatalogSync } from "../lib/notion/ai-frontier-catalog"

const PENDING = new Set(["목록", "수집 실패"])
const SOURCES = ["https://aifrontier.kr/", "https://www.dwarkesh.com/"]

function flag(name: string): string | null {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1] ?? ""
}

function describeError(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  while (current instanceof Error) {
    const extra = current as Error & { phase?: string; detail?: string }
    parts.push([current.message, extra.phase, extra.detail].filter(Boolean).join(" · "))
    current = current.cause
  }
  return parts.join(" ← ") || String(error)
}

function label(episode: { episodeNumber: number | null; name: string }): string {
  return episode.episodeNumber !== null ? `EP${episode.episodeNumber}` : episode.name.slice(0, 40)
}

async function main() {
  const limit = Number(flag("--limit") ?? Infinity)

  if (!process.argv.includes("--no-sync")) {
    try {
      const synced = await runAiFrontierCatalogSync()
      console.log(`카탈로그 동기화: created ${synced.created ?? 0}, updated ${synced.updated ?? 0}`)
    } catch (error) {
      console.error(`카탈로그 동기화 실패(계속 진행): ${describeError(error)}`)
    }
  }

  const index = await getAiFrontierIndex()
  const pending = index.episodes
    .filter((episode) =>
      PENDING.has(episode.status ?? "") &&
      SOURCES.some((prefix) => episode.transcriptSource?.startsWith(prefix))
    )
    .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""))
    .slice(0, limit)

  console.log(`수집 대상 ${pending.length}개: ${pending.map(label).join(", ") || "없음"}`)

  const failures: string[] = []
  for (const episode of pending) {
    const started = Date.now()
    try {
      const result = await importAiFrontierEpisode(episode.id)
      console.log(`✓ ${label(episode)} ${Math.round((Date.now() - started) / 1000)}s 개념 +${result.conceptsCreated}/~${result.conceptsUpdated}`)
    } catch (error) {
      failures.push(label(episode))
      console.error(`✗ ${label(episode)}: ${describeError(error)}`)
    }
  }

  console.log(`완료 ${pending.length - failures.length}/${pending.length}${failures.length ? ` · 실패 ${failures.join(", ")}` : ""}`)
  if (failures.length) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(describeError(error))
  process.exitCode = 1
})
