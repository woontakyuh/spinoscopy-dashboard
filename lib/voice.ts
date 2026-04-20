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

// ─── STT hook ────────────────────────────────────────────────────
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

  useEffect(() => {
    setIsSupported(!!getSRConstructor())
  }, [])

  const stop = useCallback(() => {
    try {
      recogRef.current?.stop()
    } catch {}
  }, [])

  const start = useCallback(() => {
    const SR = getSRConstructor()
    if (!SR) return
    // 이미 listening 중이면 중단
    if (recogRef.current) {
      try {
        recogRef.current.abort()
      } catch {}
      recogRef.current = null
    }
    const r = new SR()
    r.lang = lang
    r.continuous = false
    r.interimResults = interim
    finalRef.current = ""

    r.onresult = (e) => {
      let interimStr = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const transcript = res[0]?.transcript ?? ""
        if (res.isFinal) finalRef.current += transcript
        else interimStr += transcript
      }
      setInterimText(interimStr)
    }
    r.onerror = () => {
      setIsListening(false)
      setInterimText("")
    }
    r.onend = () => {
      setIsListening(false)
      setInterimText("")
      const text = finalRef.current.trim()
      if (text) onFinalText(text)
    }

    try {
      r.start()
      recogRef.current = r
      setIsListening(true)
    } catch {
      setIsListening(false)
    }
  }, [lang, interim, onFinalText])

  useEffect(() => {
    return () => {
      try {
        recogRef.current?.abort()
      } catch {}
    }
  }, [])

  return { isListening, isSupported, interimText, start, stop }
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
