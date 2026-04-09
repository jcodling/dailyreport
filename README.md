# Daily Report

An automated daily content curation system that aggregates articles from Hacker News, Reddit, and RSS feeds, uses Claude AI to select the best picks across five interest categories, and serves them through a personal web UI with feedback-driven learning.

---

## How it works

1. **Fetch** — Pulls articles from Hacker News, configured subreddits, and RSS feeds in parallel
2. **Deduplicate** — Filters out URLs seen in the past 30 days and scores articles by topic relevance
3. **Curate** — Sends a compact prompt to Claude, which selects 5 articles per category + 1 wildcard pick
4. **Learn** — Reads feedback markers from yesterday's report and updates keyword weights for next time
5. **Publish** — Renders a Markdown report, uploads it to the hosted web UI via SFTP

Runs automatically at 3 AM daily via macOS launchd.

---

## Categories

1. AI & LLMs
2. Software Development
3. Geopolitics & World News
4. Robotics, Electronics & 3D Printing
5. Science & Technology
6. Wildcard (one article outside all categories)

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript (strict) |
| AI | Claude Code CLI tool |
| Feed parsing | `fast-xml-parser` |
| Remote sync | `ssh2-sftp-client` (IONOS SFTP) |
| Web UI | PHP + Vanilla JS (hosted on IONOS) |
| Auth | Google OAuth 2.0 |
| Scheduler | macOS launchd |

---

## Requirements

- **Bun** runtime (for TypeScript execution)
- **Claude Code CLI** tool (for article curation)
  - Install Claude Code from [Anthropic](https://docs.anthropic.com/claude/docs/claude-code)
  - Ensure `claude` command is available in PATH
  - Set `CLAUDE_BIN` and `CLAUDE_MODEL` in your `.env` file (e.g., `CLAUDE_BIN=claude`, `CLAUDE_MODEL=claude-sonnet-4-6`)
- **IONOS SFTP** account (for hosting and report sync)
- **Google OAuth** credentials (for web UI authentication)
- **macOS** (for launchd automation)

---

## Project structure

```
├── src/
│   ├── index.ts          # Pipeline orchestrator
│   ├── curator.ts        # Claude Code CLI integration (compact ID-based prompting)
│   ├── feedback.ts       # Parse feedback markers from yesterday's report, update weights
│   ├── prefilter.ts      # Topic scoring, deduplication, candidate selection
│   ├── report.ts         # Markdown report renderer
│   ├── seen.ts           # 30-day rolling URL deduplication store
│   ├── sftp.ts           # Download yesterday / upload today via IONOS SFTP
│   ├── deploy.ts         # One-time deployment of web UI to IONOS
│   ├── server.ts         # Local dev server (port 3001)
│   └── fetchers/
│       ├── hackernews.ts # HN top stories API
│       ├── reddit.ts     # Reddit hot posts (public JSON)
│       └── rss.ts        # Generic RSS/Atom parser
│
├── config/
│   ├── interests.yaml            # Topics, keywords, subreddits, RSS feeds
│   ├── feedback-weights.json     # Learned keyword weights (auto-updated)
│   └── seen-urls.json            # 30-day dedup store (auto-updated)
│
├── public/
│   ├── index.php         # Report viewer SPA
│   ├── api.php           # REST API (reports, voting, settings, deletion)
│   ├── auth.php          # Google OAuth handler
│   └── .htaccess         # IONOS routing config
│
├── scripts/
│   ├── install-launchd.sh  # Install macOS launchd 3 AM job + persistent wake schedule
│   ├── run.sh              # Wrapper: loads .env, sets PATH, runs pipeline
│   └── monitor.sh          # Colourised live log viewer
│
├── reports/              # Generated Markdown reports (YYYY-MM-DD.md)
└── logs/                 # Execution logs (dailyreport.log, dailyreport.err)
```

---

## Setup

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Install Claude Code CLI

Follow the installation instructions from [Anthropic Claude Code docs](https://docs.anthropic.com/claude/docs/claude-code).

### 3. Install dependencies

```bash
bun install
```

### 4. Create `.env`

```bash
# Claude Code CLI
CLAUDE_BIN=claude
CLAUDE_MODEL=claude-sonnet-4-6

# IONOS SFTP
FTP_HOST=your-sftp-host
FTP_USER=your-username
FTP_PASS=your-password
FTP_REMOTE_REPORTS_DIR=/path/to/remote/reports
TARGET_DIR=/path/to/remote/web-root

# Google OAuth (for web UI login)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
ALLOWED_EMAIL=your@email.com
REDIRECT_URI=https://your-site.com/projects/dailyreport/auth.php
```

### 4. Configure your interests

Edit `config/interests.yaml` to set your topics, keywords, subreddits, and RSS feeds.

### 5. Deploy the web UI (first time only)

```bash
bun run deploy
```

Uploads `index.php`, `api.php`, `auth.php`, `.htaccess`, and a generated `config.php` (with OAuth secrets) to IONOS.

---

## Usage

### Run the full pipeline

```bash
bun run generate
```

Fetches articles, calls Claude, writes `reports/YYYY-MM-DD.md`, and uploads it to IONOS.

### Dry run (no Claude call)

```bash
bun run dry-run
```

Fetches and pre-filters articles without spending API credits. Useful for testing source config.

### View reports locally

```bash
bun run serve
```

Starts a dev server at http://localhost:3001 with the report viewer (no OAuth required).

---

## Automation (macOS launchd)

```bash
bash scripts/install-launchd.sh
```

Installs a launchd job that runs the pipeline at **3:00 AM every day**, and sets a persistent daily wake at **2:55 AM** via `pmset repeat` so the machine is awake in time. The wake schedule survives reboots and macOS updates.

> **Note:** `install-launchd.sh` requires sudo to set the wake schedule. If it can't prompt for a password (e.g. first run), set it manually: `sudo pmset repeat wake MTWRFSU 02:55:00`

**View logs (colourised):**
```bash
bash scripts/monitor.sh
```

**View full log history:**
```bash
bash scripts/monitor.sh --all
```

**Raw logs:**
```bash
tail -f logs/dailyreport.log
```

**Uninstall:**
```bash
launchctl unload ~/Library/LaunchAgents/com.dailyreport.generate.plist
rm ~/Library/LaunchAgents/com.dailyreport.generate.plist
```

---

## Feedback learning

Vote on articles in the web UI with 👍 / 👎. The next morning, the pipeline:

1. Downloads yesterday's report (which now contains your votes as `<!-- vote:+1 -->` or `<!-- vote:-1 -->` markers)
2. Extracts keywords from voted article titles
3. Nudges `config/feedback-weights.json` by ±0.1 per keyword, clamped to `[-1.0, 1.0]`
4. Applies those weights to scoring during the next pre-filter pass

Over time, the report adapts to surface articles you actually want to read.

---

## Design notes

- **Compact prompting** — Articles are sent to Claude as `ID|Title|Source|Snippet` lines. Claude returns only IDs + reasons, minimising token usage by ~60% vs full JSON.
- **30-day deduplication** — A rolling URL window (`seen-urls.json`) prevents the same article appearing twice within a month.
- **SFTP sync model** — The pipeline pulls yesterday's report to read votes, generates today's report, then pushes it. No database required.
- **Keyword weights** — Simpler and more inspectable than embedding-based preference learning; the full weight map is readable JSON.
