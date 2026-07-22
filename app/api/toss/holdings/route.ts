import { NextResponse } from "next/server"
import {
  getTossPortfolio,
  hasTossCredentials,
  TossCredentialsError,
} from "@/lib/toss/client"

export async function GET() {
  if (!hasTossCredentials()) {
    return NextResponse.json(
      { error: "Toss API credentials가 설정되지 않았습니다.", configured: false },
      { status: 503 },
    )
  }

  try {
    const portfolio = await getTossPortfolio()
    return NextResponse.json({
      configured: true,
      holdings: portfolio.holdings,
      fetchedAt: new Date().toISOString(),
    })
  } catch (error: unknown) {
    if (error instanceof TossCredentialsError) {
      return NextResponse.json(
        { error: error.message, configured: false },
        { status: 503 },
      )
    }
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
