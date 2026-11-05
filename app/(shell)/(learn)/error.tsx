"use client";
import { digestOf, ErrorState } from "@/components/layout/ErrorState";

export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorState
      status="unhandled error · lesson"
      title="This lesson failed to load"
      message="Part of this lesson failed to render. Your checkpoints and quiz scores are saved; try again, or open the phase overview."
      retry={retry}
      digest={digestOf(error)}
      home={{ href: "/plan", label: "Study plan" }}
    />
  );
}
