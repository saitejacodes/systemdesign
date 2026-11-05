"use client";
import { digestOf, ErrorState } from "@/components/layout/ErrorState";

export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorState
      status="unhandled error · design studio"
      title="The studio hit an error"
      message="The Design Studio hit an error. Your designs are autosaved in this browser; try again, or go back to the design list and reopen it."
      retry={retry}
      digest={digestOf(error)}
      home={{ href: "/studio", label: "All designs" }}
    />
  );
}
