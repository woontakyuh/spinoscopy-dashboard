import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 맥북에어 → Tailscale → 맥미니 dev 서버를 브라우저로 볼 때 필요.
  // 없으면 /_next/* 요청이 cross-origin 으로 걸린다 (Next 16 에서는 경고, 이후 차단 예정)
  allowedDevOrigins: [
    "100.117.38.66",
    "tak-m4macmini.tail96c3f4.ts.net",
    "*.tail96c3f4.ts.net",
  ],
  async redirects() {
    return [
      { source: "/agents/clinicus", destination: "/agents/elon", permanent: true },
      { source: "/agents/scholar", destination: "/agents/brian", permanent: true },
      { source: "/agents/vault", destination: "/agents/warren", permanent: true },
      { source: "/agents/sensei", destination: "/agents/lo", permanent: true },
      { source: "/agents/radar", destination: "/agents/andrej", permanent: true },
    ]
  },
};

export default nextConfig;
