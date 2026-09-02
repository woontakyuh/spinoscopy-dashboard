import { describe, it, expect } from "vitest"
import {
  folderDate, isVideoFile, countClips, normalizeShareUrl,
  unmatchedFolders, videoLabel, type ClassVideoFolder,
} from "./index"

describe("folderDate", () => {
  it("날짜만 있는 폴더", () => {
    expect(folderDate("2026-08-19")).toBe("2026-08-19")
  })

  it("뒤에 관장님·룰셋이 붙어도 날짜만 뽑는다", () => {
    expect(folderDate("2026-01-21 김진우 No-gi")).toBe("2026-01-21")
    expect(folderDate("2024-05-22 No-gi")).toBe("2024-05-22")
  })

  it("앞뒤 공백을 견딘다", () => {
    expect(folderDate("  2026-03-11 No-gi ")).toBe("2026-03-11")
  })

  it("날짜로 시작하지 않으면 null", () => {
    expect(folderDate("캐릭터")).toBeNull()
    expect(folderDate("Keenan Lapel Encyclopedia")).toBeNull()
  })

  it("말이 안 되는 월·일은 거른다", () => {
    expect(folderDate("2026-13-01")).toBeNull()
    expect(folderDate("2026-00-11")).toBeNull()
    expect(folderDate("2026-08-00")).toBeNull()
    expect(folderDate("2026-08-32")).toBeNull()
  })
})

describe("isVideoFile / countClips", () => {
  it("확장자 대소문자를 가리지 않는다 — 아이폰은 .MOV 로 준다", () => {
    expect(isVideoFile("IMG_8643.MOV")).toBe(true)
    expect(isVideoFile("clip.mp4")).toBe(true)
    expect(isVideoFile("메모.txt")).toBe(false)
  })

  it("하위 폴더와 비영상은 세지 않는다", () => {
    const entries = [
      { name: "IMG_1.MOV" }, { name: "IMG_2.mp4" },
      { name: "메모.txt" },
      { name: "원본", ".tag": "folder" as const },
      { name: "a.MOV", ".tag": "folder" as const }, // 폴더인데 이름이 영상 같은 경우
    ]
    expect(countClips(entries)).toBe(2)
  })

  it("빈 폴더는 0", () => {
    expect(countClips([])).toBe(0)
  })
})

describe("normalizeShareUrl", () => {
  it("dl=1 은 다운로드가 시작되므로 dl=0 으로 바꾼다", () => {
    expect(normalizeShareUrl("https://www.dropbox.com/scl/fo/x/y?rlkey=abc&dl=1"))
      .toBe("https://www.dropbox.com/scl/fo/x/y?rlkey=abc&dl=0")
  })

  it("이미 dl=0 이면 그대로", () => {
    const u = "https://www.dropbox.com/scl/fo/x/y?rlkey=abc&dl=0"
    expect(normalizeShareUrl(u)).toBe(u)
  })

  it("dl=1 이 맨 끝에 있어도 바꾼다", () => {
    expect(normalizeShareUrl("https://www.dropbox.com/scl/fo/x?dl=1"))
      .toBe("https://www.dropbox.com/scl/fo/x?dl=0")
  })

  it("dl 파라미터가 없으면 건드리지 않는다", () => {
    const u = "https://www.dropbox.com/scl/fo/x/y?rlkey=abc"
    expect(normalizeShareUrl(u)).toBe(u)
  })
})

describe("unmatchedFolders", () => {
  const f = (date: string): ClassVideoFolder => ({ date, path: `/p/${date}`, clipCount: 3 })

  it("노션 기록이 없는 폴더만 돌려준다", () => {
    const got = unmatchedFolders([f("2024-04-16"), f("2026-08-19")], new Set(["2026-08-19"]))
    expect(got.map((x) => x.date)).toEqual(["2024-04-16"])
  })

  it("전부 매칭되면 빈 배열", () => {
    expect(unmatchedFolders([f("2026-08-19")], new Set(["2026-08-19"]))).toEqual([])
  })
})

describe("videoLabel", () => {
  it("개수를 보여준다", () => {
    expect(videoLabel(5)).toBe("수업 영상 5개")
  })
  it("개수를 모르면 개수 없이", () => {
    expect(videoLabel(0)).toBe("수업 영상")
  })
})
