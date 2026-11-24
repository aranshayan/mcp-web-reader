import { parseArgs } from "node:util";
import type { FetchPolicy } from "./fetcher.js";
import { NAME, VERSION } from "./version.js";

export const HELP = `mcp-web-reader — fetch web pages as clean Markdown over MCP

Usage: npx @aranshayan/mcp-web-reader [options]

  --allow-private         allow localhost / private-network / link-local addresses (blocked by default: SSRF protection)
  --ignore-robots         do not honour robots.txt
  --allowed-domains <l>   comma-separated; only these domains (and subdomains) may be fetched
  --blocked-domains <l>   comma-separated domains that are never fetched
  --timeout-ms <n>        per-request timeout (default 15000)
  --max-bytes <n>         max response size in bytes (default 5242880)
  --user-agent <s>        custom User-Agent
  -h, --help   -v, --version

Environment: MCP_WEB_ALLOW_PRIVATE=1, MCP_WEB_IGNORE_ROBOTS=1, MCP_WEB_ALLOWED_DOMAINS, MCP_WEB_BLOCKED_DOMAINS
`;

const truthy = (v?: string): boolean => v !== undefined && /^(1|true|yes|on)$/i.test(v);
const list = (v?: string): string[] => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

function int(raw: string | undefined, fallback: number, min: number, max: number, label: string): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  return n;
}

export function parseConfig(argv: string[], env: NodeJS.ProcessEnv): FetchPolicy | "help" | "version" {
  const { values } = parseArgs({
    args: argv,
    options: {
      "allow-private": { type: "boolean", default: false },
      "ignore-robots": { type: "boolean", default: false },
      "allowed-domains": { type: "string" },
      "blocked-domains": { type: "string" },
      "timeout-ms": { type: "string" },
      "max-bytes": { type: "string" },
      "user-agent": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });
  if (values.help) return "help";
  if (values.version) return "version";
  return {
    allowPrivate: values["allow-private"] || truthy(env.MCP_WEB_ALLOW_PRIVATE),
    ignoreRobots: values["ignore-robots"] || truthy(env.MCP_WEB_IGNORE_ROBOTS),
    allowedDomains: list(values["allowed-domains"] ?? env.MCP_WEB_ALLOWED_DOMAINS),
    blockedDomains: list(values["blocked-domains"] ?? env.MCP_WEB_BLOCKED_DOMAINS),
    timeoutMs: int(values["timeout-ms"], 15_000, 500, 120_000, "--timeout-ms"),
    maxBytes: int(values["max-bytes"], 5 * 1024 * 1024, 1024, 50 * 1024 * 1024, "--max-bytes"),
    userAgent: values["user-agent"] ?? `${NAME}/${VERSION} (+https://github.com/aranshayan/mcp-web-reader)`,
  };
}
