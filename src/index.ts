import { readFileSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import type { Config } from "./types";
import { fetchHackerNews } from "./fetchers/hackernews";
import { fetchReddit } from "./fetchers/reddit";
import { fetchRssFeeds } from "./fetchers/rss";
import { parseFeedback } from "./feedback";
import { prefilter } from "./prefilter";
import { curateWithClaude } from "./curator";
import { renderReport } from "./report";

const PROJECT_ROOT = join(import.meta.dir, "..");
const isDryRun = process.argv.includes("--dry-run");

function loadConfig(): Config {
  const configPath = join(PROJECT_ROOT, "config/interests.yaml");
  const raw = readFileSync(configPath, "utf-8");
  return yaml.load(raw) as Config;
}

async function fetchAll(config: Config) {
  const allSubreddits = config.topics.flatMap((t) => t.subreddits);
  const allRssFeeds = config.topics.flatMap((t) => t.rss);

  console.log(`Fetching from Hacker News, ${allSubreddits.length} subreddits, ${allRssFeeds.length} RSS feeds...`);

  const [hn, reddit, rss] = await Promise.all([
    fetchHackerNews(60),
    fetchReddit(allSubreddits),
    fetchRssFeeds(allRssFeeds),
  ]);

  console.log(`  HN: ${hn.length} articles`);
  console.log(`  Reddit: ${reddit.length} articles`);
  console.log(`  RSS: ${rss.length} articles`);

  return [...hn, ...reddit, ...rss];
}

async function main() {
  const config = loadConfig();
  console.log(`Loaded config: ${config.topics.length} topics, ${config.articles_per_category} articles/category`);

  // Step 1: Parse feedback from yesterday's report
  console.log("\nParsing feedback from yesterday's report...");
  const { summary: feedbackSummary, weights } = parseFeedback(
    config.feedback_weight_file,
    config.report_output_dir
  );
  console.log("Feedback:", feedbackSummary.split("\n")[0]);

  // Step 2: Fetch all articles in parallel
  console.log("\nFetching articles...");
  const articles = await fetchAll(config);
  console.log(`Total: ${articles.length} articles fetched`);

  // Step 3: Pre-filter to top candidates per topic
  console.log("\nPre-filtering articles...");
  const { filtered, stats } = prefilter(articles, config.topics, weights, config.articles_per_category);
  console.log(stats);

  if (isDryRun) {
    console.log("\n=== DRY RUN — skipping Claude API call ===\n");
    console.log("Top 10 pre-filtered articles:");
    filtered.slice(0, 10).forEach((a, i) => {
      console.log(`\n[${i}] ${a.title}`);
      console.log(`    Source: ${a.source}`);
      console.log(`    URL: ${a.url}`);
    });
    console.log(`\n...and ${filtered.length - 10} more.`);
    return;
  }

  // Step 4: Curate with Claude
  console.log("\nCalling Claude to curate articles...");
  const curationResult = await curateWithClaude(
    filtered,
    config.topics,
    feedbackSummary,
    weights,
    config.articles_per_category
  );

  const categoryCount = curationResult.categories.length;
  const totalArticles = curationResult.categories.reduce(
    (sum, c) => sum + c.articles.length,
    0
  );
  console.log(`Curated: ${categoryCount} categories, ${totalArticles} articles + 1 wildcard`);

  // Step 5: Render and write report
  const reportPath = renderReport(curationResult, config.report_output_dir);
  console.log(`\nReport written to: ${reportPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
