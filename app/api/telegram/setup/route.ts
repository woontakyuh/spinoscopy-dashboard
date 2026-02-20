import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.TELEGRAM_SECRET_TOKEN}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 })
  }

  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ?? process.env.VERCEL_URL
    ?? "localhost:3000"
  const webhookUrl = `https://${baseUrl}/api/telegram`

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: process.env.TELEGRAM_SECRET_TOKEN,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      }),
    }
  )

  const result = await response.json()
  return NextResponse.json({ webhook_url: webhookUrl, telegram_response: result })
}
