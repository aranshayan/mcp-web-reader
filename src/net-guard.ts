import dns from "node:dns";
import { isIP } from "node:net";

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, p) => acc * 256 + Number(p), 0);
}

const V4_BLOCKED: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3], // multicast + reserved (224.0.0.0 – 255.255.255.255)
];

function parseV6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0]!;
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) {
    const n = v4ToInt(tail[1]!);
    s = s.slice(0, -tail[1]!.length) + ((n >>> 16) & 0xffff).toString(16) + ":" + (n & 0xffff).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...rest].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

/** True for loopback, private, link-local, CGNAT, multicast, reserved and cloud-metadata addresses. */
export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = v4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => n >>> (32 - bits) === v4ToInt(base) >>> (32 - bits));
  }
  if (kind === 6) {
    const g = parseV6(ip);
    if (!g) return true;
    if (g.every((x) => x === 0)) return true; // ::
    if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
    if ((g[0]! & 0xffc0) === 0xfe80) return true; // link-local
    if ((g[0]! & 0xfe00) === 0xfc00) return true; // unique local
    if ((g[0]! & 0xff00) === 0xff00) return true; // multicast
    if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
      return isBlockedAddress(`${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`); // v4-mapped / compatible
    }
    if (g[0] === 0x64 && g[1] === 0xff9b) return true; // NAT64
    if (g[0] === 0x2002) return true; // 6to4
    return false;
  }
  return true;
}

export class BlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedError";
  }
}

export interface UrlPolicy {
  allowPrivate: boolean;
  allowedDomains: string[];
  blockedDomains: string[];
}

const domainMatches = (host: string, d: string): boolean => host === d || host.endsWith(`.${d}`);

/** Validates scheme, domain lists and IP-literal hosts. Hostnames are checked again at connect time. */
export function assertUrlAllowed(raw: string | URL, policy: UrlPolicy): URL {
  let url: URL;
  try {
    url = raw instanceof URL ? raw : new URL(raw);
  } catch {
    throw new BlockedError(`Invalid URL: ${String(raw).slice(0, 200)}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedError(`Only http and https URLs are allowed (got ${url.protocol}).`);
  }
  if (url.username || url.password) throw new BlockedError("URLs with embedded credentials are not allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (policy.blockedDomains.some((d) => domainMatches(host, d))) throw new BlockedError(`Domain ${host} is blocked.`);
  if (policy.allowedDomains.length > 0 && !policy.allowedDomains.some((d) => domainMatches(host, d))) {
    throw new BlockedError(`Domain ${host} is not in the allowed list.`);
  }
  if (!policy.allowPrivate) {
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
      throw new BlockedError(`Host ${host} is a local address; use --allow-private to permit it.`);
    }
    if (isIP(host) && isBlockedAddress(host)) {
      throw new BlockedError(`Address ${host} is private or reserved; use --allow-private to permit it.`);
    }
  }
  return url;
}

/** dns.lookup replacement for undici's `connect.lookup`: validates every resolved address (anti DNS-rebinding). */
export function safeLookup(allowPrivate: boolean) {
  return (
    hostname: string,
    options: dns.LookupOptions,
    callback: (err: Error | null, address?: string | dns.LookupAddress[], family?: number) => void,
  ): void => {
    dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
      if (err) return callback(err);
      const list = addrs as dns.LookupAddress[];
      if (!allowPrivate) {
        const bad = list.find((a) => isBlockedAddress(a.address));
        if (bad) return callback(new BlockedError(`${hostname} resolves to a private or reserved address (${bad.address}).`));
      }
      if (options.all) return callback(null, list);
      const first = list[0]!;
      callback(null, first.address, first.family);
    });
  };
}
