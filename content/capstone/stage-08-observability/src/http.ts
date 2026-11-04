import type { IncomingMessage, ServerResponse } from "node:http";

/** An error with an HTTP status and an OpenAI-style error type. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly type = "invalid_request_error",
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** Read a JSON body, refusing anything over `limit` bytes. */
export async function readJson(req: IncomingMessage, limit = 256 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, `request body over ${limit} bytes`);
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new HttpError(400, "request body must be JSON");
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(Buffer.byteLength(payload)),
    ...headers,
  });
  res.end(payload);
}

/** OpenAI-shaped error body, so OpenAI client libraries surface the message. */
export function sendError(res: ServerResponse, err: HttpError): void {
  sendJson(res, err.status, { error: { message: err.message, type: err.type } }, err.headers);
}

export function header(req: IncomingMessage, name: string): string | null {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) ?? null;
}
