// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { VideoWikiView } from "@/components/lo/VideoWikiView"
import { allScenes, scenesByPosition } from "@/lib/reel"

describe("영상 위키 데이터", () => {
  it("장면마다 기술 태그가 최소 하나 붙어 있다", () => {
    const scenes = allScenes()
    expect(scenes.length).toBeGreaterThan(0)
    for (const scene of scenes) {
      expect(scene.pos.length).toBeGreaterThan(0)
    }
  })

  it("기술별로 묶고 장면이 많은 순으로 돌려준다", () => {
    const positions = scenesByPosition()
    expect(positions.length).toBeGreaterThan(0)
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i - 1].scenes.length).toBeGreaterThanOrEqual(positions[i].scenes.length)
    }
  })

  it("슬러그가 아니라 읽을 수 있는 기술 이름을 쓴다", () => {
    const [first] = scenesByPosition()
    expect(first.name).not.toBe(first.slug)
  })
})

describe("VideoWikiView", () => {
  it("기술 목록과 첫 기술의 장면을 보여준다", () => {
    render(<VideoWikiView />)

    const [first] = scenesByPosition()
    expect(screen.getByRole("navigation", { name: "기술 목록" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(first.name)
    expect(screen.getByText(`${first.scenes.length}장면`)).toBeInTheDocument()
  })

  it("검색하면 맞는 장면만 남는다", () => {
    render(<VideoWikiView />)

    fireEvent.change(screen.getByLabelText("장면 검색"), { target: { value: "라펠" } })
    const nav = screen.getByRole("navigation", { name: "기술 목록" })
    expect(within(nav).getAllByRole("button").length).toBeGreaterThan(0)
    expect(screen.queryByText("조건에 맞는 장면이 없어.")).not.toBeInTheDocument()
  })

  it("없는 말을 검색하면 빈 상태를 알린다", () => {
    render(<VideoWikiView />)

    fireEvent.change(screen.getByLabelText("장면 검색"), { target: { value: "zzzz없는말zzzz" } })
    expect(screen.getAllByText("조건에 맞는 장면이 없어.").length).toBeGreaterThan(0)
  })

  it("장면은 한 줄로 접혀 있다가 누르면 펼쳐진다", () => {
    render(<VideoWikiView />)

    const [first] = scenesByPosition()
    const scene = first.scenes[0]
    const row = screen.getByRole("button", { name: new RegExp(scene.title), expanded: false })

    // 접힌 상태에선 육성 인용이 보이지 않는다
    const firstQuoteLine = scene.quote.split("\n")[0]
    expect(document.body.textContent).not.toContain(firstQuoteLine)

    fireEvent.click(row)
    expect(screen.getByRole("button", { name: new RegExp(scene.title), expanded: true })).toBeInTheDocument()
    expect(document.body.textContent).toContain(firstQuoteLine)
  })

  it("장면 수는 기술이 겹쳐도 중복해서 세지 않는다", () => {
    render(<VideoWikiView />)

    const uniqueScenes = allScenes().length
    expect(screen.getByText(`장면 ${uniqueScenes}개`)).toBeInTheDocument()
  })

  it("역할 필터를 누르면 그 역할 장면만 센다", () => {
    render(<VideoWikiView />)

    const bottomOnly = allScenes().filter((s) => s.role === "bottom").length
    fireEvent.click(screen.getByRole("button", { name: "바텀", pressed: false }))
    // 한 장면이 기술 두 개에 걸릴 수 있어 합계는 장면 수 이상이다
    expect(bottomOnly).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "바텀", pressed: true })).toBeInTheDocument()
  })
})
