import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

export function welcomeHtml({ displayName, siteUrl }) {
  const name = displayName ? escapeHtml(displayName) : '读者';
  const newsUrl = new URL('news.html', siteUrl).toString();
  const homeUrl = new URL('', siteUrl).toString();
  const logoUrl = new URL('assets/icons/logo-lockup-horizontal-light.png', siteUrl).toString();
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Janet 快车箱订阅成功</title>
  </head>
  <body style="margin:0;background:#F4F2EC;color:#151515;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">订阅成功。下一期 Janet 快车箱会在发布后送到这个邮箱。</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#F4F2EC;padding:28px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#FFFEF9;border:1px solid #D8DBD2;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;background:#0D1712;border-bottom:3px solid #18E299;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="width:152px;vertical-align:middle;"><img src="${logoUrl}" width="148" alt="Janet" style="display:block;width:148px;height:auto;border:0;"></td>
                    <td style="padding-left:14px;vertical-align:middle;color:#FFFEF9;">
                      <div style="font-size:15px;font-weight:700;line-height:1.2;">快车箱</div>
                      <div style="margin-top:4px;color:#9AA89F;font-size:11px;letter-spacing:0;line-height:1.2;">SUBSCRIPTION CONNECTED</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px 30px;">
                <div style="color:#1A3A2A;font-size:12px;font-weight:800;letter-spacing:0;">WELCOME ABOARD</div>
                <h1 style="margin:10px 0 12px;font-family:'Avenir Next','SF Pro Display',-apple-system,BlinkMacSystemFont,'Helvetica Neue','PingFang SC',sans-serif;font-size:36px;line-height:1.08;font-weight:600;color:#111;">${name}，晨间信号通道已接上。</h1>
                <p style="margin:0;color:#555B56;font-size:16px;line-height:1.75;">从下一期开始，晨报发布后会自动送到这个邮箱。邮件会使用你的注册名称，内容包含当天 AI 信号、Janet 锐评和完整阅读入口。</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;margin-top:26px;border-top:1px solid #DFE1DA;border-bottom:1px solid #DFE1DA;">
                  <tr>
                    <td style="padding:18px 0;">
                      <div style="font-size:13px;color:#7A7A72;">发送规则</div>
                      <div style="margin-top:6px;font-size:16px;line-height:1.65;color:#151515;">晨报完成发布后发送，不用固定时刻的空邮件占你的收件箱。账户中心可随时取消订阅。</div>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:26px;">
                  <a href="${newsUrl}" style="display:inline-block;padding:12px 17px;border-radius:6px;background:#1A3A2A;color:#FFFEF9;text-decoration:none;font-weight:800;">查看晨报归档</a>
                  <a href="${homeUrl}" style="display:inline-block;margin-left:8px;padding:11px 16px;border:1px solid #1A3A2A;border-radius:6px;color:#1A3A2A;text-decoration:none;font-weight:800;">回到主页</a>
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
    `${displayName || '读者'}，订阅成功。`,
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

  for (const subscriber of subscribers) {
    try {
      await transport.sendMail({
        from: /<[^>]+>/.test(mailFrom) ? mailFrom : { name: process.env.MAIL_FROM_NAME || 'Janet 快车箱', address: mailFrom },
        to: subscriber.email,
        subject: '欢迎加入｜Janet 快车箱邮件通道已开启',
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
