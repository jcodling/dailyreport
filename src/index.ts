import { readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
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
import { downloadYesterday, uploadToday, downloadBlacklist } from "./sftp";
import { log, warn } from "./log";

const PROJECT_ROOT = join(import.meta.dir, "..");
const isDryRun = process.argv.includes("--dry-run");
const ftpEnabled = !!process.env.FTP_HOST;

function loadConfig(): Config {
  const configPath = join(PROJECT_ROOT, "config/interests.yaml");
  const raw = readFileSync(configPath, "utf-8");
  return yaml.load(raw) as Config;
}

function gitCommitIfChanged(relPath: string, message: string, push = false): void {
  try {
    execSync(`git diff --quiet -- "${relPath}"`, { cwd: PROJECT_ROOT });
    // exit 0 means no changes
  } catch {
    // exit non-zero means file changed — stage and commit
    try {
      execSync(`git add "${relPath}"`, { cwd: PROJECT_ROOT });
      execSync(`git commit -m "${message}"`, { cwd: PROJECT_ROOT });
      log(`  [git] Committed ${relPath}`);
      if (push) {
        execSync(`git push`, { cwd: PROJECT_ROOT });
        log(`  [git] Pushed`);
      }
    } catch (err) {
      warn(`  [git] Failed to commit ${relPath}:`, err);
    }
  }
}

async function fetchAll(config: Config) {
  const allSubreddits = config.topics.flatMap((t) => t.subreddits);
  const allRssFeeds = config.topics.flatMap((t) => t.rss);

  log(`Fetching from Hacker News, ${allSubreddits.length} subreddits, ${allRssFeeds.length} RSS feeds...`);

  const [hn, reddit, rss] = await Promise.all([
    fetchHackerNews(60),
    fetchReddit(allSubreddits),
    fetchRssFeeds(allRssFeeds),
  ]);

  log(`  HN: ${hn.length} articles`);
  log(`  Reddit: ${reddit.length} articles`);
  log(`  RSS: ${rss.length} articles`);

  return [...hn, ...reddit, ...rss];
}

async function main() {
  const config = loadConfig();
  const reportsDir = join(PROJECT_ROOT, config.report_output_dir);
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  log(`\n${'─'.repeat(60)}`);
  log(`  📰 Daily Report — ${dateLabel}`);
  log(`${'─'.repeat(60)}\n`);
  log(`Loaded config: ${config.topics.length} topics, ${config.articles_per_category} articles/category`);

  // Step 1: FTP — download yesterday's report (with any votes the user added)
  if (ftpEnabled && !isDryRun) {
    log("FTP: Syncing yesterday's report and blacklist...");
    try {
      await downloadYesterday(reportsDir);
      await downloadBlacklist(join(PROJECT_ROOT, "config/blacklist.json"));
      gitCommitIfChanged("config/blacklist.json", "chore: update blacklist from remote");
    } catch (err) {
      warn("  [ftp] Download failed, continuing with local copy:", err);
    }
  }

  // Step 2: Parse feedback from yesterday's report
  log("Parsing feedback from yesterday's report...");
  const { summary: feedbackSummary, weights } = parseFeedback(
    config.feedback_weight_file,
    config.report_output_dir
  );
  log("Feedback:", feedbackSummary.split("\n")[0]);
  gitCommitIfChanged(config.feedback_weight_file, "chore: update feedback weights from daily votes");

  // Step 3: Fetch all articles in parallel
  log("Fetching articles...");
  const articles = await fetchAll(config);
  log(`Total: ${articles.length} articles fetched`);

  // Step 4: Pre-filter to top candidates per topic
  log("Pre-filtering articles...");
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
  log(stats);

  if (isDryRun) {
    log("\n=== DRY RUN — skipping Claude API call ===\n");
    log("Top 10 pre-filtered articles:");
    filtered.slice(0, 10).forEach((a, i) => {
      log(`\n[${i}] ${a.title}`);
      log(`    Source: ${a.source}`);
      log(`    URL: ${a.url}`);
    });
    log(`\n...and ${filtered.length - 10} more.`);
    return;
  }

  // Step 5: Curate with Claude
  log("Calling Claude to curate articles...");
  const curationResult = await curateWithClaude(
    filtered,
    config.topics,
    feedbackSummary,
    weights,
    config.articles_per_category
  );

  const totalArticles = curationResult.categories.reduce((sum, c) => sum + c.articles.length, 0);
  log(`Curated: ${curationResult.categories.length} categories, ${totalArticles} articles + 1 wildcard`);

  // Step 6: Render and write report
  const reportPath = renderReport(curationResult, config.report_output_dir);
  log(`Report written to: ${reportPath}`);

  // Save today's shown URLs for future deduplication
  const shownUrls = [
    ...curationResult.categories.flatMap((c) => c.articles.map((a) => a.url)),
    curationResult.wildcard.url,
  ];
  saveSeenUrls(seenUrlsFile, todayStr(), shownUrls);
  gitCommitIfChanged("config/seen-urls.json", "chore: update seen-urls", true);

  // Step 7: FTP — upload today's report to IONOS
  if (ftpEnabled) {
    log("FTP: Uploading today's report...");
    try {
      await uploadToday(reportsDir);
    } catch (err) {
      warn("  [ftp] Upload failed:", err);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
