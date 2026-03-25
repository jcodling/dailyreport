import SftpClient from "ssh2-sftp-client";
import { existsSync } from "fs";
import { join } from "path";
import { log, warn } from "./log";

// Required .env variables:
//   FTP_HOST               — IONOS SFTP hostname
//   FTP_USER               — SFTP username
//   FTP_PASS               — SFTP password
//   FTP_REMOTE_REPORTS_DIR — Absolute SFTP path to the reports dir,
//                            e.g. /projects/dailyreport/reports

function dateStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

export async function makeClient(): Promise<SftpClient> {
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
    const exists = await client.exists(remoteFile);
    if (!exists) {
      log(`  [sftp] ${yesterday}.md not on server yet — using local copy`);
      return false;
    }
    await client.fastGet(remoteFile, localFile);
    log(`  [sftp] ↓ Downloaded ${yesterday}.md`);
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
  const remoteFile = remoteDir.replace(/\/reports\/?$/, '') + '/blacklist.json';

  const client = await makeClient();
  try {
    const exists = await client.exists(remoteFile);
    if (!exists) {
      return false;
    }
    await client.fastGet(remoteFile, localPath);
    log(`  [sftp] ↓ Downloaded blacklist.json`);
    return true;
  } catch (err) {
    warn(`  [sftp] Failed to download blacklist.json:`, err);
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
  const remoteFile = remoteDir.replace(/\/reports\/?$/, '') + '/access.log';

  const client = await makeClient();
  try {
    const exists = await client.exists(remoteFile);
    if (!exists) {
      return null;
    }
    await client.fastGet(remoteFile, localPath);
    await client.delete(remoteFile);
    log(`  [sftp] ↓ Downloaded access.log (reset on server)`);
    return require("fs").readFileSync(localPath, "utf-8");
  } catch (err) {
    warn(`  [sftp] Failed to download access.log:`, err);
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
    await client.fastPut(localFile, `${remoteDir}/${today}.md`);
    log(`  [sftp] ↑ Uploaded ${today}.md`);
  } finally {
    await client.end();
  }
}
