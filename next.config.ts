import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.56.1", "192.168.1.4", "10.45.97.236"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "drive.google.com", pathname: "/**" },
      { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "googleusercontent.com", pathname: "/**" },
    ],
  },
};

export default withSerwist(nextConfig);
