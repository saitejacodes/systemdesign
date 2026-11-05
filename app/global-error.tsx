"use client";
import { digestOf, ErrorState } from "@/components/layout/ErrorState";
import "./globals.css";

// Replaces the root layout when it fails, so it brings its own <html>, <body> and stylesheet.
// Fonts fall back to the token stacks (the next/font variables live in the root layout).
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" data-theme="paper">
      <body>
        <ErrorState
          standalone
          status="unhandled error · app"
          title="The app hit an error"
          message="SysDesign Lab failed to start this page. Your progress is stored in this browser and is safe. Try again; if it keeps failing, reload the page or come back later."
          retry={retry}
          digest={digestOf(error)}
        />
      </body>
    </html>
  );
}
