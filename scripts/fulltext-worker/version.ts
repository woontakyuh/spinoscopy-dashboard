// scripts/fulltext-worker/version.ts
// 워커가 지금 어떤 코드로 도는지 + 새 코드가 나왔는지.
//
// 맥스튜디오는 고용산 교수님 맥이라 원격으로 들어갈 수 없다. 예전엔 코드를 고칠 때마다
// 교수님께 git pull·재시작을 부탁해야 했고, 실제로 반영됐는지도 확인할 길이 없었다.
// 이제 데몬이 스스로 origin/main 을 보고 있다가 새 커밋이 생기면 종료한다 →
// launchd KeepAlive 가 다시 띄우고 → run.sh 의 job_bootstrap 이 pull 한다.
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const REPO = fileURLToPath(new URL("../..", import.meta.url))

function git(...args: string[]): string {
  return execFileSync("git", ["-C", REPO, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 60_000,
  }).trim()
}

function readVersion(): string {
  try {
    return git("rev-parse", "--short", "HEAD")
  } catch {
    return "git없음(zip설치)"
  }
}

export const WORKER_VERSION = readVersion()

export interface RepoState {
  branch: string
  dirty: boolean
  head: string
  remote: string
  /** HEAD 가 origin/main 의 조상인가 = fast-forward 로 따라갈 수 있나 */
  ffable: boolean
}

/**
 * 재시작해야 하나. job_bootstrap 이 pull 하는 조건(main + 깨끗한 트리)과 똑같이 맞춘다 —
 * 조건이 어긋나면 "재시작했는데 pull 은 안 함"을 30분마다 되풀이하게 된다.
 */
export function shouldRestartForUpdate(s: RepoState): boolean {
  return s.branch === "main" && !s.dirty && s.head !== s.remote && s.ffable
}

export function checkForUpdate(): { restart: boolean; head: string; remote: string } | null {
  try {
    git("fetch", "--quiet", "origin", "main")
    const head = git("rev-parse", "HEAD")
    const remote = git("rev-parse", "origin/main")
    let ffable = true
    try {
      git("merge-base", "--is-ancestor", "HEAD", "origin/main")
    } catch {
      ffable = false
    }
    const state: RepoState = {
      branch: git("rev-parse", "--abbrev-ref", "HEAD"),
      dirty: git("status", "--porcelain").length > 0,
      head,
      remote,
      ffable,
    }
    return { restart: shouldRestartForUpdate(state), head: head.slice(0, 7), remote: remote.slice(0, 7) }
  } catch {
    // git 이 없거나(zip 설치) 네트워크가 끊겼다 — 지금 코드로 계속 돈다.
    return null
  }
}
