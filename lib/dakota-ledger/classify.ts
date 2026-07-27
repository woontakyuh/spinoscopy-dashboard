import type { ClassifiedSession, DaySessions, LedgerOrigin, RawSession } from "./types"

/** 에이전트 디스패치 프롬프트가 시작하는 영어 명령형 동사 */
const DISPATCH_VERB =
  /^\s*(you are |act as |analyze |audit |collect |compare |create |deep-digest |design |draft |find |generate |inspect |produce |research |retrieve |review |summarize |use the |write )/i

/** "As Warren, ..." 형태의 영문 페르소나 지정. 대소문자를 구분해야 오탐이 없다. */
const PERSONA_EN = /^\s*As [A-Z][a-z]+,/

/**
 * "Brian으로서" 처럼 영문 이름 뒤에 붙은 경우만 페르소나 지정으로 본다.
 * "의사로서", "부모로서" 같은 일상 한국어 조사까지 잡으면
 * 센터장님의 실제 지시가 수행으로 오분류돼 칸반에서 사라진다.
 */
const PERSONA_KO = /[A-Z][a-zA-Z]*(으로서|로서)\s/

/** cron 산출물이 텔레그램 세션으로 유입된 것. 장부 대상이 아니다. */
const CRON_RELAY = /^\s*Cronjob Response:/i

/** 논의로 볼 최소 메시지 수 */
const DISCUSSION_MIN_MESSAGES = 30

const HANGUL = /[가-힣]/

export function classifyOrigin(session: RawSession): LedgerOrigin {
  if (session.channel === "subagent") return "수행"

  const head = session.firstUserMessage.slice(0, 40)
  if (
    DISPATCH_VERB.test(session.firstUserMessage) ||
    PERSONA_EN.test(session.firstUserMessage) ||
    CRON_RELAY.test(session.firstUserMessage) ||
    session.firstUserMessage.includes("/tmp/") ||
    PERSONA_KO.test(head)
  ) {
    return "수행"
  }

  if (session.messageCount >= DISCUSSION_MIN_MESSAGES && HANGUL.test(session.firstUserMessage)) {
    return "논의"
  }

  return "지시"
}

export function classifySessions(sessions: RawSession[]): ClassifiedSession[] {
  return sessions.map((s) => ({ ...s, origin: classifyOrigin(s) }))
}

/** ISO 문자열을 Asia/Seoul 기준 YYYY-MM-DD로 변환한다. */
export function toSeoulDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso))
}

export function groupByDay(sessions: ClassifiedSession[]): DaySessions[] {
  const buckets = new Map<string, ClassifiedSession[]>()
  for (const s of sessions) {
    const date = toSeoulDate(s.startedAt)
    const list = buckets.get(date)
    if (list) list.push(s)
    else buckets.set(date, [s])
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      sessions: list.slice().sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    }))
}

const DEFAULT_SESSION_LIMIT = 2000
const DEFAULT_DETAIL_LIMIT = 10

/** 세션 하나를 LLM 입력용 블록으로 압축한다. */
export function truncateSession(
  session: ClassifiedSession,
  limit: number = DEFAULT_SESSION_LIMIT
): string {
  const header =
    `[${session.sessionKey}] ${session.startedAt} · ${session.channel} · ${session.origin} · ` +
    `${session.messageCount}msg · tools=${session.toolNames.join(",") || "none"}`
  const body =
    `요청: ${session.firstUserMessage}\n` +
    `응답: ${session.lastAssistantMessage}`
  const room = limit - header.length - 1
  return room <= 0 ? header.slice(0, limit) : `${header}\n${body.slice(0, room)}`
}

/**
 * 하루치를 LLM 입력 문자열로 만든다.
 * 세션이 detailLimit을 넘으면 Msg Count 상위만 본문을 담고 나머지는 머리말만 담는다.
 */
export function buildDayContext(
  day: DaySessions,
  detailLimit: number = DEFAULT_DETAIL_LIMIT
): string {
  const ranked = day.sessions.slice().sort((a, b) => b.messageCount - a.messageCount)
  const detailed = new Set(ranked.slice(0, detailLimit).map((s) => s.sessionKey))

  const blocks = day.sessions.map((s) =>
    detailed.has(s.sessionKey)
      ? truncateSession(s)
      : `[${s.sessionKey}] ${s.startedAt} · ${s.channel} · ${s.origin} · ${s.messageCount}msg (본문 생략)`
  )

  return `날짜: ${day.date} (Asia/Seoul), 세션 ${day.sessions.length}건\n\n${blocks.join("\n\n")}`
}
