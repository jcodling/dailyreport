import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const REPORTS_DIR  = join(PROJECT_ROOT, "reports");
const PUBLIC_DIR   = join(PROJECT_ROOT, "public");
const PORT = 3001;

// --- Helpers ---

function getAvailableDates(): string[] {
  if (!existsSync(REPORTS_DIR)) return [];
  return readdirSync(REPORTS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map((f) => f.replace(".md", ""))
    .sort()
    .reverse();
}

function applyVote(date: string, lineIndex: number, vote: 1 | -1 | 0): void {
  const filePath = join(REPORTS_DIR, `${date}.md`);
  if (!existsSync(filePath)) throw new Error("Report not found");

  const lines = readFileSync(filePath, "utf-8").split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) throw new RangeError("lineIndex out of bounds");

  let line = lines[lineIndex].replace(/ [+-]1$/, "");
  if (vote === 1)  line += " +1";
  if (vote === -1) line += " -1";

  lines[lineIndex] = line;
  writeFileSync(filePath, lines.join("\n"), "utf-8");
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

// --- Server ---

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url  = new URL(req.url);
    const path = url.pathname;

    // Serve SPA
    if (req.method === "GET" && (path === "/" || path === "/index.html")) {
      const html = readFileSync(join(PUBLIC_DIR, "index.php"), "utf-8");
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // List report dates
    if (req.method === "GET" && path === "/api/reports") {
      return json(getAvailableDates());
    }

    // Return raw markdown (same as PHP — JS in index.html parses it)
    const reportMatch = path.match(/^\/api\/report\/(\d{4}-\d{2}-\d{2})$/);
    if (req.method === "GET" && reportMatch) {
      const date     = reportMatch[1];
      const filePath = join(REPORTS_DIR, `${date}.md`);
      if (!existsSync(filePath)) return new Response("Not found", { status: 404 });
      return new Response(readFileSync(filePath, "utf-8"), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Delete single report
    const deleteMatch = path.match(/^\/api\/report\/(\d{4}-\d{2}-\d{2})$/);
    if (req.method === "DELETE" && deleteMatch) {
      const filePath = join(REPORTS_DIR, `${deleteMatch[1]}.md`);
      if (!existsSync(filePath)) return json({ error: "Not found" }, 404);
      unlinkSync(filePath);
      return json({ ok: true });
    }

    // Delete all reports
    if (req.method === "POST" && path === "/api/delete-all") {
      getAvailableDates().forEach(d => {
        const f = join(REPORTS_DIR, `${d}.md`);
        if (existsSync(f)) unlinkSync(f);
      });
      return json({ ok: true });
    }

    // Write feedback vote
    if (req.method === "POST" && path === "/api/feedback") {
      let body: { date?: string; lineIndex?: number; vote?: number };
      try { body = await req.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      const { date, lineIndex, vote } = body;
      if (!date || !isValidDate(date))         return json({ error: "Invalid date" }, 400);
      if (typeof lineIndex !== "number")        return json({ error: "Invalid lineIndex" }, 400);
      if (vote !== 1 && vote !== -1 && vote !== 0) return json({ error: "Invalid vote" }, 400);

      try {
        applyVote(date, lineIndex, vote as 1 | -1 | 0);
        return json({ ok: true });
      } catch (err) {
        return json({ error: String(err) }, 500);
      }
    }

    // Blacklist GET
    if (req.method === "GET" && path === "/api/blacklist") {
      const blacklistFile = join(PROJECT_ROOT, "config/blacklist.json");
      if (!existsSync(blacklistFile)) return json([]);
      try {
        const blacklist = JSON.parse(readFileSync(blacklistFile, "utf-8"));
        return json(blacklist);
      } catch {
        return json([]);
      }
    }

    // Blacklist POST (Add domain)
    if (req.method === "POST" && path === "/api/blacklist") {
      let body: { domain?: string };
      try { body = await req.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      if (!body.domain) return json({ error: "Missing domain" }, 400);

      const blacklistFile = join(PROJECT_ROOT, "config/blacklist.json");
      let blacklist: string[] = [];
      if (existsSync(blacklistFile)) {
        try { blacklist = JSON.parse(readFileSync(blacklistFile, "utf-8")); } catch {}
      }

      if (!blacklist.includes(body.domain)) {
        blacklist.push(body.domain);
        writeFileSync(blacklistFile, JSON.stringify(blacklist, null, 2));
      }
      return json({ ok: true });
    }

    // Blacklist DELETE (Remove domain)
    if (req.method === "DELETE" && path === "/api/blacklist") {
      let body: { domain?: string };
      try { body = await req.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      if (!body.domain) return json({ error: "Missing domain" }, 400);

      const blacklistFile = join(PROJECT_ROOT, "config/blacklist.json");
      let blacklist: string[] = [];
      if (existsSync(blacklistFile)) {
        try { blacklist = JSON.parse(readFileSync(blacklistFile, "utf-8")); } catch {}
      }

      const filtered = blacklist.filter((d) => d !== body.domain);
      writeFileSync(blacklistFile, JSON.stringify(filtered, null, 2));
      return json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Daily Report viewer → http://localhost:${PORT}`);
