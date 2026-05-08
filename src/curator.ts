import type { Article, CurationResult, CuratedArticle, Topic } from "./types";
import type { ScoredArticle } from "./prefilter";

// ── Source quality bonus (optional, for notable sources) ──
const SOURCE_BONUS: Record<string, number> = {
    "bbc": 0.5,
    "nytimes": 0.5,
    "reuters": 0.5,
    "nature": 0.4,
    "hacker news": 0.2,
};

// ── Recency bonus ──
function recencyBonus(articleDate: string): number {
    const today = new Date().toISOString().split("T")[0];
    if (articleDate === today) return 0.3;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    if (articleDate === yesterday) return 0.1;
    return 0;
}

// ── Deterministic ranking score ──
function rankScore(article: ScoredArticle, date: string): number {
    let score = article.topicScores[article.bestTopic] * 2;   // base topic score

    // Source quality bonus
    const sourceKey = article.source.toLowerCase();
    for (const [src, bonus] of Object.entries(SOURCE_BONUS)) {
        if (sourceKey.includes(src)) {
            score += bonus;
            break;
        }
    }

    // Recency
    score += recencyBonus(date);

    // Engagement score
    if (article.score) score += Math.min(article.score / 500, 1.0);

    return score;
}

// ── Generate a one-sentence reason deterministically ──
function generateReason(article: ScoredArticle, topics: Topic[]): string {
    const t = topics[article.bestTopic];
    if (!t) return "General interest article";

    const titleTokens = article.title.toLowerCase().split(/\s+/);
    const snippetTokens = article.snippet.toLowerCase().split(/\s+/);
    let matchingKeyword = t.keywords.find(
        (kw) => kw.toLowerCase().split(/\s+/).some(word => titleTokens.includes(word) || snippetTokens.includes(word))
    );

    if (matchingKeyword) {
        return `Relevant to ${t.name} — matches keyword "${matchingKeyword}"`;
    }
    return `Selected for overall quality in the ${t.name} category`;
}

// ── Main curation function ──
export function curate(
    scored: ScoredArticle[],
    topics: Topic[],
    articleDate: string,
    articlesPerCategory: number
): CurationResult {
    // ── Stage 1: Assign to best category, pick top N per topic ──
    const topIds = new Set<string>();
    const perTopicUsed = new Map<number, number>();

    topics.map((_, i) => perTopicUsed.set(i, 0));

    // Process articles by best-topic, picking top N per category
    for (const a of scored) {
        if (a.bestTopic < 0) continue;
        const count = perTopicUsed.get(a.bestTopic) ?? 0;
        if (count < articlesPerCategory) {
            topIds.add(a.url);
            perTopicUsed.set(a.bestTopic, count + 1);
        }
    }

    // ── Stage 2: Build categories ──
    const categories = topics.map((t, i) => {
        const articles: CuratedArticle[] = scored
            .filter((a) => a.bestTopic === i && topIds.has(a.url))
            .map((a) => ({...a, reason: generateReason(a, topics)}))
            .sort((a, b) => rankScore(b, articleDate) - rankScore(a, articleDate));
        return { name: t.name, articles };
    });

    const unassigned = scored.filter((a) => !topIds.has(a.url));
    let wildcard: ScoredArticle | undefined;
    if (unassigned.length > 0) {
      wildcard = unassigned
          .sort((a, b) => rankScore(b, articleDate) - rankScore(a, articleDate))[0];
    }

    // No articles left at all — return empty wildcard (renderer handles gracefully)
    if (!wildcard) {
        return {
            categories,
            wildcard: null as unknown as CuratedArticle,
        };
    }

    return {
        categories,
        wildcard: { ...wildcard, reason: "Surprising or interesting article outside your main topics" },
    };
}
