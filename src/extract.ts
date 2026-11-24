import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export interface PageMeta {
  title: string | null;
  description: string | null;
  canonical: string | null;
  language: string | null;
  siteName: string | null;
  image: string | null;
  publishedTime: string | null;
}

export interface Extracted {
  title: string | null;
  byline: string | null;
  markdown: string;
  text: string;
  usedReadability: boolean;
}

export interface LinkInfo {
  text: string;
  href: string;
}

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", linkStyle: "inlined" });
turndown.use(gfm);
turndown.remove(["script", "style", "noscript", "iframe", "svg", "form"]);

/** linkedom mangles bare fragments, so wrap anything that is not a full document. */
const parseDoc = (html: string) => parseHTML(/<html|<body/i.test(html) ? html : `<!doctype html><html><head></head><body>${html}</body></html>`);

const clean = (s: string): string => s.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

export function extractMain(html: string, baseUrl: string, mainContent: boolean): Extracted {
  const { document } = parseDoc(html);
  const pageTitle = document.querySelector("title")?.textContent?.trim() || null;
  if (mainContent) {
    try {
      const article = new Readability(parseDoc(html).document as unknown as ConstructorParameters<typeof Readability>[0], { charThreshold: 200 }).parse();
      if (article?.content && (article.textContent ?? "").trim().length > 200) {
        return {
          title: article.title || pageTitle,
          byline: article.byline ?? null,
          markdown: clean(turndown.turndown(absolutize(article.content, baseUrl))),
          text: clean(article.textContent ?? ""),
          usedReadability: true,
        };
      }
    } catch {
      /* fall through to whole-body conversion */
    }
  }
  const body = document.body?.innerHTML ?? html;
  return {
    title: pageTitle,
    byline: null,
    markdown: clean(turndown.turndown(absolutize(body, baseUrl))),
    text: clean(document.body?.textContent ?? ""),
    usedReadability: false,
  };
}

/** Rewrites relative href/src attributes to absolute URLs so links survive the conversion. */
function absolutize(html: string, baseUrl: string): string {
  const { document } = parseHTML(`<!doctype html><html><head></head><body>${html}</body></html>`);
  for (const [sel, attr] of [["a[href]", "href"], ["img[src]", "src"]] as const) {
    for (const el of document.querySelectorAll(sel)) {
      try {
        el.setAttribute(attr, new URL(el.getAttribute(attr)!, baseUrl).href);
      } catch {
        /* leave as is */
      }
    }
  }
  return document.body.innerHTML;
}

export function extractMeta(html: string, baseUrl: string): PageMeta {
  const { document } = parseDoc(html);
  const meta = (sel: string): string | null => document.querySelector(sel)?.getAttribute("content")?.trim() || null;
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  return {
    title: meta('meta[property="og:title"]') ?? (document.querySelector("title")?.textContent?.trim() || null),
    description: meta('meta[name="description"]') ?? meta('meta[property="og:description"]'),
    canonical: canonical ? new URL(canonical, baseUrl).href : null,
    language: document.documentElement?.getAttribute("lang") ?? null,
    siteName: meta('meta[property="og:site_name"]'),
    image: meta('meta[property="og:image"]'),
    publishedTime: meta('meta[property="article:published_time"]'),
  };
}

export function extractLinks(html: string, baseUrl: string, sameDomainOnly: boolean): LinkInfo[] {
  const { document } = parseDoc(html);
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const out: LinkInfo[] = [];
  for (const a of document.querySelectorAll("a[href]")) {
    try {
      const u = new URL(a.getAttribute("href")!, base);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      u.hash = "";
      if (sameDomainOnly && u.hostname !== base.hostname) continue;
      if (seen.has(u.href)) continue;
      seen.add(u.href);
      out.push({ text: (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200), href: u.href });
    } catch {
      /* skip malformed */
    }
  }
  return out;
}
