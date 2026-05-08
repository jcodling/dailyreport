import type { Article, FeedbackWeights, Topic } from "./types";

// Maximum wildcard candidates to keep (low-relevance but decent general quality)
const WILDCARD_POOL_LIMIT = 15;

export type ScoredArticle = Article & {
  topicScores: number[];
  bestScore: number;
  bestTopic: number; // index into topics[] or -1 if no topic fits
};

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

export function prefilter(
  articles: Article[],
  topics: Topic[],
  weights: FeedbackWeights,
  seenUrls: Set<string>,
  blacklistDomains: Set<string>,
  articlesPerCategory: number
): { scored: ScoredArticle[]; stats: string } {
  // ── Deduplicate by URL ──
  const seen = new Set<string>();
  const deduped = articles.filter((a) => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  // ── Filter out already-seen or blacklisted domains ──
  const fresh = deduped.filter((a) => {
    if (seenUrls.has(a.url)) return false;
    try {
      const hostname = new URL(a.url).hostname.replace(/^www\./, "");
      if (blacklistDomains.has(hostname)) return false;
    } catch {
      // Invalid URL — let it through, filtering happens later
    }
    return true;
  });

  // ── Score every article against every topic ──
  const scored: ScoredArticle[] = fresh.map((a) => {
    const topicScores = topics.map((t) => scoreArticle(a, t.keywords, weights));
    const bestScore = Math.max(...topicScores);
    const bestTopic = topicScores.indexOf(bestScore);
    return { ...a, topicScores, bestScore, bestTopic };
  });

  // ── Two-stage selection ──

  // Stage 1: Assign each article to its BEST category
  const assigned = new Set<string>(); // URLs assigned to a topic category
  const perTopicCounts: number[] = Array(topics.length).fill(0);

  for (const a of scored) {
    const idx = a.bestTopic;
    if (idx >= 0 && a.bestScore > 0 && perTopicCounts[idx] < articlesPerCategory * 3) {
      assigned.add(a.url);
      perTopicCounts[idx]++;
    }
  }

  // Stage 2: Wildcard pool = not assigned to any category, but still decent general quality
  const wildcardCandidates = scored
    .filter((a) => !assigned.has(a.url) && a.bestScore < 1)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, WILDCARD_POOL_LIMIT);

  const stats = [
    `Prefilter: ${deduped.length} deduped → ${deduped.length - fresh.length} already seen → ${scored.length} scored`,
    topics.map((t, i) => `   ${t.name}: ${perTopicCounts[i]} candidates`).join("\n"),
    `  Wildcard pool: ${wildcardCandidates.length}`,
  ].join("\n");

  return { scored, stats };
}
