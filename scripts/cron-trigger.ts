#!/usr/bin/env bun
/**
 * Cron trigger script for daily report generation.
 * Triggers the remote server endpoint via HTTP POST.
 *
 * Usage:
 *   bun scripts/cron-trigger.ts         # Uses SERVER_URL from .env or defaults to localhost:3001
 *
 * Environment variables:
 *   API_KEY       — API key for authenticating the cron trigger (required)
 *   SERVER_URL    — URL of the dailyreport server (default: http://localhost:3001)
 *
 * Can be used in crontab:
 *   0 3 * * * /usr/bin/bun /path/to/dailyreport/scripts/cron-trigger.ts
 */

const API_KEY = process.env.API_KEY;
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3001";

if (!API_KEY) {
  console.error("ERROR: API_KEY not set in environment");
  console.error("Set API_KEY=<your-secret-key> in .env or as an environment variable");
  process.exit(1);
}

async function triggerReport(): Promise<void> {
  const url = `${SERVER_URL}/admin/cron/generate`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json",
    },
  });

  const result = await res.json();

  if (!res.ok) {
    console.error("Trigger failed:", result);
    process.exit(1);
  }

  console.log("Report generation triggered:", result);
}

triggerReport().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
