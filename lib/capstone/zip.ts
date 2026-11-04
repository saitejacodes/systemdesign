import type JSZipType from "jszip";
import type { CapstoneFile } from "./schema";

/** Packs the capstone files into a zip; .sh files keep their executable bit. JSZip is passed in so callers can lazy-load it. */
export function buildZip<T extends "blob" | "uint8array">(JSZip: typeof JSZipType, files: CapstoneFile[], type: T) {
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.content, { unixPermissions: f.executable ? 0o755 : 0o644 });
  return zip.generateAsync({ type, platform: "UNIX", compression: "DEFLATE" });
}
