import { NextRequest, NextResponse } from "next/server"

// 클라이언트 MediaRecorder 에서 녹음한 audio blob 을 받아 Groq Whisper 로 전사.
// iOS Safari 의 Web Speech API 조용한 실패 회피용.

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "GROQ_API_KEY missing" }, { status: 500 })
    }

    const incoming = await req.formData()
    const audio = incoming.get("audio")
    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ error: "no audio" }, { status: 400 })
    }

    const form = new FormData()
    form.append("file", audio, "audio.webm")
    // distil-whisper-large-v3-en: 영어 전용, turbo 대비 ~2배 빠름. Dakota 음성모드는 영어 고정.
    form.append("model", "distil-whisper-large-v3-en")
    form.append("response_format", "json")
    form.append("language", "en")

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json(
        { error: `Groq ${res.status}`, detail: errText.slice(0, 500) },
        { status: 502 },
      )
    }

    const data = (await res.json()) as { text?: string }
    return NextResponse.json({ text: (data.text ?? "").trim() })
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
