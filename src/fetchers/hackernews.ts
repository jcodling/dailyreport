import type { Article } from "../types";

const HN_API = "https://hacker-news.firebaseio.com/v0";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HN fetch failed: ${res.status} ${url}`);
  return res.json() as Promise<T>;
}

type HNItem = {
  id: number;
  title?: string;
  url?: string;
  text?: string;
  score?: number;
  descendants?: number;
  type?: string;
};

export async function fetchHackerNews(limit = 60): Promise<Article[]> {
  const ids = await fetchJson<number[]>(`${HN_API}/topstories.json`);
  const top = ids.slice(0, 200);

  // Fetch items in batches of 20
  const batchSize = 20;
  const items: HNItem[] = [];
  for (let i = 0; i < Math.min(top.length, 200); i += batchSize) {
    const batch = top.slice(i, i + batchSize);
    const fetched = await Promise.all(
      batch.map((id) => fetchJson<HNItem>(`${HN_API}/item/${id}.json`))
    );
    items.push(...fetched);
  }

  return items
    .filter((item) => item.type === "story" && item.title && (item.url || item.text))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit)
    .map((item) => ({
      title: item.title!,
      url: item.url ?? `https://news.ycombinator.com/item?id=${item.id}`,
      snippet: item.text
        ? item.text.replace(/<[^>]*>/g, "").slice(0, 200)
        : `Score: ${item.score ?? 0}, Comments: ${item.descendants ?? 0}`,
      source: "Hacker News",
      score: item.score,
    }));
}
