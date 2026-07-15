// scripts/fulltext-worker/run-once.ts
// 큐를 1회만 소진(수동 실행/셀프테스트용). 데몬 없이 한 번 돌린다.
import { drainQueue } from "./drain"

drainQueue()
  .then((n) => console.log(`  → 처리: ${n}건(대기 요청이 없으면 0이 정상)`))
  .catch((e) => {
    console.error("  ❌", e instanceof Error ? e.message : e)
    process.exit(1)
  })
