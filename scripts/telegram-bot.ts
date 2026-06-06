import * as fs from "node:fs"
import * as path from "node:path"
import * as process from "node:process"

type AgentId = "dakota" | "elon" | "brian" | "lo" | "warren" | "andrej"
type EventStatus = "pending" | "in_progress" | "completed" | "blocked" | "cancelled"

interface RoutedMessage {
  agentId: AgentId
  cleanedText: string
  explicit: boolean
  label: string
}

function loadDotEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return
  const text = fs.readFileSync(filePath, "utf8")
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const idx = line.indexOf("=")
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

const ROOT = process.cwd()
loadDotEnv(path.join(ROOT, ".env.local"))
loadDotEnv(path.join(ROOT, ".env"))

const TELEGRAM_BOT_TOKEN = process.env.DAKOTA_TELEGRAM_BOT_TOKEN
const LOCAL_CHAT_URL = process.env.DAKOTA_TELEGRAM_CHAT_URL ?? "http://127.0.0.1:4321/api/ai/chat"
const BOT_NAME = process.env.DAKOTA_TELEGRAM_BOT_NAME ?? "Dakota"
const GROQ_API_KEY = process.env.GROQ_API_KEY
const OFFSET_DIR = path.join(ROOT, ".hermes", "runtime")
const OFFSET_FILE = path.join(OFFSET_DIR, "telegram-offset.json")
const LOCAL_BASE_URL = (() => {
  try {
    return new URL(LOCAL_CHAT_URL).origin
  } catch {
    return "http://127.0.0.1:4321"
  }
})()

const AGENT_LABELS: Record<AgentId, string> = {
  dakota: "Dakota",
  elon: "Elon",
  brian: "Brian",
  lo: "Lo",
  warren: "Warren",
  andrej: "Andrej",
}

const AGENT_ALIASES: Array<{ agentId: AgentId; aliases: string[] }> = [
  { agentId: "dakota", aliases: ["dakota", "다코타"] },
  { agentId: "elon", aliases: ["elon", "일론", "엘론"] },
  { agentId: "brian", aliases: ["brian", "브라이언"] },
  { agentId: "lo", aliases: ["lo", "로", "형님로"] },
  { agentId: "warren", aliases: ["warren", "워렌"] },
  { agentId: "andrej", aliases: ["andrej", "안드레이"] },
]

if (!TELEGRAM_BOT_TOKEN) {
  console.error("[telegram-bot] DAKOTA_TELEGRAM_BOT_TOKEN is missing")
  process.exit(1)
}

fs.mkdirSync(OFFSET_DIR, { recursive: true })

function readOffset(): number {
  try {
    const raw = fs.readFileSync(OFFSET_FILE, "utf8")
    const parsed = JSON.parse(raw) as { offset?: number }
    return Number.isFinite(parsed.offset) ? Math.max(0, Number(parsed.offset ?? 0)) : 0
  } catch {
    return 0
  }
}

function writeOffset(offset: number) {
  fs.writeFileSync(OFFSET_FILE, JSON.stringify({ offset }, null, 2))
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function telegramApi(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Telegram API ${method} failed: ${res.status} ${text}`)
  return JSON.parse(text) as { ok: boolean; result?: unknown; description?: string }
}

function splitTelegramMessage(text: string, max = 3900): string[] {
  const cleaned = text.trim()
  if (!cleaned) return [""]
  if (cleaned.length <= max) return [cleaned]

  const chunks: string[] = []
  let start = 0
  while (start < cleaned.length) {
    let end = Math.min(start + max, cleaned.length)
    if (end < cleaned.length) {
      const newline = cleaned.lastIndexOf("\n", end)
      if (newline > start + 200) end = newline + 1
    }
    chunks.push(cleaned.slice(start, end).trim())
    start = end
  }
  return chunks.filter(Boolean)
}

function formatStartMessage() {
  return [
    `${BOT_NAME}가 살아났어요.`,
    "이제 Telegram에서 바로 명령 주시면 제가 처리할게요.",
    "여긴 별도 Dakota가 아니라, dashboard/Claude와 같은 Dakota에 붙는 Telegram surface예요.",
    "기본 창구는 Dakota고, 필요하면 specialist로 바로 라우팅합니다.",
    "예: 오늘 일정 / Brian: 이 논문 코멘트 정리 / Elon: 오늘 수술 흐름 점검 / Warren: 엔비디아 지금 어떻게 볼까",
  ].join("\n")
}

function formatTodoSummary(items: Array<{ name: string; due?: string | null; priority?: string; category?: string; status?: string }>) {
  if (!items.length) return "활성 할 일이 없어요."
  const lines = items.slice(0, 8).map((item, idx) => {
    const due = item.due ? ` · ${item.due}` : ""
    const pri = item.priority ? ` · ${item.priority}` : ""
    const cat = item.category ? ` · ${item.category}` : ""
    const st = item.status ? ` · ${item.status}` : ""
    return `${idx + 1}. ${item.name}${due}${pri}${cat}${st}`
  })
  return [`활성 할 일 ${items.length}개`, ...lines].join("\n")
}

function formatScheduleSummary(items: Array<{ name: string; date_start?: string; date_end?: string; place?: string; category?: string }>) {
  if (!items.length) return "다가오는 일정이 없어요."
  const lines = items.slice(0, 8).map((item, idx) => {
    const date = item.date_start ? ` · ${item.date_start}${item.date_end && item.date_end !== item.date_start ? `~${item.date_end}` : ""}` : ""
    const place = item.place ? ` · ${item.place}` : ""
    const cat = item.category ? ` · ${item.category}` : ""
    return `${idx + 1}. ${item.name}${date}${place}${cat}`
  })
  return [`다가오는 일정 ${items.length}개`, ...lines].join("\n")
}

function formatMemorySummary(text: string) {
  const cleaned = text.trim()
  if (!cleaned) return "기억이 비어 있어요."
  return cleaned.slice(0, 3000)
}

function normalizeAgentAlias(value: string): AgentId | null {
  const lowered = value.trim().toLowerCase()
  for (const entry of AGENT_ALIASES) {
    if (entry.aliases.includes(lowered)) return entry.agentId
  }
  return null
}

function inferAgentByIntent(text: string): AgentId {
  if (/(논문|저널|리뷰어|reviewer|editorial|manuscript|abstract|revision|cover letter|연구)/i.test(text)) {
    return "brian"
  }
  if (/(환자|수술|외래|임상|prom|ube|spinoscopy|케이스|회진)/i.test(text)) {
    return "elon"
  }
  if (/(주식|투자|포트폴리오|자산|현금흐름|엔비디아|nvda|tesla|비트코인|bitcoin|매수|매도)/i.test(text)) {
    return "warren"
  }
  if (/(bjj|주짓수|롤링|훈련|시합|가드|패스|스파링)/i.test(text)) {
    return "lo"
  }
  if (/(ai|llm|openai|anthropic|qwen|deepseek|모델|에이전트|workflow|자동화|뉴스)/i.test(text)) {
    return "andrej"
  }
  return "dakota"
}

export function routeTelegramMessage(text: string): RoutedMessage {
  const slashMatch = text.match(/^\/(dakota|elon|brian|lo|warren|andrej)\b\s*(.*)$/i)
  if (slashMatch) {
    const agentId = normalizeAgentAlias(slashMatch[1]) ?? "dakota"
    return {
      agentId,
      cleanedText: (slashMatch[2] || "").trim() || text.trim(),
      explicit: true,
      label: AGENT_LABELS[agentId],
    }
  }

  const prefixMatch = text.match(/^([@A-Za-z가-힣]+)\s*[:：]\s*([\s\S]+)$/)
  if (prefixMatch) {
    const agentId = normalizeAgentAlias(prefixMatch[1])
    if (agentId) {
      return {
        agentId,
        cleanedText: prefixMatch[2].trim(),
        explicit: true,
        label: AGENT_LABELS[agentId],
      }
    }
  }

  const inferred = inferAgentByIntent(text)
  return {
    agentId: inferred,
    cleanedText: text.trim(),
    explicit: false,
    label: AGENT_LABELS[inferred],
  }
}

async function fetchJson<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  const text = await res.text()
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${text.slice(0, 300)}`)
  return JSON.parse(text) as T
}

async function callLocalAgentChat(text: string, agentId: AgentId) {
  const res = await fetch(LOCAL_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(18_000),
    body: JSON.stringify({
      messages: [{ role: "user", content: text }],
      agentId,
      userContext: {},
      voiceMode: false,
    }),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`${agentId} chat failed: ${res.status} ${raw.slice(0, 500)}`)
  const trimmed = raw.trim()
  if (!trimmed) throw new Error(`${agentId} chat returned empty content`)
  return trimmed
}

export async function callGroqAgent(text: string, agentId: AgentId) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY missing")

  const systemByAgent: Record<AgentId, string> = {
    dakota: [
      "You are Dakota, Dr. Woon Tak Yuh's calm Korean personal assistant.",
      "Respond in Korean.",
      "Be concise, direct, and practical.",
      "If the user asks for schedule/todo/memory, be concrete.",
      "No markdown unless it clearly helps readability.",
    ].join(" "),
    brian: [
      "You are Brian, Dr. Tak's research and journal strategy partner.",
      "Respond in Korean.",
      "Focus on reviewer logic, manuscript structure, editorial judgment, and concrete revision strategy.",
      "Be concise and intellectually sharp.",
    ].join(" "),
    elon: [
      "You are Elon, Dr. Tak's clinical workflow partner.",
      "Respond in Korean.",
      "Focus on practical clinical reasoning, workflow, patient flow, and surgical execution.",
      "Be concise and operational.",
    ].join(" "),
    lo: [
      "You are Lo, Dr. Tak's BJJ coach-brother figure.",
      "Respond in Korean.",
      "Be direct, practical, and coaching-oriented about training and competition.",
    ].join(" "),
    warren: [
      "You are Warren, Dr. Tak's capital allocation and investing partner.",
      "Respond in Korean.",
      "Focus on risk, portfolio logic, downside, and timing.",
      "Be concise and sober, not hyped.",
    ].join(" "),
    andrej: [
      "You are Andrej, Dr. Tak's AI and model-systems commentator.",
      "Respond in Korean.",
      "Focus on AI models, ecosystems, workflow implications, and strategic significance.",
      "Be concise and insightful.",
    ].join(" "),
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.4,
      max_tokens: 700,
      messages: [
        { role: "system", content: systemByAgent[agentId] },
        { role: "user", content: text },
      ],
    }),
  })
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
  if (!res.ok) throw new Error(`Groq chat failed: ${json.error?.message ?? res.statusText}`)
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error("Groq returned empty content")
  return content
}

async function sendReply(chatId: number | string, text: string, replyToMessageId?: number) {
  const chunks = splitTelegramMessage(text)
  for (let i = 0; i < chunks.length; i += 1) {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: chunks[i],
      reply_to_message_id: i === 0 ? replyToMessageId : undefined,
      disable_web_page_preview: true,
    })
  }
}

async function postLocalJson(url: string, payload: Record<string, unknown>, timeoutMs = 8_000) {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(payload),
  }).catch(() => undefined)
}

function buildTaskId(chatId: number | string, messageId?: number) {
  return `telegram-${chatId}-${messageId ?? Date.now()}`
}

async function emitOrchestratorEvent(
  agentId: AgentId,
  kind: "received" | "reported",
  summary: string,
  taskId: string,
  status: EventStatus = "completed"
) {
  await postLocalJson(`${LOCAL_BASE_URL}/api/orchestrator/events`, {
    agent: agentId,
    role: kind === "received" ? "user" : "specialist",
    kind,
    status,
    channel: "telegram",
    summary,
    requiresApproval: false,
    approvalState: "none",
    artifactType: kind === "reported" ? "report" : undefined,
    taskId,
  })
}

async function saveTelegramSession(agentId: AgentId, userText: string, answer: string) {
  const now = new Date().toISOString()
  await postLocalJson(`${LOCAL_BASE_URL}/api/dakota/memory/session`, {
    startTime: now,
    endTime: now,
    channel: "telegram",
    agentId,
    exchanges: [
      { role: "user", content: userText },
      { role: "assistant", content: answer },
    ],
  })
}

async function getScheduleText() {
  try {
    const items = await fetchJson<Array<{ name: string; date_start?: string; date_end?: string; place?: string; category?: string }>>(
      `${LOCAL_BASE_URL}/api/notion/schedule`,
      8_000
    )
    return formatScheduleSummary(items)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return `일정 조회가 잠깐 느려요. 잠시 후 다시 시도해 주세요.\n(${msg.slice(0, 120)})`
  }
}

async function getTodoText() {
  try {
    const items = await fetchJson<Array<{ name: string; due?: string | null; priority?: string; category?: string; status?: string }>>(
      `${LOCAL_BASE_URL}/api/dakota/todo?status=active`,
      8_000
    )
    return formatTodoSummary(items)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return `할 일 조회가 잠깐 느려요. 잠시 후 다시 시도해 주세요.\n(${msg.slice(0, 120)})`
  }
}

async function getMemoryText() {
  try {
    const payload = await fetchJson<{ text?: string }>(`${LOCAL_BASE_URL}/api/dakota/memory`, 8_000)
    return formatMemorySummary(payload.text ?? "")
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return `기억 조회가 잠깐 느려요. 잠시 후 다시 시도해 주세요.\n(${msg.slice(0, 120)})`
  }
}

function looksLikeScheduleQuery(text: string) {
  return /일정|스케줄|캘린더|calendar|schedule|agenda/i.test(text)
}

function looksLikeTodoQuery(text: string) {
  return /할\s*일|투두|todo|to-do|해야 할|해야할/i.test(text)
}

function looksLikeMemoryQuery(text: string) {
  return /기억|메모리|remember|memory/i.test(text)
}

async function handleMessage(message: any) {
  const chatId = message?.chat?.id
  const text = typeof message?.text === "string" ? message.text.trim() : ""
  const messageId = message?.message_id
  if (!chatId || !text) return

  if (/^\/(start|help)\b/.test(text)) {
    await sendReply(chatId, formatStartMessage(), messageId)
    return
  }

  if (/^\/ping\b/.test(text)) {
    await sendReply(chatId, "pong", messageId)
    return
  }

  if (/^\/status\b/.test(text)) {
    const status = [
      "Telegram 연결: 살아있음",
      `로컬 AI 엔드포인트: ${LOCAL_CHAT_URL}`,
      `Groq fallback: ${GROQ_API_KEY ? "가능" : "없음"}`,
      "모드: polling",
      "정체성: dashboard/Claude와 같은 Dakota",
      "라우팅: Dakota front door + specialist direct route",
    ].join("\n")
    await sendReply(chatId, status, messageId)
    return
  }

  const typing = telegramApi("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined)
  const routed = routeTelegramMessage(text)
  const taskId = buildTaskId(chatId, messageId)

  try {
    let answer: string | null = null

    if (looksLikeScheduleQuery(routed.cleanedText) && !/저장|추가|등록|만들/i.test(routed.cleanedText)) {
      answer = await getScheduleText()
    } else if (looksLikeTodoQuery(routed.cleanedText) && !/저장|추가|등록|만들/i.test(routed.cleanedText)) {
      answer = await getTodoText()
    } else if (looksLikeMemoryQuery(routed.cleanedText) && !/저장|추가|등록|만들/i.test(routed.cleanedText)) {
      answer = await getMemoryText()
    } else {
      await emitOrchestratorEvent(routed.agentId, "received", routed.cleanedText.slice(0, 220), taskId)
      try {
        answer = await callLocalAgentChat(routed.cleanedText, routed.agentId)
      } catch (error) {
        const localMsg = error instanceof Error ? error.message : String(error)
        try {
          answer = await callGroqAgent(routed.cleanedText, routed.agentId)
        } catch (groqError) {
          const groqMsg = groqError instanceof Error ? groqError.message : String(groqError)
          throw new Error(`local chat failed: ${localMsg}; groq fallback failed: ${groqMsg}`)
        }
      }

      if (answer) {
        await emitOrchestratorEvent(routed.agentId, "reported", answer.slice(0, 220), taskId)
        await saveTelegramSession(routed.agentId, routed.cleanedText, answer)
        if (routed.explicit && routed.agentId !== "dakota") {
          answer = `[${routed.label}]\n${answer}`
        }
      }
    }

    await typing
    await sendReply(chatId, answer ?? "응답을 만들지 못했어요.", messageId)
  } catch (error) {
    await typing
    const msg = error instanceof Error ? error.message : String(error)
    await sendReply(chatId, `지금은 잠깐 막혔어요. ${msg.slice(0, 200)}`, messageId)
  }
}

async function main() {
  let offset = readOffset()
  console.error(`[telegram-bot] starting with offset=${offset}`)

  while (true) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(35_000),
        body: JSON.stringify({
          offset,
          timeout: 30,
          allowed_updates: ["message", "edited_message"],
        }),
      })
      const payload = (await res.json()) as { ok: boolean; result?: Array<{ update_id: number; message?: any; edited_message?: any }>; description?: string }
      if (!res.ok || !payload.ok) throw new Error(`getUpdates failed: ${res.status} ${payload.description ?? "unknown"}`)

      for (const update of payload.result ?? []) {
        offset = Math.max(offset, update.update_id + 1)
        writeOffset(offset)
        const message = update.message ?? update.edited_message
        if (!message) continue
        await handleMessage(message)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[telegram-bot] ${msg}`)
      await delay(1500)
    }
  }
}

if (process.env.TELEGRAM_BOT_DRY_RUN !== "1") {
  main().catch((error) => {
    console.error("[telegram-bot] fatal:", error)
    process.exit(1)
  })
}
