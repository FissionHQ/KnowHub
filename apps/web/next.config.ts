import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  experimental: {
    // Required for PDF/file uploads through /api/* rewrites (default is 10MB)
    middlewareClientMaxBodySize: "100mb",
  },
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
