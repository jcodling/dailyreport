import type { Article, CurationResult, CuratedArticle, FeedbackWeights, Topic } from "./types";

const CLAUDE_BIN = process.env.CLAUDE_BIN!;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL!;
const SNIPPET_LEN = 120;
const CLAUDE_TIMEOUT_MS = 3 * 60 * 1000;
const CLAUDE_MAX_ATTEMPTS = 5;
const CLAUDE_BACKOFF_BASE_MS = 5_000;

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

async function callClaudeCLI(prompt: string): Promise<string> {
  const env = { ...process.env };
  delete env.CLAUDECODE;

  const proc = Bun.spawn([CLAUDE_BIN, "-p", prompt, "--model", CLAUDE_MODEL], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env,
  });

  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      proc.kill();
      reject(new Error(`Claude CLI timed out after ${CLAUDE_TIMEOUT_MS / 1000}s`));
    }, CLAUDE_TIMEOUT_MS);
  });

  let stdout: string, stderr: string;
  try {
    [stdout, stderr] = await Promise.race([
      Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeoutId!);
  }

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`claude CLI exited with code ${exitCode}:\n${stderr}`);
  }
  return stdout;
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

  let stdout = "";
  let lastError: unknown;
  for (let attempt = 1; attempt <= CLAUDE_MAX_ATTEMPTS; attempt++) {
    try {
      stdout = await callClaudeCLI(prompt);
      break;
    } catch (err) {
      lastError = err;
      if (attempt < CLAUDE_MAX_ATTEMPTS) {
        const delay = CLAUDE_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        console.error(`Claude attempt ${attempt} failed, retrying in ${delay / 1000}s:`, err);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  if (!stdout) throw new Error(`Claude failed after ${CLAUDE_MAX_ATTEMPTS} attempts: ${lastError}`);

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
