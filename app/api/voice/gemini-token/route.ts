import { NextResponse } from "next/server"
import { GoogleGenAI } from "@google/genai"

// Gemini Live(S2S) 용 ephemeral token 발급.
// 브라우저가 GEMINI_API_KEY를 직접 들고 있지 않도록, 서버가 단기 토큰을 만들어 내려줌.
// 클라이언트는 token.name 을 apiKey 로 ai.live.connect() 에 사용.

// native-audio 모델(높은 음질·자연스러운 페이싱). env로 교체 가능.
const MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025"

export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 503 },
    )
  }
  try {
    const ai = new GoogleGenAI({ apiKey })
    const now = Date.now()
    const token = await ai.authTokens.create({
      config: {
        uses: 1, // 단일 세션
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(), // 30분 유효
        newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(), // 2분 안에 세션 시작
        httpOptions: { apiVersion: "v1alpha" },
      },
    })
    return NextResponse.json({ token: token.name, model: MODEL })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[voice/gemini-token]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
