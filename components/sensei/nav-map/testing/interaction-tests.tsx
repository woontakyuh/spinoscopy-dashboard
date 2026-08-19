import { fireEvent, screen, within } from "@testing-library/react"
import { expect, it } from "vitest"
import { renderNavMap } from "./render-nav-map"
import { setCompactViewport } from "./test-environment"

export function registerInteractionTests() {
  it("supports keyboard node selection and exposes the inspector on mobile", async () => {
    renderNavMap()

    const node = await screen.findByRole("button", { name: "하프 가드 스킬 보기" })
    fireEvent.keyDown(node, { key: "Enter" })

    expect(screen.getByRole("button", { name: "Focus 모드" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    const inspector = screen.getByTestId("navmap-detail")
    expect(inspector).toHaveAttribute("data-selected-node", "hg")
    expect(inspector).not.toHaveClass("hidden")

    fireEvent.click(within(inspector).getByRole("button", { name: "선택 해제" }))
    expect(screen.queryByTestId("navmap-detail")).not.toBeInTheDocument()
  })

  it("reveals depth-two nodes and opens transition context", async () => {
    renderNavMap()

    fireEvent.click(await screen.findByRole("button", { name: "하프 가드 스킬 보기" }))
    expect(screen.queryByRole("button", { name: "엑스 가드 스킬 보기" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Focus depth 2" }))
    expect(screen.getByRole("button", { name: "엑스 가드 스킬 보기" })).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: "데라히바 전환 전이 보기" }))
    const detail = screen.getByTestId("navmap-transition-detail")
    expect(detail).toHaveTextContent("상대가 일어설 때")
  })

  it("keeps map coordinates in Focus and toggles the selected node back to Map", async () => {
    renderNavMap()

    const halfGuard = await screen.findByRole("button", { name: "하프 가드 스킬 보기" })
    const kneeShield = screen.getByRole("button", { name: "니쉴드 스킬 보기" })
    const halfGuardTransform = halfGuard.getAttribute("transform")
    const kneeShieldTransform = kneeShield.getAttribute("transform")

    fireEvent.click(halfGuard)

    expect(screen.getByRole("button", { name: "Focus 모드" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: "하프 가드 스킬 보기" })).toHaveAttribute(
      "transform",
      halfGuardTransform?.replace("scale(1)", "scale(1.8)"),
    )
    expect(screen.getByRole("button", { name: "니쉴드 스킬 보기" })).toHaveAttribute(
      "transform",
      kneeShieldTransform?.replace("scale(1)", "scale(1.45)"),
    )

    fireEvent.click(screen.getByRole("button", { name: "니쉴드 스킬 보기" }))

    expect(screen.getByRole("button", { name: "하프 가드 스킬 보기" })).toHaveAttribute(
      "transform",
      halfGuardTransform?.replace("scale(1)", "scale(1.45)"),
    )
    expect(screen.getByRole("button", { name: "니쉴드 스킬 보기" })).toHaveAttribute(
      "transform",
      kneeShieldTransform?.replace("scale(1)", "scale(1.8)"),
    )

    fireEvent.click(screen.getByRole("button", { name: "니쉴드 스킬 보기" }))

    expect(screen.getByRole("button", { name: "Map 모드" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.queryByTestId("navmap-detail")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "엑스 가드 스킬 보기" })).toBeVisible()
    expect(screen.getByRole("button", { name: "하프 가드 스킬 보기" })).toHaveAttribute(
      "transform",
      halfGuardTransform,
    )
  })

  it("enlarges compact Focus nodes around their unchanged coordinates", async () => {
    setCompactViewport(true)
    renderNavMap()

    const halfGuard = await screen.findByRole("button", { name: "하프 가드 스킬 보기" })
    const mapTransform = halfGuard.getAttribute("transform")
    expect(mapTransform).toMatch(/^translate\(.+\) scale\(1\)$/)

    fireEvent.click(halfGuard)

    expect(screen.getByRole("button", { name: "하프 가드 스킬 보기" })).toHaveAttribute(
      "transform",
      mapTransform?.replace("scale(1)", "scale(2.5)"),
    )

    fireEvent.click(screen.getByRole("button", { name: "하프 가드 스킬 보기" }))
    expect(screen.getByRole("button", { name: "하프 가드 스킬 보기" })).toHaveAttribute(
      "transform",
      mapTransform,
    )
  })
}
