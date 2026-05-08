# Daily Report

An automated daily content curation system that aggregates articles from Hacker News, Reddit, and RSS feeds, uses deterministic topic scoring to select the best picks across five interest categories, and serves them through a personal web UI with feedback-driven learning.

Zero external AI dependencies — runs entirely locally in ~1 second per curation pass.

---

## How it works

1. **Fetch** — Pulls articles from Hacker News, configured subreddits, and RSS feeds in parallel
2. **Deduplicate** — Filters out URLs seen in the past 30 days and scores articles by topic relevance
3. **Curate** — Assigns each article to its best-matching category via weighted keyword scoring, then ranks candidates by topic score + source quality + recency + engagement
4. **Learn** — Aggregates feedback from all historical remote reports, extracts keywords from voted articles, nudges `feedback-weights.json` by ±0.1 per keyword. Weights decay gradually so old signals don't dominate forever.
5. **Publish** — Renders a Markdown report, uploads it to the hosted web UI via SFTP

Runs automatically at 3 AM daily via macOS launchd.

---

## Categories

1. AI & LLMs
2. Software Development
3. Geopolitics & World News
4. Robotics, Electronics & 3D Printing
5. Science & Technology
6. Wildcard (one article outside all categories — either unexpected or high-quality but uncategorised)

---

## Scoring system

Each article is rated on a per-category basis:

| Signal | How it works |
|---|---|
| **Keyword matches** | Multi-word keywords use substring match (bonus +4); single-word tokens: title match = +3, snippet match = +1 |
| **Feedback weights** | Your past 👍/👎 votes add ±0.1 per keyword per vote, clamped to [-1.0, 1.0] |
| **Source quality** | BBC, NYT, Reuters +0.5; Nature +0.4; Hacker News +0.2. Configurable in `curator.ts`. |
| **Recency** | Today's articles get +0.3, yesterday +0.1, older articles +0.0 |
| **Engagement** | HN upvotes divided by 500 (capped at +1.0); Reddit score similarly scaled |

Final score = `(topic_score × 2) + source_bonus + recency + engagement`

The top 5 articles per category by total score are selected. The wildcard is the highest-scoring article that wasn't assigned to any category.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript (strict) |
| Curation | Deterministic scoring (no AI/L LM) |
| Feed parsing | `fast-xml-parser` |
| Remote sync | `ssh2-sftp-client` (IONOS SFTP) |
| Web UI | PHP + Vanilla JS (hosted on IONOS) |
| Auth | Google OAuth 2.0 (only allows access from configured email address) |
| Scheduler | macOS launchd |

---

## Requirements

- **Bun** runtime (for TypeScript execution)
- **IONOS SFTP** account (for hosting and report sync)
- **Google OAuth** credentials (for web UI authentication — only allows access from configured email address)
- **macOS** (for launchd automation)

No AI model or external API dependency required.

---

## Project structure

```
├── src/
│    ├── index.ts           # Pipeline orchestrator
│    ├── curator.ts         # Deterministic curation: scoring, ranking, wildcard selection
│    ├── sftp.ts            # SFTP client: download reports/blacklist, upload today, fetch historical reports
│    ├── feedback.ts        # Parse feedback markers from all reports (not just yesterday), update weights
│    ├── prefilter.ts       # Topic scoring, deduplication, best-topic assignment
│    ├── report.ts          # Markdown report renderer
│    ├── seen.ts            # 30-day rolling URL deduplication store
│    ├── deploy.ts          # One-time deployment of web UI to IONOS
│    ├── server.ts          # Local dev server (port 3001)
│    ├── log.ts             # Colourised logging helper
│    └── fetchers/
│        ├── hackernews.ts # HN top stories API
│        ├── reddit.ts      # Reddit hot posts (public JSON)
│        └── rss.ts         # Generic RSS/Atom parser
│
├── config/
│    ├── interests.yaml             # Topics, keywords, subreddits, RSS feeds
│    ├── feedback-weights.json      # Learned keyword weights (auto-updated)
│    └── seen-urls.json             # 30-day dedup store (auto-updated)
│
├── public/
│    ├── index.php          # Report viewer SPA
│    ├── api.php            # REST API (reports, voting, settings, deletion)
│    ├── auth.php           # Google OAuth handler
│    └── .htaccess          # IONOS routing config
│
├── scripts/
│    ├── install-launchd.sh   # Install macOS launchd 3 AM job + persistent wake schedule
│    ├── run.sh               # Wrapper: loads .env, sets PATH, runs pipeline
│    └── monitor.sh           # Colourised live log viewer
│
├── reports/               # Generated Markdown reports (YYYY-MM-DD.md)
└── logs/                  # Execution logs (dailyreport.log, dailyreport.err)
```

---

## Setup

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Install dependencies

```bash
bun install
```

### 3. Create `.env`

```bash
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

Fetches articles, curates deterministically using weighted scoring, writes `reports/YYYY-MM-DD.md`, and uploads it to IONOS.

### Dry run (no curation or upload)

```bash
bun run dry-run
```

Fetches and pre-filters articles without running curation or uploading. Useful for testing source config.

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

1. Downloads yesterday's report (which contains your votes as `+1`/`-1` markers at end of article lines)
2. Downloads all older reports from the server for additional signal
3. Extracts keywords from all voted titles (only words longer than 3 characters)
4. Nudges `config/feedback-weights.json` by ±0.1 per keyword, clamped to `[-1.0, 1.0]`
5. Cleans up temporary downloaded reports after aggregation

Over time, the report adapts to surface articles you actually want to read. The weight system is fully transparent — `config/feedback-weights.json` is plain readable JSON showing exactly what signals have been accumulated.

---

## Design notes

- **Deterministic curation** — Each article is scored against every topic using keyword matching, then assigned to its best-matching category. No LLM required.
- **Multi-signal ranking** — Final rank combines topic score (×2), source quality bonus, recency bonus, and engagement metrics.
- **Historical feedback** — Unlike systems that only use yesterday's report, this aggregates votes from all historical reports. The feedback system bootstraps immediately on first FTP sync with real voting data.
- **30-day deduplication** — A rolling URL window (`seen-urls.json`) prevents the same article appearing twice within a month.
- **SFTP sync model** — The pipeline pulls yesterday's report plus all older reports to read votes, generates today's report, then pushes it. Reports older than 48 hours are downloaded into a temporary directory and cleaned up after feedback parsing.
- **Keyword weights** — Simpler and more inspectable than embedding-based preference learning; the full weight map is readable JSON with each signal traceable back to a specific voted article.
- **Zero external AI deps** — Claude Code CLI and all related env vars (`CLAUDE_BIN`, `CLAUDE_MODEL`) are no longer required. Curation completes in under 1 second.
