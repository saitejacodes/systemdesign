import { b64urlEncode, b64urlFromBytes, bytesFromB64url, type Json, type Sample } from "./model";

/*
 * HS256 (RFC 7518 §3.2) with Web Crypto. The demo secret is 32 random bytes made in this tab;
 * nothing here touches the network.
 */

export const newSecret = () => crypto.getRandomValues(new Uint8Array(32));
const key = (secret: Uint8Array) => crypto.subtle.importKey("raw", secret as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
const ascii = (s: string) => new TextEncoder().encode(s);

export async function signInput(signingInput: string, secret: Uint8Array) {
  return b64urlFromBytes(new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), ascii(signingInput))));
}
export async function sign(header: Json, payload: Json, secret: Uint8Array) {
  const input = `${b64urlEncode(JSON.stringify(header))}.${b64urlEncode(JSON.stringify(payload))}`;
  return `${input}.${await signInput(input, secret)}`;
}
/** crypto.subtle.verify compares in constant time, unlike comparing two strings. */
export async function verify(token: string, secret: Uint8Array) {
  const [h, p, s] = token.trim().split(".");
  try { return await crypto.subtle.verify("HMAC", await key(secret), bytesFromB64url(s ?? "") as BufferSource, ascii(`${h}.${p}`)); } catch { return false; }
}

export async function makeSample(x: Sample, secret: Uint8Array, now: number) {
  const payload = x.payload(now);
  if (x.mode === "none") return `${b64urlEncode(JSON.stringify(x.header))}.${b64urlEncode(JSON.stringify(payload))}.`;
  const t = await sign(x.header, payload, secret);
  if (x.mode !== "tamper") return t;
  const [h, , s] = t.split(".");
  return `${h}.${b64urlEncode(JSON.stringify({ ...payload, ...x.tamper }))}.${s}`;
}
