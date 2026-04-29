import type { Article, CurationResult, CuratedArticle, FeedbackWeights, Topic } from "./types";

const CLAUDE_BIN = process.env.CLAUDE_BIN!;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL!;
const SNIPPET_LEN = 120;

// Compact pipe-delimited article list — much cheaper than JSON
function formatArticles(articles: Article[]): string {
  return articles
    .map((a, i) => {
      const snippet = a.snippet.replace(/\|/g, " ").slice(0, SNIPPET_LEN).trim();
      return `${i}|${a.title}|${a.source}|${snippet}`;
    })
    .join("\n");
}

// Compact weights summary — only include significant weights
function formatWeights(weights: FeedbackWeights): string {
  const entries = Object.entries(weights).filter(([, v]) => Math.abs(v) > 0.2);
  if (entries.length === 0) return "";
  const boosts = entries.filter(([, v]) => v > 0).map(([k, v]) => `${k}(+${v.toFixed(1)})`);
  const penalties = entries.filter(([, v]) => v < 0).map(([k, v]) => `${k}(${v.toFixed(1)})`);
  const parts: string[] = [];
  if (boosts.length) parts.push(`Boost: ${boosts.join(", ")}`);
  if (penalties.length) parts.push(`Penalize: ${penalties.join(", ")}`);
  return parts.join(" | ");
}

// ID-based compact output schema — Claude returns IDs, we look up full articles
type CompactArticle = { id: number; reason: string };
type CompactResult = {
  categories: { name: string; articles: CompactArticle[] }[];
  wildcard: CompactArticle;
};

export async function curateWithClaude(
  articles: Article[],
  topics: Topic[],
  feedbackSummary: string,
  weights: FeedbackWeights,
  articlesPerCategory: number
): Promise<CurationResult> {
  const topicNames = topics.map((t) => t.name);
  const weightsSummary = formatWeights(weights);

  const prompt = `Personal content curator. Select best articles for user.

Categories: ${topicNames.join(" | ")}
Articles/category: ${articlesPerCategory}
${feedbackSummary !== "No previous report found." && feedbackSummary !== "No feedback reactions found in yesterday's report." ? `Feedback: ${feedbackSummary}` : ""}${weightsSummary ? `\n${weightsSummary}` : ""}

Rules:
- Pick top ${articlesPerCategory} articles per category. If <${articlesPerCategory} relevant exist, include all.
- Pick 1 wildcard: surprising/important article outside all categories.
- No duplicate stories (pick best source if multiple cover same event).
- Return ONLY JSON, no markdown. Use article IDs from the list below.

Schema:
{"categories":[{"name":"...","articles":[{"id":0,"reason":"1-sentence why"}]}],"wildcard":{"id":0,"reason":"..."}}

Articles (format: ID|Title|Source|Snippet):
${formatArticles(articles)}`;

  const env = { ...process.env };
  delete env.CLAUDECODE;

  const proc = Bun.spawn([CLAUDE_BIN, "-p", prompt, "--model", CLAUDE_MODEL], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env,
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`claude CLI exited with code ${exitCode}:\n${stderr}`);
  }

  const cleaned = stdout
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  let compact: CompactResult;
  try {
    compact = JSON.parse(cleaned) as CompactResult;
  } catch (err) {
    throw new Error(`Failed to parse Claude response as JSON:\n${stdout}\n\nError: ${err}`);
  }

  // Resolve IDs back to full article objects
  function resolve(item: CompactArticle): CuratedArticle {
    const article = articles[item.id];
    if (!article) throw new Error(`Unknown article ID ${item.id} in Claude response`);
    return { ...article, reason: item.reason };
  }

  return {
    categories: compact.categories.map((c) => ({
      name: c.name,
      articles: c.articles.map(resolve),
    })),
    wildcard: resolve(compact.wildcard),
  };
}
