import { webhookCallback } from "grammy"
import { getBot } from "@/lib/telegram/bot"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest): Promise<Response> {
  const secretToken = req.headers.get("x-telegram-bot-api-secret-token")
  if (secretToken !== process.env.TELEGRAM_SECRET_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const bot = getBot()
    const handleUpdate = webhookCallback(bot, "std/http")
    return await handleUpdate(req)
  } catch (err) {
    console.error("Telegram webhook error:", err)
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({ status: "Telegram webhook active" })
}
