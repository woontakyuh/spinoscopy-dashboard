// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

import type { AiFrontierConcept } from "@/lib/types/ai-frontier"

import { ConceptsPane } from "./ConceptsPane"
import type { FrontierCategoryCount } from "./frontier-view"

function makeConcept(overrides: Partial<AiFrontierConcept> = {}): AiFrontierConcept {
  return {
    id: "c1",
    term: "Transformer",
    korean: "트랜스포머",
    category: "Architecture",
    verified: "전사 기반",
    oneLine: "어텐션으로 시퀀스를 병렬 처리하는 신경망 구조.",
    intuition: "모든 토큰이 서로를 동시에 본다.",
    whyItMatters: "현대 LLM 전부가 이 위에 서 있다.",
    source: "EP12 05:12",
    episodes: [{ ref: "EP12", available: true, pageId: "ep-12" }],
    ...overrides,
  }
}

const categoryCounts: FrontierCategoryCount[] = [
  { category: "Architecture", count: 3 },
  { category: "Training", count: 2 },
]

function renderPane(overrides: Partial<ComponentProps<typeof ConceptsPane>> = {}) {
  const onCategoryChange = vi.fn()
  const onEpisodeNavigate = vi.fn()
  render(
    <ConceptsPane
      concepts={[makeConcept()]}
      categoryCounts={categoryCounts}
      currentCategory={null}
      selectedConceptId={null}
      onCategoryChange={onCategoryChange}
      onEpisodeNavigate={onEpisodeNavigate}
      {...overrides}
    />
  )
  return { onCategoryChange, onEpisodeNavigate }
}

const toggle = () => screen.getByRole("button", { name: /Transformer/ })

// 카테고리 이름은 카드 안 배지에도 나오므로, 칩 조회는 칩 줄 안으로 한정한다.
const chips = () => within(screen.getByTestId("frontier-category-chips"))

describe("ConceptsPane 카테고리 칩", () => {
  it("카테고리별 개수를 칩으로 보여준다", () => {
    renderPane()

    expect(chips().getByRole("button", { name: /Architecture/ })).toHaveTextContent("3")
    expect(chips().getByRole("button", { name: /Training/ })).toHaveTextContent("2")
  })

  it("칩을 누르면 해당 카테고리로 onCategoryChange를 호출한다", () => {
    const { onCategoryChange } = renderPane()

    fireEvent.click(chips().getByRole("button", { name: /Training/ }))

    expect(onCategoryChange).toHaveBeenCalledWith("Training")
  })

  it("전체 칩은 카테고리를 null로 되돌린다", () => {
    const { onCategoryChange } = renderPane({ currentCategory: "Training" })

    fireEvent.click(chips().getByRole("button", { name: /전체/ }))

    expect(onCategoryChange).toHaveBeenCalledWith(null)
  })

  it("현재 카테고리 칩만 aria-pressed로 활성 상태를 알린다", () => {
    renderPane({ currentCategory: "Training" })

    expect(chips().getByRole("button", { name: /Training/ })).toHaveAttribute("aria-pressed", "true")
    expect(chips().getByRole("button", { name: /Architecture/ })).toHaveAttribute("aria-pressed", "false")
  })
})

describe("ConceptsPane 카드", () => {
  it("용어/한국어/카테고리/Verified 라벨을 함께 보여준다", () => {
    renderPane()

    const card = toggle()
    expect(card).toHaveTextContent("Transformer")
    expect(card).toHaveTextContent("트랜스포머")
    expect(card).toHaveTextContent("Architecture")
    expect(card).toHaveTextContent("전사 기반")
  })

  it("접힌 상태의 한 줄 설명은 clamp 된다", () => {
    renderPane()

    expect(screen.getByTestId("concept-oneline-c1")).toHaveClass("line-clamp-2")
  })

  it("Verified 라벨에 초록색 사실검증 스타일을 쓰지 않는다", () => {
    renderPane()

    // Verified는 사실 검증이 아니라 출처 라벨이라 green/emerald로 칠하면 의미가 왜곡된다.
    expect(screen.getByTestId("concept-verified-c1").className).not.toMatch(/green|emerald/)
  })

  it("개념이 없으면 비어 있음을 직접 알린다", () => {
    renderPane({ concepts: [], categoryCounts: [] })

    expect(screen.getByText("표시할 개념이 없습니다.")).toBeInTheDocument()
  })
})

describe("ConceptsPane 펼치기", () => {
  it("실제 button과 aria-expanded로 접힘 상태를 노출한다", () => {
    renderPane()

    const button = toggle()
    expect(button.tagName).toBe("BUTTON")
    expect(button).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("모든 토큰이 서로를 동시에 본다.")).not.toBeInTheDocument()
  })

  it("펼치면 Intuition / Why It Matters / source가 드러난다", () => {
    renderPane()

    fireEvent.click(toggle())

    expect(toggle()).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("모든 토큰이 서로를 동시에 본다.")).toBeInTheDocument()
    expect(screen.getByText("현대 LLM 전부가 이 위에 서 있다.")).toBeInTheDocument()
    expect(screen.getByText("EP12 05:12")).toBeInTheDocument()
  })

  it("선택된 개념은 처음부터 펼쳐진 상태로 렌더링된다", () => {
    renderPane({ selectedConceptId: "c1" })

    expect(toggle()).toHaveAttribute("aria-expanded", "true")
  })

  it("키보드로 도달 가능한 네이티브 button이다", () => {
    renderPane()

    const button = toggle()
    button.focus()

    // 네이티브 button은 Enter/Space 활성화를 브라우저가 보장한다.
    // jsdom은 그 합성을 하지 않으므로 여기서는 활성화 의미를 지키는 조건을 검증한다.
    expect(button).toHaveFocus()
    expect(button).toHaveAttribute("type", "button")
    expect(button).not.toBeDisabled()
    expect(button).not.toHaveAttribute("tabindex", "-1")
  })

  it("선택 항목의 빈 필드는 섹션 자체를 만들지 않는다", () => {
    renderPane({
      concepts: [
        makeConcept({
          korean: null,
          verified: null,
          oneLine: null,
          intuition: null,
          whyItMatters: "",
          source: "   ",
        }),
      ],
    })

    fireEvent.click(toggle())

    expect(screen.queryByText("Intuition")).not.toBeInTheDocument()
    expect(screen.queryByText("Why It Matters")).not.toBeInTheDocument()
    expect(screen.queryByText("Source")).not.toBeInTheDocument()
    expect(screen.queryByTestId("concept-verified-c1")).not.toBeInTheDocument()
  })
})

describe("ConceptsPane 에피소드 참조", () => {
  it("연결된 Episode 칩은 전달받은 네비게이션을 호출한다", () => {
    const { onEpisodeNavigate } = renderPane()

    fireEvent.click(screen.getByRole("button", { name: /EP12/ }))

    expect(onEpisodeNavigate).toHaveBeenCalledWith({ ref: "EP12", available: true, pageId: "ep-12" })
  })

  it("orphan 참조는 사라지지 않고 비활성으로 남는다", () => {
    const { onEpisodeNavigate } = renderPane({
      concepts: [
        makeConcept({
          episodes: [
            { ref: "EP12", available: true, pageId: "ep-12" },
            { ref: "EP45", available: false, pageId: null },
          ],
        }),
      ],
    })

    const orphan = screen.getByRole("button", { name: /EP45/ })
    expect(orphan).toBeVisible()
    expect(orphan).toBeDisabled()
    expect(orphan).toHaveTextContent("현재 DB에 없음")

    fireEvent.click(orphan)
    expect(onEpisodeNavigate).not.toHaveBeenCalled()
  })
})
