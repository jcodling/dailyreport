import type { Article, FeedbackWeights, Topic } from "./types";

// How many candidates per topic to keep for Claude (articlesPerCategory * this multiplier)
const CANDIDATES_PER_TOPIC = 4;
// How many wildcard candidates (low-relevance articles) to keep
const WILDCARD_POOL_SIZE = 20;

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function scoreArticle(
  article: Article,
  keywords: string[],
  weights: FeedbackWeights
): number {
  const titleTokens = tokenize(article.title);
  const snippetTokens = tokenize(article.snippet);

  let score = 0;

  for (const kw of keywords) {
    const kwTokens = tokenize(kw);
    // Multi-word keyword: check as substring in lowercased text
    const combinedText = `${article.title} ${article.snippet}`.toLowerCase();
    if (kwTokens.length > 1) {
      if (combinedText.includes(kw.toLowerCase())) score += 4;
    } else {
      if (titleTokens.includes(kw)) score += 3;
      if (snippetTokens.includes(kw)) score += 1;
    }
  }

  // Apply feedback weights — boost or penalize based on user's past reactions
  for (const token of [...titleTokens, ...snippetTokens]) {
    if (weights[token] !== undefined) {
      score += weights[token] * 2;
    }
  }

  // Small bonus for high-engagement articles
  if (article.score) score += Math.min(article.score / 500, 1.0);

  return score;
}

export type ScoredArticle = Article & { topicScores: number[]; bestScore: number };

export function prefilter(
  articles: Article[],
  topics: Topic[],
  weights: FeedbackWeights,
  seenUrls: Set<string>,
  blacklistDomains: Set<string>,
  articlesPerCategory: number
): { filtered: Article[]; stats: string } {
  const keep = articlesPerCategory * CANDIDATES_PER_TOPIC;

  // Deduplicate by URL first
  const seen = new Set<string>();
  const deduped = articles.filter((a) => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  // Filter out articles already shown in previous reports or in the blacklist
  const fresh = deduped.filter((a) => {
    if (seenUrls.has(a.url)) return false;
    try {
      const hostname = new URL(a.url).hostname.replace(/^www\./, "");
      if (blacklistDomains.has(hostname)) return false;
    } catch {
      // Invalid URL? Skip or just let it through
    }
    return true;
  });

  // Score every article against every topic
  const scored: ScoredArticle[] = fresh.map((a) => {
    const topicScores = topics.map((t) => scoreArticle(a, t.keywords, weights));
    return { ...a, topicScores, bestScore: Math.max(...topicScores) };
  });

  // Per-topic: keep top N by that topic's score
  const keptIds = new Set<string>();
  const perTopicCounts: number[] = [];

  for (let i = 0; i < topics.length; i++) {
    const sorted = [...scored].sort((a, b) => b.topicScores[i] - a.topicScores[i]);
    let added = 0;
    for (const a of sorted) {
      if (added >= keep) break;
      if (a.topicScores[i] <= 0) break; // no keyword match at all
      keptIds.add(a.url);
      added++;
    }
    perTopicCounts.push(added);
  }

  // Wildcard pool: articles that didn't score well on any topic
  const wildcardCandidates = scored
    .filter((a) => !keptIds.has(a.url) && a.bestScore < 1)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, WILDCARD_POOL_SIZE);

  wildcardCandidates.forEach((a) => keptIds.add(a.url));

  const filtered = scored.filter((a) => keptIds.has(a.url));

  const stats = [
    `Pre-filter: ${deduped.length} deduped → ${deduped.length - fresh.length} already seen → ${filtered.length} kept`,
    topics.map((t, i) => `  ${t.name}: ${perTopicCounts[i]} candidates`).join("\n"),
    `  Wildcard pool: ${wildcardCandidates.length}`,
  ].join("\n");

  return { filtered, stats };
}
