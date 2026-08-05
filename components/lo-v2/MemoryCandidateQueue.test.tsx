// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { MemoryCandidateQueue } from "./MemoryCandidateQueue"

describe("MemoryCandidateQueue", () => {
  it("loads pending candidates and removes one after approval", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{
          candidateId: "candidate-1",
          name: "니쉴드 언더훅 우선",
          content: "왼쪽 니쉴드에서 언더훅을 먼저 잡는다",
          category: "preference",
          importance: 3,
          sourceReference: "sqlite:lo-turn:turn-1",
          status: "pending",
          createdAt: "2026-08-05T06:00:00.000Z",
          decidedAt: null,
          notionPageId: null,
        }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidate: { candidateId: "candidate-1", status: "approved" },
      }), { status: 200 }))

    render(<MemoryCandidateQueue fetchImpl={fetchImpl} />)

    expect(await screen.findByText("니쉴드 언더훅 우선")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Notion으로 승인" }))
    await waitFor(() => expect(screen.queryByText("니쉴드 언더훅 우선")).not.toBeInTheDocument())
    expect(fetchImpl).toHaveBeenLastCalledWith("/api/lo/memory-candidates", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ candidateId: "candidate-1", decision: "approve" }),
    }))
  })
})
