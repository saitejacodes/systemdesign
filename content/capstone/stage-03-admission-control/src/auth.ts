import type { IncomingMessage } from "node:http";
import { authenticate, type Tenant } from "./db";
import { header, HttpError } from "./http";

/** "Authorization: Bearer sk-..." -> tenant, or 401. The same error for a missing, unknown or revoked key. */
export async function requireTenant(req: IncomingMessage): Promise<Tenant> {
  const auth = header(req, "authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  const tenant = m ? await authenticate(m[1]) : null;
  if (!tenant) throw new HttpError(401, "missing or invalid API key", "authentication_error", { "www-authenticate": "Bearer" });
  return tenant;
}
