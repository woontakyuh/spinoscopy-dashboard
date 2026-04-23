// 모바일에서도 볼 수 있도록 voice 디버그 로그를 화면에 띄울 수 있게 한 옵저버블.
// 해결 후 이 파일 + 참조 지우면 됨.

const MAX = 30
let logs: string[] = []
type Sub = (logs: string[]) => void
const subs = new Set<Sub>()

export function pushVoiceLog(msg: string): void {
  const ts = new Date().toTimeString().slice(0, 8)
  logs = [`${ts} ${msg}`, ...logs].slice(0, MAX)
  // eslint-disable-next-line no-console
  console.log("[voice]", msg)
  subs.forEach((s) => s(logs))
}

export function subscribeVoiceLog(sub: Sub): () => void {
  subs.add(sub)
  sub(logs)
  return () => {
    subs.delete(sub)
  }
}

export function clearVoiceLog(): void {
  logs = []
  subs.forEach((s) => s(logs))
}
