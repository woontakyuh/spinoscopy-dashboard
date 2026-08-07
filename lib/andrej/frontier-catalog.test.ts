import { describe, expect, it, vi } from "vitest"

import {
  fetchAiFrontierCatalog,
  fetchAiFrontierEpisode,
  parseAiFrontierEpisodePage,
  parseAiFrontierSitemap,
} from "./frontier-catalog"

const SITEMAP = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://aifrontier.kr/en/episodes/ep107</loc></url>
  <url><loc>https://aifrontier.kr/ko/episodes/ep45</loc></url>
  <url><loc>https://aifrontier.kr/ko/episodes/ep107</loc></url>
  <url><loc>https://evil.example/ko/episodes/ep999</loc></url>
  <url><loc>https://aifrontier.kr/ko/about</loc></url>
</urlset>`

const EPISODE_HTML = `<!doctype html>
<html>
  <head>
    <script type="application/ld+json">
      {
        "@type": "PodcastEpisode",
        "name": "EP 107: 미래란 언제나 예측불허",
        "description": "한 줄 공식 설명",
        "datePublished": "2026-08-02",
        "duration": "PT1H55M37S",
        "episodeNumber": 107,
        "url": "https://aifrontier.kr/ko/episodes/ep107",
        "associatedMedia": {
          "@type": "VideoObject",
          "embedUrl": "https://www.youtube.com/embed/tgCoPeWsTU8"
        }
      }
    </script>
  </head>
  <body>
    <section class="prose prose-transcript max-w-none">
      <h2>00:00 시작</h2>
      <p><strong>노정석:</strong> 첫 문장 &amp; 설명입니다.</p>
      <p>최승준: 두 번째 문장입니다.</p>
    </section>
  </body>
</html>`

describe("AI Frontier 공식 카탈로그", () => {
  it("sitemap에서 한국어 Episode URL만 최신순으로 고른다", () => {
    expect(parseAiFrontierSitemap(SITEMAP)).toEqual([
      "https://aifrontier.kr/ko/episodes/ep107",
      "https://aifrontier.kr/ko/episodes/ep45",
    ])
  })

  it("JSON-LD 메타데이터와 전사 전문을 파싱한다", () => {
    expect(
      parseAiFrontierEpisodePage(
        EPISODE_HTML,
        "https://aifrontier.kr/ko/episodes/ep107"
      )
    ).toEqual({
      episodeNumber: 107,
      name: "EP107. 미래란 언제나 예측불허",
      officialUrl: "https://aifrontier.kr/ko/episodes/ep107",
      published: "2026-08-02",
      duration: "PT1H55M37S",
      youtube: "https://www.youtube.com/watch?v=tgCoPeWsTU8",
      summary: "한 줄 공식 설명",
      transcript: expect.stringContaining("노정석: 첫 문장 & 설명입니다."),
    })
  })

  it("공식 도메인이 아닌 Episode URL을 거부한다", () => {
    expect(() =>
      parseAiFrontierEpisodePage(EPISODE_HTML, "https://evil.example/ko/episodes/ep107")
    ).toThrow("공식 AI Frontier")
  })

  it("sitemap의 모든 Episode 제목과 링크를 가져온다", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith("/sitemap.xml")) return new Response(SITEMAP)
      const episodeNumber = url.endsWith("ep45") ? 45 : 107
      return new Response(
        EPISODE_HTML
          .replaceAll("107", String(episodeNumber))
          .replace("미래란 언제나 예측불허", `Episode ${episodeNumber}`)
      )
    })

    const catalog = await fetchAiFrontierCatalog(fetchImpl)

    expect(catalog.map((episode) => episode.episodeNumber)).toEqual([107, 45])
    expect(catalog[1]?.name).toBe("EP45. Episode 45")
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
})

describe("AI Frontier Episode 전사", () => {
  it("선택한 공식 Episode 한 건의 전사를 가져온다", async () => {
    const fetchImpl = vi.fn(async () => new Response(EPISODE_HTML))

    const episode = await fetchAiFrontierEpisode(
      "https://aifrontier.kr/ko/episodes/ep107",
      fetchImpl
    )

    expect(episode.transcript).toContain("최승준: 두 번째 문장입니다.")
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
