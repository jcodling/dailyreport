import { existsSync, readFileSync, writeFileSync } from "fs";

type SeenStore = Record<string, string[]>; // date → urls[]

export function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export function loadSeenUrls(seenUrlsFile: string): Set<string> {
  if (!existsSync(seenUrlsFile)) return new Set();
  const store: SeenStore = JSON.parse(readFileSync(seenUrlsFile, "utf-8"));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const result = new Set<string>();
  for (const [date, urls] of Object.entries(store)) {
    if (new Date(date) >= cutoff) urls.forEach((u) => result.add(u));
  }
  return result;
}

export function saveSeenUrls(seenUrlsFile: string, date: string, urls: string[]): void {
  const store: SeenStore = existsSync(seenUrlsFile)
    ? JSON.parse(readFileSync(seenUrlsFile, "utf-8"))
    : {};
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  for (const d of Object.keys(store)) {
    if (new Date(d) < cutoff) delete store[d];
  }
  store[date] = urls;
  writeFileSync(seenUrlsFile, JSON.stringify(store, null, 2));
}
