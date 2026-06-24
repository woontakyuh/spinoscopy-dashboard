import { NextRequest, NextResponse } from "next/server"

// 소셜 프로필 사진 프록시 — 브라우저가 직접 못 부르는 CDN(인스타/X)을 우리 도메인으로 받아
// 장기 캐시로 내려줌. 결과적으로 "정적"(한 번 받으면 Vercel CDN이 보관, 갱신 불필요).
// SSRF 방지: 알려진 아바타 호스트만 허용.
const ALLOWED_HOSTS = [/(^|\.)cdninstagram\.com$/i, /(^|\.)fbcdn\.net$/i, /(^|\.)twimg\.com$/i]

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u")
  if (!u) return new NextResponse("missing u", { status: 400 })

  let url: URL
  try {
    url = new URL(u)
  } catch {
    return new NextResponse("bad url", { status: 400 })
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.some((re) => re.test(url.hostname))) {
    return new NextResponse("host not allowed", { status: 403 })
  }

  try {
    const upstream = await fetch(url.toString(), {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" },
    })
    if (!upstream.ok) return new NextResponse(`upstream ${upstream.status}`, { status: 502 })
    const buf = await upstream.arrayBuffer()
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch {
    return new NextResponse("fetch error", { status: 502 })
  }
}
