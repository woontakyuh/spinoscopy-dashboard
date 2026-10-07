// scripts/fulltext-worker/daemon.ts
// 상주 데몬 — Ably 트리거(즉시) + 백업 폴링(완전성) + 중복기동 방지 뮤텍스.
// launchd KeepAlive 로 상시 유지. run.sh 가 .env.local 로드 후 tsx 호출.
import * as Ably from "ably"
import { drainQueue } from "./drain"
import { ABLY_CHANNEL, ABLY_EVENT } from "../../lib/fulltext/ably"
import { WORKER_VERSION, checkForUpdate } from "./version"

const POLL_MS = Number(process.env.FULLTEXT_POLL_MS ?? "300000")
const ABLY_KEY = process.env.ABLY_API_KEY ?? ""
const UPDATE_CHECK_MS = Number(process.env.FULLTEXT_UPDATE_CHECK_MS ?? "1800000")

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

// 새 코드가 main 에 올라오면 스스로 내려간다. launchd KeepAlive 가 다시 띄우면서
// run.sh 가 pull 하므로, 교수님께 업데이트를 부탁할 필요가 없어진다.
// 처리 중엔 건드리지 않는다 — 반쯤 받은 PDF 를 버리지 않도록.
function selfUpdateCheck(): void {
  if (running) return
  const r = checkForUpdate()
  if (!r?.restart) return
  console.log(`[fulltext-daemon] 새 코드 발견 ${r.head} → ${r.remote} — 재시작해 업데이트`)
  process.exit(0)
}

async function main() {
  console.log(
    `[fulltext-daemon] 시작 v${WORKER_VERSION} (poll=${POLL_MS}ms, ably=${ABLY_KEY ? "on" : "off"})`
  )

  await runDrain("startup") // 부팅 시 밀린 큐 한 번 소진
  setInterval(() => void runDrain("poll"), POLL_MS) // 백업 폴링(안전망)
  setInterval(selfUpdateCheck, UPDATE_CHECK_MS)

  if (ABLY_KEY) {
    try {
      const client = new Ably.Realtime(ABLY_KEY)
      const channel = client.channels.get(ABLY_CHANNEL)
      await channel.subscribe(ABLY_EVENT, () => void runDrain("ably"))
      console.log("[fulltext-daemon] Ably 구독 시작")
    } catch (e) {
      console.error("[fulltext-daemon] Ably 구독 실패 — 백업 폴링만으로 동작:", e instanceof Error ? e.message : e)
    }
  }
  // setInterval + Ably 연결이 이벤트 루프를 유지 → 프로세스 상주.
}

main().catch((e) => {
  console.error("[fulltext-daemon] 치명 오류:", e)
  process.exit(1)
})
