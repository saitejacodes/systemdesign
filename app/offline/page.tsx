import type { Metadata } from "next";
import { ErrorState } from "@/components/layout/ErrorState";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

// Precached by the service worker (app/sw.ts) and served for any page not yet opened while online.
// Server-only markup with plain links: its page chunk may not be cached, so it must not need JavaScript.
export default function OfflinePage() {
  return (
    <ErrorState
      standalone
      caption={["NET", "OFFLINE"]}
      before="You're"
      em="offline"
      message="This page hasn't been saved for offline use yet. Lessons, simulators and code labs you've opened before still work without a connection; AI features need one. Reconnect and try again."
      // An empty href is the current URL, so this reloads the page the learner asked for.
      retryHref=""
      retryLabel="Retry"
      home={{ href: "/today", label: "Today's plan" }}
    />
  );
}
