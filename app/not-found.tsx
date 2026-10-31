import Link from "next/link";
import { FigureCaption, PhasePath } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="fm-grid grid min-h-dvh place-items-center p-6">
      <div className="grid w-full max-w-xl gap-6">
        <FigureCaption parts={["ERR 404", "OFF THE PATH"]} />
        <h1 className="fm-h1 max-sm:text-[44px]">This page is <span className="fm-em">missing</span>.</h1>
        <PhasePath interactive={false} labels={false} />
        <Link className="fm-btn fm-btn--primary justify-self-start no-underline" href="/">Back to the start <span className="arr">→</span></Link>
      </div>
    </main>
  );
}
