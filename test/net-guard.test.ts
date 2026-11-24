import { describe, expect, it } from "vitest";
import { assertUrlAllowed, isBlockedAddress } from "../src/net-guard.js";

const policy = { allowPrivate: false, allowedDomains: [], blockedDomains: [] };

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
    "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1",
    "::", "::1", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:7f00:1", "64:ff9b::7f00:1", "2002:7f00:1::1",
  ])("blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.255.255", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "allows %s",
    (ip) => expect(isBlockedAddress(ip)).toBe(false),
  );
});

describe("assertUrlAllowed", () => {
  it("rejects non-http schemes, credentials and local hosts", () => {
    for (const u of ["file:///etc/passwd", "ftp://x.com", "javascript:alert(1)", "http://user:pw@example.com", "http://localhost/", "http://foo.localhost/",
      "http://127.0.0.1:8080/", "http://[::1]/", "http://169.254.169.254/latest/meta-data", "http://2130706433/", "http://0x7f.1/", "not a url"]) {
      expect(() => assertUrlAllowed(u, policy), u).toThrow();
    }
  });

  it("allows public URLs and honours allow/block lists", () => {
    expect(assertUrlAllowed("https://example.com/a", policy).hostname).toBe("example.com");
    expect(() => assertUrlAllowed("https://evil.example.com", { ...policy, blockedDomains: ["example.com"] })).toThrow(/blocked/);
    expect(() => assertUrlAllowed("https://other.org", { ...policy, allowedDomains: ["example.com"] })).toThrow(/allowed list/);
    expect(assertUrlAllowed("https://docs.example.com", { ...policy, allowedDomains: ["example.com"] })).toBeTruthy();
  });

  it("permits private hosts only with allowPrivate", () => {
    expect(assertUrlAllowed("http://127.0.0.1:3000", { ...policy, allowPrivate: true })).toBeTruthy();
  });
});
