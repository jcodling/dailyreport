import { XMLParser } from "fast-xml-parser";
import type { Article } from "../types";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

type RssItem = {
  title?: string | { "#text": string };
  link?: string | { "#text": string } | { "@_href": string };
  description?: string;
  summary?: string;
  content?: string;
  "content:encoded"?: string;
};

function extractText(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    return String(obj["#text"] ?? obj["@_href"] ?? "");
  }
  return String(val);
}

function extractLink(item: RssItem): string {
  if (item.link) return extractText(item.link);
  return "";
}

function extractSnippet(item: RssItem): string {
  const raw =
    item["content:encoded"] ??
    item.content ??
    item.description ??
    item.summary ??
    "";
  return extractText(raw)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 250);
}

/**
 * Parse raw RSS/Atom XML into Articles. Shared by the RSS feed fetcher and
 * the Reddit `.hot.rss` fetcher (Reddit's per-subreddit RSS feed is
 * Atom-formatted, and needs no auth unlike the blocked `.json` endpoint).
 * Pass `sourceName` to override the feed's self-reported title (used to keep
 * the "Reddit r/<sub>" display convention).
 */
export function parseRssXml(xml: string, sourceName?: string): Article[] {
  const parsed = parser.parse(xml);

  const channel = parsed?.rss?.channel ?? parsed?.feed;
  if (!channel) return [];

  const items: RssItem[] = Array.isArray(channel.item)
    ? channel.item
    : channel.item
      ? [channel.item]
      : Array.isArray(channel.entry)
        ? channel.entry
        : channel.entry
          ? [channel.entry]
          : [];

  const resolvedSource = sourceName || extractText(channel.title) || "feed";

  return items
    .map((item) => {
      const title = extractText(item.title);
      const url = extractLink(item);
      if (!title || !url) return null;
      return {
        title,
        url,
        snippet: extractSnippet(item),
        source: resolvedSource,
      } satisfies Article;
    })
    .filter((a): a is Article => a !== null);
}

export async function fetchRssFeed(feedUrl: string): Promise<Article[]> {
  try {
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": "dailyreport/1.0 (personal curation bot)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn(`RSS fetch failed for ${feedUrl}: ${res.status}`);
      return [];
    }
    return parseRssXml(await res.text());
  } catch (err) {
    console.warn(`RSS error for ${feedUrl}:`, err);
    return [];
  }
}

export async function fetchRssFeeds(feedUrls: string[]): Promise<Article[]> {
  const results = await Promise.all(feedUrls.map(fetchRssFeed));
  // Deduplicate by URL
  const seen = new Set<string>();
  return results.flat().filter((a) => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });
}
