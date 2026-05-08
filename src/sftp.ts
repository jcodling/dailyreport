import SftpClient from "ssh2-sftp-client";
import { existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { log, warn } from "./log";

// Required .env variables:
//   FTP_HOST                — IONOS SFTP hostname
//   FTP_USER                — SFTP username
//   FTP_PASS                — SFTP password
//   FTP_REMOTE_REPORTS_DIR — Absolute SFTP path to the reports dir,
//                            e.g. /projects/dailyreport/reports

function dateStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

/**
 * Retry an async operation with exponential backoff.
 * Retries up to maxRetries times, waiting 2s, 4s, 8s, etc. between attempts.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 2000
): Promise<T> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
     } catch (err: unknown) {
      lastErr = err as Error;
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        log(`    [sftp] Retry ${attempt + 1}/${maxRetries} in ${delay / 1000}s`);
        await new Promise((r) => setTimeout(r, delay));
       }
     }
   }
  throw lastErr!;
}

/**
 * Creates an SFTP client and returns it.
 */
async function makeClient(): Promise<SftpClient> {
  const host     = process.env.FTP_HOST!;
  const username = process.env.FTP_USER!;
  const password = process.env.FTP_PASS!;

  const client = new SftpClient();
  await client.connect({ host, username, password, tryKeyboard: true });
  return client;
}

/**
 * Downloads yesterday's report from IONOS.
 * Overwrites the local copy so feedback.ts picks up any votes the user added.
 * Returns true if downloaded, false if the file wasn't on the server yet.
 */
export async function downloadYesterday(localReportsDir: string): Promise<boolean> {
  const remoteDir = process.env.FTP_REMOTE_REPORTS_DIR!;
  const yesterday = dateStr(-1);
  const remoteFile = `${remoteDir}/${yesterday}.md`;
  const localFile  = join(localReportsDir, `${yesterday}.md`);

  const client = await makeClient();
  try {
    const exists = await withRetry(() => client.exists(remoteFile));
    if (!exists) {
      log(`   [sftp] ${yesterday}.md not on server yet — using local copy`);
      return false;
     }
    await withRetry(() => client.fastGet(remoteFile, localFile));
    log(`   [sftp] ↓ Downloaded ${yesterday}.md`);
    return true;
   } finally {
    await client.end();
   }
}

/**
 * Downloads blacklist.json from IONOS.
 * Overwrites the local copy so prefilter.ts applies user blacklists.
 */
export async function downloadBlacklist(localPath: string): Promise<boolean> {
  const remoteDir = process.env.FTP_REMOTE_REPORTS_DIR!;
  const remoteFile = remoteDir.replace(/\/reports\/?$/, "") + "/blacklist.json";

  const client = await makeClient();
  try {
    const exists = await withRetry(() => client.exists(remoteFile));
    if (!exists) {
      return false;
     }
    await withRetry(() => client.fastGet(remoteFile, localPath));
    log(`   [sftp] ↓ Downloaded blacklist.json`);
    return true;
   } catch (err) {
    warn(`   [sftp] Failed to download blacklist.json:`, err);
    return false;
   } finally {
    await client.end();
   }
}

/**
 * Downloads access.log from IONOS, saves it locally, then deletes the remote copy.
 * Returns the raw log content, or null if no log exists yet.
 */
export async function downloadAccessLog(localPath: string): Promise<string | null> {
  const remoteDir = process.env.FTP_REMOTE_REPORTS_DIR!;
  const remoteFile = remoteDir.replace(/\/reports\/?$/, "") + "/access.log";

  const client = await makeClient();
  try {
    const exists = await withRetry(() => client.exists(remoteFile));
    if (!exists) {
      return null;
     }
    await withRetry(() => client.fastGet(remoteFile, localPath));
    await withRetry(() => client.delete(remoteFile));
    log(`   [sftp] ↓ Downloaded access.log (reset on server)`);
    return readFileSync(localPath, "utf-8");
   } catch (err) {
    warn(`   [sftp] Failed to download access.log:`, err);
    return null;
   } finally {
    await client.end();
   }
}

/**
 * Uploads today's generated report to IONOS reports/.
 */
export async function uploadToday(localReportsDir: string): Promise<void> {
  const remoteDir = process.env.FTP_REMOTE_REPORTS_DIR!;
  const today     = dateStr(0);
  const localFile = join(localReportsDir, `${today}.md`);

  if (!existsSync(localFile)) {
    throw new Error(`[sftp] Report not found at ${localFile}`);
   }

  const client = await makeClient();
  try {
    await client.mkdir(remoteDir, true);
    await withRetry(() => client.fastPut(localFile, `${remoteDir}/${today}.md`));
    log(`   [sftp] ↑ Uploaded ${today}.md`);
   } finally {
    await client.end();
   }
}

/**
 * Fetches all historical reports from the server and saves them to a temp dir.
 * Returns paths to downloaded report files (for feedback aggregation).
 */
export async function fetchAllHistoricalReports(
  localReportsDir: string,
  feedbackTempDir: string    // separate dir for feedback aggregation temp files
): Promise<string[]> {
  const remoteDir = process.env.FTP_REMOTE_REPORTS_DIR!;
  const today     = dateStr(0);

  // Ensure temp dir exists for downloaded reports
  try { mkdirSync(feedbackTempDir, { recursive: true }); } catch {}
  const client = await makeClient();
  try {
    const entries = await withRetry(() => client.list(remoteDir));
    const mdFiles = entries
      .filter((e: { name: string; isDirectory: boolean }) => !e.isDirectory && e.name.endsWith(".md"))
      .map((e: { name: string }) => e.name);

    const downloaded: string[] = [];
    for (const filename of mdFiles) {
      const reportDate = filename.replace(".md", "");
      // Skip today's report (we generate it today)
      if (reportDate === today) continue;
      // Only fetch older reports (not last 48h — we have those locally)
      const reportDateObj = new Date(reportDate);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 2);
      if (reportDateObj < cutoff) {
        const destPath = join(feedbackTempDir, filename);
        await withRetry(() => client.fastGet(`${remoteDir}/${filename}`, destPath));
        downloaded.push(destPath);
       }
     }

    if (downloaded.length > 0) {
      log(`    [sftp] Downloaded ${downloaded.length} historical reports for feedback aggregation`);
     } else {
      log(`    [sftp] No historical reports to aggregate (all recent days have local copies)`);
     }

    return downloaded;
   } finally {
    await client.end();
   }
}
