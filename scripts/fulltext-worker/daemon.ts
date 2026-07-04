// scripts/fulltext-worker/daemon.ts
// 상주 데몬 — Ably 트리거(즉시) + 백업 폴링(완전성) + 중복기동 방지 뮤텍스.
// launchd KeepAlive 로 상시 유지. run.sh 가 .env.local 로드 후 tsx 호출.
import * as Ably from "ably"
import { drainQueue } from "./drain"
import { ABLY_CHANNEL, ABLY_EVENT } from "../../lib/fulltext/ably"

const POLL_MS = Number(process.env.FULLTEXT_POLL_MS ?? "300000")
const ABLY_KEY = process.env.ABLY_API_KEY ?? ""

let running = false

async function runDrain(trigger: string): Promise<void> {
  if (running) {
    console.log(`[${trigger}] 이미 처리 중 — skip`)
    return
  }
  running = true
  try {
    const n = await drainQueue()
    console.log(`[${trigger}] ${n}건 처리`)
  } catch (e) {
    console.error(`[${trigger}] drain 오류:`, e instanceof Error ? e.message : e)
  } finally {
    running = false
  }
}

async function main() {
  console.log(`[fulltext-daemon] 시작 (poll=${POLL_MS}ms, ably=${ABLY_KEY ? "on" : "off"})`)

  await runDrain("startup") // 부팅 시 밀린 큐 한 번 소진
  setInterval(() => void runDrain("poll"), POLL_MS) // 백업 폴링(안전망)

  if (ABLY_KEY) {
    const client = new Ably.Realtime(ABLY_KEY)
    const channel = client.channels.get(ABLY_CHANNEL)
    await channel.subscribe(ABLY_EVENT, () => void runDrain("ably"))
    console.log("[fulltext-daemon] Ably 구독 시작")
  }
  // setInterval + Ably 연결이 이벤트 루프를 유지 → 프로세스 상주.
}

main().catch((e) => {
  console.error("[fulltext-daemon] 치명 오류:", e)
  process.exit(1)
})
