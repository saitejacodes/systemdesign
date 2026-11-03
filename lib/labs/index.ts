import "server-only";
import fs from "node:fs";
import path from "node:path";
import { ContentError, parseContent } from "@/lib/content/parse";
import { EXT, LANGS, LabMeta, TESTS_EXT, type Lab } from "./schema";

const ROOT = path.join(process.cwd(), "content", "labs");

function loadLab(dir: string): Lab {
  const read = (name: string) => {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) throw new ContentError(`Missing ${path.relative(process.cwd(), p)}`);
    return fs.readFileSync(p, "utf8");
  };
  const meta = parseContent(`content/labs/${path.basename(dir)}/meta.json`, read("meta.json"), LabMeta);
  if (meta.id !== path.basename(dir)) throw new ContentError(`content/labs/${path.basename(dir)}/meta.json: id must match folder name`);
  const code = Object.fromEntries(LANGS.map((l) => [l, { starter: read(`starter.${EXT[l]}`), solution: read(`solution.${EXT[l]}`), tests: read(`tests.${TESTS_EXT[l]}`) }])) as Lab["code"];
  return { meta, explanation: read("explanation.md"), code };
}

let cache: Lab[] | null = null;
export function getLabs(): Lab[] {
  return (cache ??= fs.readdirSync(ROOT).filter((d) => fs.statSync(path.join(ROOT, d)).isDirectory()).map((d) => loadLab(path.join(ROOT, d))).sort((a, b) => a.meta.order - b.meta.order));
}
export const getLab = (id: string) => getLabs().find((l) => l.meta.id === id);
export const labsForSection = (sectionId: string) => getLabs().filter((l) => l.meta.sectionIds.includes(sectionId));
