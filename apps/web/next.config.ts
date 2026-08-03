import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env["NEXT_BUILD_STANDALONE"] === "1" ? { output: "standalone" as const } : {}),
  reactStrictMode: true,
  typedRoutes: false,
  transpilePackages: ["pptx-react-viewer"],
  // Optional AI peers of pptx-react-viewer — unused; stub so production webpack can build.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      ai: false,
      "@ai-sdk/react": false,
    };
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
