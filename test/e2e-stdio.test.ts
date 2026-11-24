import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { beforeAll, describe, expect, it } from "vitest";

// Runs the real built CLI over stdio, exactly as an MCP client launches it.
const root = fileURLToPath(new URL("..", import.meta.url));
const bin = join(root, "dist", "index.js");

beforeAll(() => {
  execFileSync("npx", ["tsup"], { cwd: root, stdio: "ignore" });
  expect(existsSync(bin)).toBe(true);
}, 120_000);

describe("cli over stdio", () => {
  it("lists tools and blocks private addresses by default", async () => {
    const client = new Client({ name: "e2e", version: "1.0.0" });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [bin], env: { PATH: process.env.PATH ?? "" } }));
    try {
      const tools = (await client.listTools()).tools;
      expect(tools.map((t) => t.name).sort()).toEqual(["extract_links", "fetch_page", "page_metadata"]);
      expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
      const res = await client.callTool({ name: "fetch_page", arguments: { url: "http://169.254.169.254/latest/meta-data/" } });
      expect(res.isError).toBe(true);
      expect((res.content as Array<{ text: string }>)[0]!.text).toMatch(/private or reserved/);
    } finally {
      await client.close();
    }
  }, 30_000);

  it("prints help and version", () => {
    expect(spawnSync(process.execPath, [bin, "--version"], { encoding: "utf8" }).stdout).toMatch(/^mcp-web-reader \d+\.\d+\.\d+/);
    expect(spawnSync(process.execPath, [bin, "--help"], { encoding: "utf8" }).stdout).toMatch(/--allow-private/);
  });
});
