import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";
import { VERSION } from "../src/version.js";

describe("config", () => {
  it("version matches package.json", () => {
    expect(VERSION).toBe(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
  });
  it("is safe by default", () => {
    expect(parseConfig([], {})).toMatchObject({ allowPrivate: false, ignoreRobots: false, timeoutMs: 15000 });
  });
  it("parses flags and env", () => {
    expect(parseConfig(["--allow-private", "--allowed-domains", "A.com, b.org"], {})).toMatchObject({ allowPrivate: true, allowedDomains: ["a.com", "b.org"] });
    expect(parseConfig([], { MCP_WEB_IGNORE_ROBOTS: "1" })).toMatchObject({ ignoreRobots: true });
    expect(() => parseConfig(["--timeout-ms", "1"], {})).toThrow(/timeout-ms/);
  });
});
