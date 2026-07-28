import type { NextConfig } from "next";

const serverApiUrl =
  process.env["API_URL"] ??
  process.env["NEXT_PUBLIC_API_URL"] ??
  "http://localhost:3001";

const nextConfig: NextConfig = {
  ...(process.env["NEXT_BUILD_STANDALONE"] === "1" ? { output: "standalone" as const } : {}),
  reactStrictMode: true,
  typedRoutes: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${serverApiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
