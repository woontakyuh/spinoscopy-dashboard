import { describe, it, expect } from "vitest"
import { dropboxPath, parseCreateLinkResponse } from "./dropbox"

describe("dropboxPath", () => {
  it("dir 끝 슬래시를 정리하고 .pdf를 붙인다", () => {
    expect(dropboxPath("/Scholar PDFs", "10.1_x")).toBe("/Scholar PDFs/10.1_x.pdf")
    expect(dropboxPath("/Scholar PDFs/", "10.1_x")).toBe("/Scholar PDFs/10.1_x.pdf")
  })
})

describe("parseCreateLinkResponse", () => {
  it("url을 뽑는다", () => {
    expect(parseCreateLinkResponse({ url: "https://www.dropbox.com/s/a/x.pdf?dl=0" })).toBe(
      "https://www.dropbox.com/s/a/x.pdf?dl=0"
    )
  })
  it("이미 존재(409) 응답의 기존 링크를 뽑는다", () => {
    const err = {
      error: {
        ".tag": "shared_link_already_exists",
        shared_link_already_exists: { metadata: { url: "https://www.dropbox.com/s/b/x.pdf" } },
      },
    }
    expect(parseCreateLinkResponse(err)).toBe("https://www.dropbox.com/s/b/x.pdf")
  })
  it("없으면 null", () => {
    expect(parseCreateLinkResponse({})).toBeNull()
  })
})
