"use client";
import { digestOf, ErrorState } from "@/components/layout/ErrorState";

// Pages outside the app shell (the landing page). Shell pages have their own boundaries in app/(shell).
export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorState
      standalone
      status="unhandled error · page"
      title="This page hit an error"
      message="Something went wrong while drawing this page. Your progress is saved in this browser and is not affected."
      retry={retry}
      digest={digestOf(error)}
      home={{ href: "/today", label: "Today's plan" }}
    />
  );
}
