import fs from 'node:fs/promises';
import path from 'node:path';
import { createTransport } from 'nodemailer';

const SITE_URL = process.env.PUBLIC_SITE_URL || 'https://yaojingwen2002.github.io/janet-public-site/';
const ROOT = process.cwd();
const CONFIG_FILE = path.join(ROOT, 'scripts/supabase-config.js');
const NEWS_INDEX_FILE = path.join(ROOT, 'data/news-index.json');

function boolFromEnv(value) {
  return /^(1|true|yes)$/i.test(String(value || ''));
}

function booleanValue(value) {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    if (/^true$/i.test(value)) return true;
    if (/^false$/i.test(value)) return false;
  }
  return null;
}

function cleanBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function maskEmail(email) {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return '[invalid-email]';
  return `${name.slice(0, 2)}***@${domain}`;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function readSupabaseUrlFromConfig() {
  const source = await fs.readFile(CONFIG_FILE, 'utf8');
  const match = source.match(/SUPABASE_URL\s*=\s*'([^']+)'/);
  return match ? match[1] : '';
}

function parseTitle(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

function stripUnsafeEmailParts(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<link\b[^>]*potato-center[^>]*>/gi, '')
    .replace(/<link\b[^>]*comments[^>]*>/gi, '');
}

function injectEmailBanner(html, onlineUrl) {
  const banner = [
    '<div style="margin:0;padding:14px 18px;background:#1A3A2A;color:#fffdf8;font:14px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">',
    'Janet 快车箱已送达。若邮件排版异常，',
    `<a href="${onlineUrl}" style="color:#18E299;text-decoration:underline;">点这里在线阅读</a>。`,
    '</div>'
  ].join('');

  if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (body) => body + banner);
  return banner + html;
}

function textVersion({ title, summary, onlineUrl }) {
  return [
    title,
    '',
    summary || '今天的 Janet 快车箱已经发布。',
    '',
    `在线阅读：${onlineUrl}`,
    '',
    '你收到这封邮件，是因为你在 Janet Public Site 注册了邮箱账号并开启了每日晨报。'
  ].join('\n');
}

async function supabaseFetch(supabaseUrl, serviceRoleKey, restPath, options = {}) {
  const url = `${cleanBaseUrl(supabaseUrl)}/rest/v1/${restPath}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase REST ${response.status}: ${body.slice(0, 500)}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function supabaseAuthFetch(supabaseUrl, serviceRoleKey, authPath, options = {}) {
  const url = `${cleanBaseUrl(supabaseUrl)}/auth/v1/${authPath}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase Auth ${response.status}: ${body.slice(0, 500)}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function listAuthUsers(supabaseUrl, serviceRoleKey) {
  const users = [];
  const perPage = 1000;
  for (let page = 1; page < 1000; page += 1) {
    const data = await supabaseAuthFetch(supabaseUrl, serviceRoleKey, `admin/users?page=${page}&per_page=${perPage}`);
    const batch = Array.isArray(data?.users) ? data.users : [];
    users.push(...batch);
    if (batch.length < perPage) break;
  }
  return users;
}

async function getSubscribers(supabaseUrl, serviceRoleKey) {
  const [subscribers, profiles, authUsers] = await Promise.all([
    supabaseFetch(
      supabaseUrl,
      serviceRoleKey,
      'newsletter_subscribers?select=email,display_name,last_sent_at,subscribed&email=not.is.null'
    ),
    supabaseFetch(
      supabaseUrl,
      serviceRoleKey,
      'profiles?select=email,display_name,username,newsletter_opt_in,is_guest&is_guest=eq.false&email=not.is.null'
    ),
    listAuthUsers(supabaseUrl, serviceRoleKey)
  ]);

  const byEmail = new Map();
  const optedOut = new Set();
  const lastSentByEmail = new Map();
  for (const row of subscribers || []) {
    const email = normalizeEmail(row.email);
    if (!validEmail(email)) continue;
    if (row.last_sent_at) lastSentByEmail.set(email, row.last_sent_at);
    if (row.subscribed === false) {
      optedOut.add(email);
      continue;
    }
    byEmail.set(email, {
      email,
      displayName: row.display_name || '',
      lastSentAt: row.last_sent_at || '',
      source: 'newsletter_subscribers'
    });
  }

  for (const user of authUsers || []) {
    const email = normalizeEmail(user.email);
    if (!validEmail(email)) continue;
    const metadata = user.user_metadata || {};
    const optIn = booleanValue(metadata.newsletter_opt_in);
    if (optIn === false) {
      optedOut.add(email);
      byEmail.delete(email);
      continue;
    }
    if (optedOut.has(email) || byEmail.has(email)) continue;
    byEmail.set(email, {
      email,
      displayName: metadata.display_name || metadata.username || metadata.name || '',
      lastSentAt: lastSentByEmail.get(email) || '',
      source: 'auth.users'
    });
  }

  for (const row of profiles || []) {
    const email = normalizeEmail(row.email);
    if (!validEmail(email) || optedOut.has(email) || byEmail.has(email)) continue;
    byEmail.set(email, {
      email,
      displayName: row.display_name || row.username || '',
      lastSentAt: lastSentByEmail.get(email) || '',
      source: 'profiles'
    });
  }

  return Array.from(byEmail.values());
}

async function markSent(supabaseUrl, serviceRoleKey, subscriber, sentAt) {
  await supabaseFetch(
    supabaseUrl,
    serviceRoleKey,
    'newsletter_subscribers?on_conflict=email',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        email: subscriber.email,
        display_name: subscriber.displayName || null,
        subscribed: true,
        source: subscriber.source || 'daily-briefing-email',
        updated_at: sentAt,
        last_sent_at: sentAt
      })
    }
  );
}

async function main() {
  const dryRun = boolFromEnv(process.env.DRY_RUN);
  const forceSend = boolFromEnv(process.env.FORCE_SEND);
  const requestedEmail = normalizeEmail(process.env.RECIPIENT_EMAIL || '');
  if (requestedEmail && !validEmail(requestedEmail)) throw new Error(`Invalid RECIPIENT_EMAIL: ${process.env.RECIPIENT_EMAIL}`);

  const supabaseUrl = process.env.SUPABASE_URL || await readSupabaseUrlFromConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const newsIndex = JSON.parse(await fs.readFile(NEWS_INDEX_FILE, 'utf8'));
  const editionId = process.env.BRIEFING_EDITION_ID || newsIndex.latest_edition_id;
  const edition = (newsIndex.editions || []).find((item) => item.edition_id === editionId) || {};
  const outputPath = path.join(ROOT, edition.url || `data/${editionId}/output.html`);
  const rawHtml = await fs.readFile(outputPath, 'utf8');
  const onlineUrl = new URL(edition.url || `data/${editionId}/output.html`, SITE_URL).toString();
  const title = edition.title || parseTitle(rawHtml) || `Janet 快车箱 · ${editionId}`;
  const subject = process.env.MAIL_SUBJECT || `Janet 快车箱 · AI 晨报 · ${editionId} · ${title}`;
  const html = injectEmailBanner(stripUnsafeEmailParts(rawHtml), onlineUrl);
  const text = textVersion({ title: subject, summary: edition.summary || '', onlineUrl });

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Put service role key in GitHub Secrets, never in the repo.');
  }

  let subscribers = await getSubscribers(supabaseUrl, serviceRoleKey);
  if (requestedEmail) {
    subscribers = subscribers.filter((subscriber) => subscriber.email === requestedEmail);
    if (subscribers.length === 0) {
      throw new Error(`Recipient ${maskEmail(requestedEmail)} is not subscribed in Supabase.`);
    }
  }

  const pending = forceSend
    ? subscribers
    : subscribers.filter((subscriber) => !String(subscriber.lastSentAt || '').startsWith(editionId));

  console.log(`edition=${editionId}`);
  if (requestedEmail) console.log(`recipient=${maskEmail(requestedEmail)}`);
  if (forceSend) console.log('force_send=true');
  console.log(`subscribers=${subscribers.length}`);
  console.log(`pending=${pending.length}`);

  if (pending.length === 0) return;

  if (dryRun) {
    console.log('DRY_RUN=true, not sending. Recipients:', pending.slice(0, 10).map((item) => maskEmail(item.email)).join(', '));
    return;
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const mailFrom = process.env.MAIL_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass || !mailFrom) {
    throw new Error('Missing SMTP_HOST, SMTP_USER, SMTP_PASS, or MAIL_FROM.');
  }

  const transport = createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: boolFromEnv(process.env.SMTP_SECURE) || smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  const sentAt = new Date().toISOString();
  const failures = [];

  for (const subscriber of pending) {
    try {
      await transport.sendMail({
        from: mailFrom,
        to: subscriber.email,
        subject,
        html,
        text
      });
      await markSent(supabaseUrl, serviceRoleKey, subscriber, sentAt);
      console.log(`sent=${maskEmail(subscriber.email)}`);
    } catch (error) {
      failures.push({ email: subscriber.email, error: error.message });
      console.error(`failed=${maskEmail(subscriber.email)} reason=${error.message}`);
    }
  }

  if (failures.length) {
    throw new Error(`Failed to send ${failures.length} briefing email(s).`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
