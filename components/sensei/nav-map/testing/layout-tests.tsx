import { fireEvent, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { renderNavMap } from "./render-nav-map"

export function registerLayoutTests() {
  it("saves and restores named layout presets", async () => {
    renderNavMap()

    const root = await screen.findByTestId("sensei-navmap")
    const canvas = screen.getByTestId("sensei-navmap-canvas")
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      width: 1200,
      height: 720,
      x: 0,
      y: 0,
      top: 0,
      right: 1200,
      bottom: 720,
      left: 0,
      toJSON: () => ({}),
    })
    const node = screen.getByRole("button", { name: "하프 가드 스킬 보기" })
    const defaultTransform = node.getAttribute("transform")

    expect(root).toHaveAttribute("data-layout-preset", "default")
    expect(root).toHaveAttribute("data-layout-dirty", "false")

    fireEvent.pointerDown(node, { button: 0, pointerId: 3, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(canvas, { pointerId: 3, clientX: 170, clientY: 140 })
    fireEvent.pointerUp(canvas, { pointerId: 3 })

    const savedTransform = node.getAttribute("transform")
    expect(savedTransform).not.toBe(defaultTransform)
    expect(root).toHaveAttribute("data-layout-dirty", "true")
    expect(node.querySelectorAll("circle")).toHaveLength(1)

    fireEvent.change(screen.getByRole("textbox", { name: "배치 이름" }), {
      target: { value: "내 하프가드" },
    })
    fireEvent.click(screen.getByRole("button", { name: "현재 배치 저장" }))

    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "sensei-navmap-presets-v1",
      expect.stringContaining("내 하프가드"),
    )
    expect(root).toHaveAttribute("data-layout-preset", "내 하프가드")
    expect(root).toHaveAttribute("data-layout-dirty", "false")

    fireEvent.click(screen.getByRole("button", { name: "Reset node layout" }))
    expect(node).toHaveAttribute("transform", defaultTransform)

    fireEvent.change(screen.getByRole("combobox", { name: "저장된 배치" }), {
      target: { value: "내 하프가드" },
    })
    expect(node).toHaveAttribute("transform", savedTransform)
  })

  it("pins dragged Focus nodes without changing the selection", async () => {
    renderNavMap()

    const canvas = screen.getByTestId("sensei-navmap-canvas")
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      width: 1200,
      height: 840,
      x: 0,
      y: 0,
      top: 0,
      right: 1200,
      bottom: 840,
      left: 0,
      toJSON: () => ({}),
    })

    const node = await screen.findByRole("button", { name: "하프 가드 스킬 보기" })
    const initialTransform = node.getAttribute("transform")
    fireEvent.click(node)
    fireEvent.pointerDown(node, { button: 0, pointerId: 2, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 160, clientY: 130 })
    fireEvent.pointerUp(canvas, { pointerId: 2 })

    expect(node).toHaveAttribute("aria-pressed", "true")
    expect(node).toHaveAttribute("data-pinned", "true")
    expect(node).not.toHaveAttribute("transform", initialTransform)

    fireEvent.click(screen.getByRole("button", { name: "Reset node layout" }))
    expect(node).not.toHaveAttribute("data-pinned")
    expect(node).toHaveAttribute("aria-pressed", "true")
  })

  it("pins dragged Map nodes and resets their saved layout", async () => {
    renderNavMap()

    const canvas = screen.getByTestId("sensei-navmap-canvas")
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      width: 1200,
      height: 720,
      x: 0,
      y: 0,
      top: 0,
      right: 1200,
      bottom: 720,
      left: 0,
      toJSON: () => ({}),
    })

    const node = await screen.findByRole("button", { name: "하프 가드 스킬 보기" })
    fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 140, clientY: 120 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })

    expect(node).toHaveAttribute("data-pinned", "true")

    fireEvent.click(screen.getByRole("button", { name: "Reset node layout" }))
    expect(node).not.toHaveAttribute("data-pinned")
  })
}
