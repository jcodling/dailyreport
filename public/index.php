<?php
session_set_cookie_params(['lifetime' => 86400 * 30, 'samesite' => 'Lax', 'secure' => true]);
session_start();
require_once __DIR__ . '/config.php';
if (empty($_SESSION['user_email']) || $_SESSION['user_email'] !== ALLOWED_EMAIL) {
    header('Location: auth.php?action=login');
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Daily Report</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root {
  --bg:         #111827;
  --surface:    #1f2937;
  --surface2:   #283447;
  --border:     #374151;
  --border2:    #4b5563;
  --text:       #f1f5f9;
  --subtext:    #cbd5e1;
  --muted:      #94a3b8;
  --link:       #93c5fd;
  --link-hover: #bfdbfe;
  --up:         #86efac;
  --up-bg:      rgba(134,239,172,.12);
  --up-border:  rgba(134,239,172,.35);
  --dn:         #fca5a5;
  --dn-bg:      rgba(252,165,165,.12);
  --dn-border:  rgba(252,165,165,.35);
  --wc:         #fcd34d;
  --wc-bg:      rgba(252,211,77,.07);
  --wc-border:  rgba(252,211,77,.25);
  --radius:     10px;
  --sidebar-w:  220px;
  --font: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
}

html { scroll-behavior: smooth; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 15px;
  line-height: 1.65;
  min-height: 100vh;
}

a { color: var(--link); text-decoration: none; }
a:hover { color: var(--link-hover); text-decoration: underline; }

/* ── Layout ───────────────────────────────────────────────────── */
#app {
  display: flex;
  min-height: 100vh;
}

/* ── Sidebar (desktop) ────────────────────────────────────────── */
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
  overflow: hidden;
}

.sidebar-brand {
  padding: 20px 16px 14px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: -.01em;
}

#date-list {
  overflow-y: auto;
  flex: 1;
  padding: 6px 0;
}

.date-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 16px;
  background: none;
  border: none;
  color: var(--muted);
  font-size: 13px;
  font-family: var(--font);
  cursor: pointer;
  text-align: left;
  transition: background .1s, color .1s;
  border-radius: 0;
}
.date-btn:hover { background: var(--surface2); color: var(--subtext); }
.date-btn.active {
  background: var(--surface2);
  color: var(--link);
  font-weight: 600;
  border-left: 2px solid var(--link);
  padding-left: 14px;
}
.date-btn .dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--border2);
  flex-shrink: 0;
}
.date-btn.active .dot { background: var(--link); }
.date-btn .voted-badge {
  margin-left: auto;
  font-size: 10px;
  color: var(--up);
  opacity: .7;
}

/* ── Mobile top bar ───────────────────────────────────────────── */
#mobile-bar {
  display: none;
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 12px 16px;
  align-items: center;
  gap: 10px;
}

.mobile-brand {
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  color: var(--text);
}

#mobile-date-select {
  flex: 1;
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 13px;
  font-family: var(--font);
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  min-width: 0;
}
#mobile-date-select:focus { outline: 2px solid var(--link); outline-offset: 1px; }

/* ── Main content ─────────────────────────────────────────────── */
#main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

#main-inner {
  width: 100%;
  max-width: 780px;
  padding: 36px 32px 80px;
}

/* ── Report nav header ────────────────────────────────────────── */
#report-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 36px;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--muted);
  font-size: 13px;
  font-family: var(--font);
  border-radius: 7px;
  cursor: pointer;
  white-space: nowrap;
  transition: color .15s, border-color .15s, background .15s;
}
.nav-btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border2);
  background: var(--surface2);
}
.nav-btn:disabled { opacity: .3; cursor: not-allowed; }

#report-date-heading {
  flex: 1;
  text-align: center;
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -.02em;
}

/* ── Category section ─────────────────────────────────────────── */
.cat-section { margin-bottom: 44px; }

.cat-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 14px;
}

.cat-icon { font-size: 18px; line-height: 1; }

.cat-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: var(--muted);
}

.cat-count {
  font-size: 11px;
  color: var(--border2);
}

.cat-toggle {
  background: none; border: none; color: var(--muted); cursor: pointer;
  font-size: 18px; padding: 0 4px; line-height: 1;
  transition: color .15s;
  display: flex; align-items: center;
  margin-left: auto;
}
.cat-toggle:hover { color: var(--text); }
.cat-toggle .toggle-icon { display: inline-block; transition: transform .2s; }
.cat-section.expanded .cat-toggle .toggle-icon { transform: rotate(90deg); }
.cat-section.expanded .cat-toggle { color: var(--text); }

/* Collapsed state (default) */
.cat-section .article-reason { display: none; }
.cat-section .vote-row       { display: none; }
.cat-section .source-name    { display: none; }
.cat-section:not(.expanded) .article-card { padding: 8px 18px; margin-bottom: 4px; }

/* Expanded state */
.cat-section.expanded .article-reason { display: block; }
.cat-section.expanded .vote-row       { display: flex; }
.cat-section.expanded .source-name    { display: inline; }
.cat-section.expanded .article-card   { padding: 16px 18px; margin-bottom: 10px; }

/* ── Article card ─────────────────────────────────────────────── */
.article-card {
  display: flex;
  gap: 14px;
  padding: 16px 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 10px;
  transition: border-color .15s, box-shadow .15s;
}
.article-card:hover {
  border-color: var(--border2);
  box-shadow: 0 2px 12px rgba(0,0,0,.2);
}
.article-card.voted-up {
  border-color: var(--up-border);
  background: linear-gradient(135deg, var(--surface) 85%, var(--up-bg));
}
.article-card.voted-dn {
  border-color: var(--dn-border);
  background: linear-gradient(135deg, var(--surface) 85%, var(--dn-bg));
}

.article-num {
  font-size: 12px;
  font-weight: 700;
  color: var(--border2);
  min-width: 20px;
  padding-top: 3px;
  text-align: right;
  flex-shrink: 0;
}

.article-body { flex: 1; min-width: 0; }

.article-title-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.article-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--link);
  word-break: break-word;
}
.article-title:hover { color: var(--link-hover); }

.source-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 7px;
  margin-top: 2px;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.source-badge img {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  object-fit: contain;
}

.article-reason {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 12px;
  line-height: 1.55;
}

/* ── Vote buttons ─────────────────────────────────────────────── */
.vote-row { display: flex; gap: 8px; }

.vote-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--muted);
  font-size: 12px;
  font-family: var(--font);
  cursor: pointer;
  transition: all .15s;
  white-space: nowrap;
}
.vote-btn .icon { font-size: 13px; }
.vote-btn:hover { border-color: var(--border2); color: var(--subtext); }

.vote-btn.up.active {
  background: var(--up-bg);
  border-color: var(--up-border);
  color: var(--up);
}
.vote-btn.dn.active {
  background: var(--dn-bg);
  border-color: var(--dn-border);
  color: var(--dn);
}

/* ── Wildcard card ────────────────────────────────────────────── */
.wc-card {
  background: var(--wc-bg);
  border: 1px solid var(--wc-border);
  border-radius: var(--radius);
  padding: 20px 22px;
  margin-bottom: 44px;
}

.wc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.wc-icon { font-size: 18px; }

.wc-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: var(--wc);
}

.wc-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--wc);
  word-break: break-word;
  line-height: 1.4;
  display: block;
  margin-bottom: 6px;
}
.wc-title:hover { opacity: .85; }

.wc-source {
  font-size: 11px;
  font-weight: 500;
  color: rgba(252,211,77,.6);
  background: rgba(252,211,77,.08);
  border: 1px solid rgba(252,211,77,.2);
  border-radius: 4px;
  padding: 2px 7px;
  display: inline-block;
  margin-bottom: 10px;
}

.wc-reason {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 14px;
  line-height: 1.55;
}

/* ── Empty / loading states ───────────────────────────────────── */
#empty-state {
  text-align: center;
  color: var(--muted);
  padding: 80px 20px;
}
#empty-state .empty-icon { font-size: 48px; margin-bottom: 16px; }
#empty-state h2 { font-size: 18px; color: var(--subtext); margin-bottom: 8px; }
#empty-state p { font-size: 14px; line-height: 1.6; }
#empty-state code {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 7px;
  font-size: 13px;
}

.skeleton {
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface2) 50%, var(--surface) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 4px;
}
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

.skeleton-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 18px;
  margin-bottom: 10px;
}
.sk-line { height: 14px; margin-bottom: 8px; }
.sk-title { width: 75%; }
.sk-source { width: 30%; height: 10px; }
.sk-reason { width: 55%; height: 10px; }

/* ── Toast ─────────────────────────────────────────────────────── */
#toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%) translateY(8px);
  background: var(--surface2);
  border: 1px solid var(--border2);
  border-radius: 8px;
  padding: 10px 18px;
  font-size: 13px;
  color: var(--subtext);
  opacity: 0;
  pointer-events: none;
  transition: opacity .2s, transform .2s;
  white-space: nowrap;
  z-index: 1000;
}
#toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* ── Settings button in sidebar brand ────────────────────────── */
.sidebar-brand { justify-content: space-between; }
.settings-btn {
  background: none; border: none; color: var(--muted); font-size: 16px;
  cursor: pointer; padding: 2px 4px; border-radius: 4px; line-height: 1;
  transition: color .15s;
}
.settings-btn:hover { color: var(--text); }

/* ── Delete button on date items ──────────────────────────────── */
.date-btn { position: relative; }
.delete-report-btn {
  display: none;
  background: none; border: none; color: var(--muted); cursor: pointer;
  font-size: 13px; padding: 2px 4px; border-radius: 4px; margin-left: auto;
  line-height: 1; transition: color .15s;
}
.date-btn:hover .delete-report-btn { display: inline-flex; }
.delete-report-btn:hover { color: var(--dn); }

/* ── Date confirm state ───────────────────────────────────────── */
.date-confirm {
  display: flex; align-items: center; gap: 6px; padding: 9px 16px;
  background: var(--surface2); border-left: 2px solid var(--dn); padding-left: 14px;
}
.confirm-label { font-size: 12px; color: var(--dn); flex: 1; }
.confirm-yes-btn, .confirm-no-btn {
  background: none; border: 1px solid var(--border); border-radius: 4px;
  font-size: 11px; padding: 2px 8px; cursor: pointer; font-family: var(--font);
}
.confirm-yes-btn { color: var(--dn); border-color: var(--dn-border); }
.confirm-no-btn { color: var(--muted); }

/* ── Settings modal ───────────────────────────────────────────── */
#settings-overlay {
  display: none; position: fixed; inset: 0; background: rgba(0,0,0,.6);
  z-index: 200; align-items: center; justify-content: center;
}
#settings-overlay.open { display: flex; }
#settings-panel {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  padding: 28px; width: 360px; max-width: calc(100vw - 32px);
}
.settings-title {
  font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 20px;
  display: flex; align-items: center; justify-content: space-between;
}
.settings-close {
  background: none; border: none; color: var(--muted); cursor: pointer;
  font-size: 18px; line-height: 1; padding: 2px;
}
.settings-row { margin-bottom: 20px; }
.settings-label { font-size: 12px; font-weight: 600; color: var(--muted);
  text-transform: uppercase; letter-spacing: .08em; margin-bottom: 8px; display: block; }
.settings-hint { font-size: 12px; color: var(--muted); margin-top: 4px; }
.settings-input {
  width: 100%; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 6px; color: var(--text); font-size: 14px; padding: 8px 12px;
  font-family: var(--font);
}
.settings-input:focus { outline: 2px solid var(--link); outline-offset: 1px; border-color: transparent; }
.danger-btn {
  width: 100%; padding: 10px; background: rgba(252,165,165,.1);
  border: 1px solid var(--dn-border); border-radius: 7px; color: var(--dn);
  font-size: 13px; font-family: var(--font); cursor: pointer; font-weight: 600;
  transition: background .15s;
}
.danger-btn:hover { background: rgba(252,165,165,.2); }
#confirm-delete-all { display: none; margin-top: 12px; padding: 14px;
  background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; }
#confirm-delete-all.open { display: block; }
#confirm-delete-all p { font-size: 13px; color: var(--subtext); margin-bottom: 12px; }
.confirm-btns { display: flex; gap: 8px; }
.confirm-cancel { flex: 1; padding: 8px; background: none; border: 1px solid var(--border);
  border-radius: 6px; color: var(--muted); cursor: pointer; font-family: var(--font); font-size: 13px; }
.confirm-delete { flex: 1; padding: 8px; background: var(--dn-bg);
  border: 1px solid var(--dn-border); border-radius: 6px; color: var(--dn);
  cursor: pointer; font-family: var(--font); font-size: 13px; font-weight: 600; }

/* ── Responsive ───────────────────────────────────────────────── */
@media (max-width: 768px) {
  #sidebar { display: none; }
  #mobile-bar { display: flex; }
  #app { flex-direction: column; }
  #main-inner { padding: 20px 16px 60px; }
  #report-nav { margin-bottom: 24px; }
  #report-date-heading { font-size: 16px; }
  .nav-btn .btn-label { display: none; }
  .nav-btn { padding: 7px 10px; }
  .article-card { padding: 14px 14px; gap: 10px; }
  .vote-btn .label { display: none; }
  .source-badge { max-width: 130px; }
}

@media (max-width: 480px) {
  .article-title { font-size: 14px; }
  .wc-card { padding: 16px; }
}

/* Touch devices: always show trash btn (no hover state on touch) */
@media (hover: none) {
  .delete-report-btn { display: inline-flex; }
}

/* Mobile delete button confirm state */
#mob-delete-btn.confirming {
  color: var(--dn);
  border-color: var(--dn-border);
  background: var(--dn-bg);
}
</style>
</head>
<body>
<div id="app">

  <!-- Desktop sidebar -->
  <aside id="sidebar">
    <div class="sidebar-brand">
      📰 Daily Report
      <button class="settings-btn" id="settings-btn" title="Settings">⚙️</button>
    </div>
    <nav id="date-list"></nav>
  </aside>

  <!-- Mobile top bar -->
  <header id="mobile-bar">
    <span class="mobile-brand">📰</span>
    <select id="mobile-date-select" aria-label="Select report date"></select>
    <button class="nav-btn" id="mob-prev" title="Previous">&#8592;</button>
    <button class="nav-btn" id="mob-next" title="Next">&#8594;</button>
    <button class="nav-btn" id="mob-delete-btn" title="Delete this report">🗑</button>
    <button class="nav-btn" id="mob-settings-btn" title="Settings">⚙️</button>
  </header>

  <!-- Main -->
  <div id="main">
    <div id="main-inner">
      <div id="report-nav">
        <button class="nav-btn" id="prev-btn">&#8592; <span class="btn-label">Prev</span></button>
        <h1 id="report-date-heading">Daily Report</h1>
        <button class="nav-btn" id="next-btn"><span class="btn-label">Next</span> &#8594;</button>
      </div>
      <div id="report-body"></div>
    </div>
  </div>
</div>

<div id="settings-overlay">
  <div id="settings-panel">
    <div class="settings-title">
      Settings
      <button class="settings-close" id="settings-close">✕</button>
    </div>
    <div class="settings-row">
      <label class="settings-label" for="max-days-input">Max days to keep</label>
      <input type="number" id="max-days-input" class="settings-input" min="0" max="365" placeholder="0 = keep all">
      <p class="settings-hint">Reports older than this are deleted automatically on page load. Set to 0 to keep all.</p>
    </div>
    <div class="settings-row">
      <button class="danger-btn" id="delete-all-btn">🗑 Delete all reports</button>
      <div id="confirm-delete-all">
        <p id="confirm-count-text">This will permanently delete all reports.</p>
        <div class="confirm-btns">
          <button class="confirm-cancel" id="confirm-cancel">Cancel</button>
          <button class="confirm-delete" id="confirm-delete">Delete all</button>
        </div>
      </div>
    </div>
  </div>
</div>

<div id="toast" role="status" aria-live="polite"></div>

<script>
'use strict';

// ── Config ─────────────────────────────────────────────────────────
const CAT_ICONS = {
  'AI':          '🤖',
  'LLM':         '🤖',
  'Software':    '💻',
  'Development': '💻',
  'Geopolitics': '🌍',
  'World':       '🌍',
  'News':        '🌍',
  'Robotics':    '🔧',
  'Electronics': '🔧',
  '3D':          '🔧',
  'Science':     '🔬',
  'Technology':  '🔬',
};

// ── State ──────────────────────────────────────────────────────────
let dates = [];
let currentDate = null;
const expandedCats = new Set();
let currentReport = null;
let pendingDelete = null;
let mobDeleteConfirming = false;
let mobDeleteTimer = null;

// ── Settings (localStorage) ─────────────────────────────────────────
const SETTINGS_KEY = 'dailyreport_settings';
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

// ── Utils ──────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function faviconUrl(url) {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
  } catch { return null; }
}

function catIcon(name) {
  for (const [k, v] of Object.entries(CAT_ICONS)) {
    if (name.includes(k)) return v;
  }
  return '📄';
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[+m-1]} ${+day}, ${y}`;
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Markdown parser ────────────────────────────────────────────────
function extractVote(line) {
  if (line.endsWith(' +1')) return 1;
  if (line.endsWith(' -1')) return -1;
  return 0;
}

function stripVote(line) {
  return line.replace(/ [+-]1$/, '');
}

function parseMarkdown(date, text) {
  const lines = text.split('\n');
  const categories = [];
  let wildcard = null;
  let currentCat = null;
  let inWildcard = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bare = stripVote(line);

    // Category heading
    if (bare.startsWith('## ')) {
      const name = bare.slice(3).trim();
      if (name.startsWith('Wildcard')) {
        inWildcard = true;
        currentCat = null;
      } else {
        inWildcard = false;
        currentCat = { name, articles: [] };
        categories.push(currentCat);
      }
      continue;
    }

    // Numbered article
    if (!inWildcard && /^\d+\./.test(bare)) {
      const m = bare.match(/^(\d+)\.\s+\[([^\]]+)\]\(([^)]+)\)\s+—\s+\*([^*]+)\*\s+—\s+(.+)$/);
      if (m && currentCat) {
        currentCat.articles.push({
          number: +m[1],
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

    // Wildcard title line: "> [Title](url) — *Source*"
    if (inWildcard && bare.startsWith('> [')) {
      const m = bare.match(/^>\s+\[([^\]]+)\]\(([^)]+)\)\s+—\s+\*([^*]+)\*/);
      if (m) {
        const reason = (lines[i + 1] || '').replace(/^>\s*/, '').trim();
        wildcard = {
          title: m[1], url: m[2], source: m[3], reason,
          lineIndex: i, vote: extractVote(line),
        };
      }
    }
  }

  return { date, categories, wildcard };
}

// ── Render ─────────────────────────────────────────────────────────
function renderSkeleton() {
  return Array(3).fill(0).map(() => `
    <div class="skeleton-card">
      <div class="skeleton sk-line sk-title"></div>
      <div class="skeleton sk-line sk-source"></div>
      <div class="skeleton sk-line sk-reason"></div>
    </div>`).join('');
}

function renderArticle(a) {
  const cls = a.vote === 1 ? 'article-card voted-up' : a.vote === -1 ? 'article-card voted-dn' : 'article-card';
  const fav = faviconUrl(a.url);
  return `
    <article class="${cls}" data-line="${a.lineIndex}">
      <div class="article-body">
        <div class="article-title-row">
          <a class="article-title" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a>
          <span class="source-badge" title="${esc(a.source)}">${fav ? `<img src="${fav}" alt="">` : ''}<span class="source-name">${esc(a.source)}</span></span>
        </div>
        <p class="article-reason">${esc(a.reason)}</p>
        <div class="vote-row">
          <button class="vote-btn up${a.vote===1?' active':''}" data-vote="1"><span class="icon">👍</span><span class="label">Useful</span></button>
          <button class="vote-btn dn${a.vote===-1?' active':''}" data-vote="-1"><span class="icon">👎</span><span class="label">Not for me</span></button>
        </div>
      </div>
    </article>`;
}

function renderWildcard(w) {
  return `
    <section class="wc-card" data-line="${w.lineIndex}">
      <div class="wc-header">
        <span class="wc-icon">✦</span>
        <span class="wc-label">Wildcard Pick</span>
      </div>
      <a class="wc-title" href="${esc(w.url)}" target="_blank" rel="noopener">${esc(w.title)}</a>
      <span class="wc-source" style="display:inline-flex;align-items:center;gap:5px;">${faviconUrl(w.url) ? `<img src="${faviconUrl(w.url)}" alt="" style="width:12px;height:12px;object-fit:contain;">` : ''}${esc(w.source)}</span>
      <p class="wc-reason">${esc(w.reason)}</p>
      <div class="vote-row">
        <button class="vote-btn up${w.vote===1?' active':''}" data-vote="1">
          <span class="icon">👍</span><span class="label">Interesting</span>
        </button>
        <button class="vote-btn dn${w.vote===-1?' active':''}" data-vote="-1">
          <span class="icon">👎</span><span class="label">Not for me</span>
        </button>
      </div>
    </section>`;
}

function renderReport(report) {
  const body = $('report-body');
  const heading = $('report-date-heading');

  if (!report) {
    heading.textContent = 'Daily Report';
    body.innerHTML = `
      <div id="empty-state">
        <div class="empty-icon">📭</div>
        <h2>No report found</h2>
        <p>Generate one with <code>bun run generate</code></p>
      </div>`;
    return;
  }

  heading.textContent = fmtDate(report.date);

  let html = '';

  for (const cat of report.categories) {
    const icon = catIcon(cat.name);
    html += `
      <section class="cat-section" data-cat="${esc(cat.name)}">
        <div class="cat-header">
          <span class="cat-icon">${icon}</span>
          <span class="cat-title">${esc(cat.name)}</span>
          <span class="cat-count">${cat.articles.length} articles</span>
          <button class="cat-toggle" title="Expand section"><span class="toggle-icon">›</span></button>
        </div>
        ${cat.articles.map(renderArticle).join('')}
      </section>`;
  }

  if (report.wildcard) html += renderWildcard(report.wildcard);

  body.innerHTML = html;
}

// ── Sidebar / date list ────────────────────────────────────────────
function buildDateUI() {
  // Desktop sidebar
  $('date-list').innerHTML = dates.map(d => {
    if (d === pendingDelete) {
      return `
        <div class="date-confirm" data-date="${d}">
          <span class="confirm-label">Delete ${fmtDate(d)}?</span>
          <button class="confirm-yes-btn" data-delete="${d}">Yes</button>
          <button class="confirm-no-btn">No</button>
        </div>`;
    }
    return `
      <div class="date-btn${d === currentDate ? ' active' : ''}" data-date="${d}" role="button" tabindex="0">
        <span class="dot"></span>
        ${fmtDate(d)}
        <button class="delete-report-btn" data-delete="${d}" title="Delete this report">🗑</button>
      </div>`;
  }).join('');

  // Mobile select
  $('mobile-date-select').innerHTML = dates.map(d =>
    `<option value="${d}"${d === currentDate ? ' selected' : ''}>${fmtDate(d)}</option>`
  ).join('');
}

function cancelPendingDelete() {
  if (!pendingDelete) return;
  pendingDelete = null;
  buildDateUI();
}

function resetMobDelete() {
  clearTimeout(mobDeleteTimer);
  mobDeleteConfirming = false;
  const btn = $('mob-delete-btn');
  btn.textContent = '🗑';
  btn.classList.remove('confirming');
}

async function confirmDeleteReport(date) {
  pendingDelete = null;
  const res = await fetch(`api/report/${date}`, { method: 'DELETE' });
  if (!res.ok) { toast('⚠️ Failed to delete report'); buildDateUI(); return; }
  dates = dates.filter(d => d !== date);
  if (currentDate === date) {
    const next = dates[0] || null;
    if (next) { loadReport(next); } else { currentDate = null; buildDateUI(); updateNavBtns(); renderReport(null); }
  } else {
    buildDateUI(); updateNavBtns();
  }
  toast('Report deleted');
}

async function deleteAllReports() {
  const res = await fetch('api/delete-all', { method: 'POST' });
  if (!res.ok) { toast('⚠️ Failed to delete reports'); return; }
  dates = []; currentDate = null; currentReport = null;
  buildDateUI(); updateNavBtns(); renderReport(null);
  toast('All reports deleted');
}

async function pruneOldReports() {
  const { maxDays } = loadSettings();
  if (!maxDays || maxDays <= 0) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxDays);
  const toDelete = dates.filter(d => new Date(d) < cutoff);
  for (const d of toDelete) {
    const res = await fetch(`api/report/${d}`, { method: 'DELETE' });
    if (res.ok) dates = dates.filter(x => x !== d);
  }
}

function updateNavBtns() {
  const idx = dates.indexOf(currentDate);
  $('prev-btn').disabled = idx >= dates.length - 1;
  $('next-btn').disabled = idx <= 0;
  $('mob-prev').disabled = idx >= dates.length - 1;
  $('mob-next').disabled = idx <= 0;
  $('mob-delete-btn').disabled = !currentDate;
  resetMobDelete();
}

// ── Data loading ───────────────────────────────────────────────────
async function loadReport(date) {
  currentDate = date;
  expandedCats.clear();
  buildDateUI();
  updateNavBtns();

  // Show skeleton while loading
  $('report-body').innerHTML = renderSkeleton();
  $('report-date-heading').textContent = fmtDate(date);

  try {
    const res = await fetch(`api/report/${date}`);
    if (!res.ok) { renderReport(null); return; }
    const text = await res.text();
    currentReport = parseMarkdown(date, text);
    renderReport(currentReport);
  } catch {
    renderReport(null);
  }
}

async function init() {
  try {
    const res = await fetch('api/reports');
    dates = await res.json();
  } catch {
    dates = [];
  }

  await pruneOldReports();
  buildDateUI();
  updateNavBtns();

  const today = todayStr();
  const target = dates.includes(today) ? today : dates[0] || null;

  if (target) {
    await loadReport(target);
  } else {
    $('report-body').innerHTML = `
      <div id="empty-state">
        <div class="empty-icon">📭</div>
        <h2>No reports yet</h2>
        <p>Run <code>bun run generate</code> to create your first report.</p>
      </div>`;
  }
}

// ── Feedback ───────────────────────────────────────────────────────
$('report-body').addEventListener('click', async e => {
  const toggle = e.target.closest('.cat-toggle');
  if (toggle) {
    const section = toggle.closest('.cat-section');
    const catName = section.dataset.cat;
    if (expandedCats.has(catName)) {
      expandedCats.delete(catName);
      section.classList.remove('expanded');
    } else {
      expandedCats.add(catName);
      section.classList.add('expanded');
    }
    return;
  }

  const btn = e.target.closest('.vote-btn');
  if (!btn) return;

  const card = btn.closest('[data-line]');
  if (!card) return;

  const lineIndex = parseInt(card.dataset.line, 10);
  const clickedVote = parseInt(btn.dataset.vote, 10);
  const currentVote = card.querySelector('.vote-btn.up.active') ? 1
    : card.querySelector('.vote-btn.dn.active') ? -1 : 0;
  const newVote = currentVote === clickedVote ? 0 : clickedVote;

  // Optimistic update
  card.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('active'));
  if (newVote !== 0) card.querySelector(`[data-vote="${newVote}"]`).classList.add('active');
  card.classList.remove('voted-up', 'voted-dn');
  if (newVote === 1) card.classList.add('voted-up');
  if (newVote === -1) card.classList.add('voted-dn');

  // Persist
  try {
    const res = await fetch('api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: currentDate, lineIndex, vote: newVote }),
    });
    if (!res.ok) throw new Error();
    const msg = newVote === 1 ? '👍 Boosting similar articles'
      : newVote === -1 ? '👎 Fewer articles like this'
      : 'Vote removed';
    toast(msg);
  } catch {
    // Revert on failure
    card.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('active'));
    if (currentVote !== 0) card.querySelector(`[data-vote="${currentVote}"]`).classList.add('active');
    card.classList.remove('voted-up', 'voted-dn');
    if (currentVote === 1) card.classList.add('voted-up');
    if (currentVote === -1) card.classList.add('voted-dn');
    toast('⚠️ Failed to save — try again');
  }
});

// ── Navigation ─────────────────────────────────────────────────────
function navigate(direction) {
  const idx = dates.indexOf(currentDate);
  const newIdx = idx + direction; // direction: +1 = older, -1 = newer
  if (newIdx >= 0 && newIdx < dates.length) loadReport(dates[newIdx]);
}

$('prev-btn').addEventListener('click', () => navigate(1));
$('next-btn').addEventListener('click', () => navigate(-1));
$('mob-prev').addEventListener('click', () => navigate(1));
$('mob-next').addEventListener('click', () => navigate(-1));
$('mobile-date-select').addEventListener('change', e => loadReport(e.target.value));
$('date-list').addEventListener('click', e => {
  const del = e.target.closest('.delete-report-btn');
  if (del) { e.stopPropagation(); pendingDelete = del.dataset.delete; buildDateUI(); return; }
  const yes = e.target.closest('.confirm-yes-btn');
  if (yes) { e.stopPropagation(); confirmDeleteReport(yes.dataset.delete); return; }
  const no = e.target.closest('.confirm-no-btn');
  if (no) { e.stopPropagation(); cancelPendingDelete(); return; }
  const btn = e.target.closest('.date-btn');
  if (btn && btn.dataset.date) { cancelPendingDelete(); loadReport(btn.dataset.date); }
});

$('date-list').addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const btn = e.target.closest('.date-btn');
  if (btn && btn.dataset.date) { e.preventDefault(); cancelPendingDelete(); loadReport(btn.dataset.date); }
});

$('mob-delete-btn').addEventListener('click', async () => {
  if (!currentDate) return;
  if (!mobDeleteConfirming) {
    mobDeleteConfirming = true;
    $('mob-delete-btn').textContent = 'Delete?';
    $('mob-delete-btn').classList.add('confirming');
    mobDeleteTimer = setTimeout(resetMobDelete, 3000);
  } else {
    resetMobDelete();
    await confirmDeleteReport(currentDate);
  }
});

$('mob-settings-btn').addEventListener('click', () => {
  cancelPendingDelete();
  resetMobDelete();
  const { maxDays } = loadSettings();
  $('max-days-input').value = maxDays || '';
  $('confirm-delete-all').classList.remove('open');
  $('settings-overlay').classList.add('open');
});

// ── Settings modal ──────────────────────────────────────────────────
$('settings-btn').addEventListener('click', () => {
  cancelPendingDelete();
  resetMobDelete();
  const { maxDays } = loadSettings();
  $('max-days-input').value = maxDays || '';
  $('confirm-delete-all').classList.remove('open');
  $('settings-overlay').classList.add('open');
});
$('settings-close').addEventListener('click', () => $('settings-overlay').classList.remove('open'));
$('settings-overlay').addEventListener('click', e => {
  if (e.target === $('settings-overlay')) $('settings-overlay').classList.remove('open');
});
$('max-days-input').addEventListener('change', e => {
  const v = parseInt(e.target.value, 10);
  saveSettings({ ...loadSettings(), maxDays: isNaN(v) ? 0 : Math.max(0, v) });
});
$('delete-all-btn').addEventListener('click', () => {
  $('confirm-count-text').textContent = `This will permanently delete all ${dates.length} report${dates.length !== 1 ? 's' : ''}.`;
  $('confirm-delete-all').classList.add('open');
});
$('confirm-cancel').addEventListener('click', () => $('confirm-delete-all').classList.remove('open'));
$('confirm-delete').addEventListener('click', async () => {
  $('settings-overlay').classList.remove('open');
  await deleteAllReports();
});

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.key === 'ArrowLeft')  navigate(1);
  if (e.key === 'ArrowRight') navigate(-1);
});

init();
</script>
</body>
</html>
