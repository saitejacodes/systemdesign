import { buildCapstoneManifest } from "@/lib/capstone";

export const dynamic = "force-static";

// Prerendered at build time: every file of the capstone project, fetched lazily by the zip download button.
export function GET() {
  return Response.json({ files: buildCapstoneManifest() });
}
