// @vitest-environment jsdom

// Andrej 페이지의 탭 계약을 고정한다.
// React Query 는 실제 것을 쓴다. 공유 키 ["andrej-frontier"] 의 요청 합치기가
// 이 화면의 핵심 계약이라, mock 으로 덮으면 검증이 사라진다.

import "@testing-library/jest-dom/vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AiFrontierEpisode, AiFrontierConcept, AiFrontierIndex } from "@/lib/types/ai-frontier"

import AndrejPage from "./page"

vi.mock("@/components/layout/TopBar", () => ({
  TopBar: () => <div data-testid="topbar" />,
}))

vi.mock("@/components/radar/RadarFeed", () => ({
  RadarFeed: () => <div data-testid="radar-feed" />,
}))

// 상태를 가진 스텁. 탭을 오갈 때 입력값이 살아남으면 remount 가 없었다는 뜻이다.
vi.mock("@/components/layout/AgentChat", async () => {
  const { useState } = await import("react")
  return {
    AgentChat: ({ api, greeting }: { readonly api?: string; readonly greeting?: string }) => {
      const [draft, setDraft] = useState("")
      return (
        <div data-testid="agent-chat">
          <span data-testid="chat-api">{api ?? "default"}</span>
          <span data-testid="chat-greeting">{greeting}</span>
          <input
            aria-label="chat-draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
      )
    },
  }
})

vi.mock("@/lib/greeterContext", () => ({
  getTimeContext: () => ({ bucket: "afternoon", isMondayMorning: false }),
}))

const EPISODE: AiFrontierEpisode = {
  id: "ep-1",
  name: "스케일링의 끝",
  episodeNumber: 12,
  status: "published",
  published: "2026-08-01",
  recorded: "2026-07-30",
  reviewed: false,
  topics: ["scaling"],
  models: ["gpt-5"],
  people: ["Andrej"],
  youtube: null,
  transcriptSource: null,
  duration: "1:02:00",
  summary: null,
  keyTerms: ["scaling law"],
  source: "ai-frontier",
  sourceKey: "EP12",
  sourceIdentityPersisted: false,
}

const CONCEPT: AiFrontierConcept = {
  id: "cp-1",
  term: "Scaling Law",
  korean: "스케일링 법칙",
  category: "Architecture",
  verified: "전사 기반",
  oneLine: "모델을 키우면 성능이 예측 가능하게 오른다.",
  intuition: null,
  whyItMatters: null,
  source: null,
  episodes: [{ ref: "EP12", available: true, pageId: "ep-1" }],
}

const DWARKESH_EPISODE: AiFrontierEpisode = {
  ...EPISODE,
  id: "dwarkesh-ryan",
  name: "Dwarkesh · Ryan Greenblatt",
  episodeNumber: null,
  published: "2026-08-11",
  transcriptSource: "https://www.dwarkesh.com/p/ryan-greenblatt",
  summary: "AI 연구 자동화에 관한 대화",
  source: "dwarkesh",
  sourceKey: "DWARKESH:RYAN-GREENBLATT",
}

const DWARKESH_CONCEPT: AiFrontierConcept = {
  ...CONCEPT,
  id: "concept-dwarkesh",
  term: "Recursive Self-Improvement",
  korean: "재귀적 자기 개선",
  episodes: [{
    ref: "DWARKESH:RYAN-GREENBLATT",
    available: true,
    pageId: "dwarkesh-ryan",
  }],
}

function makeIndex(overrides: Partial<AiFrontierIndex> = {}): AiFrontierIndex {
  return {
    status: "ok",
    sources: { episodes: "ok", concepts: "ok" },
    episodes: [EPISODE],
    concepts: [CONCEPT],
    episodeIndex: { EP12: "ep-1" },
    ...overrides,
  }
}

type FrontierReply = { readonly ok: boolean; readonly body: AiFrontierIndex | null }

let frontierReply: FrontierReply
let calls: string[]

function mockFetch(): void {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.startsWith("/api/andrej/frontier")) {
        if (!frontierReply.ok) return new Response("boom", { status: 500 })
        return new Response(JSON.stringify(frontierReply.body), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }
      if (url.startsWith("/api/ai-feed")) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }
      return new Response("not found", { status: 404 })
    })
  )
}

function countFrontierCalls(): number {
  return calls.filter((url) => url.startsWith("/api/andrej/frontier")).length
}

function renderPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <AndrejPage />
    </QueryClientProvider>
  )
}

function tab(
  name: "Radar" | "Frontier" | "AI Frontier" | "Dwarkesh"
): HTMLElement {
  return screen.getByRole("tab", {
    name: name === "Frontier" ? "AI Frontier" : name,
  })
}

beforeEach(() => {
  frontierReply = { ok: true, body: makeIndex() }
  mockFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("Andrej 페이지 탭", () => {
  it("Radar 를 기본 탭으로 열고 피드를 그대로 보여준다", async () => {
    // Given / When
    renderPage()

    // Then
    expect(tab("Radar")).toHaveAttribute("aria-selected", "true")
    expect(tab("Frontier")).toHaveAttribute("aria-selected", "false")
    expect(screen.getByTestId("radar-feed")).toBeTruthy()
    expect(screen.queryByTestId("frontier-columns")).toBeNull()
  })

  it("기본 Radar 탭에서는 Frontier 를 요청하지 않는다", async () => {
    // Given / When
    renderPage()
    await waitFor(() => expect(calls.some((url) => url.startsWith("/api/ai-feed"))).toBe(true))

    // Then
    expect(countFrontierCalls()).toBe(0)
  })

  it("Frontier 탭으로 옮기면 FrontierDashboard 를 그리고 피드는 감춘다", async () => {
    // Given
    renderPage()

    // When
    fireEvent.click(tab("Frontier"))

    // Then
    expect(await screen.findByTestId("frontier-columns")).toBeTruthy()
    expect(screen.queryByTestId("radar-feed")).toBeNull()
    expect(tab("Frontier")).toHaveAttribute("aria-selected", "true")
  })

  it("AI Frontier 옆 Dwarkesh 탭에서 소스별 데이터만 보여준다", async () => {
    frontierReply = {
      ok: true,
      body: makeIndex({
        episodes: [EPISODE, DWARKESH_EPISODE],
        concepts: [CONCEPT, DWARKESH_CONCEPT],
        episodeIndex: {
          EP12: "ep-1",
          "DWARKESH:RYAN-GREENBLATT": "dwarkesh-ryan",
        },
      }),
    }
    renderPage()

    expect(tab("AI Frontier")).toHaveAttribute("aria-selected", "false")
    expect(tab("Dwarkesh")).toHaveAttribute("aria-selected", "false")

    fireEvent.click(tab("AI Frontier"))
    expect(await screen.findByText("스케일링의 끝")).toBeInTheDocument()
    expect(screen.queryByText("Dwarkesh · Ryan Greenblatt")).not.toBeInTheDocument()

    fireEvent.click(tab("Dwarkesh"))
    expect(await screen.findByText("Dwarkesh · Ryan Greenblatt")).toBeInTheDocument()
    expect(screen.queryByText("스케일링의 끝")).not.toBeInTheDocument()
    expect(tab("Dwarkesh")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("chat-greeting")).toHaveTextContent(
      "운탁씨, Dwarkesh에 에피소드 1개와 개념 1개가 정리돼 있어요."
    )
    expect(countFrontierCalls()).toBe(1)
  })

  it("Radar → Frontier → Radar 왕복 후에도 Radar 가 정상 복귀한다", async () => {
    // Given
    renderPage()

    // When
    fireEvent.click(tab("Frontier"))
    await screen.findByTestId("frontier-columns")
    fireEvent.click(tab("Radar"))

    // Then
    expect(screen.getByTestId("radar-feed")).toBeTruthy()
    expect(screen.queryByTestId("frontier-columns")).toBeNull()
    expect(tab("Radar")).toHaveAttribute("aria-selected", "true")
  })

  it("탭을 오가도 채팅 입력값이 살아남는다 (remount 없음)", async () => {
    // Given
    renderPage()
    const draft = screen.getByLabelText("chat-draft")
    fireEvent.change(draft, { target: { value: "쓰던 문장" } })

    // When
    fireEvent.click(tab("Frontier"))
    await screen.findByTestId("frontier-columns")
    fireEvent.click(tab("Radar"))

    // Then
    expect(screen.getByLabelText("chat-draft")).toHaveValue("쓰던 문장")
  })

  it("AgentChat 은 화면에 하나뿐이고 Andrej 전용 엔드포인트를 쓴다", async () => {
    // Given
    renderPage()

    // When
    fireEvent.click(tab("Frontier"))
    await screen.findByTestId("frontier-columns")

    // Then
    expect(screen.getAllByTestId("agent-chat")).toHaveLength(1)
    expect(screen.getByTestId("chat-api").textContent).toBe("/api/andrej/conversation")
  })
})

describe("Frontier 인사말", () => {
  it("불러오는 중에는 로딩 인사말을 건다", async () => {
    // Given
    // executor 는 동기 실행이라 release 는 반드시 채워진다.
    // TS 는 콜백 안의 대입을 추적하지 못해 null 로 좁히므로 확정 대입으로 알려준다.
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        calls.push(url)
        if (url.startsWith("/api/andrej/frontier")) {
          await gate
          return new Response(JSON.stringify(makeIndex()), { status: 200 })
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      })
    )
    renderPage()

    // When
    fireEvent.click(tab("Frontier"))

    // Then
    await waitFor(() =>
      expect(screen.getByTestId("chat-greeting").textContent).toBe(
        "운탁씨, AI Frontier 지식 라이브러리를 불러오고 있어요."
      )
    )
    release()
  })

  it("불러오면 에피소드·개념·미검토 수를 담은 인사말을 건다", async () => {
    // Given
    renderPage()

    // When
    fireEvent.click(tab("Frontier"))

    // Then
    await waitFor(() =>
      expect(screen.getByTestId("chat-greeting").textContent).toBe(
        "운탁씨, AI Frontier에 에피소드 1개와 개념 1개가 정리돼 있어요. 검토 대기는 1개입니다."
      )
    )
  })

  it("미검토가 없으면 개념부터 보라고 말한다", async () => {
    // Given
    frontierReply = {
      ok: true,
      body: makeIndex({ episodes: [{ ...EPISODE, reviewed: true }] }),
    }
    renderPage()

    // When
    fireEvent.click(tab("Frontier"))

    // Then
    await waitFor(() =>
      expect(screen.getByTestId("chat-greeting").textContent).toBe(
        "운탁씨, AI Frontier에 에피소드 1개와 개념 1개가 정리돼 있어요. 검토 대기는 0개입니다."
      )
    )
  })

  it("정말 비어 있는 것과 못 읽는 것을 구분한다", async () => {
    // Given — 소스는 살아 있는데 내용이 없는 경우
    frontierReply = {
      ok: true,
      body: makeIndex({ episodes: [], concepts: [], episodeIndex: {} }),
    }
    renderPage()

    // When
    fireEvent.click(tab("Frontier"))

    // Then
    await waitFor(() =>
      expect(screen.getByTestId("chat-greeting").textContent).toBe(
        "운탁씨, AI Frontier에 에피소드 0개와 개념 0개가 정리돼 있어요. 검토 대기는 0개입니다."
      )
    )
  })

  it("요청이 실패하면 못 읽고 있다고 말한다", async () => {
    // Given
    frontierReply = { ok: false, body: null }
    renderPage()

    // When
    fireEvent.click(tab("Frontier"))

    // Then
    await waitFor(() =>
      expect(screen.getByTestId("chat-greeting").textContent).toBe(
        "운탁씨, AI Frontier는 지금 Notion 연결을 확인해야 해요. Radar는 정상적으로 볼 수 있습니다."
      )
    )
  })

  it("두 소스가 모두 끊기면 실패와 같은 인사말을 건다", async () => {
    // Given
    frontierReply = {
      ok: true,
      body: makeIndex({
        status: "unavailable",
        sources: { episodes: "unavailable", concepts: "unavailable" },
        episodes: [],
        concepts: [],
        episodeIndex: {},
      }),
    }
    renderPage()

    // When
    fireEvent.click(tab("Frontier"))

    // Then
    await waitFor(() =>
      expect(screen.getByTestId("chat-greeting").textContent).toBe(
        "운탁씨, AI Frontier는 지금 Notion 연결을 확인해야 해요. Radar는 정상적으로 볼 수 있습니다."
      )
    )
  })

  it("Radar 로 돌아오면 기존 피드 인사말이 그대로 돌아온다", async () => {
    // Given — 피드가 자리잡은 뒤를 기준으로 잡는다.
    // 렌더 직후는 아직 로딩("...")이라, 그 값을 기준 삼으면 로딩과 완료를 비교하게 된다.
    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId("chat-greeting").textContent).not.toBe("...")
    )
    const radarGreeting = screen.getByTestId("chat-greeting").textContent

    // When
    fireEvent.click(tab("Frontier"))
    await screen.findByTestId("frontier-columns")
    fireEvent.click(tab("Radar"))

    // Then
    expect(screen.getByTestId("chat-greeting").textContent).toBe(radarGreeting)
    expect(radarGreeting).toContain("운탁씨")
  })
})

describe("Frontier 요청 합치기", () => {
  it("페이지와 대시보드가 키를 공유해 요청은 한 번만 나간다", async () => {
    // Given
    renderPage()

    // When
    fireEvent.click(tab("Frontier"))
    await screen.findByTestId("frontier-columns")

    // Then
    expect(countFrontierCalls()).toBe(1)
  })

  it("탭을 여러 번 오가도 캐시가 살아 재요청이 없다", async () => {
    // Given
    renderPage()
    fireEvent.click(tab("Frontier"))
    await screen.findByTestId("frontier-columns")

    // When
    fireEvent.click(tab("Radar"))
    fireEvent.click(tab("Frontier"))
    await screen.findByTestId("frontier-columns")

    // Then
    expect(countFrontierCalls()).toBe(1)
  })
})

describe("탭 접근성", () => {
  it("tablist / tab 역할과 선택 상태를 노출한다", async () => {
    // Given / When
    renderPage()
    const list = screen.getByRole("tablist")

    // Then
    expect(within(list).getAllByRole("tab")).toHaveLength(3)
    expect(list.getAttribute("aria-label")).toBeTruthy()
  })

  it("탭은 네이티브 button 이라 Enter·Space 가 그대로 먹는다", async () => {
    // Given / When
    renderPage()

    // Then
    for (const name of ["Radar", "AI Frontier", "Dwarkesh"] as const) {
      expect(tab(name).tagName).toBe("BUTTON")
      expect(tab(name)).toHaveAttribute("type", "button")
    }
  })

  it("탭 라벨은 글자로 읽히고 이모지를 쓰지 않는다", async () => {
    // Given / When
    renderPage()
    const list = screen.getByRole("tablist")

    // Then
    expect(list.textContent).toBe("RadarAI FrontierDwarkesh")
    expect(/\p{Extended_Pictographic}/u.test(list.textContent ?? "")).toBe(false)
  })

  it("탭 전환에 URL 을 건드리지 않는다", async () => {
    // Given
    const push = vi.spyOn(window.history, "pushState")
    const replace = vi.spyOn(window.history, "replaceState")
    renderPage()

    // When
    fireEvent.click(tab("Frontier"))
    await screen.findByTestId("frontier-columns")

    // Then
    expect(push).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(window.location.search).toBe("")
  })

  it("TopBar → 탭 바 → 채팅 → 선택된 내용 순서로 놓인다", async () => {
    // Given / When
    renderPage()
    const topbar = screen.getByTestId("topbar")
    const list = screen.getByRole("tablist")
    const chat = screen.getByTestId("agent-chat")
    const feed = screen.getByTestId("radar-feed")

    // Then
    const before = Node.DOCUMENT_POSITION_FOLLOWING
    expect(topbar.compareDocumentPosition(list) & before).toBeTruthy()
    expect(list.compareDocumentPosition(chat) & before).toBeTruthy()
    expect(chat.compareDocumentPosition(feed) & before).toBeTruthy()
  })
})
