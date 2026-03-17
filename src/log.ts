/** Prints a timestamped log line, e.g. [09:44:01] message */
export function log(...args: unknown[]): void {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  console.log(`[${hh}:${mm}:${ss}]`, ...args);
}

export function warn(...args: unknown[]): void {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  console.warn(`[${hh}:${mm}:${ss}]`, ...args);
}
