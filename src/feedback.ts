import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { FeedbackWeights } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

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

export function parseFeedback(
  weightsFile: string,
  reportsDir: string
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

  const yesterdayFile = join(PROJECT_ROOT, reportsDir, `${yesterdayStr()}.md`);
  if (!existsSync(yesterdayFile)) {
    return { summary: "No previous report found.", weights };
  }

  const content = readFileSync(yesterdayFile, "utf-8");
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
    const keywords = extractKeywords(title);

    if (vote === 1) {
      positives.push(title);
      for (const kw of keywords) {
        weights[kw] = Math.min(1.0, (weights[kw] ?? 0) + 0.1);
      }
    }

    if (vote === -1) {
      negatives.push(title);
      for (const kw of keywords) {
        weights[kw] = Math.max(-1.0, (weights[kw] ?? 0) - 0.1);
      }
    }
  }

  // Persist updated weights
  writeFileSync(weightsPath, JSON.stringify(weights, null, 2));

  const lines_summary: string[] = [];
  if (positives.length > 0) {
    lines_summary.push(`Liked (${positives.length}): ${positives.join("; ")}`);
  }
  if (negatives.length > 0) {
    lines_summary.push(
      `Disliked (${negatives.length}): ${negatives.join("; ")}`
    );
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
      : "No feedback reactions found in yesterday's report.";

  return { summary, weights };
}
