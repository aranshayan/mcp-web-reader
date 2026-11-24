import { Agent, fetch } from "undici";
import robotsParser from "robots-parser";
import { assertUrlAllowed, BlockedError, safeLookup, type UrlPolicy } from "./net-guard.js";

export interface FetchPolicy extends UrlPolicy {
  ignoreRobots: boolean;
  timeoutMs: number;
  maxBytes: number;
  userAgent: string;
}

export interface FetchedPage {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  truncatedBytes: boolean;
}

const MAX_REDIRECTS = 5;
const TEXTUAL = /^(text\/|application\/(xhtml\+xml|json|xml|ld\+json|rss\+xml|atom\+xml))/i;

export class Fetcher {
  private readonly agent: Agent;
  private readonly robots = new Map<string, ReturnType<typeof robotsParser> | null>();

  constructor(private readonly policy: FetchPolicy) {
    this.agent = new Agent({ connect: { lookup: safeLookup(policy.allowPrivate) as never } });
  }

  async close(): Promise<void> {
    await this.agent.close();
  }

  private async raw(url: URL, accept: string): Promise<Awaited<ReturnType<typeof fetch>>> {
    return fetch(url, {
      dispatcher: this.agent,
      redirect: "manual",
      signal: AbortSignal.timeout(this.policy.timeoutMs),
      headers: { "user-agent": this.policy.userAgent, accept, "accept-language": "en,*;q=0.5" },
    });
  }

  private async checkRobots(url: URL): Promise<void> {
    if (this.policy.ignoreRobots) return;
    const origin = url.origin;
    if (!this.robots.has(origin)) {
      let parser: ReturnType<typeof robotsParser> | null = null;
      try {
        const res = await this.raw(new URL("/robots.txt", origin), "text/plain");
        if (res.status >= 200 && res.status < 300) parser = robotsParser(`${origin}/robots.txt`, (await res.text()).slice(0, 500_000));
        else await res.body?.cancel();
      } catch {
        parser = null; // unreachable robots.txt: treat as no restrictions
      }
      this.robots.set(origin, parser);
    }
    const parser = this.robots.get(origin);
    if (parser && parser.isAllowed(url.href, this.policy.userAgent) === false) {
      throw new BlockedError(`robots.txt at ${origin} disallows fetching this URL (use --ignore-robots only if you have permission).`);
    }
  }

  async fetchText(input: string): Promise<FetchedPage> {
    let url = assertUrlAllowed(input, this.policy);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await this.checkRobots(url);
      const res = await this.raw(url, "text/html,application/xhtml+xml,text/plain,text/markdown,application/json;q=0.8,*/*;q=0.1");
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        await res.body?.cancel();
        url = assertUrlAllowed(new URL(res.headers.get("location")!, url), this.policy);
        continue;
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (!TEXTUAL.test(contentType) && contentType !== "") {
        await res.body?.cancel();
        throw new Error(`Unsupported content type "${contentType}". Only text, HTML, JSON and XML are supported.`);
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      let truncatedBytes = false;
      if (res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > this.policy.maxBytes) {
            chunks.push(value.subarray(0, value.byteLength - (size - this.policy.maxBytes)));
            truncatedBytes = true;
            await reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }
      return {
        finalUrl: url.href,
        status: res.status,
        contentType,
        body: new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks)),
        truncatedBytes,
      };
    }
    throw new Error(`Too many redirects (more than ${MAX_REDIRECTS}).`);
  }
}
