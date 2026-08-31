import { fireEvent, screen, within } from "@testing-library/react"
import { expect, it } from "vitest"
import { renderNavMap } from "./render-nav-map"

export function registerComparisonTests() {
  it("compares self with an athlete tactical map", async () => {
    renderNavMap()

    const athleteSelect = await screen.findByRole("combobox", { name: "선수 전술맵" })
    expect(
      within(athleteSelect).getByRole("option", { name: "Roger Gracie" }),
    ).toBeInTheDocument()

    fireEvent.change(athleteSelect, { target: { value: "Roger Gracie" } })
    expect(screen.getByRole("img", { name: "Brazil flag" })).toBeInTheDocument()
    const root = screen.getByTestId("sensei-navmap")
    expect(root).toHaveAttribute("data-athlete", "Roger Gracie")

    fireEvent.click(screen.getByRole("button", { name: "선수와 비교" }))

    const selfPane = screen.getByTestId("navmap-pane-self")
    const athletePane = screen.getByTestId("navmap-pane-athlete")
    expect(selfPane).toHaveTextContent("나")
    expect(athletePane).toHaveTextContent("Roger Gracie")
    expect(within(athletePane).getByRole("img", { name: "Brazil flag" })).toBeVisible()
    expect(athletePane).toHaveTextContent("Invisible Guard")

    const selfHalfGuard = within(selfPane).getByRole("button", { name: "하프 가드 스킬 보기" })
    const athleteHalfGuard = within(athletePane).getByRole("button", {
      name: "하프 가드 스킬 보기",
    })
    expect(selfHalfGuard).not.toHaveAttribute(
      "data-node-radius",
      athleteHalfGuard.getAttribute("data-node-radius"),
    )
  })
}
