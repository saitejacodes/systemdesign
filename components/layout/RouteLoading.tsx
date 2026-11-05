/** Placeholder for the server-rendered (dynamic) routes while their page streams in: a request in flight, then the page's rough shape. */
export function RouteLoading({ what }: { what: string }) {
  return (
    <div className="grid gap-4 px-4 py-8 sm:px-8" role="status" aria-live="polite">
      <span className="fm-cap">Loading {what}…</span>
      <div aria-hidden className="sdl-inflight" />
      <div aria-hidden className="h-10 max-w-xl rounded-[3px] bg-surface" />
      <div aria-hidden className="h-48 rounded-[3px] bg-surface-sunk" />
    </div>
  );
}
