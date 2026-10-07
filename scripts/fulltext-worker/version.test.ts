import { describe, it, expect } from "vitest"
import { shouldRestartForUpdate } from "./version"

describe("shouldRestartForUpdate", () => {
  const base = { branch: "main", dirty: false, head: "aaa", remote: "bbb", ffable: true }
  it("main·깨끗·뒤처짐·ff 가능 → 재시작", () => {
    expect(shouldRestartForUpdate(base)).toBe(true)
  })
  it("이미 최신이면 그대로", () => {
    expect(shouldRestartForUpdate({ ...base, remote: "aaa" })).toBe(false)
  })
  // run.sh 의 job_bootstrap 이 pull 하지 않는 조건 — 재시작해 봐야 같은 코드로 뜬다.
  it("main 이 아니거나 더러우면 재시작 안 함", () => {
    expect(shouldRestartForUpdate({ ...base, branch: "agent/brian" })).toBe(false)
    expect(shouldRestartForUpdate({ ...base, dirty: true })).toBe(false)
  })
  it("갈라졌으면(ff 불가) 재시작 안 함", () => {
    expect(shouldRestartForUpdate({ ...base, ffable: false })).toBe(false)
  })
})
