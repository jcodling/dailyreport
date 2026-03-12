import * as ftp from "basic-ftp";
import { existsSync } from "fs";
import { join } from "path";

// Required .env variables when FTP is enabled:
//   FTP_HOST               — IONOS FTP hostname, e.g. ftp.yourdomain.com
//   FTP_USER               — FTP username
//   FTP_PASS               — FTP password
//   FTP_REMOTE_REPORTS_DIR — Absolute FTP path to the reports dir,
//                            e.g. /dailyreport/public/reports
//                            Run `pwd` after connecting to find your FTP root.

function dateStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

async function makeClient(): Promise<ftp.Client> {
  const host     = process.env.FTP_HOST!;
  const user     = process.env.FTP_USER!;
  const password = process.env.FTP_PASS!;

  const client = new ftp.Client();
  client.ftp.verbose = false;

  // IONOS supports FTPS (explicit TLS on port 21) — try secure first, fall back to plain
  try {
    await client.access({ host, user, password, secure: true });
  } catch {
    client.close();
    const plain = new ftp.Client();
    plain.ftp.verbose = false;
    await plain.access({ host, user, password, secure: false });
    return plain;
  }

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
    await client.downloadTo(localFile, remoteFile);
    console.log(`  [ftp] ↓ Downloaded ${yesterday}.md`);
    return true;
  } catch (err: unknown) {
    if (err instanceof ftp.FTPError && err.code === 550) {
      console.log(`  [ftp] ${yesterday}.md not on server yet — using local copy`);
      return false;
    }
    throw err;
  } finally {
    client.close();
  }
}

/**
 * Uploads today's generated report to IONOS public/reports/.
 */
export async function uploadToday(localReportsDir: string): Promise<void> {
  const remoteDir = process.env.FTP_REMOTE_REPORTS_DIR!;
  const today     = dateStr(0);
  const localFile = join(localReportsDir, `${today}.md`);

  if (!existsSync(localFile)) {
    throw new Error(`[ftp] Report not found at ${localFile}`);
  }

  const client = await makeClient();
  try {
    await client.ensureDir(remoteDir);
    await client.uploadFrom(localFile, `${remoteDir}/${today}.md`);
    console.log(`  [ftp] ↑ Uploaded ${today}.md`);
  } finally {
    client.close();
  }
}
