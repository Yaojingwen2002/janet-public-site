import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readerName(value) {
  return String(value || '').trim() || '读者';
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

export function stripUnsafeEmailParts(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<div class="potato-center"[\s\S]*?<\/div>\s*<div class="mobile-nav-menu"[\s\S]*?<\/div>/i, '')
    .replace(/<header>[\s\S]*?<\/header>/i, '')
    .replace(/<div class="news-card-actions output-engagement"[\s\S]*?<!-- ══ 页脚/i, '<!-- ══ 页脚');
}

function safeAbsoluteUrl(value, baseUrl) {
  const url = String(value || '').trim();
  if (!url || /^(?:#|mailto:|tel:|data:|cid:)/i.test(url)) return url;
  if (/^javascript:/i.test(url)) return '#';
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function imageFallbacks(content) {
  const fallbacks = new Map();
  for (const section of Object.values(content?.sections || {})) {
    for (const item of section?.items || []) {
      const image = String(item.image || '').replace(/^\.\//, '');
      if (!/\.avif(?:$|\?)/i.test(image)) continue;
      const source = String(item.image_source_url || item.image_url || '').trim();
      if (/^https:\/\//i.test(source)) fallbacks.set(image, source);
    }
  }
  return fallbacks;
}

export function absolutizeEmailUrls(html, { onlineUrl, content }) {
  const fallbacks = imageFallbacks(content);
  let next = html.replace(/\b(src|href)=(['"])([^'"]+)\2/gi, (match, attribute, quote, value) => {
    const clean = String(value || '').replace(/^\.\//, '');
    const url = attribute.toLowerCase() === 'src' && fallbacks.has(clean)
      ? fallbacks.get(clean)
      : safeAbsoluteUrl(value, onlineUrl);
    return `${attribute}=${quote}${escapeHtml(url)}${quote}`;
  });

  next = next
    .replace(/\sloading=(['"])[^'"]*\1/gi, '')
    .replace(/\sdecoding=(['"])[^'"]*\1/gi, '')
    .replace(/<img\b([^>]*)>/gi, (tag, attributes) => {
      const imageStyle = 'display:block;width:100%;max-width:100%;height:auto;border:0;';
      if (/\sstyle=(['"])/i.test(attributes)) {
        return tag.replace(/\sstyle=(['"])([\s\S]*?)\1/i, (styleMatch, quote, style) => ` style=${quote}${imageStyle}${style}${quote}`);
      }
      return `<img${attributes} style="${imageStyle}">`;
    });
  return next;
}

export function personalizeBriefingIntro(html, displayName) {
  const name = escapeHtml(readerName(displayName));
  const withNamedGreeting = html.replace(
    /(<strong\b[^>]*data-reader-greeting[^>]*>)[\s\S]*?(<\/strong>)/i,
    `$1${name}$2`
  );
  if (withNamedGreeting !== html) return withNamedGreeting;

  return html.replace(/(<div class="intro-box"[^>]*>)([\s\S]*?)(<\/div>)/i, (_match, open, content, close) => {
    const clean = content.replace(/^\s*Janet\s*早[。.!！]?\s*/i, '');
    return `${open}<p style="margin:0 0 10px;color:#0d0d0d;font-size:18px;line-height:1.45;"><strong style="color:#1A3A2A;">${name}</strong>，早。</p>${clean}${close}`;
  });
}

export function injectEmailHeader(html, { displayName, editionId, edition, onlineUrl, siteUrl = SITE_URL }) {
  const name = escapeHtml(readerName(displayName));
  const editionTitle = escapeHtml(edition.title || '今天的 AI 信号');
  const signalCount = Number(edition.signal_count || edition.edition_items_count || 17);
  const logoUrl = new URL('assets/icons/logo-mark.png', siteUrl).toString();
  const preheader = `${edition.title || '今日 AI 晨报'}：${signalCount} 条信号已经筛完。`;
  const header = `
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#0D1712;border-bottom:3px solid #18E299;">
  <tr>
    <td align="center" style="padding:0 18px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:860px;">
        <tr>
          <td style="padding:24px 0 18px;vertical-align:middle;">
            <table role="presentation" cellspacing="0" cellpadding="0">
              <tr>
                <td style="width:44px;vertical-align:middle;"><img src="${logoUrl}" width="40" height="40" alt="Janet" style="display:block;width:40px;height:40px;border:0;border-radius:8px;"></td>
                <td style="padding-left:12px;vertical-align:middle;color:#FFFEF9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                  <div style="font-size:16px;font-weight:800;line-height:1.2;">Janet 快车箱</div>
                  <div style="margin-top:4px;color:#9AA89F;font-size:11px;letter-spacing:.08em;line-height:1.2;">AI DAILY BRIEFING</div>
                </td>
              </tr>
            </table>
          </td>
          <td align="right" style="padding:24px 0 18px;color:#9AA89F;font:12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;vertical-align:middle;">${escapeHtml(editionId)}<br>${signalCount} SIGNALS</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:18px 0 28px;border-top:1px solid rgba(255,255,255,.12);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
            <h1 style="margin:0;color:#FFFEF9;font-size:30px;line-height:1.18;font-weight:750;">${name}，今天的信号已筛完。</h1>
            <p style="margin:10px 0 0;color:#C7D1CB;font-size:16px;line-height:1.65;">本期主线：${editionTitle}</p>
            <p style="margin:8px 0 20px;color:#9AA89F;font-size:14px;line-height:1.65;">${signalCount} 条全球 AI 动态，按重要性压缩成一份晨间判断。先看事实，再看 Janet 锐评。</p>
            <a href="${escapeHtml(onlineUrl)}" style="display:inline-block;border-bottom:1px solid #18E299;color:#18E299;font-size:14px;font-weight:800;line-height:1.8;text-decoration:none;">打开网页版 →</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

  if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (body) => body + header);
  return header + html;
}

function textVersion({ title, summary, onlineUrl, displayName }) {
  return [
    `${readerName(displayName)}，早。`,
    '',
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
  const excludedEmail = normalizeEmail(process.env.EXCLUDE_RECIPIENT_EMAIL || '');
  if (requestedEmail && !validEmail(requestedEmail)) throw new Error(`Invalid RECIPIENT_EMAIL: ${process.env.RECIPIENT_EMAIL}`);
  if (excludedEmail && !validEmail(excludedEmail)) throw new Error(`Invalid EXCLUDE_RECIPIENT_EMAIL: ${process.env.EXCLUDE_RECIPIENT_EMAIL}`);
  if (requestedEmail && excludedEmail) throw new Error('RECIPIENT_EMAIL and EXCLUDE_RECIPIENT_EMAIL cannot be used together.');

  const supabaseUrl = process.env.SUPABASE_URL || await readSupabaseUrlFromConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const newsIndex = JSON.parse(await fs.readFile(NEWS_INDEX_FILE, 'utf8'));
  const editionId = process.env.BRIEFING_EDITION_ID || newsIndex.latest_edition_id;
  const edition = (newsIndex.editions || []).find((item) => item.edition_id === editionId) || {};
  const outputPath = path.join(ROOT, edition.url || `data/${editionId}/output.html`);
  const rawHtml = await fs.readFile(outputPath, 'utf8');
  const contentPath = path.join(ROOT, edition.content_url || `data/${editionId}/content.json`);
  const content = JSON.parse(await fs.readFile(contentPath, 'utf8'));
  const onlineUrl = new URL(edition.url || `data/${editionId}/output.html`, SITE_URL).toString();
  const title = edition.title || parseTitle(rawHtml) || `Janet 快车箱 · ${editionId}`;
  const subject = process.env.MAIL_SUBJECT || `Janet 快车箱 · AI 晨报 · ${editionId} · ${title}`;
  const emailBaseHtml = absolutizeEmailUrls(stripUnsafeEmailParts(rawHtml), { onlineUrl, content });

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
  if (excludedEmail) subscribers = subscribers.filter((subscriber) => subscriber.email !== excludedEmail);

  const pending = forceSend
    ? subscribers
    : subscribers.filter((subscriber) => !String(subscriber.lastSentAt || '').startsWith(editionId));

  console.log(`edition=${editionId}`);
  if (requestedEmail) console.log(`recipient=${maskEmail(requestedEmail)}`);
  if (excludedEmail) console.log(`excluded=${maskEmail(excludedEmail)}`);
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

  const { createTransport } = await import('nodemailer');
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
      const html = injectEmailHeader(
        personalizeBriefingIntro(emailBaseHtml, subscriber.displayName),
        { displayName: subscriber.displayName, editionId, edition, onlineUrl }
      );
      const text = textVersion({
        title: subject,
        summary: edition.summary || '',
        onlineUrl,
        displayName: subscriber.displayName
      });
      await transport.sendMail({
        from: /<[^>]+>/.test(mailFrom) ? mailFrom : { name: process.env.MAIL_FROM_NAME || 'Janet 快车箱', address: mailFrom },
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
