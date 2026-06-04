import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { loadEnv, targetDateFromArg } from './lib.mjs';

const RENDER_BLOCKED_TERMS = [
  '事实剥离',
  '破防点',
  '槽点',
  '代价',
  '搞钱',
  '落地指导',
  'JANET:',
  'Janet:'
];

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paragraphs(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function webPath(path) {
  return path.split(/[\\/]+/).join('/');
}

function assertRenderableText(value, path) {
  const text = String(value || '');
  const blocked = RENDER_BLOCKED_TERMS.find((term) => text.includes(term));
  if (blocked) throw new Error(`render_blocked_term:${path}:${blocked}`);
}

function allItems(sections) {
  return Object.entries(sections || {}).flatMap(([section, group]) =>
    (group?.items || []).map((item, index) => ({ item, path: `${section}[${index}]` }))
  );
}

function validateRenderableContent(content) {
  if (!content.trend) throw new Error('missing_trend');
  assertRenderableText(content.trend, 'trend');
  for (const { item, path } of allItems(content.sections)) {
    if (item.content) assertRenderableText(item.content, `${path}.content`);
    if (!item.body) throw new Error(`missing_body:${path}`);
    if (!item.janet_take) throw new Error(`missing_janet_take:${path}`);
    assertRenderableText(item.title, `${path}.title`);
    assertRenderableText(item.body, `${path}.body`);
    assertRenderableText(item.janet_take, `${path}.janet_take`);
  }
}

function itemParts(item) {
  return {
    bodyText: String(item.body || '').trim(),
    critique: String(item.janet_take || '').trim()
  };
}

function itemImageSrc(item) {
  const image = String(item.image || '').trim();
  if (!image) return '';
  if (/^(https?:|file:|data:)/i.test(image)) return image;
  const clean = webPath(image.replace(/^\.?\//, ''));
  if (clean.startsWith('runs/')) {
    const parts = clean.split('/');
    const imageIndex = parts.indexOf('images');
    if (imageIndex >= 0) return parts.slice(imageIndex).join('/');
  }
  if (clean.startsWith('images/')) return clean;
  return `images/${clean}`;
}

function renderItemImage(item, title) {
  const image = itemImageSrc(item);
  if (!image) return '';
  const credit = String(item.image_credit || item.source || '').trim();
  return (
    `  <figure class="item-image">\n` +
    `    <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async">\n` +
    (credit ? `    <figcaption>${escapeHtml(credit)}</figcaption>\n` : '') +
    `  </figure>\n`
  );
}

function buildCard(item, isMini, date) {
  const title = String(item.title || '').trim();
  const source = String(item.source || '').trim();
  const link = String(item.link || item.url || '').trim();
  const itemDate = String(item.date || date || '').trim();
  const { bodyText, critique } = itemParts(item);
  const tag = isMini ? 'h3' : 'h2';
  const cardClass = isMini ? 'mini-card' : 'card';
  let html = `<div class="${cardClass}">\n`;
  html += renderItemImage(item, title);
  if (title) html += `  <${tag}>${escapeHtml(title)}</${tag}>\n`;
  if (source || itemDate || link) {
    html += `  <p class="item-meta">${source ? `来源: ${escapeHtml(source)}` : ''}${source && itemDate ? ' · ' : ''}${itemDate ? escapeHtml(itemDate) : ''}${link ? ` · <a href="${escapeHtml(link)}" target="_blank" rel="noopener">原文链接</a>` : ''}</p>\n`;
  }
  if (bodyText) html += `  <p>${paragraphs(bodyText)}</p>\n`;
  if (critique) {
    html += `  <div class="critique">\n`;
    html += `    <b>Janet 锐评：</b>\n`;
    html += `    <span>${paragraphs(critique)}</span>\n`;
    html += `  </div>\n`;
  }
  html += `</div>\n`;
  return html;
}

function generateSection(items, isMini, date) {
  return (items || []).map((item) => buildCard(item, isMini, date)).join('\n');
}

function generateInvestment(items, date) {
  if (!items?.length) return '<div class="prediction-box">\n  <p style="color:rgba(255,255,255,0.5);">今日无投资预测。</p>\n</div>';
  let html = '<div class="prediction-box">\n';
  html += '  <h3>今日核心预测</h3>\n\n';
  for (const item of items) {
    const title = String(item.title || '').trim();
    const link = String(item.link || item.url || '').trim();
    const source = String(item.source || '').trim();
    const itemDate = String(item.date || date || '').trim();
    const { bodyText, critique } = itemParts(item);
    html += renderItemImage(item, title);
    if (title) html += `  <h3>${escapeHtml(title)}</h3>\n`;
    if (source || itemDate || link) {
      html += `  <p class="item-meta inverted">${source ? `来源: ${escapeHtml(source)}` : ''}${source && itemDate ? ' · ' : ''}${itemDate ? escapeHtml(itemDate) : ''}${link ? ` · <a href="${escapeHtml(link)}" target="_blank" rel="noopener">原文链接</a>` : ''}</p>\n`;
    }
    if (bodyText) html += `  <p>${paragraphs(bodyText)}</p>\n`;
    if (critique) {
      html += `  <div class="critique" style="background:rgba(255,255,255,0.1);">\n`;
      html += `    <b>Janet 锐评：</b>\n`;
      html += `    <span>${paragraphs(critique)}</span>\n`;
      html += `  </div>\n`;
    }
  }
  html += '</div>\n';
  return html;
}

function generateTools(items, date) {
  if (!items?.length) return '<div class="tools-grid">\n  <p style="color:#666;">今日无工具推荐。</p>\n</div>';
  let html = '<div class="tools-grid">\n';
  html += '  <h3>今日工具箱</h3>\n\n';
  for (const item of items) {
    html += buildCard(item, false, date).replace('class="card"', 'class="tool-card"');
  }
  html += '</div>\n';
  return html;
}

function generateTrend(trend) {
  const parts = String(trend || '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const [headline = '', ...body] = parts;
  let html = `<div class="trend-card">\n  <h2>📌 今日趋势：${escapeHtml(headline)}</h2>\n`;
  for (const paragraph of body) {
    html += `  <p>${paragraphs(paragraph)}</p>\n`;
  }
  html += '</div>';
  return html;
}

function generateCover(content, { rootPath, outputPath }) {
  const cover = content.cover;
  if (!cover || typeof cover !== 'object') {
    throw new Error('missing_cover');
  }
  const date = content.date || '';
  const expectedImagePath = `runs/${date}/cover.png`;
  if (cover.image_path !== expectedImagePath) {
    throw new Error(`cover_image_path_mismatch:${cover.image_path || 'missing'}!=${expectedImagePath}`);
  }
  const absoluteImagePath = resolve(rootPath, cover.image_path);
  if (!existsSync(absoluteImagePath)) {
    throw new Error(`missing_cover_image:${absoluteImagePath}`);
  }
  const imageSrc = webPath(relative(dirname(outputPath), absoluteImagePath));
  const vol = String(content.vol || '').replace(/^第|期$/g, '');
  return `
 <section class="janet-cover" data-janet-cover="true">
  <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(cover.title || 'Janet AI Briefing Cover')}" class="janet-cover-img">
  <div class="janet-cover-overlay">
   <div class="janet-cover-meta">${escapeHtml(date)} // VOL_${escapeHtml(vol)}</div>
   <h1>${escapeHtml(cover.title || '')}</h1>
   <p>${escapeHtml(cover.subtitle || '')}</p>
  </div>
 </section>
`;
}

function injectCoverStyles(html) {
  const styles = `
 .janet-cover { position: relative; width: 100%; aspect-ratio: 21 / 9; margin: 0 0 34px; overflow: hidden; border: 1px solid rgba(0,0,0,0.12); background: #050706; }
 .janet-cover-img { width: 100%; height: 100%; display: block; object-fit: cover; filter: contrast(1.05) saturate(0.9); }
 .janet-cover-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; padding: clamp(20px, 4vw, 44px); color: #fff; background: linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.68) 100%); }
 .janet-cover-meta { font-family: var(--mono); font-size: 12px; font-weight: 800; letter-spacing: 0.16em; color: var(--brand); margin-bottom: 10px; text-transform: uppercase; }
 .janet-cover h1 { margin: 0; max-width: 720px; font-size: clamp(30px, 6vw, 58px); line-height: 0.98; font-weight: 950; letter-spacing: 0; }
 .janet-cover p { margin: 12px 0 0; max-width: 620px; color: rgba(255,255,255,0.88); font-size: clamp(14px, 2.2vw, 18px); font-weight: 650; }
 .item-image { position: relative; margin: 0 0 16px; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px; overflow: hidden; background: #050706; }
 .item-image img { width: 100%; aspect-ratio: 16 / 9; display: block; object-fit: cover; }
 .mini-card .item-image img { max-height: 170px; }
 .prediction-box .item-image { border-color: rgba(255,255,255,0.12); }
 .item-image figcaption { position: absolute; right: 10px; bottom: 10px; max-width: calc(100% - 20px); padding: 5px 8px; border-radius: 999px; background: rgba(0,0,0,0.58); color: rgba(255,255,255,0.72); font-size: 10px; line-height: 1; }
 .item-meta { font-family: var(--mono); font-size: 12px; color: #666; margin: 0 0 12px; }
 .item-meta a { color: var(--brand); text-decoration: none; font-weight: 700; }
 .item-meta.inverted { color: rgba(255,255,255,0.62); }
 @media (max-width: 640px) { .janet-cover { aspect-ratio: 16 / 9; } .janet-cover-overlay { padding: 20px; } }
`;
  return html.replace('</style>', `${styles}\n </style>`);
}

function sourceList(content) {
  const sources = [...new Set(allItems(content.sections).map(({ item }) => String(item.source || '').trim()).filter(Boolean))];
  return sources.join(', ');
}

export function renderBriefing({ content, templatePath, outputPath, rootPath = resolve(new URL('..', import.meta.url).pathname) }) {
  validateRenderableContent(content);
  const template = readFileSync(templatePath, 'utf8');
  const intro = `${content.intro_text || ''}\n\n以下是你今天需要知道的 5 条全球要闻、4 条模型动态、4 条技术深度，以及我的投资视角和工具箱推荐。\n\n保持好奇，保持吐槽。`;
  const sections = content.sections || {};
  const coverHtml = generateCover(content, { rootPath, outputPath });
  let html = injectCoverStyles(template);
  html = html.replaceAll('{{date}}', content.date || '');
  html = html.replaceAll('{{vol}}', String(content.vol || '').replace(/^第|期$/g, ''));
  html = html.replace('</header>', `</header>\n${coverHtml}`);
  html = html.replace('{{intro_text}}', paragraphs(intro));
  html = html.replace('{{trend_section}}', generateTrend(content.trend));
  html = html.replace('{{section_1}}', generateSection(sections.news?.items || [], false, content.date));
  html = html.replace('{{section_2}}', generateSection(sections.models?.items || [], true, content.date));
  html = html.replace('{{section_3}}', generateSection(sections.insights?.items || [], true, content.date));
  html = html.replace('{{section_4}}', generateInvestment(sections.insights2?.items || [], content.date));
  html = html.replace('{{section_5}}', generateTools(sections.tools?.items || [], content.date));
  html = html.replace(/DATA SOURCES:[^<]+<br>/, `DATA SOURCES: ${escapeHtml(sourceList(content))}<br>`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html, 'utf8');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = resolve(new URL('..', import.meta.url).pathname);
  loadEnv(resolve(root, '.env'));
  const date = targetDateFromArg();
  const templatePath = process.env.TEMPLATE_PATH || '/Volumes/Janet/公众号 AI 推文/engineering/template.html';
  const contentPath = process.env.RUN_CONTENT_PATH || resolve(root, 'runs', date, 'content.json');
  const outputPath = process.env.RUN_OUTPUT_PATH || resolve(root, 'runs', date, 'output.html');
  const content = JSON.parse(readFileSync(contentPath, 'utf8'));
  renderBriefing({ content, templatePath, outputPath, rootPath: root });
  console.log(JSON.stringify({ status: 'briefing_render_ready', date, outputPath }, null, 2));
}
