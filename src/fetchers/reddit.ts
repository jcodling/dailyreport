import type { Article } from "../types";
import { log } from "../log";
import { parseRssXml } from "./rss";

/**
 * Reddit blocks the unauthenticated `.json` endpoint used previously
 * (HTTP 403 for all subreddits), so we fetch each subreddit's `.hot.rss`
 * feed instead. RSS requires no OAuth/app token, and the feed is parsed
 * with the shared Atom/RSS parser in `rss.ts`.
 *
 * Tradeoff: RSS carries no numeric upvote `score`, so Reddit articles no
 * longer contribute the engagement bonus — that is acceptable since the
 * JSON path is fully unavailable.
 */

/**
 * Fetch one subreddit's hot RSS feed with retry and rate-limit handling.
 */
async function fetchSubredditQuiet(subreddit: string): Promise<Article[]> {
  const url = `https://www.reddit.com/r/${subreddit}/hot.rss`;
  const source = `Reddit r/${subreddit}`;
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "dailyreport/1.0 (personal curation)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        if (res.status === 429 && attempt < maxRetries - 1) {
          const waitMs = (attempt + 1) * 3000; // 3s, 6s between retries
          log(`     [reddit] r/${subreddit} rate-limited, retrying in ${waitMs}ms...`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        console.warn(`Reddit fetch failed for r/${subreddit}: ${res.status}`);
        return [];
      }
      const xml = await res.text();
      return parseRssXml(xml, source);
    } catch (err) {
      if (attempt < maxRetries - 1) {
        log(`   [reddit] r/${subreddit} fetch error, retrying...`);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      console.warn(`Reddit error for r/${subreddit}:`, err);
      return [];
    }
  }
  return [];
}

/**
 * Fetch subs in batches of 4 to stay well under Reddit's rate limit while
 * keeping total runtime bounded. Batcher of the old JSON approach.
 */
export async function fetchReddit(subreddits: string[]): Promise<Article[]> {
  const BATCH_SIZE = 4;
  const BATCH_DELAY = 3000;
  const allResults: Article[] = [];

  for (let i = 0; i < subreddits.length; i += BATCH_SIZE) {
    const batch = subreddits.slice(i, i + BATCH_SIZE);
    console.log(`    Reddit batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(subreddits.length / BATCH_SIZE)}...`);
    const results = await Promise.all(batch.map(fetchSubredditQuiet));
    allResults.push(...results.flat());
    if (i + BATCH_SIZE < subreddits.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY));
    }
  }

  return allResults;
}
