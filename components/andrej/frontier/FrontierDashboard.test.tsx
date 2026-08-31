// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type {
  AiFrontierConcept,
  AiFrontierEpisode,
  AiFrontierEpisodeDetail,
  AiFrontierIndex,
} from "@/lib/types/ai-frontier"

import { FrontierDashboard } from "./FrontierDashboard"

const INDEX_URL = "/api/andrej/frontier"

function makeEpisodes(): AiFrontierEpisode[] {
  const base: AiFrontierEpisode = {
    id: "ep-12",
    name: "스케일링 법칙의 끝",
    episodeNumber: 12,
    status: "Published",
    published: "2026-05-02",
    recorded: null,
    reviewed: true,
    topics: ["Scaling"],
    models: ["GPT-5"],
    people: ["Karpathy"],
    youtube: null,
    transcriptSource: null,
    duration: null,
    summary: null,
    keyTerms: [],
    source: "ai-frontier",
    sourceKey: "EP12",
    sourceIdentityPersisted: false,
  }
  return [
    base,
    {
      ...base,
      id: "ep-11",
      name: "에이전트 루프",
      episodeNumber: 11,
      published: "2026-04-01",
      reviewed: false,
      topics: ["Agents"],
    },
  ]
}

/** 제목에 출처 접두어가 없는 원래 Dwarkesh 제목. 저장된 source 로만 구분돼야 한다. */
const DWARKESH_EPISODE: AiFrontierEpisode = {
  ...makeEpisodes()[0],
  id: "dwarkesh-ryan",
  name: "Ryan Greenblatt — AI R&D 자동화",
  episodeNumber: null,
  published: "2026-04-20",
  topics: ["AI R&D"],
  people: ["Ryan Greenblatt"],
  transcriptSource: "https://www.dwarkesh.com/p/ryan-greenblatt",
  source: "dwarkesh",
  sourceKey: "DWARKESH:RYAN-GREENBLATT",
  sourceIdentityPersisted: true,
}

/** 제목과 URL 은 Dwarkesh 를 가리키지만 저장된 source 는 ai-frontier 인 행. */
const CONTRADICTORY_EPISODE: AiFrontierEpisode = {
  ...makeEpisodes()[0],
  id: "ep-contradictory",
  name: "Dwarkesh · 제목만 Dwarkesh",
  episodeNumber: null,
  published: "2026-04-10",
  transcriptSource: "https://www.dwarkesh.com/p/not-really",
  source: "ai-frontier",
  sourceKey: "EP99",
}

/**
 * index 는 JSON 경계를 넘어온다. union 밖 source 가 실제로 도착할 수 있어
 * 그 경계를 테스트에서만 재현한다.
 */
function legacyEpisode(): AiFrontierEpisode {
  const raw: unknown = {
    ...makeEpisodes()[0],
    id: "legacy-row",
    name: "출처가 사라진 옛 행",
    episodeNumber: null,
    published: "2026-03-01",
    sourceKey: null,
    source: "legacy-unknown",
  }
  return raw as AiFrontierEpisode
}

function makeConcepts(): AiFrontierConcept[] {
  const base: AiFrontierConcept = {
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
  }
  return [
    base,
    {
      ...base,
      id: "c2",
      term: "Chain of Thought",
      korean: "사고 사슬",
      category: "Reasoning",
      oneLine: "중간 추론을 밖으로 꺼내는 방식.",
      episodes: [{ ref: "EP11", available: true, pageId: "ep-11" }],
    },
  ]
}

function makeIndex(overrides: Partial<AiFrontierIndex> = {}): AiFrontierIndex {
  return {
    status: "ok",
    sources: { episodes: "ok", concepts: "ok" },
    episodes: makeEpisodes(),
    concepts: makeConcepts(),
    episodeIndex: { EP12: "ep-12", EP11: "ep-11" },
    ...overrides,
  }
}

function makeDetail(): AiFrontierEpisodeDetail {
  return { ...makeEpisodes()[0], blocks: [], truncated: false }
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
vi.stubGlobal("fetch", fetchMock)

/** index 응답만 갈아끼우고, 에피소드 상세 요청은 항상 성공시킨다. */
function mockIndex(index: AiFrontierIndex | Promise<never> | null = makeIndex()) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input)
    if (url.startsWith(`${INDEX_URL}/episodes/`)) return jsonResponse(makeDetail())
    if (index === null) return jsonResponse({ error: "down" }, false, 500)
    if (index instanceof Promise) return index
    return jsonResponse(index)
  })
}

function indexCalls(): number {
  return fetchMock.mock.calls.filter((call) => String(call[0]) === INDEX_URL).length
}

afterEach(() => {
  fetchMock.mockReset()
})

function renderDashboard(props: ComponentProps<typeof FrontierDashboard> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <FrontierDashboard {...props} />
    </QueryClientProvider>
  )
  return { queryClient, ...view }
}

/**
 * 마운트된 컴포넌트가 실제로 등록한 쿼리 옵션.
 * Query.options 는 QueryOptions 로 좁혀져 있어 staleTime/refetchInterval 을 들고 있지 않다.
 * observer.options 는 QueryObserverOptions 라 두 필드를 그대로 갖는다.
 */
function mountedQueryOptions(queryClient: QueryClient) {
  return queryClient.getQueryCache().find({ queryKey: ["andrej-frontier"] })?.observers[0]?.options
}

const panel = (section: "episodes" | "concepts") => screen.getByTestId(`frontier-panel-${section}`)
const tab = (name: RegExp) => screen.getByRole("tab", { name })

async function renderReady() {
  mockIndex()
  const result = renderDashboard()
  await screen.findByTestId("frontier-status")
  return result
}

describe("FrontierDashboard 데이터 연결", () => {
  it("약속된 경로로 index를 한 번만 요청한다", async () => {
    await renderReady()

    expect(indexCalls()).toBe(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe(INDEX_URL)
  })

  it("andrej-frontier 키로 캐싱하고 10분 staleTime을 쓴다", async () => {
    const { queryClient } = await renderReady()

    expect(queryClient.getQueryData(["andrej-frontier"])).toBeDefined()
    expect(mountedQueryOptions(queryClient)?.staleTime).toBe(10 * 60 * 1000)
  })

  it("주기적으로 다시 부르지 않는다", async () => {
    const { queryClient } = await renderReady()

    expect(mountedQueryOptions(queryClient)?.refetchInterval).toBeUndefined()
    expect(indexCalls()).toBe(1)
  })

  it("stale 하지 않으면 다시 마운트해도 재요청하지 않는다", async () => {
    mockIndex()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    const tree = (
      <QueryClientProvider client={queryClient}>
        <FrontierDashboard />
      </QueryClientProvider>
    )

    const first = render(tree)
    await screen.findByTestId("frontier-status")
    first.unmount()
    render(tree)
    await screen.findByTestId("frontier-status")

    expect(indexCalls()).toBe(1)
  })

  it("불러오는 동안 양쪽 자리에 스켈레톤을 세워 둔다", () => {
    mockIndex(new Promise<never>(() => {}))
    renderDashboard()

    expect(screen.getAllByTestId(/^frontier-skeleton-/)).toHaveLength(2)
    // 로딩 자리와 목록 자리는 이름을 나눠 쓴다. 같은 이름이면 pending 중에 잡은 요소에
    // 패널이 없어 조용히 헛짚게 된다.
    expect(screen.getByTestId("frontier-loading-columns").className).toContain("md:grid-cols-2")
    expect(screen.queryByTestId("frontier-columns")).not.toBeInTheDocument()
  })
})

describe("FrontierDashboard 상태 줄", () => {
  it("최신 EP·개수·미검토·동기화 시각을 한 줄에 모은다", async () => {
    await renderReady()

    const status = screen.getByTestId("frontier-status")
    expect(status).toHaveTextContent("EP12")
    expect(status).toHaveTextContent("에피소드 2")
    expect(status).toHaveTextContent("개념 2")
    expect(status).toHaveTextContent("미검토 1")
    expect(screen.getByTestId("frontier-last-sync")).toHaveTextContent(/\d{2}:\d{2}/)
  })

  it("한쪽 소스만 끊기면 부분 연결임을 상태 줄에서 알린다", async () => {
    mockIndex(makeIndex({ status: "partial", sources: { episodes: "unavailable", concepts: "ok" }, episodes: [] }))
    renderDashboard()

    expect(await screen.findByTestId("frontier-status")).toHaveTextContent("일부 연결 실패")
  })
})

describe("FrontierDashboard 검색과 필터", () => {
  it("검색 입력에 이름표가 붙어 있다", async () => {
    await renderReady()

    expect(screen.getByLabelText(/검색/)).toBeInTheDocument()
  })

  it("한글 검색어가 양쪽 목록에 함께 걸린다", async () => {
    await renderReady()

    fireEvent.change(screen.getByLabelText(/검색/), { target: { value: "사고" } })

    expect(within(panel("concepts")).getByText("Chain of Thought")).toBeInTheDocument()
    expect(within(panel("concepts")).queryByText("Transformer")).not.toBeInTheDocument()
    expect(within(panel("episodes")).getByText("표시할 에피소드가 없습니다.")).toBeInTheDocument()
  })

  it("에피소드 제목 검색은 에피소드 쪽만 남긴다", async () => {
    await renderReady()

    fireEvent.change(screen.getByLabelText(/검색/), { target: { value: "스케일링" } })

    expect(within(panel("episodes")).getByText("스케일링 법칙의 끝")).toBeInTheDocument()
    expect(within(panel("episodes")).queryByText("에이전트 루프")).not.toBeInTheDocument()
    expect(within(panel("concepts")).getByText("표시할 개념이 없습니다.")).toBeInTheDocument()
  })

  it("카테고리 칩은 개념만 좁히고 에피소드는 건드리지 않는다", async () => {
    await renderReady()

    // 개념 카드의 접근 이름에도 카테고리가 섞여 있어, 칩 줄 안으로 좁혀서 누른다.
    fireEvent.click(within(screen.getByTestId("frontier-category-chips")).getByRole("button", { name: /Architecture/ }))

    expect(within(panel("concepts")).getByText("Transformer")).toBeInTheDocument()
    expect(within(panel("concepts")).queryByText("Chain of Thought")).not.toBeInTheDocument()
    expect(within(panel("episodes")).getAllByTestId(/^frontier-episode-row-/)).toHaveLength(2)
  })
})

describe("FrontierDashboard 소스 필터", () => {
  const sourceChip = (name: "전체" | "AI Frontier" | "Dwarkesh") =>
    within(screen.getByTestId("frontier-source-chips")).getByRole("button", { name: new RegExp(`^${name}`) })

  const episodeIds = () =>
    within(panel("episodes"))
      .getAllByTestId(/^frontier-episode-row-/)
      .map((element) => element.dataset.testid)

  async function renderMixed() {
    mockIndex(
      makeIndex({
        episodes: [...makeEpisodes(), DWARKESH_EPISODE, CONTRADICTORY_EPISODE, legacyEpisode()],
      })
    )
    const result = renderDashboard()
    await screen.findByTestId("frontier-status")
    return result
  }

  it("전체·AI Frontier·Dwarkesh 를 누를 수 있는 버튼으로 세운다", async () => {
    await renderMixed()

    for (const name of ["전체", "AI Frontier", "Dwarkesh"] as const) {
      const chip = sourceChip(name)
      expect(chip.tagName).toBe("BUTTON")
      expect(chip).toHaveAttribute("type", "button")
      expect(chip).not.toBeDisabled()
      chip.focus()
      expect(chip).toHaveFocus()
    }
  })

  it("Dwarkesh 필터는 저장된 source 가 dwarkesh 인 행만 보여준다", async () => {
    await renderMixed()

    fireEvent.click(sourceChip("Dwarkesh"))

    expect(episodeIds()).toEqual(["frontier-episode-row-dwarkesh-ryan"])
    expect(sourceChip("Dwarkesh")).toHaveAttribute("aria-pressed", "true")
    expect(sourceChip("전체")).toHaveAttribute("aria-pressed", "false")
    // 제목/URL 이 Dwarkesh 를 가리켜도 저장된 source 가 ai-frontier 면 빠진다.
    expect(within(panel("episodes")).queryByText("Dwarkesh · 제목만 Dwarkesh")).not.toBeInTheDocument()
  })

  it("AI Frontier 필터는 저장된 source 가 ai-frontier 인 행만 보여준다", async () => {
    await renderMixed()

    fireEvent.click(sourceChip("AI Frontier"))

    expect(episodeIds()).toEqual([
      "frontier-episode-row-ep-12",
      "frontier-episode-row-ep-contradictory",
      "frontier-episode-row-ep-11",
    ])
    expect(within(panel("episodes")).queryByText("Ryan Greenblatt — AI R&D 자동화")).not.toBeInTheDocument()
  })

  it("전체는 두 소스를 published 내림차순 한 줄로 합친다", async () => {
    await renderMixed()

    fireEvent.click(sourceChip("전체"))

    expect(episodeIds()).toEqual([
      "frontier-episode-row-ep-12",
      "frontier-episode-row-dwarkesh-ryan",
      "frontier-episode-row-ep-contradictory",
      "frontier-episode-row-ep-11",
      "frontier-episode-row-legacy-row",
    ])
    expect(sourceChip("전체")).toHaveAttribute("aria-pressed", "true")
  })

  it("제목에 접두어가 없어도 Dwarkesh 검색으로 찾힌다", async () => {
    await renderMixed()

    fireEvent.click(sourceChip("전체"))
    fireEvent.change(screen.getByLabelText(/검색/), { target: { value: "Dwarkesh" } })

    // 제목에 "Dwarkesh" 가 한 글자도 없는 행이 출처 이름만으로 걸린다.
    expect(within(panel("episodes")).getByText("Ryan Greenblatt — AI R&D 자동화")).toBeInTheDocument()
    // 제목 검색도 그대로 살아 있어, 제목에 그 단어가 든 행은 소스와 무관하게 함께 걸린다.
    expect(episodeIds()).toEqual([
      "frontier-episode-row-dwarkesh-ryan",
      "frontier-episode-row-ep-contradictory",
    ])

    // 소스 필터를 걸면 제목만 닮은 행은 남지 않는다.
    fireEvent.click(sourceChip("Dwarkesh"))
    expect(episodeIds()).toEqual(["frontier-episode-row-dwarkesh-ryan"])
  })

  it("알 수 없는 source 행도 전체에서는 사라지지 않는다", async () => {
    await renderMixed()

    fireEvent.click(sourceChip("전체"))
    expect(within(panel("episodes")).getByText("출처가 사라진 옛 행")).toBeInTheDocument()
    expect(
      within(screen.getByTestId("frontier-episode-row-legacy-row")).getByText("기타 출처")
    ).toBeInTheDocument()

    fireEvent.click(sourceChip("AI Frontier"))
    expect(screen.queryByTestId("frontier-episode-row-legacy-row")).not.toBeInTheDocument()

    fireEvent.click(sourceChip("Dwarkesh"))
    expect(screen.queryByTestId("frontier-episode-row-legacy-row")).not.toBeInTheDocument()
  })

  it("소스 필터는 개념 쪽 개수와 상태 줄에도 함께 걸린다", async () => {
    await renderMixed()

    fireEvent.click(sourceChip("Dwarkesh"))

    expect(screen.getByTestId("frontier-status")).toHaveTextContent("에피소드 1")
  })
})

describe("FrontierDashboard 레이아웃", () => {
  it("md 이상에서 두 열로 나눈다", async () => {
    await renderReady()

    expect(screen.getByTestId("frontier-columns").className).toContain("md:grid-cols-2")
    // 데이터가 온 뒤에는 로딩 자리가 남아 있지 않다.
    expect(screen.queryByTestId("frontier-loading-columns")).not.toBeInTheDocument()
    expect(within(screen.getByTestId("frontier-columns")).getAllByRole("tabpanel")).toHaveLength(2)
  })

  it("모바일 세그먼트는 `에피소드 N | 개념 N` 한 줄로 읽힌다", async () => {
    await renderReady()

    const tablist = screen.getByRole("tablist")
    expect(tab(/에피소드/)).toHaveTextContent("2")
    expect(tab(/개념/)).toHaveTextContent("2")
    expect(tablist.textContent?.replace(/\s+/g, " ").trim()).toBe("에피소드 2 | 개념 2")
    expect(tablist.className).toContain("md:hidden")
  })

  it("두 세그먼트 사이의 구분자는 눈에만 보이고 읽히지는 않는다", async () => {
    await renderReady()

    const separator = screen.getByTestId("frontier-segment-separator")
    expect(separator).toHaveTextContent("|")
    expect(separator).toHaveAttribute("aria-hidden", "true")
    // 구분자가 실제로 두 세그먼트 사이에 있어야 한 줄로 읽힌다.
    expect(separator.previousElementSibling).toBe(tab(/에피소드/))
    expect(separator.nextElementSibling).toBe(tab(/개념/))
  })

  it("세그먼트는 테두리 상자가 아니라 글자 줄로 붙어 있다", async () => {
    await renderReady()

    // 활성 표시는 색만이 아니라 밑줄로도 준다(색 구분이 어려운 경우 대비).
    expect(tab(/에피소드/).className).not.toContain("border")
    expect(tab(/에피소드/).className).toContain("underline")
    expect(tab(/개념/).className).not.toContain("underline")
  })

  it("모바일에서는 선택된 쪽 한 패널만 보인다", async () => {
    await renderReady()

    expect(tab(/에피소드/)).toHaveAttribute("aria-selected", "true")
    expect(panel("episodes").className).not.toContain("hidden")
    expect(panel("concepts").className).toContain("hidden")

    fireEvent.click(tab(/개념/))

    expect(tab(/개념/)).toHaveAttribute("aria-selected", "true")
    expect(tab(/에피소드/)).toHaveAttribute("aria-selected", "false")
    expect(panel("concepts").className).not.toContain("hidden")
    expect(panel("episodes").className).toContain("hidden")
    expect(panel("episodes").className).toContain("md:block")
  })
})

describe("FrontierDashboard 교차 이동", () => {
  it("개념의 EP 칩은 에피소드 쪽으로 옮겨 펼치고 초점을 준다", async () => {
    await renderReady()

    fireEvent.click(within(panel("concepts")).getByRole("button", { name: "EP12" }))

    const row = within(panel("episodes")).getByRole("button", { name: /스케일링 법칙의 끝/ })
    expect(tab(/에피소드/)).toHaveAttribute("aria-selected", "true")
    expect(row).toHaveAttribute("aria-expanded", "true")
    expect(row).toHaveFocus()
    expect(panel("episodes")).toHaveAttribute("data-target", "true")
  })

  it("에피소드의 개념 칩은 개념 쪽으로 옮겨 펼치고 초점을 준다", async () => {
    await renderReady()

    fireEvent.click(within(panel("episodes")).getByRole("button", { name: /스케일링 법칙의 끝/ }))
    fireEvent.click(
      await within(panel("episodes")).findByRole("button", { name: /Transformer.*트랜스포머/ })
    )

    const card = within(panel("concepts")).getByRole("button", { name: /Transformer/ })
    expect(tab(/개념/)).toHaveAttribute("aria-selected", "true")
    expect(card).toHaveAttribute("aria-expanded", "true")
    expect(card).toHaveFocus()
    expect(panel("concepts")).toHaveAttribute("data-target", "true")
  })

  it("끊긴 참조로는 이동하지 않고 그 사실을 알린다", async () => {
    const orphan = makeConcepts()[0]
    mockIndex(
      makeIndex({ concepts: [{ ...orphan, episodes: [{ ref: "EP45", available: true, pageId: "ep-45" }] }] })
    )
    renderDashboard()
    await screen.findByTestId("frontier-status")

    // 모바일에서 개념 쪽을 보고 있던 사용자가 끊긴 칩을 누른 상황.
    fireEvent.click(tab(/개념/))
    fireEvent.click(within(panel("concepts")).getByRole("button", { name: "EP45" }))

    expect(screen.getByTestId("frontier-crosslink-unavailable")).toHaveTextContent("EP45")
    // 이동에 실패했으므로 보던 쪽에 그대로 남는다.
    expect(tab(/개념/)).toHaveAttribute("aria-selected", "true")
    expect(panel("episodes")).not.toHaveAttribute("data-target")
  })

  it("Escape는 선택만 풀어 준다", async () => {
    await renderReady()

    fireEvent.click(within(panel("concepts")).getByRole("button", { name: "EP12" }))
    fireEvent.keyDown(window, { key: "Escape" })

    const row = within(panel("episodes")).getByRole("button", { name: /스케일링 법칙의 끝/ })
    expect(row).toHaveAttribute("aria-expanded", "false")
    expect(panel("episodes")).not.toHaveAttribute("data-target")
  })
})

describe("FrontierDashboard 실패와 재시도", () => {
  it("에피소드 소스만 끊기면 개념 목록은 그대로 쓴다", async () => {
    mockIndex(makeIndex({ status: "partial", sources: { episodes: "unavailable", concepts: "ok" }, episodes: [] }))
    renderDashboard()
    await screen.findByTestId("frontier-status")

    expect(within(panel("episodes")).getByTestId("frontier-error-episodes")).toBeInTheDocument()
    expect(within(panel("episodes")).queryByText("표시할 에피소드가 없습니다.")).not.toBeInTheDocument()
    expect(within(panel("concepts")).getByText("Transformer")).toBeInTheDocument()
  })

  it("개념 소스만 끊기면 에피소드 목록은 그대로 쓴다", async () => {
    mockIndex(makeIndex({ status: "partial", sources: { episodes: "ok", concepts: "unavailable" }, concepts: [] }))
    renderDashboard()
    await screen.findByTestId("frontier-status")

    expect(within(panel("concepts")).getByTestId("frontier-error-concepts")).toBeInTheDocument()
    expect(within(panel("concepts")).queryByText("표시할 개념이 없습니다.")).not.toBeInTheDocument()
    expect(within(panel("episodes")).getByText("스케일링 법칙의 끝")).toBeInTheDocument()
  })

  it("양쪽 다 끊기면 양쪽 다 실패라고 말한다", async () => {
    mockIndex(
      makeIndex({
        status: "unavailable",
        sources: { episodes: "unavailable", concepts: "unavailable" },
        episodes: [],
        concepts: [],
      })
    )
    renderDashboard()
    await screen.findByTestId("frontier-status")

    expect(screen.getByTestId("frontier-error-episodes")).toBeInTheDocument()
    expect(screen.getByTestId("frontier-error-concepts")).toBeInTheDocument()
  })

  it("요청 자체가 실패하면 재시도로 다시 살아난다", async () => {
    mockIndex(null)
    renderDashboard()

    const retry = await screen.findByRole("button", { name: /재시도/ })
    mockIndex()
    fireEvent.click(retry)

    await waitFor(() => expect(screen.getByTestId("frontier-status")).toBeInTheDocument())
    expect(within(panel("episodes")).getByText("스케일링 법칙의 끝")).toBeInTheDocument()
  })

  it("요청 자체가 실패하면 지금 보고 있는 출처 이름으로 알린다", async () => {
    mockIndex(null)
    renderDashboard({ source: "dwarkesh" })

    const card = await screen.findByTestId("frontier-error-index")
    expect(within(card).getByRole("heading")).toHaveTextContent("Dwarkesh")
    expect(within(card).getByRole("heading")).not.toHaveTextContent("AI Frontier")
  })

  it("AI Frontier 를 보고 있었다면 실패 카드 제목도 AI Frontier 다", async () => {
    mockIndex(null)
    renderDashboard()

    const card = await screen.findByTestId("frontier-error-index")
    expect(within(card).getByRole("heading")).toHaveTextContent("AI Frontier")
  })

  it("소스 실패 자리의 재시도는 index를 다시 부른다", async () => {
    mockIndex(makeIndex({ status: "partial", sources: { episodes: "unavailable", concepts: "ok" }, episodes: [] }))
    renderDashboard()
    await screen.findByTestId("frontier-status")

    fireEvent.click(within(screen.getByTestId("frontier-error-episodes")).getByRole("button", { name: /재시도/ }))

    await waitFor(() => expect(indexCalls()).toBe(2))
  })

  it("에피소드가 정말 비어 있으면 비어 있다고 말한다", async () => {
    mockIndex(makeIndex({ episodes: [] }))
    renderDashboard()
    await screen.findByTestId("frontier-status")

    expect(within(panel("episodes")).getByText("표시할 에피소드가 없습니다.")).toBeInTheDocument()
    expect(screen.queryByTestId("frontier-error-episodes")).not.toBeInTheDocument()
  })
})
