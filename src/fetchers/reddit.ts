import type { Article } from "../types";

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

export async function fetchSubreddit(subreddit: string): Promise<Article[]> {
  const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=25`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "dailyreport/1.0 (personal curation bot)" },
    });
    if (!res.ok) {
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
    console.warn(`Reddit error for r/${subreddit}:`, err);
    return [];
  }
}

export async function fetchReddit(subreddits: string[]): Promise<Article[]> {
  const results = await Promise.all(subreddits.map(fetchSubreddit));
  return results.flat();
}
