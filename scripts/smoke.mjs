// Live smoke test: runs the built CLI the way an MCP client does and reads a list of real,
// stable public pages with fetch_page. Kept out of the normal test run so a flaky site can
// never block a pull request. Run with: npm run build && node scripts/smoke.mjs
import { appendFileSync, readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = new URL("..", import.meta.url);
const sites = JSON.parse(readFileSync(new URL("scripts/smoke-sites.json", root), "utf8"));
const bin = new URL("dist/index.js", root).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const MIN_CHARS = 100;

const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [bin], env: { PATH: process.env.PATH ?? "" } }));

const results = [];
for (const site of sites) {
  const started = Date.now();
  let ok = false;
  let detail = "";
  try {
    const res = await client.callTool({ name: "fetch_page", arguments: { url: site.url, max_chars: 200_000 } });
    const text = res.content.map((c) => c.text ?? "").join("\n");
    const status = /^HTTP status: (\d{3})/m.exec(text)?.[1];
    if (res.isError) detail = text.slice(0, 160);
    // fetch_page returns error pages as content, so a 4xx/5xx would otherwise look like a pass.
    else if (status && Number(status) >= 400) detail = `HTTP ${status}`;
    else if (text.length < MIN_CHARS) detail = `only ${text.length} characters`;
    else if (!text.toLowerCase().includes(site.expect.toLowerCase())) detail = `"${site.expect}" not found`;
    else {
      ok = true;
      detail = `${text.length.toLocaleString("en")} characters`;
    }
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
  }
  const ms = Date.now() - started;
  results.push({ ...site, ok, detail, ms });
  console.log(`${ok ? "PASS" : "FAIL"}  ${site.name.padEnd(22)} ${String(ms).padStart(6)} ms  ${detail}`);
}
await client.close();

const failed = results.filter((r) => !r.ok);
const summary = [
  `## Live smoke test: ${results.length - failed.length} of ${results.length} pages read`,
  "",
  "| Result | Page | Time | Detail |",
  "| --- | --- | --- | --- |",
  ...results.map((r) => `| ${r.ok ? "✅" : "❌"} | [${r.name}](${r.url}) | ${r.ms} ms | ${r.detail.replaceAll("|", "\\|")} |`),
].join("\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
process.exitCode = failed.length ? 1 : 0;
