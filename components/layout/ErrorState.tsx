import Link from "next/link";

export interface ErrorStateProps {
  /** The status line, written like a log entry: "unhandled error · simulator". */
  status: string;
  title: string;
  message: string;
  retry?: () => void;
  /** Server-rendered alternative to `retry`: a plain link (no JavaScript needed, used by the offline page). */
  retryHref?: string;
  retryLabel?: string;
  home?: { href: string; label: string };
  /** Error digest from Next.js, shown so a learner can match it with the server log. */
  digest?: string;
  /** Full-screen layout (outside the app shell: root error, global error, offline page). */
  standalone?: boolean;
}

/** Next.js attaches a `digest` to server errors; error boundaries receive the thrown value as `unknown`. */
export const digestOf = (error: unknown) => (typeof error === "object" && error && "digest" in error && typeof error.digest === "string" ? error.digest : undefined);

/**
 * Error / offline panel shared by every error boundary and the offline fallback.
 * Not a client module itself: error boundaries (client) pass `retry`; the offline page (server) passes `retryHref`.
 */
export function ErrorState({ status, title, message, retry, retryHref, retryLabel = "Try again", home = { href: "/", label: "Back to the start" }, digest, standalone = false }: ErrorStateProps) {
  const body = (
    <div className="grid w-full max-w-xl gap-6" role="alert" aria-live="assertive">
      <p className="fm-mono m-0 inline-flex items-center gap-2"><span aria-hidden className="inline-block size-2 rounded-full" style={{ background: status.startsWith("offline") ? "var(--status-hot)" : "var(--status-over)" }} />{status}</p>
      <h1 className={standalone ? "fm-h1 max-sm:text-[44px]" : "fm-h2"}>{title}</h1>
      <p className="m-0 max-w-[60ch] text-ink-muted">{message}</p>
      {digest && <p className="fm-mono m-0 text-ink-muted">digest {digest}</p>}
      <div className="flex flex-wrap gap-2">
        {retry && <button type="button" className="fm-btn fm-btn--primary" onClick={retry}>{retryLabel} <span className="arr">↻</span></button>}
        {retryHref !== undefined && <a className="fm-btn fm-btn--primary no-underline" href={retryHref}>{retryLabel} <span className="arr">↻</span></a>}
        {retryHref !== undefined
          ? <a className="fm-btn no-underline" href={home.href}>{home.label} <span className="arr">→</span></a>
          : <Link className="fm-btn no-underline" href={home.href}>{home.label} <span className="arr">→</span></Link>}
      </div>
    </div>
  );
  if (standalone) return <main className="fm-grid grid min-h-dvh place-items-center p-6">{body}</main>;
  return <div className="grid px-4 py-12 sm:px-8">{body}</div>;
}
