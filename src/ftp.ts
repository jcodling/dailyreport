import SftpClient from "ssh2-sftp-client";
import { existsSync } from "fs";
import { join } from "path";

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
      console.log(`  [sftp] ${yesterday}.md not on server yet — using local copy`);
      return false;
    }
    await client.fastGet(remoteFile, localFile);
    console.log(`  [sftp] ↓ Downloaded ${yesterday}.md`);
    return true;
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
    console.log(`  [sftp] ↑ Uploaded ${today}.md`);
  } finally {
    await client.end();
  }
}
