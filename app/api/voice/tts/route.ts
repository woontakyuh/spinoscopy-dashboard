import { NextRequest } from "next/server"

// ElevenLabs TTS proxy — 클라이언트가 /api/voice/tts로 텍스트 POST →
// 서버가 ElevenLabs stream endpoint 호출 → MP3 스트림 그대로 파이프.
// API key 노출 없음. Default voice는 env에서 제어.

const DEFAULT_MODEL = "eleven_multilingual_v2"

export async function POST(req: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID
  if (!key || !voiceId) {
    return new Response(
      JSON.stringify({ error: "ElevenLabs not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )
  }

  let body: { text?: string; voice_id?: string; model_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const text = (body.text ?? "").trim()
  if (!text) {
    return new Response(JSON.stringify({ error: "text required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }
  if (text.length > 5000) {
    return new Response(JSON.stringify({ error: "text too long (max 5000)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const targetVoice = body.voice_id?.trim() || voiceId
  const model = body.model_id?.trim() || DEFAULT_MODEL

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${targetVoice}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    },
  )

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "")
    console.error("[voice/tts] elevenlabs error:", upstream.status, errText)
    return new Response(
      JSON.stringify({ error: `elevenlabs ${upstream.status}`, detail: errText }),
      { status: upstream.status, headers: { "Content-Type": "application/json" } },
    )
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  })
}
