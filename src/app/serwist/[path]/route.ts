import { createSerwistRoute } from "@serwist/turbopack";

// Use a static revision ID instead of spawning git (which fails on Windows)
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? Date.now().toString();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    additionalPrecacheEntries: [{ url: "/~offline", revision }],
    swSrc: "src/app/sw.ts",
  });
