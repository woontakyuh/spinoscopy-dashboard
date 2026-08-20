import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { expect, it } from "vitest"
import { renderNavMap } from "./render-nav-map"

export function registerTrainingAndScoringTests() {
  it("shows record evidence on a derived position finish", async () => {
    renderNavMap()

    fireEvent.click(await screen.findByRole("button", { name: "하프 가드 스킬 보기" }))

    const detail = await screen.findByTestId("navmap-detail")
    expect(within(detail).getByText("하프 가드 기무라")).toBeInTheDocument()
    expect(within(detail).getByText("기록 1")).toBeInTheDocument()
  })

  it("shows record-backed HQ passing branches", async () => {
    renderNavMap()

    fireEvent.click(await screen.findByRole("button", { name: "본부 자세 스킬 보기" }))

    const detail = await screen.findByTestId("navmap-detail")
    expect(within(detail).getByText("본부 자세 니슬라이드")).toBeInTheDocument()
    expect(within(detail).getByText("본부 자세 스매시")).toBeInTheDocument()
    expect(within(detail).getAllByText("기록 1")).toHaveLength(2)
  })

  it("renders scored transitions at rest from the active profile", async () => {
    renderNavMap()

    const advance = await screen.findByRole("button", { name: "언더훅 회복 전이 보기" })
    const pass = await screen.findByRole("button", { name: "본부 자세 니슬라이드 전이 보기" })
    const halfGuard = screen.getByRole("button", { name: "하프 가드 스킬 보기" })
    const headquarters = screen.getByRole("button", { name: "본부 자세 스킬 보기" })

    expect(advance).toHaveAttribute("data-transition-category", "advance")
    expect(pass).toHaveAttribute("data-transition-category", "pass")
    await waitFor(() => {
      expect(advance).not.toHaveAttribute("data-edge-width", pass.getAttribute("data-edge-width"))
      expect(halfGuard).not.toHaveAttribute(
        "data-node-radius",
        headquarters.getAttribute("data-node-radius"),
      )
    })

    fireEvent.pointerEnter(pass)
    expect(pass).toHaveAttribute("data-emphasis", "active")
  })

  it("renders one node for each physical control situation", async () => {
    renderNavMap()

    for (const name of ["사이드 컨트롤", "니온벨리", "마운트", "백 컨트롤", "터틀"]) {
      expect(await screen.findByRole("button", { name: `${name} 스킬 보기` })).toBeInTheDocument()
    }
    for (const name of ["사이드 당함", "니온벨리 당함", "마운트 당함", "백 당함", "터틀 방어"]) {
      expect(screen.queryByRole("button", { name: `${name} 스킬 보기` })).not.toBeInTheDocument()
    }
  })

  it("keeps defensive escapes on the merged situation node", async () => {
    renderNavMap()

    fireEvent.click(await screen.findByRole("button", { name: "마운트 스킬 보기" }))

    const detail = await screen.findByTestId("navmap-detail")
    expect(within(detail).getByText("브릿지 이스케이프")).toBeInTheDocument()
  })
}
