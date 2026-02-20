import { Bot } from "grammy"

let _bot: Bot | null = null

export function getBot(): Bot {
  if (!_bot) {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set")
    _bot = new Bot(token)
    registerHandlers(_bot)
  }
  return _bot
}

const ALLOWED_CHAT_IDS = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
  .split(",")
  .filter(Boolean)
  .map(Number)

function isAuthorized(chatId: number): boolean {
  if (ALLOWED_CHAT_IDS.length === 0) return true
  return ALLOWED_CHAT_IDS.includes(chatId)
}

function getBaseUrl(): string {
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
}

function registerHandlers(bot: Bot) {
  bot.command("start", async (ctx) => {
    if (!isAuthorized(ctx.chat.id)) {
      return ctx.reply("⛔ Unauthorized. Your chat ID: " + ctx.chat.id)
    }
    await ctx.reply(
      "👋 Spinoscopy AI Bot\n\n" +
      "/alerts — 최신 저널 알림\n" +
      "/schedule — 오늘 일정\n" +
      "/scholar — 논문 통계\n" +
      "/help — 도움말\n\n" +
      "또는 자유롭게 질문하세요."
    )
  })

  bot.command("help", async (ctx) => {
    if (!isAuthorized(ctx.chat.id)) return
    await ctx.reply(
      "/alerts — 최신 저널 알림 (필독 논문)\n" +
      "/schedule — 오늘 일정/수술\n" +
      "/scholar — 논문 DB 통계\n" +
      "/help — 이 메시지"
    )
  })

  bot.command("schedule", async (ctx) => {
    if (!isAuthorized(ctx.chat.id)) return
    try {
      const res = await fetch(`${getBaseUrl()}/api/notion/schedule`)
      if (!res.ok) throw new Error(`API ${res.status}`)
      const items = await res.json()

      if (!items || items.length === 0) {
        return ctx.reply("📅 이번 주 일정이 없습니다.")
      }

      const today = new Date().toISOString().slice(0, 10)
      const todayItems = items.filter((s: { date_start: string | null }) =>
        s.date_start?.slice(0, 10) === today
      )
      const upcomingItems = items.filter((s: { date_start: string | null }) =>
        s.date_start?.slice(0, 10) !== today
      )

      let msg = "📅 *일정*\n\n"
      if (todayItems.length > 0) {
        msg += "*오늘:*\n"
        for (const s of todayItems) {
          const cat = s.category ? ` [${s.category}]` : ""
          const place = s.place ? ` 📍${s.place}` : ""
          msg += `• ${s.name}${cat}${place}\n`
        }
      } else {
        msg += "오늘 일정 없음\n"
      }

      if (upcomingItems.length > 0) {
        msg += "\n*이번 주:*\n"
        for (const s of upcomingItems.slice(0, 5)) {
          const date = s.date_start?.slice(5, 10) ?? ""
          msg += `• ${date} ${s.name}\n`
        }
      }

      await ctx.reply(msg, { parse_mode: "Markdown" })
    } catch {
      await ctx.reply("❌ 일정 로딩 실패")
    }
  })

  bot.command("alerts", async (ctx) => {
    if (!isAuthorized(ctx.chat.id)) return
    try {
      const res = await fetch(`${getBaseUrl()}/api/notion/journal?interest=🔴 필독&limit=10`)
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = await res.json()
      const articles = data.articles ?? []

      if (articles.length === 0) {
        return ctx.reply("📚 새로운 필독 논문이 없습니다.")
      }

      let msg = `📚 *필독 논문 ${articles.length}편*\n\n`
      for (const a of articles.slice(0, 10)) {
        const journal = a.journal_name ? ` (${a.journal_name})` : ""
        const summary = a.summary ? `\n  _${a.summary.slice(0, 80)}_` : ""
        msg += `🔴 ${a.title.slice(0, 80)}${journal}${summary}\n\n`
      }

      await ctx.reply(msg, { parse_mode: "Markdown" })
    } catch {
      await ctx.reply("❌ 논문 알림 로딩 실패")
    }
  })

  bot.command("scholar", async (ctx) => {
    if (!isAuthorized(ctx.chat.id)) return
    try {
      const res = await fetch(`${getBaseUrl()}/api/notion/journal?limit=1`)
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = await res.json()

      const stats = data.stats
      if (!stats) return ctx.reply("📊 통계 없음")

      const byInterest = stats.by_interest ?? {}
      const byJournal = stats.by_journal ?? {}

      let msg = `📊 *Scholar 통계*\n\n`
      msg += `전체: ${stats.total}편 (미읽음: ${stats.unread})\n`
      msg += `이번 주: ${stats.recent_week}편\n\n`
      msg += `🔴 필독: ${byInterest["🔴 필독"] ?? 0}\n`
      msg += `🟡 관심: ${byInterest["🟡 관심"] ?? 0}\n`
      msg += `⚪ 참고: ${byInterest["⚪ 참고"] ?? 0}\n\n`

      const journals = Object.entries(byJournal)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 6)
      if (journals.length > 0) {
        msg += "*저널별:*\n"
        for (const [name, count] of journals) {
          msg += `• ${name}: ${count}편\n`
        }
      }

      await ctx.reply(msg, { parse_mode: "Markdown" })
    } catch {
      await ctx.reply("❌ 통계 로딩 실패")
    }
  })

  bot.on("message:text", async (ctx) => {
    if (!isAuthorized(ctx.chat.id)) return
    await ctx.reply(
      "🤖 자유 질문은 아직 준비 중입니다.\n" +
      "명령어를 사용해주세요: /alerts /schedule /scholar /help"
    )
  })
}
