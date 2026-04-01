import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.56.1"],
  images: {
    domains: ["picsum.photos"],
  },
};

export default nextConfig;
