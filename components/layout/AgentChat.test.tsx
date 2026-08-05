// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AgentChat } from "./AgentChat"

const transportOptions = vi.hoisted(() => [] as Array<{ api: string; body: { agentId: string } }>)
const chatState = vi.hoisted(() => ({
  messages: [] as Array<{
    id: string
    role: "user" | "assistant"
    parts: Array<{ type: string; text?: string }>
  }>,
  error: null as Error | null,
}))

vi.mock("ai", () => ({
  TextStreamChatTransport: class {
    constructor(options: { api: string; body: { agentId: string } }) {
      transportOptions.push(options)
    }
  },
}))

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: chatState.messages,
    sendMessage: vi.fn(),
    status: "idle",
    error: chatState.error,
    setMessages: vi.fn(),
  }),
}))

describe("AgentChat", () => {
  beforeEach(() => {
    transportOptions.length = 0
    chatState.messages = []
    chatState.error = null
  })

  describe("transport routing", () => {
    it("keeps the shared Anthropic route by default", () => {
      render(
        <AgentChat
          agentId="dakota"
          image="/dakota.png"
          name="Dakota"
          greeting="Default route"
        />,
      )

      expect(transportOptions.at(-1)).toEqual({
        api: "/api/ai/chat",
        body: { agentId: "dakota" },
      })
    })

    it("uses the supplied Luna route for Lo", () => {
      render(
        <AgentChat
          agentId="lo"
          image="/lo.png"
          name="Lo"
          greeting="Luna route"
          api="/api/lo/conversation"
        />,
      )

      expect(transportOptions.at(-1)).toEqual({
        api: "/api/lo/conversation",
        body: { agentId: "lo" },
      })
    })
  })

  it("formats restored messages before rendering them", () => {
    chatState.messages = [{
      id: "assistant-1",
      role: "assistant",
      parts: [{
        type: "text",
        text: "하프가드가 중심이야. [citation:notion:training:one]",
      }],
    }]

    render(
      <AgentChat
        agentId="lo"
        image="/lo.png"
        name="Lo"
        greeting="Greeting"
        formatMessage={(text) => text.replace(/\s*\[citation:[^\]]+\]/g, "")}
      />,
    )
    fireEvent.click(screen.getByRole("img", { name: "Lo" }))

    expect(screen.getByText("하프가드가 중심이야.")).toBeVisible()
    expect(screen.queryByText(/citation:notion/)).not.toBeInTheDocument()
  })

  it("never renders an upstream HTML error body in the chat", () => {
    chatState.error = new Error("<!DOCTYPE html><title>502: Bad gateway</title>")

    render(
      <AgentChat
        agentId="lo"
        image="/lo.png"
        name="Lo"
        greeting="Greeting"
      />,
    )
    fireEvent.click(screen.getByRole("img", { name: "Lo" }))

    expect(screen.getByRole("alert")).toHaveTextContent(
      "응답을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    )
    expect(screen.getByRole("alert")).not.toHaveTextContent(/doctype|bad gateway/i)
  })

  it("places the focused chat above the mobile navigation", () => {
    render(
      <AgentChat
        agentId="lo"
        image="/lo.png"
        name="Lo"
        greeting="Greeting"
      />,
    )
    fireEvent.click(screen.getByRole("img", { name: "Lo" }))

    expect(screen.getByRole("button", { name: "닫기" }).parentElement).toHaveClass(
      "z-[1100]",
    )
  })

  describe("default (non-compact) mode", () => {
    it("renders standard avatar sizes (64px/96px)", () => {
      const { container } = render(
        <AgentChat
          agentId="test"
          image="/test.png"
          name="TestAgent"
          greeting="Test greeting"
        />
      )
      const avatar = container.querySelector("img[alt='TestAgent']")
      expect(avatar).toHaveClass("w-16", "h-16", "md:w-24", "md:h-24")
    })

    it("renders name below avatar (vertical stack)", () => {
      const { container } = render(
        <AgentChat
          agentId="test"
          image="/test.png"
          name="TestAgent"
          greeting="Test greeting"
        />
      )
      const nameSpan = screen.getByText("TestAgent")
      expect(nameSpan).toHaveClass("text-xs", "md:text-sm")
      const avatarImg = container.querySelector("img[alt='TestAgent']")
      const parentFlexCol = avatarImg?.parentElement
      expect(parentFlexCol).toHaveClass("flex-col")
    })

    it("renders standard greeting padding (16-20px)", () => {
      render(
        <AgentChat
          agentId="test"
          image="/test.png"
          name="TestAgent"
          greeting="Test greeting"
        />
      )
      const greetingBox = screen.getByText("Test greeting").parentElement
      expect(greetingBox).toHaveClass("px-4", "py-3", "md:px-5", "md:py-4")
    })

    it("renders standard gaps (12-16px)", () => {
      const { container } = render(
        <AgentChat
          agentId="test"
          image="/test.png"
          name="TestAgent"
          greeting="Test greeting"
        />
      )
      const wrapper = container.querySelector(".flex.items-start")
      expect(wrapper).toHaveClass("gap-3", "md:gap-4")
    })
  })

  describe("compact mode (compact=true)", () => {
    it("renders compact avatar sizes (40px/48px)", () => {
      const { container } = render(
        <AgentChat
          agentId="lo"
          image="/lo.png"
          name="Lo"
          greeting="Compact greeting"
          compact
        />
      )
      const avatar = container.querySelector("img[alt='Lo']")
      expect(avatar).toHaveClass("w-10", "h-10", "md:w-12", "md:h-12")
    })

    it("renders name inline without vertical flex stack", () => {
      const { container } = render(
        <AgentChat
          agentId="lo"
          image="/lo.png"
          name="Lo"
          greeting="Compact greeting"
          compact
        />
      )
      const nameSpan = screen.getByText("Lo")
      expect(nameSpan).toHaveClass("text-xs")
      expect(nameSpan).not.toHaveClass("mt-1.5")
      const avatarImg = container.querySelector("img[alt='Lo']")
      const parentDiv = avatarImg?.parentElement
      expect(parentDiv).not.toHaveClass("flex-col")
    })

    it("renders compact greeting padding (8-12px)", () => {
      render(
        <AgentChat
          agentId="lo"
          image="/lo.png"
          name="Lo"
          greeting="Compact greeting"
          compact
        />
      )
      const greetingBox = screen.getByText("Compact greeting").parentElement
      expect(greetingBox).not.toHaveClass("px-4", "py-3", "md:px-5", "md:py-4")
      expect(greetingBox).toHaveClass("px-2.5", "py-2", "md:px-3", "md:py-2.5")
    })

    it("renders compact gaps (8px)", () => {
      const { container } = render(
        <AgentChat
          agentId="lo"
          image="/lo.png"
          name="Lo"
          greeting="Compact greeting"
          compact
        />
      )
      const wrapper = container.querySelector(".flex.items-start")
      expect(wrapper).not.toHaveClass("gap-3", "md:gap-4")
      expect(wrapper).toHaveClass("gap-2")
    })

    it("limits greeting max-width to ~60ch", () => {
      render(
        <AgentChat
          agentId="lo"
          image="/lo.png"
          name="Lo"
          greeting="Compact greeting"
          compact
        />
      )
      const greetingContainer = screen.getByText("Compact greeting").parentElement?.parentElement
      expect(greetingContainer).toHaveClass("max-w-[60ch]")
    })
  })

  describe("overlay behavior (both modes)", () => {
    it("opens overlay on avatar click (non-compact)", () => {
      const { container } = render(
        <AgentChat
          agentId="test"
          image="/test.png"
          name="TestAgent"
          greeting="Test greeting"
        />
      )
      const avatar = container.querySelector("img[alt='TestAgent']")
      expect(avatar).toBeInTheDocument()
      fireEvent.click(avatar!)
      const overlay = screen.getByRole("button", { name: /닫기/i })
      expect(overlay).toBeInTheDocument()
    })

    it("opens overlay on avatar click (compact)", () => {
      const { container } = render(
        <AgentChat
          agentId="lo"
          image="/lo.png"
          name="Lo"
          greeting="Compact greeting"
          compact
        />
      )
      const avatar = container.querySelector("img[alt='Lo']")
      expect(avatar).toBeInTheDocument()
      fireEvent.click(avatar!)
      const overlay = screen.getByRole("button", { name: /닫기/i })
      expect(overlay).toBeInTheDocument()
    })

    it("opens overlay on greeting click (non-compact)", () => {
      render(
        <AgentChat
          agentId="test"
          image="/test.png"
          name="TestAgent"
          greeting="Test greeting"
        />
      )
      const greetingBox = screen.getByText("Test greeting").parentElement?.parentElement
      fireEvent.click(greetingBox!)
      const overlay = screen.getByRole("button", { name: /닫기/i })
      expect(overlay).toBeInTheDocument()
    })

    it("opens overlay on greeting click (compact)", () => {
      render(
        <AgentChat
          agentId="lo"
          image="/lo.png"
          name="Lo"
          greeting="Compact greeting"
          compact
        />
      )
      const greetingBox = screen.getByText("Compact greeting").parentElement?.parentElement
      fireEvent.click(greetingBox!)
      const overlay = screen.getByRole("button", { name: /닫기/i })
      expect(overlay).toBeInTheDocument()
    })
  })

  describe("other agent pages unchanged", () => {
    it("does not accept compact prop for other agents by default", () => {
      render(
        <AgentChat
          agentId="dakota"
          image="/dakota.png"
          name="Dakota"
          greeting="Dakota greeting"
        />
      )
      const avatar = screen.getByRole("img", { name: /dakota/i })
      expect(avatar).toHaveClass("w-16", "h-16", "md:w-24", "md:h-24")
    })
  })
})
