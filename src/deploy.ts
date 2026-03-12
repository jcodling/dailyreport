// src/deploy.ts — run once after any web UI change
import { makeClient } from "./sftp";
import { join } from "path";

const PUBLIC_DIR = join(import.meta.dir, "..", "public");

async function deploy() {
  const targetDir = process.env.TARGET_DIR;
  if (!targetDir) throw new Error("TARGET_DIR not set in .env");

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const allowedEmail = process.env.ALLOWED_EMAIL;
  if (!clientId || !clientSecret || !allowedEmail) {
    throw new Error("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and ALLOWED_EMAIL must be set in .env");
  }

  const configPhp = `<?php
define('GOOGLE_CLIENT_ID',     '${clientId}');
define('GOOGLE_CLIENT_SECRET', '${clientSecret}');
define('ALLOWED_EMAIL',        '${allowedEmail}');
define('REDIRECT_URI',         'https://things.jcodling.ca/projects/dailyreport/auth.php');
`;

  const client = await makeClient();
  try {
    await client.mkdir(targetDir, true);

    // Generate config.php from env and upload (never stored in git)
    await client.put(Buffer.from(configPhp), `${targetDir}/config.php`);
    console.log("  ↑ config.php");

    for (const file of ["index.php", "auth.php", "api.php", ".htaccess"]) {
      await client.fastPut(join(PUBLIC_DIR, file), `${targetDir}/${file}`);
      console.log(`  ↑ ${file}`);
    }

    await client.mkdir(`${targetDir}/reports`, true);
    console.log(`  ✓ reports/ directory ready`);
    console.log(`\nDeployed → https://things.jcodling.ca/projects/dailyreport/`);
  } finally {
    await client.end();
  }
}

deploy().catch(err => { console.error(err); process.exit(1); });
