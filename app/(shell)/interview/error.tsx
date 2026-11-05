"use client";
import { digestOf, ErrorState } from "@/components/layout/ErrorState";

export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorState
      status="unhandled error · interview"
      title="The interview stopped"
      message="Interview Mode hit an error. Your draft answers are saved as you type; try again to pick up where you left off."
      retry={retry}
      digest={digestOf(error)}
      home={{ href: "/case-studies", label: "Case studies" }}
    />
  );
}
