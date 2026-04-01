import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.56.1","192.168.1.6"],
  images: {
    domains: ["drive.google.com", "lh3.googleusercontent.com", "googleusercontent.com"],
  },
};

export default nextConfig;
