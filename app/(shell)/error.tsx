"use client";
import { digestOf, ErrorState } from "@/components/layout/ErrorState";

export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorState
      status="unhandled error · page"
      title="This page hit an error"
      message="Something went wrong while drawing this page. Your progress is saved in this browser and is not affected. Try again, or head back to today's plan."
      retry={retry}
      digest={digestOf(error)}
      home={{ href: "/today", label: "Today" }}
    />
  );
}
