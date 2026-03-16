import { readFileSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import type { Config } from "./types";
import { fetchHackerNews } from "./fetchers/hackernews";
import { fetchReddit } from "./fetchers/reddit";
import { fetchRssFeeds } from "./fetchers/rss";
import { parseFeedback } from "./feedback";
import { prefilter } from "./prefilter";
import { loadSeenUrls, saveSeenUrls, todayStr } from "./seen";
import { curateWithClaude } from "./curator";
import { renderReport } from "./report";
import { downloadYesterday, uploadToday } from "./sftp";

const PROJECT_ROOT = join(import.meta.dir, "..");
const isDryRun = process.argv.includes("--dry-run");
const ftpEnabled = !!process.env.FTP_HOST;

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
  const reportsDir = join(PROJECT_ROOT, config.report_output_dir);
  console.log(`Loaded config: ${config.topics.length} topics, ${config.articles_per_category} articles/category`);

  // Step 1: FTP — download yesterday's report (with any votes the user added)
  if (ftpEnabled && !isDryRun) {
    console.log("\nFTP: Syncing yesterday's report...");
    try {
      await downloadYesterday(reportsDir);
    } catch (err) {
      console.warn("  [ftp] Download failed, continuing with local copy:", err);
    }
  }

  // Step 2: Parse feedback from yesterday's report
  console.log("\nParsing feedback from yesterday's report...");
  const { summary: feedbackSummary, weights } = parseFeedback(
    config.feedback_weight_file,
    config.report_output_dir
  );
  console.log("Feedback:", feedbackSummary.split("\n")[0]);

  // Step 3: Fetch all articles in parallel
  console.log("\nFetching articles...");
  const articles = await fetchAll(config);
  console.log(`Total: ${articles.length} articles fetched`);

  // Step 4: Pre-filter to top candidates per topic
  console.log("\nPre-filtering articles...");
  const seenUrlsFile = join(PROJECT_ROOT, "config/seen-urls.json");
  const seenUrls = loadSeenUrls(seenUrlsFile);
  
  const blacklistFile = join(PROJECT_ROOT, "config/blacklist.json");
  let blacklistDomains = new Set<string>();
  if (require("fs").existsSync(blacklistFile)) {
    try {
      const parsed = JSON.parse(require("fs").readFileSync(blacklistFile, "utf-8"));
      blacklistDomains = new Set(parsed);
    } catch {}
  }

  const { filtered, stats } = prefilter(articles, config.topics, weights, seenUrls, blacklistDomains, config.articles_per_category);
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

  // Step 5: Curate with Claude
  console.log("\nCalling Claude to curate articles...");
  const curationResult = await curateWithClaude(
    filtered,
    config.topics,
    feedbackSummary,
    weights,
    config.articles_per_category
  );

  const totalArticles = curationResult.categories.reduce((sum, c) => sum + c.articles.length, 0);
  console.log(`Curated: ${curationResult.categories.length} categories, ${totalArticles} articles + 1 wildcard`);

  // Step 6: Render and write report
  const reportPath = renderReport(curationResult, config.report_output_dir);
  console.log(`\nReport written to: ${reportPath}`);

  // Save today's shown URLs for future deduplication
  const shownUrls = [
    ...curationResult.categories.flatMap((c) => c.articles.map((a) => a.url)),
    curationResult.wildcard.url,
  ];
  saveSeenUrls(seenUrlsFile, todayStr(), shownUrls);

  // Step 7: FTP — upload today's report to IONOS
  if (ftpEnabled) {
    console.log("\nFTP: Uploading today's report...");
    try {
      await uploadToday(reportsDir);
    } catch (err) {
      console.warn("  [ftp] Upload failed:", err);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
