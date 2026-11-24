import { createServer as createHttp, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FetchPolicy } from "../src/fetcher.js";
import { createServer } from "../src/server.js";
import { connect } from "./helpers.js";

const article = `<!doctype html><html lang="en"><head><title>Test Article</title>
<meta name="description" content="A description"><meta property="og:site_name" content="Site">
<link rel="canonical" href="/canonical"></head><body>
<nav><a href="/home">Home</a><a href="/about">About</a></nav>
<article><h1>Test Article</h1><p>${"This is a sentence of real article content. ".repeat(20)}</p>
<p>See <a href="/relative/link">relative link</a> and <a href="https://other.example/x">external</a>.</p>
<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
<script>alert('evil')</script></article><footer>Footer junk</footer></body></html>`;

let http: Server;
let base: string;
const hits: string[] = [];

beforeAll(async () => {
  http = createHttp((req, res) => {
    hits.push(req.url ?? "");
    const url = req.url ?? "";
    if (url === "/robots.txt") return void res.writeHead(200, { "content-type": "text/plain" }).end("User-agent: *\nDisallow: /private\n");
    if (url === "/article") return void res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(article);
    if (url === "/json") return void res.writeHead(200, { "content-type": "application/json" }).end('{"a":1}');
    if (url === "/redirect") return void res.writeHead(302, { location: "/article" }).end();
    if (url === "/redirect-meta") return void res.writeHead(302, { location: "http://169.254.169.254/latest" }).end();
    if (url === "/loop") return void res.writeHead(302, { location: "/loop" }).end();
    if (url === "/private") return void res.writeHead(200, { "content-type": "text/html" }).end("<p>secret</p>");
    if (url === "/image") return void res.writeHead(200, { "content-type": "image/png" }).end(Buffer.alloc(10));
    if (url === "/big") return void res.writeHead(200, { "content-type": "text/plain" }).end("x".repeat(50_000));
    res.writeHead(404, { "content-type": "text/html" }).end("<p>nope</p>");
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => http.close(() => r())));

const policy = (over: Partial<FetchPolicy> = {}): FetchPolicy => ({
  allowPrivate: true, ignoreRobots: false, allowedDomains: [], blockedDomains: [], timeoutMs: 5000, maxBytes: 1_000_000, userAgent: "test-agent", ...over,
});
async function open(over?: Partial<FetchPolicy>) {
  const { server, fetcher } = createServer(policy(over));
  const h = await connect(server);
  return { h, done: async () => { await h.close(); await fetcher.close(); } };
}

describe("fetch_page", () => {
  it("returns clean markdown of the main content", async () => {
    const { h, done } = await open();
    const r = await h.call("fetch_page", { url: `${base}/article` });
    expect(r.isError).toBe(false);
    expect(r.text).toContain("Title: Test Article");
    expect(r.text).toContain("real article content");
    expect(r.text).toContain(`[relative link](${base}/relative/link)`);
    expect(r.text).toContain("| A | B |");
    expect(r.text).not.toMatch(/alert|Footer junk/);
    await done();
  });

  it("returns plain text, follows redirects, and handles json", async () => {
    const { h, done } = await open();
    expect((await h.call("fetch_page", { url: `${base}/redirect`, format: "text" })).text).toContain("real article content");
    expect((await h.call("fetch_page", { url: `${base}/json` })).text).toContain('"a": 1');
    await done();
  });

  it("paginates long content", async () => {
    const { h, done } = await open();
    const first = await h.call("fetch_page", { url: `${base}/big`, max_chars: 1000 });
    expect(first.text).toContain("start_index=1000");
    const next = await h.call("fetch_page", { url: `${base}/big`, max_chars: 1000, start_index: 49_500 });
    expect(next.text).not.toContain("Truncated");
    await done();
  });

  it("enforces the byte limit and content-type allowlist", async () => {
    const { h, done } = await open({ maxBytes: 2048 });
    expect((await h.call("fetch_page", { url: `${base}/big` })).text).toMatch(/2048-byte limit/);
    const img = await h.call("fetch_page", { url: `${base}/image` });
    expect(img.isError).toBe(true);
    expect(img.text).toMatch(/Unsupported content type/);
    await done();
  });

  it("honours robots.txt unless told otherwise", async () => {
    const a = await open();
    const blocked = await a.h.call("fetch_page", { url: `${base}/private` });
    expect(blocked.isError).toBe(true);
    expect(blocked.text).toMatch(/robots\.txt/);
    await a.done();
    const b = await open({ ignoreRobots: true });
    expect((await b.h.call("fetch_page", { url: `${base}/private` })).text).toContain("secret");
    await b.done();
  });

  it("reports redirect loops and re-validates every redirect hop", async () => {
    const { h, done } = await open({ allowPrivate: true });
    expect((await h.call("fetch_page", { url: `${base}/loop` })).text).toMatch(/Too many redirects/);
    await done();
    // Private addresses blocked: a public-looking start can't be simulated locally, so verify the IP-literal path directly.
    const strict = await open({ allowPrivate: false });
    const before = hits.length;
    const r = await strict.h.call("fetch_page", { url: `${base}/article` });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/private or reserved/);
    expect(hits.length).toBe(before); // no request ever reached the server
    for (const u of ["http://169.254.169.254/latest/meta-data/", "http://localhost/", "file:///etc/passwd"]) {
      expect((await strict.h.call("fetch_page", { url: u })).isError, u).toBe(true);
    }
    await strict.done();
  });

  it("blocks hostnames that resolve to private addresses (DNS check at connect time)", async () => {
    const strict = await open({ allowPrivate: false, ignoreRobots: true });
    const port = new URL(base).port;
    const r = await strict.h.call("fetch_page", { url: `http://localtest.me:${port}/article` });
    expect(r.isError).toBe(true);
    await strict.done();
  });
});

describe("extract_links / page_metadata", () => {
  it("lists unique absolute links", async () => {
    const { h, done } = await open();
    const data = JSON.parse((await h.call("extract_links", { url: `${base}/article`, same_domain_only: true })).text);
    expect(data.links.map((l: { href: string }) => l.href)).toEqual([`${base}/home`, `${base}/about`, `${base}/relative/link`]);
    await done();
  });

  it("returns metadata", async () => {
    const { h, done } = await open();
    const data = JSON.parse((await h.call("page_metadata", { url: `${base}/article` })).text);
    expect(data).toMatchObject({ title: "Test Article", description: "A description", language: "en", siteName: "Site", canonical: `${base}/canonical` });
    await done();
  });
});
