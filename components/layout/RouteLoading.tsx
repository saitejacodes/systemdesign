/** Placeholder for the server-rendered (dynamic) routes while their page streams in. */
export function RouteLoading({ what }: { what: string }) {
  return (
    <div className="grid gap-4 px-4 py-8 sm:px-8" role="status" aria-live="polite">
      <span className="fm-cap">Loading {what}…</span>
      <div aria-hidden className="h-10 max-w-xl border border-line bg-surface" style={{ borderRadius: 2 }} />
      <div aria-hidden className="h-48 border border-line bg-surface-sunk" style={{ borderRadius: 2 }} />
    </div>
  );
}
