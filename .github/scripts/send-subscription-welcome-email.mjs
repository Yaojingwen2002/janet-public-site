import fs from 'node:fs/promises';
import path from 'node:path';
import { createTransport } from 'nodemailer';

const SITE_URL = process.env.PUBLIC_SITE_URL || 'https://yaojingwen2002.github.io/janet-public-site/';
const ROOT = process.cwd();
const CONFIG_FILE = path.join(ROOT, 'scripts/supabase-config.js');

function boolFromEnv(value) {
  return /^(1|true|yes)$/i.test(String(value || ''));
}

function cleanBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function maskEmail(email) {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return '[invalid-email]';
  return `${name.slice(0, 2)}***@${domain}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readSupabaseUrlFromConfig() {
  const source = await fs.readFile(CONFIG_FILE, 'utf8');
  const match = source.match(/SUPABASE_URL\s*=\s*'([^']+)'/);
  return match ? match[1] : '';
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

function welcomeHtml({ displayName, siteUrl }) {
  const name = displayName ? escapeHtml(displayName) : 'Janet 读者';
  const newsUrl = new URL('news.html', siteUrl).toString();
  const homeUrl = new URL('', siteUrl).toString();
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Janet 快车箱订阅成功</title>
  </head>
  <body style="margin:0;background:#f7f7f2;color:#151515;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;">订阅成功。明早晨报出来后，会自动走邮箱通道送达。</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f7f2;padding:28px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffef9;border:1px solid #d8dbd2;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(20,25,20,.08);">
            <tr>
              <td style="padding:30px 32px 22px;border-bottom:1px solid #e6e4db;">
                <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#6d746d;font-weight:700;">Janet Public Site</div>
                <h1 style="margin:12px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1.02;font-weight:500;color:#111;">订阅已接上</h1>
                <p style="margin:0;color:#76776e;font-size:16px;line-height:1.7;">${name}，你已经进入 Janet 快车箱邮件通道。</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 30px;">
                <div style="border:1px solid #1e3b2b;border-radius:16px;padding:20px 20px 18px;background:#f4fbf6;">
                  <div style="display:inline-block;margin-bottom:14px;padding:5px 10px;border:1px solid #1e3b2b;border-radius:999px;background:#18e299;color:#092016;font-weight:800;font-size:12px;letter-spacing:.08em;">ACTIVE</div>
                  <p style="margin:0;font-size:20px;line-height:1.55;color:#111;">每天早上晨报发布后，我会把当天的 AI 信号、Janet 锐评和完整阅读入口直接送到这个邮箱。</p>
                </div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;">
                  <tr>
                    <td style="padding:16px 0;border-top:1px solid #e7e4db;border-bottom:1px solid #e7e4db;">
                      <div style="font-size:14px;color:#79786f;">下一步</div>
                      <div style="margin-top:6px;font-size:18px;line-height:1.5;color:#151515;">今天的晨报会单独发出。以后不想收，也可以回网站的 Potato Center 取消订阅。</div>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:26px;">
                  <a href="${newsUrl}" style="display:inline-block;padding:13px 18px;border-radius:999px;background:#111;color:#fffef9;text-decoration:none;font-weight:800;">查看晨报归档</a>
                  <a href="${homeUrl}" style="display:inline-block;margin-left:10px;padding:12px 17px;border:1px solid #111;border-radius:999px;color:#111;text-decoration:none;font-weight:800;">回到主页</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function welcomeText({ displayName, siteUrl }) {
  return [
    `${displayName || 'Janet 读者'}，订阅成功。`,
    '',
    '你已经进入 Janet 快车箱邮件通道。每天早上晨报发布后，会自动发送到这个邮箱。',
    '',
    `晨报归档：${new URL('news.html', siteUrl).toString()}`
  ].join('\n');
}

async function getPendingSubscribers(supabaseUrl, serviceRoleKey, requestedEmail) {
  const rows = await supabaseFetch(
    supabaseUrl,
    serviceRoleKey,
    'newsletter_subscribers?select=email,display_name,subscribed,welcome_sent_at&subscribed=eq.true&email=not.is.null'
  );

  return (rows || [])
    .map((row) => ({
      email: normalizeEmail(row.email),
      displayName: row.display_name || '',
      welcomeSentAt: row.welcome_sent_at || ''
    }))
    .filter((row) => validEmail(row.email))
    .filter((row) => !requestedEmail || row.email === requestedEmail)
    .filter((row) => requestedEmail || !row.welcomeSentAt);
}

async function markWelcomeSent(supabaseUrl, serviceRoleKey, subscriber, sentAt) {
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
        source: 'welcome-email',
        updated_at: sentAt,
        welcome_sent_at: sentAt
      })
    }
  );
}

async function main() {
  const dryRun = boolFromEnv(process.env.DRY_RUN);
  const requestedEmail = normalizeEmail(process.env.RECIPIENT_EMAIL || '');
  if (requestedEmail && !validEmail(requestedEmail)) throw new Error(`Invalid RECIPIENT_EMAIL: ${process.env.RECIPIENT_EMAIL}`);

  const supabaseUrl = process.env.SUPABASE_URL || await readSupabaseUrlFromConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  const subscribers = await getPendingSubscribers(supabaseUrl, serviceRoleKey, requestedEmail);
  console.log(`pending=${subscribers.length}`);
  if (requestedEmail) console.log(`recipient=${maskEmail(requestedEmail)}`);

  if (subscribers.length === 0) return;
  if (dryRun) {
    console.log('DRY_RUN=true, not sending. Recipients:', subscribers.map((item) => maskEmail(item.email)).join(', '));
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

  for (const subscriber of subscribers) {
    try {
      await transport.sendMail({
        from: mailFrom,
        to: subscriber.email,
        subject: '订阅成功｜Janet 快车箱已接上',
        html: welcomeHtml({ displayName: subscriber.displayName, siteUrl: SITE_URL }),
        text: welcomeText({ displayName: subscriber.displayName, siteUrl: SITE_URL })
      });
      await markWelcomeSent(supabaseUrl, serviceRoleKey, subscriber, sentAt);
      console.log(`welcome_sent=${maskEmail(subscriber.email)}`);
    } catch (error) {
      failures.push({ email: subscriber.email, error: error.message });
      console.error(`failed=${maskEmail(subscriber.email)} reason=${error.message}`);
    }
  }

  if (failures.length) {
    throw new Error(`Failed to send ${failures.length} welcome email(s).`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
