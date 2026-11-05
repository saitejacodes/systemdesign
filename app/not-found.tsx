import Link from "next/link";
import { PhasePath } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="fm-grid grid min-h-dvh place-items-center p-6">
      <div className="grid w-full max-w-xl gap-6">
        <p className="fm-mono m-0 inline-flex items-center gap-2"><span aria-hidden className="inline-block size-2 rounded-full" style={{ background: "var(--status-hot)" }} />404 Not Found</p>
        <h1 className="fm-h1 max-sm:text-[44px]">No route matches this page</h1>
        <p className="m-0 max-w-[52ch] text-ink-muted">The link may be old, or the address has a typo. Every lesson is still on the path below.</p>
        <Link className="fm-btn fm-btn--primary justify-self-start no-underline" href="/">Back to the start <span className="arr">→</span></Link>
        <div className="max-w-sm"><PhasePath interactive={false} labels={false} /></div>
      </div>
    </main>
  );
}
