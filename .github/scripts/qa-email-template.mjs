import fs from 'node:fs/promises';
import path from 'node:path';
import {
  absolutizeEmailUrls,
  injectEmailHeader,
  personalizeBriefingIntro,
  stripUnsafeEmailParts
} from './send-daily-briefing-email.mjs';
import { welcomeHtml } from './send-subscription-welcome-email.mjs';

const ROOT = process.cwd();
const SITE_URL = process.env.PUBLIC_SITE_URL || 'https://yaojingwen2002.github.io/janet-public-site/';
const PREVIEW_NAME = 'reader_preview';

function attributeValues(html, attribute) {
  const values = [];
  const pattern = new RegExp(`\\b${attribute}=(['"])([^'"]+)\\1`, 'gi');
  for (const match of html.matchAll(pattern)) values.push(match[2]);
  return values;
}

function validateDailyEmail(html) {
  const issues = [];
  if (/<script\b/i.test(html)) issues.push('email_contains_script');
  if (/potato-center|mobile-nav-menu|output-engagement|comments-section/i.test(html)) issues.push('email_contains_web_controls');
  if (!html.includes(`${PREVIEW_NAME}，今天的信号已筛完。`)) issues.push('email_missing_personalized_header');
  if (!html.includes(`${PREVIEW_NAME}</strong>，早。`)) issues.push('email_missing_personalized_intro');
  if (/Janet\s*早[。.!！]?/i.test(html)) issues.push('email_contains_static_janet_greeting');
  if (!html.includes('/assets/icons/logo-mark.png')) issues.push('email_missing_brand_logo');

  for (const src of attributeValues(html, 'src')) {
    if (!/^https:\/\//i.test(src) && !/^(?:cid:|data:)/i.test(src)) issues.push(`email_image_not_absolute:${src}`);
  }
  for (const href of attributeValues(html, 'href')) {
    if (!/^(?:https:\/\/|mailto:|tel:|#)/i.test(href)) issues.push(`email_link_not_absolute:${href}`);
  }
  return issues;
}

async function main() {
  const index = JSON.parse(await fs.readFile(path.join(ROOT, 'data/news-index.json'), 'utf8'));
  const editionId = process.env.BRIEFING_EDITION_ID || index.latest_edition_id;
  const edition = (index.editions || []).find((entry) => entry.edition_id === editionId);
  if (!edition) throw new Error(`email_edition_missing:${editionId}`);

  const outputPath = path.join(ROOT, edition.url || `data/${editionId}/output.html`);
  const contentPath = path.join(ROOT, edition.content_url || `data/${editionId}/content.json`);
  const [rawHtml, contentRaw] = await Promise.all([
    fs.readFile(outputPath, 'utf8'),
    fs.readFile(contentPath, 'utf8')
  ]);
  const content = JSON.parse(contentRaw);
  const onlineUrl = new URL(edition.url || `data/${editionId}/output.html`, SITE_URL).toString();
  const base = absolutizeEmailUrls(stripUnsafeEmailParts(rawHtml), { onlineUrl, content });
  const html = injectEmailHeader(
    personalizeBriefingIntro(base, PREVIEW_NAME),
    { displayName: PREVIEW_NAME, editionId, edition, onlineUrl, siteUrl: SITE_URL }
  );
  const welcome = welcomeHtml({ displayName: PREVIEW_NAME, siteUrl: SITE_URL });
  const issues = validateDailyEmail(html);
  if (!welcome.includes(PREVIEW_NAME) || !welcome.includes('/assets/icons/logo-mark.png')) {
    issues.push('welcome_email_brand_or_name_missing');
  }

  const previewDir = process.env.EMAIL_PREVIEW_DIR;
  if (previewDir) {
    await fs.mkdir(previewDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(previewDir, `daily-${editionId}.html`), html, 'utf8'),
      fs.writeFile(path.join(previewDir, 'welcome.html'), welcome, 'utf8')
    ]);
  }

  if (issues.length) {
    console.error(JSON.stringify({ status: 'email_template_failed', edition: editionId, issues }, null, 2));
    process.exit(1);
  }
  console.log(`email_template_ready edition=${editionId} images=${attributeValues(html, 'src').length}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
