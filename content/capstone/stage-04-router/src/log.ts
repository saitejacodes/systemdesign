/** One JSON object per line on stdout: easy to grep now, easy to ship to a log store later. */
export function log(event: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...fields })}\n`);
}
