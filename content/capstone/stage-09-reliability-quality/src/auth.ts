import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { config } from "./config";
import { authenticate, getTenant, type Tenant } from "./db";
import { header, HttpError } from "./http";

const sameSecret = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * "Authorization: Bearer sk-..." -> tenant, or 401. The same error for a missing, unknown or revoked key.
 * The batch worker instead sends x-internal-token + x-tenant-id; only services inside the Compose network have the
 * token, and the request runs at batch priority.
 */
export async function requireTenant(req: IncomingMessage): Promise<Tenant> {
  const internal = header(req, "x-internal-token");
  if (internal !== null) {
    const tenantId = header(req, "x-tenant-id");
    const tenant = sameSecret(internal, config.internalToken) && tenantId ? await getTenant(tenantId) : null;
    if (!tenant) throw new HttpError(401, "invalid internal credentials", "authentication_error");
    return { ...tenant, batch: true };
  }
  const auth = header(req, "authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  const tenant = m ? await authenticate(m[1]) : null;
  if (!tenant) throw new HttpError(401, "missing or invalid API key", "authentication_error", { "www-authenticate": "Bearer" });
  return tenant;
}
