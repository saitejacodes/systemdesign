import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

// cacheComponents is off: all content is static files read at build time (see DECISIONS.md).
// withSerwist only marks esbuild as a server-external package; the service worker is built by app/serwist/[path]/route.ts.
const nextConfig: NextConfig = withSerwist({
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
});

export default nextConfig;
