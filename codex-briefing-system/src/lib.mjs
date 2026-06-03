import { existsSync, readFileSync } from 'node:fs';

export function loadEnv(filePath = new URL('../.env', import.meta.url)) {
  const path = filePath instanceof URL ? filePath : new URL(filePath, import.meta.url);
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

export function targetDateFromArg() {
  const arg = process.argv.find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  if (arg) return arg;
  const now = new Date();
  return formatCstDate(now);
}

export function formatCstDate(date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

export function briefingVol(dateString) {
  const base = Date.UTC(2025, 9, 1);
  const [year, month, day] = dateString.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  return 1 + Math.round((target - base) / 86400000);
}

export function cstWindow(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const end = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const start = new Date(end.getTime() - (23 * 60 + 59) * 60 * 1000);
  return { start, end };
}

export function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|yclid)/i.test(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

export function titleLength(title) {
  return [...String(title || '').replace(/\s+/g, '')].length;
}
