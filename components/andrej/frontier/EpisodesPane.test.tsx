// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type {
  AiFrontierBlock,
  AiFrontierConcept,
  AiFrontierEpisode,
  AiFrontierEpisodeDetail,
} from "@/lib/types/ai-frontier"

import { EpisodesPane } from "./EpisodesPane"

function makeEpisode(overrides: Partial<AiFrontierEpisode> = {}): AiFrontierEpisode {
  return {
    id: "ep-12",
    name: "스케일링 법칙의 끝",
    episodeNumber: 12,
    status: "Published",
    published: "2026-05-02",
    recorded: null,
    reviewed: true,
    topics: ["Scaling", "RL", "Agents", "Eval"],
    models: ["GPT-5"],
    people: ["Karpathy"],
    youtube: "https://youtu.be/abc123",
    transcriptSource: "https://example.com/ep12.txt",
    duration: "1:42:00",
    keyTerms: ["Transformer"],
    ...overrides,
  }
}

const older = makeEpisode({ id: "ep-11", name: "에이전트 루프", episodeNumber: 11, published: "2026-04-01" })

function makeConcept(overrides: Partial<AiFrontierConcept> = {}): AiFrontierConcept {
  return {
    id: "c1",
    term: "Transformer",
    korean: "트랜스포머",
    category: "Architecture",
    verified: "전사 기반",
    oneLine: "어텐션 기반 구조.",
    intuition: null,
    whyItMatters: null,
    source: null,
    episodes: [{ ref: "EP12", available: true, pageId: "ep-12" }],
    ...overrides,
  }
}

function makeBlocks(count: number): AiFrontierBlock[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `b${index}`,
    type: "paragraph",
    text: `본문 ${index}`,
  }))
}

function makeDetail(overrides: Partial<AiFrontierEpisodeDetail> = {}): AiFrontierEpisodeDetail {
  return { ...makeEpisode(), blocks: makeBlocks(3), truncated: false, ...overrides }
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
vi.stubGlobal("fetch", fetchMock)

afterEach(() => {
  fetchMock.mockReset()
})

function renderPane(overrides: Partial<ComponentProps<typeof EpisodesPane>> = {}) {
  const onConceptNavigate = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <EpisodesPane
        episodes={[older, makeEpisode()]}
        concepts={[makeConcept()]}
        selectedEpisodeId={null}
        onConceptNavigate={onConceptNavigate}
        {...overrides}
      />
    </QueryClientProvider>
  )

  return { onConceptNavigate, queryClient }
}

const row = (label: RegExp) => screen.getByRole("button", { name: label })

describe("EpisodesPane 목록", () => {
  it("최신 published가 위로 오도록 날짜 내림차순으로 줄을 세운다", () => {
    renderPane()

    const rows = screen.getAllByTestId(/^frontier-episode-row-/)
    expect(rows.map((element) => element.dataset.testid)).toEqual([
      "frontier-episode-row-ep-12",
      "frontier-episode-row-ep-11",
    ])
  })

  it("EP 번호/제목/날짜/검토 상태를 한 줄에 함께 보여준다", () => {
    renderPane()

    const button = row(/EP12/)
    expect(button).toHaveTextContent("EP12")
    expect(button).toHaveTextContent("스케일링 법칙의 끝")
    expect(button).toHaveTextContent("2026-05-02")
    expect(button).toHaveTextContent("검토 완료")
  })

  it("검토되지 않은 에피소드는 미검토로 구분한다", () => {
    renderPane({ episodes: [makeEpisode({ reviewed: false })] })

    expect(row(/EP12/)).toHaveTextContent("미검토")
  })

  it("토픽은 2개까지만 노출하고 나머지는 +N으로 접는다", () => {
    renderPane()

    const topics = within(screen.getByTestId("frontier-episode-topics-ep-12"))
    expect(topics.getByText("Scaling")).toBeInTheDocument()
    expect(topics.getByText("RL")).toBeInTheDocument()
    expect(topics.queryByText("Agents")).not.toBeInTheDocument()
    expect(topics.getByText("+2")).toBeInTheDocument()
  })

  it("연결된 Concept 개수를 줄 위에서 바로 보여준다", () => {
    renderPane()

    expect(screen.getByTestId("frontier-episode-concept-count-ep-12")).toHaveTextContent("1")
    expect(screen.getByTestId("frontier-episode-concept-count-ep-11")).toHaveTextContent("0")
  })

  it("에피소드가 없으면 비어 있음을 직접 알린다", () => {
    renderPane({ episodes: [] })

    expect(screen.getByText("표시할 에피소드가 없습니다.")).toBeInTheDocument()
  })
})

describe("EpisodesPane 펼치기와 지연 로딩", () => {
  it("펼치기 전에는 상세 요청을 보내지 않는다", () => {
    renderPane()

    expect(row(/EP12/)).toHaveAttribute("aria-expanded", "false")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("펼칠 때 약속된 경로로 한 번만 요청한다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeDetail()))
    renderPane()

    fireEvent.click(row(/EP12/))

    expect(row(/EP12/)).toHaveAttribute("aria-expanded", "true")
    await screen.findByText("본문 0")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/andrej/frontier/episodes/ep-12")
  })

  it("React Query 키를 pageId 기준으로 캐싱해 다시 펼쳐도 재요청하지 않는다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeDetail()))
    const { queryClient } = renderPane()

    fireEvent.click(row(/EP12/))
    await screen.findByText("본문 0")

    expect(queryClient.getQueryData(["andrej-frontier-episode", "ep-12"])).toBeDefined()

    fireEvent.click(row(/EP12/))
    fireEvent.click(row(/EP12/))
    await screen.findByText("본문 0")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("선택된 에피소드는 처음부터 펼쳐진 채로 그 에피소드만 불러온다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeDetail()))
    renderPane({ selectedEpisodeId: "ep-12" })

    expect(row(/EP12/)).toHaveAttribute("aria-expanded", "true")
    expect(row(/EP11/)).toHaveAttribute("aria-expanded", "false")

    await screen.findByText("본문 0")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("불러오는 동안 그 줄 안에서 진행 상태를 알린다", async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}))
    renderPane()

    fireEvent.click(row(/EP12/))

    expect(await screen.findByText("본문을 불러오는 중…")).toBeInTheDocument()
  })

  it("본문은 상한까지만 그리고 잘렸다는 사실을 숨기지 않는다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeDetail({ blocks: makeBlocks(60), truncated: true })))
    renderPane()

    fireEvent.click(row(/EP12/))
    await screen.findByText("본문 0")

    const blocks = screen.getAllByTestId(/^frontier-episode-block-/)
    expect(blocks.length).toBeLessThanOrEqual(40)
    expect(screen.getByTestId("frontier-episode-truncated-ep-12")).toBeInTheDocument()
  })

  it("키보드로 도달 가능한 네이티브 button이다", () => {
    renderPane()

    const button = row(/EP12/)
    button.focus()

    expect(button.tagName).toBe("BUTTON")
    expect(button).toHaveFocus()
    expect(button).toHaveAttribute("type", "button")
    expect(button).not.toBeDisabled()
    expect(button).not.toHaveAttribute("tabindex", "-1")
  })
})

describe("EpisodesPane 실패와 결측", () => {
  it("상세 로딩이 실패해도 목록은 계속 쓸 수 있다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "notion down" }, false, 500))
    renderPane()

    fireEvent.click(row(/EP12/))

    expect(await screen.findByText("본문을 불러오지 못했습니다.")).toBeInTheDocument()

    fireEvent.click(row(/EP11/))
    expect(row(/EP11/)).toHaveAttribute("aria-expanded", "true")
    expect(row(/EP12/)).toHaveTextContent("스케일링 법칙의 끝")
  })

  it("YouTube/전사 링크가 없으면 링크를 만들지 않는다", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(makeDetail({ youtube: null, transcriptSource: null, blocks: [], truncated: false }))
    )
    renderPane({ episodes: [makeEpisode({ youtube: null, transcriptSource: null, topics: [] })] })

    fireEvent.click(row(/EP12/))
    await screen.findByRole("link", { name: /Notion/ })

    expect(screen.queryByRole("link", { name: /YouTube/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /전사/ })).not.toBeInTheDocument()
    expect(screen.queryByTestId("frontier-episode-topics-ep-12")).not.toBeInTheDocument()
  })

  it("http(s)가 아닌 전사 출처는 링크 대신 글자로 남긴다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeDetail({ transcriptSource: "javascript:alert(1)" })))
    renderPane()

    fireEvent.click(row(/EP12/))
    await screen.findByText("본문 0")

    expect(screen.queryByRole("link", { name: /전사/ })).not.toBeInTheDocument()
    expect(screen.getByTestId("frontier-episode-transcript-ep-12")).toHaveTextContent("javascript:alert(1)")
  })

  it("외부 링크는 새 탭에서 안전하게 연다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeDetail()))
    renderPane()

    fireEvent.click(row(/EP12/))
    const youtube = await screen.findByRole("link", { name: /YouTube/ })

    expect(youtube).toHaveAttribute("href", "https://youtu.be/abc123")
    expect(youtube).toHaveAttribute("target", "_blank")
    expect(youtube).toHaveAttribute("rel", expect.stringContaining("noopener"))
    expect(youtube).toHaveAttribute("rel", expect.stringContaining("noreferrer"))
  })
})

describe("EpisodesPane Concept 이동", () => {
  it("연결된 Concept 칩은 전달받은 네비게이션을 호출한다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeDetail()))
    const { onConceptNavigate } = renderPane()

    fireEvent.click(row(/EP12/))
    const chip = await screen.findByRole("button", { name: /Transformer/ })
    fireEvent.click(chip)

    await waitFor(() => expect(onConceptNavigate).toHaveBeenCalledTimes(1))
    expect(onConceptNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }))
  })

  it("연결된 Concept이 없으면 칩 줄을 만들지 않는다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeDetail()))
    renderPane({ concepts: [] })

    fireEvent.click(row(/EP12/))
    await screen.findByText("본문 0")

    expect(screen.queryByTestId("frontier-episode-concepts-ep-12")).not.toBeInTheDocument()
  })
})
