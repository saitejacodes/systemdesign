import { createSerwistRoute } from "@serwist/turbopack";

// Turbopack has no plugin hook, so the service worker is bundled by esbuild inside this route at build
// time and served as /serwist/sw.js (force-static: prerendered once per build with the rest of the site).
// A new revision per build makes the worker refetch /offline after each deploy.
const revision = crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "app/sw.ts",
  useNativeEsbuild: true,
  // A classic (non-module) worker, so every browser that supports service workers can run it.
  esbuildOptions: { format: "iife" },
  // App shell only (CSS, self-hosted fonts, icons); JS chunks are cached at runtime on first use.
  globPatterns: [".next/static/**/*.{css,woff2}", "public/icons/*.{png,svg}"],
  additionalPrecacheEntries: [{ url: "/offline", revision }],
});
