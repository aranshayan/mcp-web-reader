# mcp-web-reader

[![CI](https://github.com/aranshayan/mcp-web-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/aranshayan/mcp-web-reader/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@aranshayan/mcp-web-reader)](https://www.npmjs.com/package/@aranshayan/mcp-web-reader)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An [MCP](https://modelcontextprotocol.io) server that lets Claude **read web pages as clean Markdown** — article extraction (Mozilla Readability), tables, absolute links — with the guard rails a tool that fetches model-chosen URLs needs.

- **SSRF protection on by default.** Blocks localhost, private ranges, link-local/cloud-metadata (`169.254.169.254`), CGNAT, IPv6 loopback/ULA, IPv4-mapped IPv6 and NAT64. Hostnames are validated **at connect time** (defeats DNS rebinding) and **every redirect hop is re-validated**.
- **Polite.** Honours `robots.txt`, identifies itself with a clear User-Agent.
- **Bounded.** Response size cap, request timeout, redirect limit, content-type allowlist (text/HTML/JSON/XML only).
- **Paginated.** Long pages are read in pieces with `start_index`.
- Pure JS, no browser, no native dependencies. (Pages that need JavaScript to render are not supported.)

## Quick start

```json
{
  "mcpServers": {
    "web": { "command": "npx", "args": ["-y", "@aranshayan/mcp-web-reader"] }
  }
}
```

Claude Code: `claude mcp add web -- npx -y @aranshayan/mcp-web-reader`. Requires Node.js 22+.

## Tools

| Tool | Description |
| --- | --- |
| `fetch_page` | Page → Markdown (or text). Options: `main_content`, `max_chars`, `start_index`. |
| `extract_links` | Unique absolute http(s) links, optionally same-domain only. |
| `page_metadata` | Title, description, canonical URL, language, Open Graph. |

All tools are `readOnlyHint`. Fetched content is untrusted: the server instructs the model to treat it as data, not instructions, but prompt injection remains a risk with any web-reading tool — pair it with `--allowed-domains` for sensitive agents.

## Options

| Flag | Default | |
| --- | --- | --- |
| `--allow-private` | off | Permit localhost / private networks (for local docs sites). |
| `--ignore-robots` | off | Skip robots.txt. Only with permission. |
| `--allowed-domains a.com,b.org` | any | Restrict to these domains and subdomains. |
| `--blocked-domains …` | none | Never fetch these. |
| `--timeout-ms` | 15000 | Per request. |
| `--max-bytes` | 5 MiB | Max download size. |
| `--user-agent` | `mcp-web-reader/x (+repo)` | |

Environment: `MCP_WEB_ALLOW_PRIVATE`, `MCP_WEB_IGNORE_ROBOTS`, `MCP_WEB_ALLOWED_DOMAINS`, `MCP_WEB_BLOCKED_DOMAINS`.

## Tests

`npm test` covers the IP classifier (IPv4/IPv6 edge cases), URL policy, extraction, pagination, size/type limits, robots.txt, redirect loops, proof that blocked requests never reach the server, and the built CLI over stdio. Against the live internet, `npm run build && npm run smoke` reads 12 stable public pages (docs sites, a large RFC, a redirect, a JSON API) through the built CLI and checks each one. The "Live smoke test" workflow runs it weekly and on demand, never on pull requests, so a site that is down cannot block a merge. The list is in `scripts/smoke-sites.json`.

## License

[MIT](LICENSE)
