import { describe, it, expect } from "vitest"
import { laneFor, isTerminal, isPendingMyAction } from "./status"
import type { EditorialStatus } from "@/lib/types/editorial"

describe("laneFor", () => {
  // 2026-08-05 실제 문제: 리뷰 요청 자체를 거절(Declined)했는데 Under Review 레인에
  // 계속 살아 있었다. 분류 체인이 매칭 실패분을 전부 review 로 떨어뜨렸기 때문.
  it("Declined 는 rejected 레인으로 간다", () => {
    expect(laneFor("Declined")).toBe("rejected")
  })

  it("Accepted / Rejected 는 각자 종료 레인", () => {
    expect(laneFor("Accepted")).toBe("accepted")
    expect(laneFor("Rejected")).toBe("rejected")
  })

  it("리뷰 작성 중인 상태는 review", () => {
    for (const s of ["Received", "1st Review", "2nd Review", "3rd Review", "Under Review"] as EditorialStatus[]) {
      expect(laneFor(s)).toBe("review")
    }
  })

  it("리뷰 제출 완료는 review_done", () => {
    for (const s of ["1st Review Done", "2nd Review Done", "3rd Review Done"] as EditorialStatus[]) {
      expect(laneFor(s)).toBe("review_done")
    }
  })

  it("저자 수정 중은 revision", () => {
    for (const s of ["1st Revision", "2nd Revision", "3rd Revision", "Under Revision"] as EditorialStatus[]) {
      expect(laneFor(s)).toBe("revision")
    }
  })

  // 폴백이 review 인 게 애초 버그의 원인이었다. 폴백 자체는 유지하되(모르는 상태는
  // 눈에 띄어야 하니까) 종료 상태가 여기 새는 일이 없도록 위에서 고정한다.
  it("모르는 상태는 review 로 폴백한다", () => {
    expect(laneFor("무언가 새로운 상태" as EditorialStatus)).toBe("review")
  })
})

describe("isTerminal — Declined 포함", () => {
  it("Declined 는 종료 상태다 — 내 액션이 남아있지 않다", () => {
    expect(isTerminal("Declined")).toBe(true)
    expect(isPendingMyAction({ status: "Declined", recommendation: null })).toBe(false)
  })
})
