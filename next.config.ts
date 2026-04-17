import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
