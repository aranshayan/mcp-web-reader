import { STATUS_CODES } from "node:http";
import type { FetchedPage } from "./fetcher.js";

// Pages that bot protection serves instead of the real content. Matched on the body, because
// these services answer with 403, 429, 503 or sometimes 200.
const CHALLENGES: Array<[name: string, pattern: RegExp]> = [
  ["Vercel Security Checkpoint", /<title>\s*Vercel Security Checkpoint\s*<\/title>|vercel\.link\/security-checkpoint/i],
  ["Cloudflare", /<title>\s*(Just a moment\.\.\.|Attention Required! \| Cloudflare)\s*<\/title>|\/cdn-cgi\/challenge-platform\//i],
  ["Imperva", /_Incapsula_Resource|Incapsula incident ID/i],
  ["DDoS-Guard", /<title>\s*DDoS-Guard\s*<\/title>/i],
  ["AWS WAF", /awswaf\.com|AwsWafIntegration/i],
];

/** Name of the bot-protection service whose challenge page this is, or null. */
export function botChallenge(page: Pick<FetchedPage, "body">): string | null {
  const head = page.body.slice(0, 20_000);
  return CHALLENGES.find(([, re]) => re.test(head))?.[0] ?? null;
}

/**
 * Why this response should not be handed to the model as the page, or null when it is fine.
 * With allowErrorStatus, plain 4xx/5xx pages pass; bot challenges never do, because their
 * text says nothing about the page that was asked for.
 */
export function responseProblem(page: Pick<FetchedPage, "status" | "finalUrl" | "body">, allowErrorStatus: boolean): string | null {
  const challenge = botChallenge(page);
  if (challenge) {
    return (
      `${page.finalUrl} returned a ${challenge} bot check (HTTP ${page.status}) instead of the page. ` +
      "The site blocks automated readers, so retrying will not help. Try another source for this information."
    );
  }
  if (page.status >= 400 && !allowErrorStatus) {
    const reason = STATUS_CODES[page.status] ?? "Error";
    return `HTTP ${page.status} ${reason} from ${page.finalUrl}. Set allow_error_status=true to read the error page anyway.`;
  }
  return null;
}
