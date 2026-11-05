import { codeToHtml } from "shiki";
import { CopyButton } from "./CopyButton";

// Comment greys darkened (light) and lifted (dark) to reach 4.5:1 on the code block backgrounds.
const opts = {
  themes: { light: "github-light-high-contrast", dark: "github-dark" },
  defaultColor: false,
  colorReplacements: { "github-light-high-contrast": { "#66707b": "#4b535d" }, "github-dark": { "#6a737d": "#959da5" } },
} as const;

/** Shiki-highlighted code with both theme palettes; CSS picks one per data-theme. */
export async function CodeBlock({ code, lang, title }: { code: string; lang: string; title?: string }) {
  let html: string;
  try {
    html = await codeToHtml(code, { lang, ...opts });
  } catch {
    html = await codeToHtml(code, { lang: "text", ...opts });
  }
  return (
    <div className="fm-code my-6">
      <div className="fm-code__head"><span className="fm-cap">{title ?? lang}</span><CopyButton text={code} /></div>
      <div className="shiki-wrap" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
