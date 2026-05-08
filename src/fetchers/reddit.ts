import type { Article } from "../types";

type RedditPost = {
  data: {
    title: string;
    url: string;
    selftext: string;
    score: number;
    subreddit: string;
    permalink: string;
   };
};

type RedditResponse = {
  data: {
    children: RedditPost[];
   };
};

/**
 * Get a Reddit access token using app-only OAuth (client credentials flow).
 * Needs REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in .env.
 */
async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn("Reddit fetcher: REDDIT_CLIENT_ID/SECRET not set — subreddit feeds will be skipped. Create a Reddit app at https://www.reddit.com/prefs/apps for credentials.");
    return null;
    }

  try {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
       },
      body: "grant_type=client_credentials",
     });
    if (!res.ok) {
      console.warn(`Reddit OAuth failed: ${res.status}`);
      return null;
     }
    const data = await res.json();
    return data.access_token;
    } catch (err) {
    console.warn("Reddit OAuth error:", err);
    return null;
    }
}

let tokenCache: { token: string; expiresAt: number } | null = null;

/**
 * Fetches hot posts from a subreddit using Reddit's API with OAuth.
 */
export async function fetchSubreddit(subreddit: string): Promise<Article[]> {
  // Get or cache the access token
  let token: string;
  if (!tokenCache || Date.now() > tokenCache.expiresAt) {
    const newToken = await getAccessToken();
    if (!newToken) return [];
    // Tokens last 1 hour
    tokenCache = { token: newToken, expiresAt: Date.now() + 3600000 - 60000 };
    token = newToken;
    } else {
    token = tokenCache.token;
    }

  const url = `https://oauth.reddit.com/r/${subreddit}/hot.json?limit=25`;
  try {
    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}`, },
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
