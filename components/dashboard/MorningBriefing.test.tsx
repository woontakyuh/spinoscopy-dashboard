// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MorningBriefing } from "./MorningBriefing"

const voice = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  commitNow: vi.fn(() => false),
  speak: vi.fn(),
  prime: vi.fn(),
}))

vi.mock("ai", () => ({
  TextStreamChatTransport: class {},
}))

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [],
    sendMessage: vi.fn(),
    status: "idle",
    error: null,
    setMessages: vi.fn(),
  }),
}))

vi.mock("@/components/dashboard/WeatherInline", () => ({
  WeatherInline: () => null,
  useWeatherLocation: () => null,
}))

vi.mock("@/lib/voice", () => ({
  useSpeechRecognition: () => ({
    isListening: false,
    interimText: "",
    start: voice.start,
    stop: voice.stop,
    commitNow: voice.commitNow,
  }),
  useElevenLabsSpeech: () => ({
    speak: voice.speak,
    stop: voice.stop,
    isSupported: true,
    isSpeaking: false,
    prime: voice.prime,
  }),
}))

describe("MorningBriefing", () => {
  it("한국어 인사와 날짜를 단어 단위로 줄바꿈한다", () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MorningBriefing />
      </QueryClientProvider>,
    )

    expect(screen.getByRole("heading", { level: 2 })).toHaveClass("break-keep")
    expect(screen.getByText(/년.*월.*일.*요일/)).toHaveClass("break-keep")
  })

  it("대화·음성 오버레이를 모바일 하단 내비게이션보다 위에 둔다", () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MorningBriefing />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole("img", { name: "Dakota" }))

    const focusedOverlay = screen.getByRole("button", { name: "닫기" }).parentElement
    expect(focusedOverlay).toHaveClass("z-[1100]")

    fireEvent.click(within(focusedOverlay!).getByRole("img", { name: "Dakota" }))

    expect(screen.getByRole("button", { name: "음성모드 종료" }).parentElement).toHaveClass(
      "z-[1100]",
    )
  })
})
