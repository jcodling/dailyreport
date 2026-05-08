import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import type { FeedbackWeights } from "./types";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

function extractKeywords(title: string): string[] {
  return title
       .toLowerCase()
       .replace(/[^a-z0-9\s]/g, " ")
       .split(/\s+/)
       .filter((w) => w.length > 3);
}

function extractFeedbackVote(line: string): 1 | -1 | 0 {
  const trimmed = line.trimEnd();
  const markerMatch = trimmed.match(/<!--\s*vote:(\+1|-1)\s*-->$/);
  if (markerMatch) return markerMatch[1] === "+1" ? 1 : -1;
  if (trimmed.endsWith(" +1")) return 1;
  if (trimmed.endsWith(" -1")) return -1;
  return 0;
}

/**
 * Parse votes from a single report file.
 */
function parseReportForVotes(filePath: string): { positives: string[]; negatives: string[] } {
  if (!existsSync(filePath)) {
    return { positives: [], negatives: [] };
    }

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const positives: string[] = [];
  const negatives: string[] = [];

  for (const line of lines) {
    const vote = extractFeedbackVote(line);
    if (vote === 0) continue;

      // Extract title from markdown link: [Title](url)
    const titleMatch = line.match(/\[([^\]]+)\]/);
    if (!titleMatch) continue;
    const title = titleMatch[1];
    if (vote === 1) {
      positives.push(title);
      } else {
      negatives.push(title);
      }
    }

  return { positives, negatives };
}

export function parseFeedback(
  weightsFile: string,
  reportsDir: string,
  extraReportFiles?: string[]    // additional report file paths to aggregate feedback from
): { summary: string; weights: FeedbackWeights } {
  const weightsPath = join(PROJECT_ROOT, weightsFile);
  let weights: FeedbackWeights = {};
  if (existsSync(weightsPath)) {
    try {
      weights = JSON.parse(readFileSync(weightsPath, "utf-8"));
      } catch {
      weights = {};
      }
    }

   // Track which titles we've already processed to avoid double-counting
   // votes when the same article appears in multiple reports.
  const processedTitles = new Set<string>();
  const uniquePositives: string[] = [];
  const uniqueNegatives: string[] = [];

   // Aggregate feedback from yesterday's report (the one that will get updated with today's votes)
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const yesterdayFile = join(PROJECT_ROOT, reportsDir, `${yesterdayStr}.md`);
  
   // Parse yesterday's report first
  const yesterdayResult = parseReportForVotes(yesterdayFile);
  for (const title of yesterdayResult.positives) {
    if (!processedTitles.has(title)) {
      processedTitles.add(title);
      uniquePositives.push(title);
      }
    }
  for (const title of yesterdayResult.negatives) {
    if (!processedTitles.has(title)) {
      processedTitles.add(title);
      uniqueNegatives.push(title);
      }
    }

   // Parse all additional historical reports (from remote server, etc.)
  if (extraReportFiles) {
    for (const filePath of extraReportFiles) {
      const result = parseReportForVotes(filePath);
      for (const title of result.positives) {
        if (!processedTitles.has(title)) {
          processedTitles.add(title);
          uniquePositives.push(title);
          }
        }
      for (const title of result.negatives) {
        if (!processedTitles.has(title)) {
          processedTitles.add(title);
          uniqueNegatives.push(title);
          }
        }
      }
     }

   // Apply feedback to weights if any unique votes were found
  if (uniquePositives.length > 0 || uniqueNegatives.length > 0) {
    for (const title of uniquePositives) {
       const keywords = extractKeywords(title);
      for (const kw of keywords) {
        weights[kw] = Math.min(1.0, (weights[kw] ?? 0) + 0.1);
        }
      }

    for (const title of uniqueNegatives) {
       const keywords = extractKeywords(title);
      for (const kw of keywords) {
        weights[kw] = Math.max(-1.0, (weights[kw] ?? 0) - 0.1);
        }
      }

    // Apply weight decay: each run reduces weights toward zero so old signals
    // gradually lose influence. 0.95 decay = ~14-day half-life.
  const decay = 0.95;
  for (const kw of Object.keys(weights)) {
    weights[kw] = parseFloat((weights[kw] * decay).toFixed(2));
    // Prune near-zero weights to keep the file manageable
    if (Math.abs(weights[kw]) < 0.01) delete weights[kw];
     }

    // Persist updated weights
    writeFileSync(weightsPath, JSON.stringify(weights, null, 2));
    }

   // Build summary
  const lines_summary: string[] = [];
  if (uniquePositives.length > 0) {
    lines_summary.push(`Liked (${uniquePositives.length}): ${uniquePositives.join("; ")}`);
    }
  if (uniqueNegatives.length > 0) {
    lines_summary.push(`Disliked (${uniqueNegatives.length}): ${uniqueNegatives.join("; ")}`);
    }

  const topBoosts = Object.entries(weights)
     .filter(([, v]) => v > 0.2)
     .sort(([, a], [, b]) => b - a)
     .slice(0, 10)
     .map(([k, v]) => `${k}(${v.toFixed(1)})`);

  const topPenalties = Object.entries(weights)
     .filter(([, v]) => v < -0.2)
     .sort(([, a], [, b]) => a - b)
     .slice(0, 10)
     .map(([k, v]) => `${k}(${v.toFixed(1)})`);

  if (topBoosts.length > 0) {
    lines_summary.push(`Boosted keywords: ${topBoosts.join(", ")}`);
    }
  if (topPenalties.length > 0) {
    lines_summary.push(`Penalized keywords: ${topPenalties.join(", ")}`);
    }

  const summary =
    lines_summary.length > 0
       ? lines_summary.join("\n")
       : "No feedback reactions found in previous reports.";

  return { summary, weights };
}
