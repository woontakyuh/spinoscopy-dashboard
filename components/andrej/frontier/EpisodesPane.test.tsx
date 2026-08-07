// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AiFrontierConcept, AiFrontierEpisode } from "@/lib/types/ai-frontier"

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
    summary: "스케일링 법칙과 RL이 실제 모델 경쟁에서 만나는 지점을 정리합니다.",
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

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
vi.stubGlobal("fetch", fetchMock)

afterEach(() => {
  fetchMock.mockReset()
})

function renderPane(overrides: Partial<ComponentProps<typeof EpisodesPane>> = {}) {
  const onConceptNavigate = vi.fn()

  render(
    <EpisodesPane
      episodes={[older, makeEpisode()]}
      concepts={[makeConcept()]}
      selectedEpisodeId={null}
      onConceptNavigate={onConceptNavigate}
      {...overrides}
    />
  )

  return { onConceptNavigate }
}

const row = (label: RegExp) => screen.getByRole("button", { name: label })

describe("EpisodesPane dashboard readability", () => {
  it("처음에는 제목만 보이고 클릭하면 Notion 한줄요약을 보여준다", () => {
    renderPane()

    expect(screen.queryByTestId("frontier-episode-summary-ep-12")).not.toBeInTheDocument()
    expect(row(/EP12/)).not.toHaveTextContent("2026-05-02")
    expect(screen.queryByTestId("frontier-episode-topics-ep-12")).not.toBeInTheDocument()

    fireEvent.click(row(/EP12/))

    const summary = screen.getByTestId("frontier-episode-summary-ep-12")
    expect(summary).toHaveTextContent(
      "스케일링 법칙과 RL이 실제 모델 경쟁에서 만나는 지점을 정리합니다."
    )
    expect(summary).not.toHaveClass("line-clamp-2")
    expect(summary).toHaveClass("text-foreground/80")
  })

  it("주제를 빈 타원형 칩 없이 이름 붙은 한 줄로 정리한다", () => {
    renderPane({
      episodes: [makeEpisode({ topics: ["", "  ", "Scaling", "Agents"] })],
      concepts: [],
    })

    fireEvent.click(row(/EP12/))

    const summary = screen.getByTestId("frontier-episode-topics-ep-12")
    expect(summary).toHaveTextContent("주제")
    expect(summary).toHaveTextContent("Scaling · Agents")
    expect(summary.querySelectorAll('[data-empty-chip="true"]')).toHaveLength(0)
  })

  it("출연진은 펼친 상세에서만 이름 붙여 보여준다", () => {
    renderPane()

    expect(screen.queryByTestId("frontier-episode-people-ep-12")).not.toBeInTheDocument()

    fireEvent.click(row(/EP12/))

    expect(screen.getByTestId("frontier-episode-people-ep-12")).toHaveTextContent(
      "출연진Karpathy"
    )
  })

  it("출연진이 없으면 빈 메타데이터를 만들지 않는다", () => {
    renderPane({ episodes: [makeEpisode({ people: [] })] })

    fireEvent.click(row(/EP12/))

    expect(screen.queryByTestId("frontier-episode-people-ep-12")).not.toBeInTheDocument()
  })

  it("본문을 가져오지 않고 Notion·YouTube·AI Frontier 아이콘만 보여준다", () => {
    renderPane()

    fireEvent.click(row(/EP12/))

    expect(screen.queryByText("원문과 전체 정리")).not.toBeInTheDocument()
    expect(screen.queryByText(/긴 본문은 Notion에서 읽고/)).not.toBeInTheDocument()
    const links = screen.getByTestId("frontier-episode-source-links-ep-12")
    const notion = within(links).getByRole("link", { name: "Notion에서 본문 읽기" })
    expect(notion).toHaveAttribute("href", "https://www.notion.so/ep12")
    expect(notion.textContent).toBe("")
    const youtube = within(links).getByRole("link", { name: "YouTube에서 영상 보기" })
    expect(youtube).toHaveAttribute(
      "href",
      "https://youtu.be/abc123"
    )
    expect(youtube.textContent).toBe("")
    const frontier = within(links).getByRole("link", {
      name: "AI Frontier에서 전사 읽기",
    })
    expect(frontier).toHaveAttribute("href", "https://example.com/ep12.txt")
    expect(frontier.textContent).toBe("")
    expect(within(links).getAllByRole("link")).toHaveLength(3)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText("본문을 불러오는 중…")).not.toBeInTheDocument()
  })

  it("관련 개념은 영문명과 한글명을 함께 읽을 수 있다", () => {
    renderPane()

    fireEvent.click(row(/EP12/))

    expect(screen.getByRole("button", { name: /Transformer.*트랜스포머/ })).toBeInTheDocument()
  })

  it("light와 dark에서 같은 semantic text token을 사용한다", () => {
    renderPane()
    fireEvent.click(row(/EP12/))

    expect(
      within(screen.getByTestId("frontier-episode-topics-ep-12")).getByText("Scaling · RL")
    ).toHaveClass("text-foreground/80")
    expect(screen.getByTestId("frontier-episode-summary-ep-12")).toHaveClass("text-foreground/80")
    expect(screen.queryByText("원문과 전체 정리")).not.toBeInTheDocument()

    const concept = screen.getByRole("button", { name: /Transformer.*트랜스포머/ })
    expect(concept).toHaveClass("text-purple-800")
    expect(concept).toHaveClass("dark:text-purple-100")
    expect(concept).not.toHaveClass("text-purple-100")
  })
})

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
    expect(button).not.toHaveTextContent("2026-05-02")
    expect(button).not.toHaveTextContent("검토 완료")

    fireEvent.click(button)
    const detail = screen.getByRole("region", { name: "스케일링 법칙의 끝" })
    expect(detail).toHaveTextContent("2026-05-02")
    expect(detail).toHaveTextContent("검토 완료")
  })

  it("검토되지 않은 에피소드는 미검토로 구분한다", () => {
    renderPane({ episodes: [makeEpisode({ reviewed: false })] })

    fireEvent.click(row(/EP12/))
    expect(screen.getByRole("region", { name: "스케일링 법칙의 끝" })).toHaveTextContent("미검토")
  })

  it("토픽은 2개까지만 노출하고 나머지는 +N으로 접는다", () => {
    renderPane()

    fireEvent.click(row(/EP12/))

    const topics = within(screen.getByTestId("frontier-episode-topics-ep-12"))
    expect(topics.getByText("Scaling · RL")).toBeInTheDocument()
    expect(topics.queryByText("Agents")).not.toBeInTheDocument()
    expect(topics.getByText("+2")).toBeInTheDocument()
  })

  it("연결된 Concept 개수를 줄 위에서 바로 보여준다", () => {
    renderPane()

    fireEvent.click(row(/EP12/))
    expect(screen.getByTestId("frontier-episode-concept-count-ep-12")).toHaveTextContent("1")

    fireEvent.click(row(/EP11/))
    expect(screen.getByTestId("frontier-episode-concept-count-ep-11")).toHaveTextContent("0")
  })

  it("에피소드가 없으면 비어 있음을 직접 알린다", () => {
    renderPane({ episodes: [] })

    expect(screen.getByText("표시할 에피소드가 없습니다.")).toBeInTheDocument()
  })
})

describe("EpisodesPane 펼치기와 원문 이동", () => {
  it("펼치기 전에는 요약 영역을 만들지 않는다", () => {
    renderPane()

    expect(row(/EP12/)).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByTestId("frontier-episode-summary-ep-12")).not.toBeInTheDocument()
    expect(screen.queryByTestId("frontier-episode-source-links-ep-12")).not.toBeInTheDocument()
  })

  it("선택된 에피소드는 처음부터 펼쳐 원문 이동을 보여준다", () => {
    renderPane({ selectedEpisodeId: "ep-12" })

    expect(row(/EP12/)).toHaveAttribute("aria-expanded", "true")
    expect(row(/EP11/)).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByRole("link", { name: "Notion에서 본문 읽기" })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
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

describe("EpisodesPane 출처 결측", () => {
  it("YouTube/전사 링크가 없으면 링크를 만들지 않는다", () => {
    renderPane({ episodes: [makeEpisode({ youtube: null, transcriptSource: null, topics: [] })] })

    fireEvent.click(row(/EP12/))

    expect(screen.queryByRole("link", { name: /YouTube/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /전사/ })).not.toBeInTheDocument()
    expect(screen.queryByTestId("frontier-episode-topics-ep-12")).not.toBeInTheDocument()
  })

  it("전사 출처는 주소 형식과 관계없이 표시하지 않는다", () => {
    renderPane({ episodes: [makeEpisode({ transcriptSource: "javascript:alert(1)" })] })

    fireEvent.click(row(/EP12/))

    expect(screen.queryByRole("link", { name: /전사/ })).not.toBeInTheDocument()
    expect(screen.queryByText("javascript:alert(1)")).not.toBeInTheDocument()
  })

  it("외부 링크는 새 탭에서 안전하게 연다", () => {
    renderPane()

    fireEvent.click(row(/EP12/))
    const youtube = screen.getByRole("link", { name: "YouTube에서 영상 보기" })

    expect(youtube).toHaveAttribute("href", "https://youtu.be/abc123")
    expect(youtube).toHaveAttribute("target", "_blank")
    expect(youtube).toHaveAttribute("rel", expect.stringContaining("noopener"))
    expect(youtube).toHaveAttribute("rel", expect.stringContaining("noreferrer"))
  })

  it("목록 Episode는 자료 가져오기 버튼으로 전체 수집을 시작한다", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      pageId: "ep-12",
      episodeNumber: 12,
      status: "완료",
      conceptsCreated: 3,
      conceptsUpdated: 1,
    }), { status: 200 }))
    let signalImported: (() => void) | undefined
    const imported = new Promise<void>((resolve) => {
      signalImported = resolve
    })
    const onEpisodeImported = vi.fn(async () => {
      signalImported?.()
    })
    renderPane({
      episodes: [makeEpisode({ status: "목록", summary: null })],
      onEpisodeImported,
    })
    fireEvent.click(row(/EP12/))

    const importButton = screen.getByRole("button", { name: "자료 가져오기" })
    await act(async () => {
      fireEvent.click(importButton)
      await imported
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/andrej/frontier/episodes/ep-12/import",
      { method: "POST" }
    )
    expect(onEpisodeImported).toHaveBeenCalledOnce()
  })
})

describe("EpisodesPane Concept 이동", () => {
  it("연결된 Concept 카드는 전달받은 네비게이션을 호출한다", () => {
    const { onConceptNavigate } = renderPane()

    fireEvent.click(row(/EP12/))
    const chip = screen.getByRole("button", { name: /Transformer.*트랜스포머/ })
    fireEvent.click(chip)

    expect(onConceptNavigate).toHaveBeenCalledTimes(1)
    expect(onConceptNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }))
  })

  it("연결된 Concept이 없으면 관련 개념 영역을 만들지 않는다", () => {
    renderPane({ concepts: [] })

    fireEvent.click(row(/EP12/))

    expect(screen.queryByTestId("frontier-episode-concepts-ep-12")).not.toBeInTheDocument()
  })
})
