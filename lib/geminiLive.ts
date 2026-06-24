"use client"

// Gemini Live (speech-to-speech) 훅.
// 마이크 → 16kHz PCM16 → session.sendRealtimeInput → 모델 → 24kHz PCM16 오디오 → 재생.
// EL 경로(녹음→STT→Claude→TTS)와 달리 끊김 없는 실시간 양방향 음성.
//
// 선행조건: GEMINI_API_KEY 서버 env, /api/voice/gemini-token 토큰 발급.
import { useCallback, useRef, useState } from "react"
import { GoogleGenAI, Modality, type Session } from "@google/genai"
import { DAKOTA_VOICE_PERSONA } from "@/lib/dakotaPersona"

export type GeminiLiveStatus = "idle" | "connecting" | "listening" | "speaking" | "error"

const TARGET_INPUT_RATE = 16000
const OUTPUT_RATE = 24000
const VOICE_NAME = process.env.NEXT_PUBLIC_GEMINI_VOICE || "Aoede" // 여성·따뜻한 결

// Float32 (ctx rate) → Int16 PCM (16kHz). 선형보간 다운샘플.
function downsampleToPCM16(input: Float32Array, inRate: number): Int16Array {
  if (inRate === TARGET_INPUT_RATE) {
    const out = new Int16Array(input.length)
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]))
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return out
  }
  const ratio = inRate / TARGET_INPUT_RATE
  const outLen = Math.floor(input.length / ratio)
  const out = new Int16Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const idx = i * ratio
    const i0 = Math.floor(idx)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const frac = idx - i0
    const sample = input[i0] * (1 - frac) + input[i1] * frac
    const s = Math.max(-1, Math.min(1, sample))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToFloat32(b64: string): Float32Array<ArrayBuffer> {
  const binary = atob(b64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
  const pcm = new Int16Array(bytes.buffer)
  const out = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 0x8000
  return out
}

export function useGeminiLive(opts?: {
  onTranscript?: (role: "user" | "assistant", text: string) => void
}) {
  const onTranscript = opts?.onTranscript
  const [status, setStatus] = useState<GeminiLiveStatus>("idle")
  const [error, setError] = useState<string | null>(null)

  const sessionRef = useRef<Session | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const inCtxRef = useRef<AudioContext | null>(null)
  const outCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  // 재생 스케줄링
  const nextStartRef = useRef(0)
  const playingSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set())
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const markSpeaking = useCallback(() => {
    setStatus("speaking")
    if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current)
    // 마지막 오디오 청크 이후 잠잠하면 listening 으로 복귀
    speakingTimerRef.current = setTimeout(() => {
      setStatus((s) => (s === "speaking" ? "listening" : s))
    }, 700)
  }, [])

  const clearPlayback = useCallback(() => {
    for (const src of playingSourcesRef.current) {
      try { src.stop() } catch {}
    }
    playingSourcesRef.current.clear()
    nextStartRef.current = 0
  }, [])

  const playChunk = useCallback((b64: string) => {
    const ctx = outCtxRef.current
    if (!ctx) return
    const float = base64ToFloat32(b64)
    if (float.length === 0) return
    const buffer = ctx.createBuffer(1, float.length, OUTPUT_RATE)
    buffer.copyToChannel(float, 0)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    const startAt = Math.max(ctx.currentTime, nextStartRef.current)
    src.start(startAt)
    nextStartRef.current = startAt + buffer.duration
    playingSourcesRef.current.add(src)
    src.onended = () => playingSourcesRef.current.delete(src)
    markSpeaking()
  }, [markSpeaking])

  const stop = useCallback(() => {
    if (speakingTimerRef.current) { clearTimeout(speakingTimerRef.current); speakingTimerRef.current = null }
    clearPlayback()
    if (processorRef.current) { try { processorRef.current.disconnect() } catch {}; processorRef.current.onaudioprocess = null; processorRef.current = null }
    if (sourceRef.current) { try { sourceRef.current.disconnect() } catch {}; sourceRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => { try { t.stop() } catch {} }); streamRef.current = null }
    if (inCtxRef.current) { try { void inCtxRef.current.close() } catch {}; inCtxRef.current = null }
    if (outCtxRef.current) { try { void outCtxRef.current.close() } catch {}; outCtxRef.current = null }
    if (sessionRef.current) { try { sessionRef.current.close() } catch {}; sessionRef.current = null }
    setStatus("idle")
  }, [clearPlayback])

  const start = useCallback(async () => {
    if (sessionRef.current) return
    setError(null)
    setStatus("connecting")
    try {
      // 1) 토큰
      const tokenRes = await fetch("/api/voice/gemini-token", { method: "POST" })
      if (!tokenRes.ok) {
        const j = await tokenRes.json().catch(() => ({}))
        throw new Error(j.error || `token ${tokenRes.status}`)
      }
      const { token, model } = (await tokenRes.json()) as { token: string; model: string }

      // 2) 마이크 (echo cancellation 필수 — 모델이 자기 목소리 듣고 루프 도는 것 방지)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      })
      streamRef.current = stream

      // 3) 오디오 컨텍스트 (입력/출력 분리)
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const inCtx = new AC()
      const outCtx = new AC()
      inCtxRef.current = inCtx
      outCtxRef.current = outCtx
      try { await inCtx.resume() } catch {}
      try { await outCtx.resume() } catch {}

      // 4) 세션 연결
      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } })
      const session = await ai.live.connect({
        model,
        callbacks: {
          onopen: () => setStatus("listening"),
          onmessage: (message) => {
            const sc = message.serverContent
            if (sc?.interrupted) {
              clearPlayback()
              setStatus("listening")
            }
            const parts = sc?.modelTurn?.parts
            if (parts) {
              for (const part of parts) {
                const data = part.inlineData?.data
                if (data) playChunk(data)
              }
            }
            // 전사(메모리 로깅용)
            const inT = sc?.inputTranscription?.text
            if (inT && onTranscript) onTranscript("user", inT)
            const outT = sc?.outputTranscription?.text
            if (outT && onTranscript) onTranscript("assistant", outT)
          },
          onerror: (e: unknown) => {
            console.error("[geminiLive] error", e)
            setError((e as Error)?.message || "live error")
            setStatus("error")
          },
          onclose: () => { setStatus((s) => (s === "error" ? s : "idle")) },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: DAKOTA_VOICE_PERSONA,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      })
      sessionRef.current = session

      // 5) 마이크 → PCM16 16kHz → 송신
      const sourceNode = inCtx.createMediaStreamSource(stream)
      sourceRef.current = sourceNode
      const processor = inCtx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor
      processor.onaudioprocess = (ev) => {
        const sess = sessionRef.current
        if (!sess) return
        const input = ev.inputBuffer.getChannelData(0)
        const pcm = downsampleToPCM16(input, inCtx.sampleRate)
        const b64 = int16ToBase64(pcm)
        try {
          sess.sendRealtimeInput({ audio: { data: b64, mimeType: `audio/pcm;rate=${TARGET_INPUT_RATE}` } })
        } catch {}
      }
      sourceNode.connect(processor)
      // ScriptProcessor 가 작동하려면 destination 연결 필요 — gain 0 으로 에코 방지
      const mute = inCtx.createGain()
      mute.gain.value = 0
      processor.connect(mute)
      mute.connect(inCtx.destination)
    } catch (e) {
      console.error("[geminiLive] start failed", e)
      setError((e as Error)?.message || "start failed")
      setStatus("error")
      stop()
    }
  }, [clearPlayback, onTranscript, playChunk, stop])

  return {
    status,
    error,
    isActive: status !== "idle" && status !== "error",
    start,
    stop,
  }
}
