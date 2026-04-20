import { NextRequest, NextResponse } from "next/server"

// 클라이언트가 녹음한 오디오 → Groq Whisper로 전사.
// multilingual 모델이 한·영 auto-detect. Web Speech API 브라우저 의존성 제거.

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY not configured" },
      { status: 503 },
    )
  }

  let audio: Blob | null = null
  try {
    const form = await req.formData()
    const entry = form.get("audio")
    if (entry instanceof Blob) audio = entry
  } catch {
    return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 })
  }
  if (!audio || audio.size === 0) {
    return NextResponse.json({ error: "audio blob required" }, { status: 400 })
  }
  if (audio.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "audio too large (>25MB)" }, { status: 400 })
  }

  const groqForm = new FormData()
  // Groq 는 확장자로 포맷 추론 — webm·mp3·m4a·mp4·wav 모두 가능
  groqForm.append("file", audio, "audio.webm")
  groqForm.append("model", "whisper-large-v3-turbo")
  groqForm.append("response_format", "json")
  // language 생략 → 자동 감지 (ko/en 혼용 OK)
  groqForm.append("temperature", "0")

  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      console.error("[voice/stt] groq error:", res.status, errText)
      return NextResponse.json(
        { error: `groq ${res.status}`, detail: errText },
        { status: res.status },
      )
    }
    const data = await res.json() as { text?: string }
    return NextResponse.json({ text: (data.text ?? "").trim() })
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
