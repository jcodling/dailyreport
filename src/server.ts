import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const PROJECT_ROOT = join(import.meta.dir, "..");
const REPORTS_DIR = join(PROJECT_ROOT, "reports");
const PORT = 3001;

// --- Types ---

type ParsedArticle = {
  number: number;
  title: string;
  url: string;
  source: string;
  reason: string;
  lineIndex: number;
  vote: 1 | -1 | 0;
};

type ParsedCategory = {
  name: string;
  articles: ParsedArticle[];
};

type ParsedReport = {
  date: string;
  categories: ParsedCategory[];
  wildcard: ParsedArticle | null;
};

// --- Markdown parsing ---

function extractVote(line: string): 1 | -1 | 0 {
  if (line.endsWith(" +1")) return 1;
  if (line.endsWith(" -1")) return -1;
  return 0;
}

function stripVote(line: string): string {
  return line.replace(/ [+-]1$/, "");
}

function parseReport(date: string): ParsedReport | null {
  const filePath = join(REPORTS_DIR, `${date}.md`);
  if (!existsSync(filePath)) return null;

  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");

  const categories: ParsedCategory[] = [];
  let wildcard: ParsedArticle | null = null;
  let inWildcard = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bare = stripVote(line);

    // Category heading
    if (bare.startsWith("## ")) {
      const name = bare.slice(3).trim();
      if (name.startsWith("Wildcard")) {
        inWildcard = true;
      } else {
        inWildcard = false;
        categories.push({ name, articles: [] });
      }
      continue;
    }

    // Numbered article: "1. [Title](url) — *Source* — Reason"
    if (!inWildcard && /^\d+\./.test(bare)) {
      const m = bare.match(/^(\d+)\.\s+\[([^\]]+)\]\(([^)]+)\)\s+—\s+\*([^*]+)\*\s+—\s+(.+)$/);
      if (m && categories.length > 0) {
        categories[categories.length - 1].articles.push({
          number: parseInt(m[1]),
          title: m[2],
          url: m[3],
          source: m[4],
          reason: m[5].trim(),
          lineIndex: i,
          vote: extractVote(line),
        });
      }
      continue;
    }

    // Wildcard title: "> [Title](url) — *Source*"
    if (inWildcard && bare.startsWith("> [")) {
      const m = bare.match(/^>\s+\[([^\]]+)\]\(([^)]+)\)\s+—\s+\*([^*]+)\*/);
      if (m) {
        const reasonLine = lines[i + 1] ?? "";
        wildcard = {
          number: 0,
          title: m[1],
          url: m[2],
          source: m[3],
          reason: reasonLine.replace(/^>\s*/, "").trim(),
          lineIndex: i,
          vote: extractVote(line),
        };
      }
    }
  }

  return { date, categories, wildcard };
}

// --- Feedback writing ---

function applyVote(date: string, lineIndex: number, vote: 1 | -1 | 0): void {
  const filePath = join(REPORTS_DIR, `${date}.md`);
  if (!existsSync(filePath)) throw new Error("Report not found");

  const lines = readFileSync(filePath, "utf-8").split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) throw new RangeError("lineIndex out of bounds");

  let line = lines[lineIndex].replace(/ [+-]1$/, "");
  if (vote === 1) line += " +1";
  else if (vote === -1) line += " -1";

  lines[lineIndex] = line;
  writeFileSync(filePath, lines.join("\n"), "utf-8");
}

// --- Helpers ---

function getAvailableDates(): string[] {
  if (!existsSync(REPORTS_DIR)) return [];
  return readdirSync(REPORTS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map((f) => f.replace(".md", ""))
    .sort()
    .reverse();
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// --- SPA HTML ---

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Daily Report</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0d1117;
  --surface: #161b22;
  --surface2: #1c2128;
  --border: #30363d;
  --text: #e6edf3;
  --muted: #8b949e;
  --link: #58a6ff;
  --up: #3fb950;
  --up-bg: rgba(63,185,80,0.15);
  --dn: #f85149;
  --dn-bg: rgba(248,81,73,0.15);
  --wildcard: #e3b341;
  --wildcard-bg: rgba(227,179,65,0.08);
  --sidebar-w: 180px;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 15px;
  line-height: 1.6;
  display: flex;
  min-height: 100vh;
}

/* Sidebar */
#sidebar {
  width: var(--sidebar-w);
  min-width: var(--sidebar-w);
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

#sidebar-header {
  padding: 16px 12px 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
}

.date-btn {
  display: block;
  width: 100%;
  padding: 9px 12px;
  background: none;
  border: none;
  text-align: left;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  transition: background 0.1s, color 0.1s;
}
.date-btn:hover { background: var(--surface2); color: var(--text); }
.date-btn.active { background: var(--surface2); color: var(--link); font-weight: 600; }

/* Main */
#main {
  flex: 1;
  min-width: 0;
  padding: 32px 40px 80px;
  max-width: 860px;
}

#report-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;
}

.nav-btn {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--muted);
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.1s, border-color 0.1s;
}
.nav-btn:hover:not(:disabled) { color: var(--text); border-color: var(--muted); }
.nav-btn:disabled { opacity: 0.3; cursor: default; }

#report-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
}

/* Category */
.category-section { margin-bottom: 40px; }

.category-title {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}

/* Article card */
.article-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 8px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  transition: border-color 0.15s;
}
.article-card:hover { border-color: #444c56; }
.article-card.voted-up { border-color: var(--up); }
.article-card.voted-dn { border-color: var(--dn); }

.article-num {
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
  min-width: 18px;
  padding-top: 2px;
}

.article-body { flex: 1; min-width: 0; }

.article-title {
  color: var(--link);
  font-weight: 600;
  text-decoration: none;
  font-size: 15px;
  overflow-wrap: break-word;
  display: inline;
}
.article-title:hover { text-decoration: underline; }

.source-badge {
  display: inline-block;
  font-size: 11px;
  color: var(--muted);
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 6px;
  margin-left: 6px;
  vertical-align: middle;
  white-space: nowrap;
  font-weight: 500;
}

.article-reason {
  font-size: 13px;
  color: var(--muted);
  margin-top: 5px;
  overflow-wrap: break-word;
}

.vote-row {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.vote-btn {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  padding: 3px 10px;
  color: var(--muted);
  transition: all 0.1s;
  display: flex;
  align-items: center;
  gap: 4px;
}
.vote-btn:hover { border-color: var(--muted); color: var(--text); }
.vote-btn.up.active { background: var(--up-bg); border-color: var(--up); color: var(--up); }
.vote-btn.dn.active { background: var(--dn-bg); border-color: var(--dn); color: var(--dn); }

/* Wildcard */
.wildcard-section {
  background: var(--wildcard-bg);
  border: 1px solid rgba(227,179,65,0.3);
  border-radius: 8px;
  padding: 18px 20px;
  margin-bottom: 40px;
}

.wildcard-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--wildcard);
  margin-bottom: 10px;
}

.wildcard-title {
  color: var(--wildcard);
  font-weight: 600;
  text-decoration: none;
  font-size: 16px;
  overflow-wrap: break-word;
}
.wildcard-title:hover { text-decoration: underline; }

.wildcard-reason {
  font-size: 13px;
  color: var(--muted);
  margin-top: 6px;
}

/* Empty state */
#empty {
  color: var(--muted);
  text-align: center;
  margin-top: 80px;
  font-size: 16px;
}

/* Toast */
#toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 13px;
  color: var(--muted);
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}
#toast.show { opacity: 1; }
</style>
</head>
<body>

<aside id="sidebar">
  <div id="sidebar-header">Reports</div>
  <div id="date-list"></div>
</aside>

<div id="main">
  <div id="report-header">
    <button class="nav-btn" id="prev-btn" title="Previous report">&#8592;</button>
    <h1 id="report-title">Daily Report</h1>
    <button class="nav-btn" id="next-btn" title="Next report">&#8594;</button>
  </div>
  <div id="report-body"></div>
</div>

<div id="toast"></div>

<script>
const $ = id => document.getElementById(id);

let dates = [];
let currentDate = null;
let currentReport = null;

function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toastMsg(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// --- Render ---

function renderCard(article, isWildcard = false) {
  if (isWildcard) {
    return \`
      <div class="wildcard-section" data-line="\${article.lineIndex}">
        <div class="wildcard-label">✦ Wildcard Pick</div>
        <a class="wildcard-title" href="\${esc(article.url)}" target="_blank" rel="noopener">\${esc(article.title)}</a>
        <span class="source-badge">\${esc(article.source)}</span>
        <p class="wildcard-reason">\${esc(article.reason)}</p>
        <div class="vote-row">
          <button class="vote-btn up\${article.vote===1?' active':''}" data-vote="1">👍 Interesting</button>
          <button class="vote-btn dn\${article.vote===-1?' active':''}" data-vote="-1">👎 Not for me</button>
        </div>
      </div>\`;
  }

  const cardClass = article.vote===1 ? 'article-card voted-up' : article.vote===-1 ? 'article-card voted-dn' : 'article-card';
  return \`
    <div class="\${cardClass}" data-line="\${article.lineIndex}">
      <div class="article-num">\${article.number}</div>
      <div class="article-body">
        <a class="article-title" href="\${esc(article.url)}" target="_blank" rel="noopener">\${esc(article.title)}</a>
        <span class="source-badge">\${esc(article.source)}</span>
        <p class="article-reason">\${esc(article.reason)}</p>
        <div class="vote-row">
          <button class="vote-btn up\${article.vote===1?' active':''}" data-vote="1">👍</button>
          <button class="vote-btn dn\${article.vote===-1?' active':''}" data-vote="-1">👎</button>
        </div>
      </div>
    </div>\`;
}

function renderReport(report) {
  if (!report) {
    $('report-body').innerHTML = '<div id="empty">No report found for this date.</div>';
    $('report-title').textContent = 'Daily Report';
    return;
  }

  $('report-title').textContent = 'Daily Report — ' + report.date;

  let html = '';

  for (const cat of report.categories) {
    html += \`<div class="category-section">
      <div class="category-title">\${esc(cat.name)}</div>\`;
    for (const a of cat.articles) html += renderCard(a);
    html += '</div>';
  }

  if (report.wildcard) {
    html += renderCard(report.wildcard, true);
  }

  $('report-body').innerHTML = html;
}

function updateNavButtons() {
  const idx = dates.indexOf(currentDate);
  $('prev-btn').disabled = idx >= dates.length - 1;
  $('next-btn').disabled = idx <= 0;
}

function updateSidebar() {
  $('date-list').querySelectorAll('.date-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.date === currentDate);
  });
}

// --- Load data ---

async function loadReport(date) {
  currentDate = date;
  updateSidebar();
  updateNavButtons();

  const res = await fetch('/api/report/' + date);
  if (!res.ok) { renderReport(null); return; }
  currentReport = await res.json();
  renderReport(currentReport);
}

async function init() {
  const res = await fetch('/api/reports');
  dates = await res.json();

  const list = $('date-list');
  list.innerHTML = dates.map(d =>
    \`<button class="date-btn" data-date="\${d}">\${d}</button>\`
  ).join('');

  list.querySelectorAll('.date-btn').forEach(btn => {
    btn.addEventListener('click', () => loadReport(btn.dataset.date));
  });

  const today = new Date().toISOString().split('T')[0];
  const target = dates.includes(today) ? today : dates[0];
  if (target) await loadReport(target);
  else $('report-body').innerHTML = '<div id="empty">No reports yet. Run <code>bun run src/index.ts</code> to generate one.</div>';
}

// --- Feedback ---

$('report-body').addEventListener('click', async (e) => {
  const btn = e.target.closest('.vote-btn');
  if (!btn) return;

  const card = btn.closest('[data-line]');
  const lineIndex = parseInt(card.dataset.line, 10);
  const clickedVote = parseInt(btn.dataset.vote, 10);

  // Determine current vote from active class
  const currentVote = card.querySelector('.vote-btn.up.active') ? 1
    : card.querySelector('.vote-btn.dn.active') ? -1 : 0;

  const newVote = currentVote === clickedVote ? 0 : clickedVote;

  // Optimistic UI update
  card.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('active'));
  if (newVote !== 0) card.querySelector(\`[data-vote="\${newVote}"]\`).classList.add('active');
  card.classList.remove('voted-up', 'voted-dn');
  if (newVote === 1) card.classList.add('voted-up');
  if (newVote === -1) card.classList.add('voted-dn');

  // Persist
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: currentDate, lineIndex, vote: newVote }),
  });

  if (!res.ok) {
    toastMsg('Failed to save feedback');
  } else {
    const msg = newVote === 1 ? '👍 Boosting similar articles'
      : newVote === -1 ? '👎 Reducing similar articles'
      : 'Feedback removed';
    toastMsg(msg);
  }
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowLeft') $('prev-btn').click();
  if (e.key === 'ArrowRight') $('next-btn').click();
});

$('prev-btn').addEventListener('click', () => {
  const idx = dates.indexOf(currentDate);
  if (idx < dates.length - 1) loadReport(dates[idx + 1]);
});

$('next-btn').addEventListener('click', () => {
  const idx = dates.indexOf(currentDate);
  if (idx > 0) loadReport(dates[idx - 1]);
});

init();
</script>
</body>
</html>`;

// --- Server ---

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // SPA
    if (req.method === "GET" && (path === "/" || path === "/index.html")) {
      return new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // List available report dates
    if (req.method === "GET" && path === "/api/reports") {
      return json(getAvailableDates());
    }

    // Get a specific report
    const reportMatch = path.match(/^\/api\/report\/(\d{4}-\d{2}-\d{2})$/);
    if (req.method === "GET" && reportMatch) {
      const date = reportMatch[1];
      const report = parseReport(date);
      if (!report) return json({ error: "Not found" }, 404);
      return json(report);
    }

    // Post feedback
    if (req.method === "POST" && path === "/api/feedback") {
      let body: { date?: string; lineIndex?: number; vote?: number };
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      const { date, lineIndex, vote } = body;

      if (!date || !isValidDate(date)) return json({ error: "Invalid date" }, 400);
      if (typeof lineIndex !== "number") return json({ error: "Invalid lineIndex" }, 400);
      if (vote !== 1 && vote !== -1 && vote !== 0) return json({ error: "Invalid vote" }, 400);

      try {
        applyVote(date, lineIndex, vote as 1 | -1 | 0);
        return json({ ok: true });
      } catch (err) {
        return json({ error: String(err) }, 500);
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Daily Report viewer → http://localhost:${PORT}`);
