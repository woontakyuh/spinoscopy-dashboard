"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { pushVoiceLog } from "./voiceDebugLog"

// STT: MediaRecorder 로 오디오 blob 녹음 → /api/voice/stt (서버 Whisper) 에 POST → 텍스트.
// iOS Safari 의 Web Speech API 조용한 실패 회피. MediaRecorder 는 iOS 14.3+ 안정 지원.
//
// TTS: 아래 useSpeechSynthesis (브라우저 내장) / useElevenLabsSpeech (서버) 그대로 유지.

// ─── STT hook (Push-to-Talk, server Whisper) ─────────────────────
// 기존 외부 인터페이스 유지: { isListening, isSupported, interimText, start, stop, stopSilent, commitNow }
// - interimText 는 서버 전사 특성상 항상 빈 문자열 (호환용).
// - onFinalText("") 호출 시 "전사 실패 or 빈 결과" 를 의미 → 호출측은 reset 처리 권장.
// - opts.lang / opts.interim 은 인터페이스 호환용, 실제 동작엔 영향 없음.

export function useSpeechRecognition(opts: {
  lang?: string
  onFinalText: (text: string) => void
  interim?: boolean
}) {
  const { onFinalText } = opts
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const interimText = ""
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const submittedRef = useRef(false)
  const seqRef = useRef(0) // 늦게 도착한 transcribe 응답 무시

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined"
    setIsSupported(ok)
  }, [])

  const teardown = useCallback(() => {
    if (recorderRef.current) {
      const rec = recorderRef.current
      try { rec.ondataavailable = null as unknown as (e: BlobEvent) => void } catch {}
      try { rec.onerror = null as unknown as (e: Event) => void } catch {}
      try { rec.onstop = null as unknown as () => void } catch {}
      try { if (rec.state !== "inactive") rec.stop() } catch {}
      recorderRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => { try { t.stop() } catch {} })
      streamRef.current = null
    }
    chunksRef.current = []
  }, [])

  const stop = useCallback(() => {
    teardown()
    setIsListening(false)
  }, [teardown])

  // 컨텍스트 변경·취소 시: 현재 녹음 폐기, 서버에 전송 안 함.
  const stopSilent = useCallback(() => {
    submittedRef.current = true // onstop 이 떠도 transcribe 안 하도록 세팅
    teardown()
    setIsListening(false)
    pushVoiceLog(`stopSilent`)
  }, [teardown])

  const transcribe = useCallback(
    async (blob: Blob, seq: number) => {
      pushVoiceLog(`transcribe start · ${blob.size}B seq=${seq} type=${blob.type || "(none)"}`)
      try {
        const form = new FormData()
        form.append("audio", blob, "audio.webm")
        const res = await fetch("/api/voice/stt", { method: "POST", body: form })
        if (seq !== seqRef.current) {
          pushVoiceLog(`transcribe stale (seq ${seq} vs ${seqRef.current})`)
          return
        }
        if (!res.ok) {
          const errText = await res.text().catch(() => "")
          pushVoiceLog(`STT http ${res.status} · ${errText.slice(0, 100)}`)
          onFinalText("")
          return
        }
        const data = (await res.json()) as { text?: string; error?: string }
        const text = (data.text ?? "").trim()
        pushVoiceLog(`transcribed · "${text.slice(0, 60)}"`)
        onFinalText(text)
      } catch (e) {
        pushVoiceLog(`transcribe threw · ${(e as Error)?.message}`)
        onFinalText("")
      }
    },
    [onFinalText],
  )

  const start = useCallback(async () => {
    pushVoiceLog(`start() entry`)
    if (recorderRef.current || streamRef.current) teardown()
    try {
      // Whisper 는 16kHz mono 가 native. 업로드 크기도 ~5x 작아짐.
      // iOS Safari 가 제약 무시해도 기본값으로 fallback 됨.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
      const mime = candidates.find((m) => {
        try { return MediaRecorder.isTypeSupported(m) } catch { return false }
      })
      // 음성 24kbps — 기본 128kbps 대비 ~5x 작음. 음성인식엔 충분.
      const recorderOpts: MediaRecorderOptions = { audioBitsPerSecond: 24000 }
      if (mime) recorderOpts.mimeType = mime
      const rec = new MediaRecorder(stream, recorderOpts)
      chunksRef.current = []
      submittedRef.current = false

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onerror = (e) => {
        const msg = (e as unknown as { error?: { message?: string } })?.error?.message ?? "unknown"
        pushVoiceLog(`recorder.onerror · ${msg}`)
      }
      rec.onstop = () => {
        const wasSubmitted = submittedRef.current
        submittedRef.current = false
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" })
        chunksRef.current = []
        pushVoiceLog(`recorder.onstop · submitted=${wasSubmitted} blob=${blob.size}B`)
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => { try { t.stop() } catch {} })
          streamRef.current = null
        }
        recorderRef.current = null
        setIsListening(false)
        if (wasSubmitted && blob.size > 0) {
          const seq = ++seqRef.current
          void transcribe(blob, seq)
        } else if (wasSubmitted) {
          pushVoiceLog(`submitted but empty blob · skipping transcribe`)
          onFinalText("")
        }
      }

      rec.start()
      recorderRef.current = rec
      setIsListening(true)
      pushVoiceLog(`recorder.start() OK · mime=${mime ?? "(default)"}`)
    } catch (e) {
      pushVoiceLog(`getUserMedia failed · ${(e as Error)?.message}`)
      setIsListening(false)
    }
  }, [teardown, transcribe, onFinalText])

  const commitNow = useCallback((): boolean => {
    const rec = recorderRef.current
    pushVoiceLog(`commitNow ENTER · state=${rec?.state ?? "null"} chunks=${chunksRef.current.length}`)
    if (!rec || rec.state !== "recording") {
      return false
    }
    submittedRef.current = true
    try {
      rec.stop() // → onstop → transcribe (async)
    } catch (e) {
      pushVoiceLog(`commitNow rec.stop threw · ${(e as Error)?.message}`)
      submittedRef.current = false
      return false
    }
    return true
  }, [])

  useEffect(() => {
    return () => {
      teardown()
    }
  }, [teardown])

  return { isListening, isSupported, interimText, start, stop, stopSilent, commitNow }
}

// ─── TTS hook ─────────────────────────────────────────────────────
export function useSpeechSynthesis(lang = "ko-KR") {
  const [isSupported, setIsSupported] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return
    setIsSupported(true)
    const load = () => setVoices(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.onvoiceschanged = load
    return () => {
      window.speechSynthesis.onvoiceschanged = null
    }
  }, [])

  const pickVoice = useCallback((): SpeechSynthesisVoice | undefined => {
    if (voices.length === 0) return undefined
    const ko = voices.filter((v) => v.lang.toLowerCase().startsWith("ko"))
    if (ko.length === 0) return undefined
    // 여성 한국어 voice 우선 (iOS: Yuna, macOS: Yuna, Google: 한국의 여자 목소리)
    const preferred =
      ko.find((v) => /yuna|sora|kyuri|female|여자|여성/i.test(v.name)) ??
      ko.find((v) => !/male|남자|남성/i.test(v.name)) ??
      ko[0]
    return preferred
  }, [voices])

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return
      if (!text.trim()) return
      try {
        window.speechSynthesis.cancel()
      } catch {}
      const utt = new SpeechSynthesisUtterance(text)
      utt.lang = lang
      const v = pickVoice()
      if (v) utt.voice = v
      utt.rate = 1.05
      utt.pitch = 1.08 // 살짝 높여서 따뜻한 비서 톤
      utt.volume = 1.0
      utt.onstart = () => setIsSpeaking(true)
      utt.onend = () => setIsSpeaking(false)
      utt.onerror = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utt)
    },
    [lang, pickVoice],
  )

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return
    try {
      window.speechSynthesis.cancel()
    } catch {}
    setIsSpeaking(false)
  }, [])

  return { isSupported, isSpeaking, speak, stop, voice: pickVoice() }
}

// ─── ElevenLabs TTS hook ──────────────────────────────────────────
// 서버 /api/voice/tts로 텍스트 POST → MP3 blob fetch → HTMLAudioElement 재생.
//
// iOS Safari 대응: new Audio() 매번 생성하면 user gesture 컨텍스트 밖에서
// .play() 가 차단됨. 대신 **한 element 재사용** + 초기 gesture 안에서
// prime() 호출로 unlock. 이후 speak()는 같은 element의 src만 교체.
const SILENT_MP3 =
  "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYxLjcuMTAwAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAABJbmZvAAAADwAAAAIAAAHsAFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFCvr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+v////////////////////////////////////////////////////////////////8AAAAATGF2YzYxLjE5AAAAAAAAAAAAAAAAJAUAAAAAAAAAAAHsmY2JMAAAAAAAAAAAAAAAAAAAAAD/++DEAAAIXAVxtBGAIf2SbnczEAABAjAhAIIBAkkQiZGgAAQIIEEAAcMqAQADn8CAfWD4fFz5+XB9/EHIEAQd3//8Hz4Pn//iDuD4Ph/+UHz//E7+DmIJk+H4MRn9GH/BDnMQfB8P/E7/+JwcB8Hz4uAQT8QcAAIBAwEYBBaMRRG6Xz2y1DEJSB4HEzw1B0z5aTFAMN3dWiISBIOpqAQHK9Ez2mPlUxMmrOBOONNOLpXTCwAYDz0lpg"

export function useElevenLabsSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const primedRef = useRef(false)

  const ensureAudio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      const a = new Audio()
      a.preload = "auto"
      a.onplay = () => setIsSpeaking(true)
      a.onended = () => setIsSpeaking(false)
      a.onerror = () => setIsSpeaking(false)
      a.onpause = () => {
        // 사용자가 명시적으로 중단한 경우
      }
      audioRef.current = a
    }
    return audioRef.current
  }, [])

  // iOS Safari의 autoplay 정책 우회: user gesture 안에서 1회 호출.
  // 짧은 무음 mp3를 재생해서 element를 "활성화"시킴.
  const prime = useCallback(() => {
    if (primedRef.current) return
    const a = ensureAudio()
    try {
      a.src = SILENT_MP3
      const p = a.play()
      if (p && typeof p.catch === "function") p.catch(() => {})
      primedRef.current = true
    } catch {}
  }, [ensureAudio])

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause()
      } catch {}
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    setIsSpeaking(false)
  }, [])

  const speak = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim()
      if (!trimmed) return false

      // 이전 재생 중단 (element는 유지)
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
      if (audioRef.current) {
        try { audioRef.current.pause() } catch {}
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }

      const ctrl = new AbortController()
      abortRef.current = ctrl

      try {
        const res = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed }),
          signal: ctrl.signal,
        })
        if (!res.ok) {
          console.warn("[elevenlabs] http", res.status)
          return false
        }
        const blob = await res.blob()
        if (ctrl.signal.aborted) return false
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url

        const a = ensureAudio()
        a.src = url
        await a.play()
        return true
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return false
        console.warn("[elevenlabs] speak error:", e)
        setIsSpeaking(false)
        return false
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null
      }
    },
    [ensureAudio],
  )

  useEffect(() => {
    return () => {
      stop()
      if (audioRef.current) {
        try {
          audioRef.current.src = ""
        } catch {}
        audioRef.current = null
      }
    }
  }, [stop])

  return { isSupported: true, isSpeaking, speak, stop, prime }
}
