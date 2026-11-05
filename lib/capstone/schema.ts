import { z } from "@/lib/zod";

const sectionId = z.string().regex(/^p[1-7]-[a-z0-9-]+$/, "a section id such as p6-llm-serving");

export const CapstoneStage = z
  .strictObject({
    stage: z.number().int().min(0).max(10),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    /** The stage's code folder under content/capstone, or null for the written design review (stage 0). */
    folder: z.string().regex(/^stage-\d{2}-[a-z0-9-]+$/).nullable(),
    minutes: z.number().int().positive(),
    goal: z.string().min(20),
    changes: z.array(z.strictObject({ path: z.string().min(1), change: z.enum(["added", "modified", "removed"]), note: z.string().min(1) })),
    run: z.array(z.strictObject({ label: z.string().min(1), cmd: z.string().min(1) })),
    verify: z.array(z.strictObject({ label: z.string().min(1), cmd: z.string().min(1), expect: z.string().min(1) })),
    concepts: z.array(z.strictObject({ sectionId, how: z.string().min(10) })).min(2),
    checkpoints: z.array(z.strictObject({ id: z.string().regex(/^capstone-\d+-\d+$/), text: z.string().min(1) })).min(3).max(5),
  })
  .superRefine((s, ctx) => {
    s.checkpoints.forEach((c, i) => {
      if (c.id !== `capstone-${s.stage}-${i + 1}`) ctx.addIssue({ code: "custom", path: ["checkpoints", i, "id"], message: `expected capstone-${s.stage}-${i + 1}` });
    });
    if (s.stage > 0 && !s.folder) ctx.addIssue({ code: "custom", path: ["folder"], message: "stages 1-10 need a code folder" });
  });
export type CapstoneStage = z.infer<typeof CapstoneStage>;

export const BreakItem = z.strictObject({
  id: z.string().regex(/^capstone-break-\d+$/),
  n: z.number().int().positive(),
  title: z.string().min(1),
  steps: z.array(z.string().min(1)).min(2),
  observe: z.string().min(20),
  fix: z.string().min(20),
  concepts: z.array(sectionId).min(1),
});
export const BreakIt = z.array(BreakItem).length(8);
export type BreakItem = z.infer<typeof BreakItem>;

/** One file of the downloadable project, as served by /capstone-files.json. */
export interface CapstoneFile {
  path: string;
  content: string;
  executable?: boolean;
}
