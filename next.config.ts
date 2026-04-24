import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  turbopack: {},
  allowedDevOrigins: ["192.168.56.1", "192.168.1.5", "127.0.0.1", "10.99.135.236"],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "drive.google.com", pathname: "/**" },
      { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "googleusercontent.com", pathname: "/**" },
    ],
  },
};

export default withSerwist(nextConfig);
