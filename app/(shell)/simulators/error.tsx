"use client";
import { digestOf, ErrorState } from "@/components/layout/ErrorState";

export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorState
      status="unhandled error · simulator"
      title="The simulator stopped"
      message="This simulator stopped with an error. Reset it by trying again; your challenge results are saved. If it keeps happening, change the seed or the controls you last touched."
      retry={retry}
      digest={digestOf(error)}
      home={{ href: "/simulators", label: "All simulators" }}
    />
  );
}
