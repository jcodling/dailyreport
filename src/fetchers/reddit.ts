import type { Article } from "../types";
import { log } from "../log";

type RedditPost = {
  data: {
    title: string;
    url: string;
    selftext: string;
    score: number;
    subreddit: string;
    permalink: string;
    is_self: boolean;
  };
};

type RedditResponse = {
  data: {
    children: RedditPost[];
   };
};

/**
 * Fetch a single subreddit with retry and rate-limit handling.
 */
async function fetchSubredditQuiet(subreddit: string): Promise<Article[]> {
  const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=25`;
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "dailyreport/1.0 (personal curation)" },
       });
      if (!res.ok) {
         if (res.status === 429 && attempt < maxRetries - 1) {
           const waitMs = (attempt + 1) * 3000; // 3s, 6s, 9s between retries
           log(`   [reddit] r/${subreddit} rate-limited, retrying in ${waitMs}ms...`);
           await new Promise((r) => setTimeout(r, waitMs));
           continue;
          }
        console.warn(`Reddit fetch failed for r/${subreddit}: ${res.status}`);
        return [];
       }
      const json = (await res.json()) as RedditResponse;
      return json.data.children
         .filter((p) => p.data.title && p.data.url)
         .map((p) => ({
          title: p.data.title,
          url: p.data.is_self
             ? `https://reddit.com${p.data.permalink}`
             : p.data.url,
          snippet: p.data.selftext
             ? p.data.selftext.slice(0, 200)
             : `r/${subreddit} — Score: ${p.data.score}`,
          source: `Reddit r/${subreddit}`,
          score: p.data.score,
         }));
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
 * Fetch subs in batches of 4 to avoid rate limiting.
 * Reddit allows ~60 req/min; 23 subs with exponential delays would take too long.
 * So we fetch in batches with a 3s pause between batches.
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
