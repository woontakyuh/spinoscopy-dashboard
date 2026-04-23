"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// 브라우저 내장 Web Speech API 기반 음성 훅 (STT + TTS).
// API key·서버 라운드트립 없음. Chrome/Safari/모바일 iOS Safari 지원.
// Firefox는 SpeechRecognition 미지원이라 mic 버튼 자동 숨김.

// ─── SpeechRecognition 타입 shim (standard Web API, 일부 TS 버전에서 미정의) ──
interface WebSpeechRecognitionResult {
  isFinal: boolean
  readonly length: number
  [index: number]: { transcript: string; confidence: number }
}
interface WebSpeechRecognitionResultList {
  readonly length: number
  [index: number]: WebSpeechRecognitionResult
}
interface WebSpeechRecognitionEvent {
  resultIndex: number
  results: WebSpeechRecognitionResultList
}
interface WebSpeechRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: WebSpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type SRConstructor = new () => WebSpeechRecognition

function getSRConstructor(): SRConstructor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor
    webkitSpeechRecognition?: SRConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// ─── STT hook (Push-to-Talk) ─────────────────────────────────────
// 사용자가 명시적으로 start / commitNow / stop 호출할 때만 상태 전환.
// 자동 silence commit 없음. TTS 끝나도 자동 재시작 안 됨.
// continuous=true 는 엔진이 침묵에 제멋대로 꺼지지 않도록 유지.

export function useSpeechRecognition(opts: {
  lang?: string
  onFinalText: (text: string) => void
  interim?: boolean
}) {
  const { lang = "ko-KR", onFinalText, interim = true } = opts
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [interimText, setInterimText] = useState("")
  const recogRef = useRef<WebSpeechRecognition | null>(null)
  const finalRef = useRef("")
  const interimRef = useRef("")
  const submittedRef = useRef(false)

  useEffect(() => {
    setIsSupported(!!getSRConstructor())
  }, [])

  const stop = useCallback(() => {
    try {
      recogRef.current?.stop()
    } catch {}
  }, [])

  // 언어 전환·모드 전환 등 컨텍스트 변경 시 사용:
  // 인식 즉시 중단하고 버퍼 텍스트 **전송 안 함**. submittedRef=true로
  // onend의 자동 send 경로 차단.
  const stopSilent = useCallback(() => {
    submittedRef.current = true
    try {
      recogRef.current?.abort()
    } catch {}
    setIsListening(false)
    setInterimText("")
    interimRef.current = ""
    finalRef.current = ""
  }, [])

  // 사용자가 "이제 내 차례 끝" 명시적으로 누를 때:
  // 현재까지 쌓인 final + interim을 즉시 onFinalText로 flush하고 인식 중단.
  // onend가 중복 호출 시 재전송 방지 위해 submittedRef flag 사용.
  // 반환값: 실제로 텍스트를 보냈는지 여부 (empty면 false → 호출측이 재시도 결정)
  const commitNow = useCallback((): boolean => {
    const combined = (finalRef.current + " " + interimRef.current).trim()
    submittedRef.current = true
    try {
      recogRef.current?.abort()
    } catch {}
    setIsListening(false)
    setInterimText("")
    interimRef.current = ""
    finalRef.current = ""
    if (combined) {
      onFinalText(combined)
      return true
    }
    return false
  }, [onFinalText])

  const start = useCallback(() => {
    const SR = getSRConstructor()
    if (!SR) return
    // 이미 listening 중이면 중단
    const hadPrevious = !!recogRef.current
    if (recogRef.current) {
      // 이전 instance 이벤트가 늦게 도착해 새 턴 상태를 덮어쓰지 않게 차단
      recogRef.current.onresult = null
      recogRef.current.onerror = null
      recogRef.current.onend = null
      try {
        recogRef.current.abort()
      } catch {}
      recogRef.current = null
    }
    // 이전 instance 있었으면 브라우저가 audio resource 해제할 시간 확보
    // (Safari가 즉시 start() 호출 시 InvalidStateError 내는 경향)
    if (hadPrevious) {
      setTimeout(() => startInternal(), 250)
      return
    }
    startInternal()

    function startInternal() {
      const SRCtor = getSRConstructor()
      if (!SRCtor) return
      const r = new SRCtor()
      r.lang = lang
      // continuous=true: 사용자가 stop/commit 누를 때까지 유지.
      r.continuous = true
      r.interimResults = interim
      finalRef.current = ""
      interimRef.current = ""
      submittedRef.current = false

      r.onresult = (e) => {
        let interimStr = ""
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i]
          const transcript = res[0]?.transcript ?? ""
          if (res.isFinal) finalRef.current += transcript
          else interimStr += transcript
        }
        interimRef.current = interimStr
        setInterimText(interimStr)
      }
      r.onerror = () => {
        setIsListening(false)
        setInterimText("")
        interimRef.current = ""
      }
      r.onend = () => {
        setIsListening(false)
        setInterimText("")
        interimRef.current = ""
        if (submittedRef.current) {
          submittedRef.current = false
          return
        }
        const text = finalRef.current.trim()
        if (text) onFinalText(text)
      }

      try {
        r.start()
        recogRef.current = r
        setIsListening(true)
      } catch {
        // InvalidStateError 등 일시 실패 — 1회 재시도
        setTimeout(() => {
          try {
            const r2 = new SRCtor()
            Object.assign(r2, { lang: r.lang, continuous: r.continuous, interimResults: r.interimResults })
            r2.onresult = r.onresult
            r2.onerror = r.onerror
            r2.onend = r.onend
            r2.start()
            recogRef.current = r2
            setIsListening(true)
          } catch {
            setIsListening(false)
          }
        }, 500)
      }
    }
  }, [lang, interim, onFinalText])

  useEffect(() => {
    return () => {
      try {
        recogRef.current?.abort()
      } catch {}
    }
  }, [])

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
