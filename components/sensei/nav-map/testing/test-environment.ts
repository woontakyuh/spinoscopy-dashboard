import { beforeEach, vi } from "vitest"

export function setCompactViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches,
      media: "(max-width: 639px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

export function registerNavMapTestEnvironment() {
  beforeEach(() => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      length: 0,
    }
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storage,
    })
    setCompactViewport(false)
    Element.prototype.setPointerCapture = vi.fn()
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        const body = url.includes("/stats")
          ? {
              stats: {
                combined: {
                  attributes: {
                    guard: 40,
                    passing: 20,
                    control: 30,
                    finishing: 10,
                    takedowns: 15,
                    legLocks: 5,
                  },
                },
              },
              tagFrequencies: { HG: 4 },
            }
          : url.endsWith("/api/notion/sensei")
            ? [
                {
                  id: "half-kimura-class",
                  title: "하프가드 기무라",
                  sessionType: "class",
                  date: "2026-07-27",
                  instructor: "",
                  gym: "",
                  classTags: ["HG", "Kimura"],
                  sparringTags: [],
                  studyTags: [],
                  note: "",
                  url: "",
                },
                {
                  id: "hq-pass-class",
                  title: "패스 그립 선점 → 니슬라이드/스매시",
                  sessionType: "class",
                  date: "2026-07-16",
                  instructor: "",
                  gym: "",
                  classTags: ["HQ", "KCP"],
                  sparringTags: [],
                  studyTags: [],
                  note: "갈래 1 니슬라이드. 갈래 2 스매시.",
                  url: "",
                },
              ]
            : []
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }),
    )
  })
}
