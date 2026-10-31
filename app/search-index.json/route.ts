import { buildSearchIndex } from "@/lib/content/search";
import { validateAll } from "@/lib/content";

export const dynamic = "force-static";

// Prerendered at build time; also runs cross-file content validation so bad content fails the build.
export function GET() {
  validateAll();
  return new Response(buildSearchIndex(), { headers: { "content-type": "application/json" } });
}
