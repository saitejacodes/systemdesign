import type { z } from "zod";

export class ContentError extends Error {}

/** Parse JSON text against a schema; errors name the file and the exact field path. */
export function parseContent<T extends z.ZodType>(file: string, text: string, schema: T): z.infer<T> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new ContentError(`Invalid JSON in ${file}: ${(e as Error).message}`);
  }
  const r = schema.safeParse(data);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  - ${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`);
    throw new ContentError(`Content validation failed in ${file}:\n${lines.join("\n")}`);
  }
  return r.data;
}
