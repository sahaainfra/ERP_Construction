// Outbound destination control (Part 11 REQ-INTG-F01; A-59; ADR-005 §10.1). A connector may call only the hosts its IT Security
// approver listed. The name must resolve to a public address (a host name that points at a private address is refused, so an
// allow-listed name cannot be used to reach the internal network). Redirects are not followed.
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "../core/errors";

const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** A host entry is a plain DNS name: no wildcard, no IP literal, no port, no path. */
export function hostProblem(host: string): string | null {
  if (host !== host.toLowerCase()) return "host names are lower case";
  if (isIP(host)) return "IP addresses are not allowed; use a host name";
  if (!HOST.test(host)) return "not a valid DNS host name";
  return null;
}

/** True for any address that is not a public unicast address (IPv4 and IPv6). */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateV4(address);
  if (version === 6) {
    const a = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (mapped) return isPrivateV4(mapped[1]);
    if (a === "::" || a === "::1") return true;
    const first = parseInt(a.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    return false;
  }
  return true; // not an address at all: refuse
}

function isPrivateV4(address: string): boolean {
  const [a, b] = address.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // shared address space (CGNAT)
  if (a >= 224) return true; // multicast, reserved and broadcast
  return false;
}

export type Resolver = (host: string) => Promise<string[]>;

const systemResolver: Resolver = async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((r) => r.address);

/** Refuses a URL unless it is https, names an allow-listed host, carries no credentials, and resolves only to public addresses. */
export async function checkDestination(rawUrl: string, allowedHosts: readonly string[], resolve: Resolver = systemResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError("VALIDATION_FAILED", "the destination is not a valid URL");
  }
  const refuse = (reason: string) => new AppError("FORBIDDEN", `the destination is not allowed: ${reason}`);
  if (url.protocol !== "https:") throw refuse("only https is allowed");
  if (url.username || url.password) throw refuse("credentials in the URL are not allowed");
  const host = url.hostname.toLowerCase();
  if (!allowedHosts.includes(host)) throw refuse("the host is not on the connector's allow-list");
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw refuse("the host name does not resolve");
  }
  if (addresses.length === 0) throw refuse("the host name does not resolve");
  if (addresses.some(isPrivateAddress)) throw refuse("the host name resolves to a private or reserved address");
  return url;
}

/** Fetch for connectors: destination check first, then a fetch that never follows a redirect and has a timeout. */
export async function safeFetch(rawUrl: string, init: { method?: string; headers?: Record<string, string>; body?: string }, allowedHosts: readonly string[], options: { timeoutMs: number; resolve?: Resolver }): Promise<Response> {
  const url = await checkDestination(rawUrl, allowedHosts, options.resolve);
  const response = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(options.timeoutMs) });
  if (response.status >= 300 && response.status < 400) throw new AppError("FORBIDDEN", "redirects are not followed for connectors");
  return response;
}
