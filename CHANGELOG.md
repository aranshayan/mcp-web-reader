# Changelog

## Unreleased

- `fetch_page` and `extract_links` return an error for 4xx/5xx responses instead of the error page's content. `fetch_page` takes `allow_error_status` to read the page anyway. ([#4](https://github.com/aranshayan/mcp-web-reader/issues/4))
- Bot-check pages (Vercel Security Checkpoint, Cloudflare, Imperva, DDoS-Guard, AWS WAF) are reported as such, whatever their status code, with a note not to retry. ([#4](https://github.com/aranshayan/mcp-web-reader/issues/4))
- Live smoke test against 12 public pages, run weekly and on demand. ([#3](https://github.com/aranshayan/mcp-web-reader/issues/3))

## 0.1.0

Initial release: fetch_page, extract_links, page_metadata with SSRF protection, robots.txt, size/time limits.
