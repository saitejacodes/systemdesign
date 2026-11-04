import { iconMarkup } from "@/lib/studio/icons";
import type { NodeKind } from "@/lib/studio/types";

/** Palette / node icon: the isometric drawing for a component kind (see lib/studio/icons.ts). */
export function ComponentIcon({ kind, size = 32, title, className }: { kind: NodeKind; size?: number; title?: string; className?: string }) {
  // The markup is our own constant drawing (no user input), so inlining it is safe.
  const markup = (title ? `<title>${escapeXml(title)}</title>` : "") + iconMarkup(kind);
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
