import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env["NEXT_BUILD_STANDALONE"] === "1" ? { output: "standalone" as const } : {}),
  reactStrictMode: true,
  typedRoutes: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001"}/api/:path*`,
      },
      {
        source: "/search/:path*",
        destination: `${process.env["NEXT_PUBLIC_SEARCH_URL"] ?? "http://localhost:3002"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
