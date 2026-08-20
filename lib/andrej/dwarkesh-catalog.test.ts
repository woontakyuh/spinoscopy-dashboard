import { describe, expect, it, vi } from "vitest"

import {
  fetchDwarkeshCatalog,
  fetchDwarkeshEpisode,
  parseDwarkeshArchive,
  DwarkeshTranscriptNotReadyError,
  parseDwarkeshEpisode,
} from "./dwarkesh-catalog"

const ARCHIVE = [
  {
    id: 210737923,
    title: "Ryan Greenblatt – What happens once AI can automate AI research?",
    type: "podcast",
    slug: "ryan-greenblatt",
    post_date: "2026-08-11T16:31:23.667Z",
    canonical_url: "https://www.dwarkesh.com/p/ryan-greenblatt",
    podcast_duration: 7951.5166,
    subtitle: "A debate about recursive self-improvement.",
  },
  {
    id: 208928024,
    title: "Why compute might get 10x+ more expensive",
    type: "newsletter",
    slug: "why-compute-might-get-10x-more-expensive",
    post_date: "2026-07-29T15:01:35.449Z",
    canonical_url: "https://www.dwarkesh.com/p/why-compute-might-get-10x-more-expensive",
    podcast_duration: null,
    subtitle: "An essay, not a podcast.",
  },
] as const

const EPISODE = {
  id: 187852154,
  title: "Dario Amodei — \"We are near the end of the exponential\"",
  type: "podcast",
  slug: "dario-amodei-2",
  post_date: "2026-02-13T16:46:36.668Z",
  canonical_url: "https://www.dwarkesh.com/p/dario-amodei-2",
  podcast_duration: 8539.873,
  subtitle: "\"That's why I'm sending this message of urgency\"",
  body_html: `
    <p>Episode introduction.</p>
    <p>Watch on <a href="https://youtu.be/n1E9IZfvGMA">YouTube</a>.</p>
    <h2><strong>Timestamps</strong></h2>
    <p>(00:00:00) - What exactly are we scaling?</p>
    <h3><span><strong>Transcript</strong></span></h3>
    <h3>00:00:00 - What exactly are we scaling?</h3>
    <p><strong>Dwarkesh Patel</strong></p>
    <p>What has been the biggest update?</p>
    <p><strong>Dario Amodei</strong></p>
    <p>The exponential went about as expected.</p>
  `,
} as const

describe("Dwarkesh 공식 카탈로그", () => {
  it("공개 archive에서 podcast만 수집 모델로 바꾼다", () => {
    expect(parseDwarkeshArchive(ARCHIVE)).toEqual([
      {
        source: "dwarkesh",
        reference: "DWARKESH:RYAN-GREENBLATT",
        episodeNumber: null,
        name: "Ryan Greenblatt – What happens once AI can automate AI research?",
        officialUrl: "https://www.dwarkesh.com/p/ryan-greenblatt",
        published: "2026-08-11",
        duration: "PT2H12M32S",
        youtube: null,
        summary: "A debate about recursive self-improvement.",
      },
    ])
  })

  it("newsletter가 섞이면 20개 podcast target을 채울 때까지 페이지네이션한다", async () => {
    const second = {
      ...ARCHIVE[0],
      slug: "dario-amodei-2",
      title: "Dario Amodei",
      canonical_url: "https://www.dwarkesh.com/p/dario-amodei-2",
    }
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const offset = Number(new URL(String(input)).searchParams.get("offset"))
      return Response.json(offset === 0 ? ARCHIVE : [second, ARCHIVE[1]])
    })

    const catalog = await fetchDwarkeshCatalog(fetchImpl, 2, 2)

    expect(catalog).toHaveLength(2)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("pagination overlap은 canonical slug로 dedupe하고 필요한 podcast window에서 멈춘다", async () => {
    const second = {
      ...ARCHIVE[0],
      slug: "second-episode",
      canonical_url: "https://www.dwarkesh.com/p/second-episode",
    }
    const third = {
      ...ARCHIVE[0],
      slug: "third-episode",
      canonical_url: "https://www.dwarkesh.com/p/third-episode",
    }
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const offset = Number(new URL(String(input)).searchParams.get("offset"))
      return Response.json(offset === 0 ? [ARCHIVE[0], second] : [second, third])
    })

    const catalog = await fetchDwarkeshCatalog(fetchImpl, 2, 3)

    expect(catalog.map(({ reference }) => reference)).toEqual([
      "DWARKESH:RYAN-GREENBLATT",
      "DWARKESH:SECOND-EPISODE",
      "DWARKESH:THIRD-EPISODE",
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("short archive page에서 즉시 멈춰 20-row window를 위해 빈 페이지까지 증폭하지 않는다", async () => {
    const fetchImpl = vi.fn(async () => Response.json([ARCHIVE[0]]))

    await fetchDwarkeshCatalog(fetchImpl, 20, 20)

    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it("빈 subtitle은 카탈로그 전체를 버리지 않고 설명 없음으로 처리한다", () => {
    const [episode] = parseDwarkeshArchive([{
      ...ARCHIVE[0],
      subtitle: "",
    }])

    expect(episode?.summary).toBeNull()
  })
})

describe("Dwarkesh 공식 전사", () => {
  it("상세 API의 Transcript 구간과 YouTube 링크를 파싱한다", () => {
    const episode = parseDwarkeshEpisode(
      EPISODE,
      "https://www.dwarkesh.com/p/dario-amodei-2"
    )

    expect(episode).toEqual({
      source: "dwarkesh",
      reference: "DWARKESH:DARIO-AMODEI-2",
      episodeNumber: null,
      name: "Dario Amodei — \"We are near the end of the exponential\"",
      officialUrl: "https://www.dwarkesh.com/p/dario-amodei-2",
      published: "2026-02-13",
      duration: "PT2H22M20S",
      youtube: "https://www.youtube.com/watch?v=n1E9IZfvGMA",
      summary: "\"That's why I'm sending this message of urgency\"",
      transcript: [
        "00:00:00 - What exactly are we scaling?",
        "Dwarkesh Patel",
        "What has been the biggest update?",
        "Dario Amodei",
        "The exponential went about as expected.",
      ].join("\n"),
    })
  })

  it("Transcript heading이 없는 future item은 typed not-ready error다", () => {
    expect(() => parseDwarkeshEpisode(
      { ...EPISODE, body_html: "<p>Metadata only.</p>" },
      "https://www.dwarkesh.com/p/dario-amodei-2"
    )).toThrow(DwarkeshTranscriptNotReadyError)
  })

  it("공식 slug와 상세 응답 slug가 다르면 거부한다", () => {
    expect(() =>
      parseDwarkeshEpisode(EPISODE, "https://www.dwarkesh.com/p/other")
    ).toThrow("Dwarkesh")
  })

  it("공식 상세 endpoint에서 선택한 전사를 가져온다", async () => {
    const fetchImpl = vi.fn(async () => Response.json(EPISODE))

    const episode = await fetchDwarkeshEpisode(
      "https://www.dwarkesh.com/p/dario-amodei-2",
      fetchImpl
    )

    expect(episode.transcript).toContain("The exponential went about as expected.")
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://dwarkesh.substack.com/api/v1/posts/dario-amodei-2",
      expect.objectContaining({ cache: "no-store" })
    )
  })
})
