import { codeToHtml } from "shiki";
import { CopyButton } from "./CopyButton";

/** Shiki-highlighted code with both theme palettes; CSS picks one per data-theme. */
export async function CodeBlock({ code, lang, title }: { code: string; lang: string; title?: string }) {
  let html: string;
  try {
    html = await codeToHtml(code, { lang, themes: { light: "github-light", dark: "github-dark" }, defaultColor: false });
  } catch {
    html = await codeToHtml(code, { lang: "text", themes: { light: "github-light", dark: "github-dark" }, defaultColor: false });
  }
  return (
    <div className="fm-code my-6">
      <div className="fm-code__head"><span className="fm-cap">{title ?? lang}</span><CopyButton text={code} /></div>
      <div className="shiki-wrap" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
