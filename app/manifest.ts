import type { MetadataRoute } from "next";

// Colours are the Paper theme's `paper` and `ink` from design/tokens.json. Icons: scripts/make-icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SysDesign Lab",
    short_name: "SysDesign Lab",
    description: "Learn, simulate and practise system design: lessons, simulators, a design studio and mock interviews. Works offline after your first visit.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#F4EFE4",
    theme_color: "#F4EFE4",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
