#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const rootArg = process.argv.indexOf('--root');
const root = resolve(rootArg >= 0 ? process.argv[rootArg + 1] : process.cwd());
const issues = [];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  } catch (error) {
    issues.push(`invalid_json:${path}:${error.message}`);
    return null;
  }
}

function requireFile(path) {
  if (!existsSync(resolve(root, path))) issues.push(`missing_file:${path}`);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function localPathFromUrl(path) {
  return String(path || '').split('#')[0].split('?')[0].replace(/^\/+/, '');
}

function validateHtmlReferences(file) {
  const absolute = resolve(root, file);
  if (!existsSync(absolute)) return;
  const html = readFileSync(absolute, 'utf8');
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)) {
    const raw = match[1];
    const clean = localPathFromUrl(raw);
    if (!clean || /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(raw)) continue;
    const target = resolve(dirname(absolute), decodeURIComponent(clean));
    if (!existsSync(target)) issues.push(`broken_reference:${file}:${raw}`);
  }
}

function walk(path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) return [];
  const files = [];
  for (const entry of readdirSync(absolute)) {
    const next = resolve(absolute, entry);
    const stat = statSync(next);
    if (stat.isDirectory()) files.push(...walk(relative(root, next)));
    if (stat.isFile()) files.push(relative(root, next));
  }
  return files;
}

for (const file of [
  'index.html',
  'news.html',
  'portfolio.html',
  'mirror-plan.html',
  'marvel-ten.html',
  'gpt-image2-handbook.html',
  'shuttle-universe.html',
  'misaligned-scenes.html',
  '404.html',
  'auth/reset-password.html',
  'data/MANIFEST.json',
  'data/news-index.json',
  'sitemap.xml',
  'robots.txt',
  'favicon.ico'
]) requireFile(file);

for (const file of [
  'styles/update-notice.css',
  'styles/brand-system.css',
  'scripts/update-notice.js',
  'styles/mirror-plan.css',
  'scripts/mirror-plan.js',
  'data/works/works-manifest.json',
  'data/works/projects/mirror-plan.json',
  'data/works/documents/mirror-plan/index.json',
  'assets/icons/logo-mark.svg',
  'assets/icons/logo-mark.png',
  'assets/icons/logo-lockup-horizontal.svg',
  'assets/icons/logo-lockup-horizontal-light.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-32.png',
  'assets/icons/favicon-16.png',
  'assets/og/janet-og.png',
  'assets/og/news-og.png',
  'assets/og/works-og.png'
]) requireFile(file);

const manifest = readJson('data/MANIFEST.json') || [];
const index = readJson('data/news-index.json') || {};
const editions = Array.isArray(index.editions) ? index.editions : [];
const latest = index.latest_edition_id || '';

if (!Array.isArray(manifest) || !manifest.length) issues.push('manifest_empty');
if (!latest || latest !== manifest[0]) issues.push(`latest_pointer_mismatch:${latest}:${manifest[0] || ''}`);
if (new Set(manifest).size !== manifest.length) issues.push('manifest_duplicates');
if (new Set(editions.map((edition) => edition.edition_id)).size !== editions.length) issues.push('index_duplicates');
if (manifest.length !== editions.length) issues.push(`manifest_index_count_mismatch:${manifest.length}:${editions.length}`);

for (const edition of editions) {
  const id = edition.edition_id || '';
  if (!id || !manifest.includes(id)) issues.push(`index_entry_not_in_manifest:${id}`);
  const contentPath = localPathFromUrl(edition.content_url || `data/${id}/content.json`);
  requireFile(contentPath);
  const outputPath = localPathFromUrl(edition.url || '');
  if (outputPath) {
    requireFile(outputPath);
    if (existsSync(resolve(root, outputPath))) {
      const outputHtml = readFileSync(resolve(root, outputPath), 'utf8');
      if (!/<link\b[^>]*rel=["'](?:shortcut )?icon["']/i.test(outputHtml)) issues.push(`edition_favicon_missing:${id}`);
    }
  }
}

for (const id of manifest) {
  if (!editions.some((edition) => edition.edition_id === id)) issues.push(`manifest_entry_not_in_index:${id}`);
}

const artifactEditionDirs = readdirSync(resolve(root, 'data')).filter((entry) => {
  const path = resolve(root, 'data', entry);
  return /^\d{4}-\d{2}-\d{2}(?:-v\d+)?$/.test(entry) && statSync(path).isDirectory();
});
for (const id of artifactEditionDirs) {
  if (!manifest.includes(id)) issues.push(`unindexed_edition_in_artifact:${id}`);
}

const latestEdition = editions.find((edition) => edition.edition_id === latest);
if (!latestEdition) issues.push('latest_edition_missing_from_index');
const latestContentPath = latestEdition ? localPathFromUrl(latestEdition.content_url) : '';
const latestOutputPath = latestEdition ? localPathFromUrl(latestEdition.url) : '';
requireFile(`data/${latest}/cover.png`);
if (!latestContentPath) issues.push('latest_content_url_missing');
if (!latestOutputPath) issues.push('latest_output_url_missing');

const content = latestContentPath ? readJson(latestContentPath) : null;
if (content) {
  if (content.date !== latest) issues.push(`latest_content_date_mismatch:${content.date || ''}:${latest}`);
  const expectedCounts = { news: 5, models: 4, insights: 4, insights2: 3, tools: 1 };
  for (const [section, expected] of Object.entries(expectedCounts)) {
    const items = content.sections?.[section]?.items;
    if (!Array.isArray(items) || items.length !== expected) {
      issues.push(`section_count_mismatch:${section}:${Array.isArray(items) ? items.length : 0}:${expected}`);
      continue;
    }
    items.forEach((item, index) => {
      const key = `${section}[${index}]`;
      if (!String(item.title || '').trim()) issues.push(`item_title_missing:${key}`);
      if (!String(item.body || '').trim()) issues.push(`item_body_missing:${key}`);
      if (!String(item.janet_take || '').trim()) issues.push(`item_janet_take_missing:${key}`);
      if (!/^https?:\/\//i.test(String(item.url || item.link || ''))) issues.push(`item_source_url_invalid:${key}`);
      const image = localPathFromUrl(item.image || '');
      if (!image || !existsSync(resolve(root, `data/${latest}`, image))) issues.push(`item_image_missing:${key}:${image}`);
    });
  }
}

const shellPages = [
  'index.html',
  'news.html',
  'portfolio.html',
  'mirror-plan.html',
  'marvel-ten.html',
  'project-detail.html',
  'gpt-image2-handbook.html',
  'misaligned-scenes.html',
  'shuttle-universe.html',
  '404.html',
  'auth/reset-password.html'
];
shellPages.forEach(validateHtmlReferences);
if (latestOutputPath) validateHtmlReferences(latestOutputPath);

for (const file of shellPages.filter((path) => path !== 'marvel-ten.html')) {
  const absolute = resolve(root, file);
  if (!existsSync(absolute)) continue;
  const html = readFileSync(absolute, 'utf8');
  if (!/styles\/brand-system\.css/i.test(html)) issues.push(`brand_stylesheet_missing:${file}`);
  if (!/apple-touch-icon/i.test(html)) issues.push(`brand_touch_icon_missing:${file}`);
  if (/fonts\.googleapis\.com/i.test(html)) issues.push(`legacy_google_font_present:${file}`);
  if (/nav-brand-logo/i.test(html) && !/logo-lockup-horizontal\.svg/i.test(html)) {
    issues.push(`brand_nav_lockup_missing:${file}`);
  }
}

const mirrorDocumentIndexPath = 'data/works/documents/mirror-plan/index.json';
const mirrorDocumentIndex = readJson(mirrorDocumentIndexPath) || {};
const mirrorDocuments = Array.isArray(mirrorDocumentIndex.documents) ? mirrorDocumentIndex.documents : [];
const mirrorDocumentIds = mirrorDocuments.map((item) => String(item.id || ''));
const hasMirrorLocalArchive = existsSync(resolve(root, '镜场计划/tests'));
if (!mirrorDocuments.length) issues.push('mirror_document_index_empty');
if (new Set(mirrorDocumentIds).size !== mirrorDocumentIds.length) issues.push('mirror_document_index_duplicates');
if (mirrorDocumentIds.join(',') !== '01,02,03,04') {
  issues.push(`mirror_document_index_expected_01_04:${mirrorDocumentIds.join(',')}`);
}
if (mirrorDocuments.filter((item) => item.default).length !== 1 || !mirrorDocuments.find((item) => item.id === '01')?.default) {
  issues.push('mirror_document_default_must_be_01');
}

for (const item of mirrorDocuments) {
  const id = String(item.id || '');
  const dataPath = localPathFromUrl(item.data_url || '');
  if (!/^\d{2,}$/.test(id)) issues.push(`mirror_document_id_invalid:${id}`);
  if (!String(item.title || '').trim()) issues.push(`mirror_document_title_missing:${id}`);
  if (!String(item.objective || '').trim()) issues.push(`mirror_document_objective_missing:${id}`);
  if ('status_code' in item || 'status_label' in item) issues.push(`mirror_document_status_field_present:${id}`);
  if (!dataPath.startsWith('data/works/documents/mirror-plan/') || !dataPath.endsWith('.json')) {
    issues.push(`mirror_document_path_invalid:${id}:${dataPath}`);
    continue;
  }
  requireFile(dataPath);
  const documentData = readJson(dataPath);
  if (!documentData) continue;
  if (String(documentData.id || '') !== id) issues.push(`mirror_document_id_mismatch:${id}:${documentData.id || ''}`);
  if (String(documentData.objective || '') !== String(item.objective || '')) issues.push(`mirror_document_objective_mismatch:${id}`);
  if ('status_code' in documentData || 'status_label' in documentData || 'sections' in documentData || 'facts' in documentData) {
    issues.push(`mirror_document_summary_payload_present:${id}`);
  }
  const primary = documentData.primary_document;
  if (!primary) issues.push(`mirror_primary_document_missing:${id}`);
  if (primary) {
    if (primary.scope !== 'public' || primary.source_mode !== 'pdf-tracked-docx-release') {
      issues.push(`mirror_primary_document_scope_invalid:${id}`);
    }
    const pdfPath = localPathFromUrl(primary.pdf_url || '');
    const pdfPattern = new RegExp(`^assets/works/mirror-plan/documents/${id}/JW-LTBF-${id}-experiment-archive-([a-f0-9]{8})\\.pdf$`, 'i');
    const pdfMatch = pdfPath.match(pdfPattern);
    if (!pdfMatch) {
      issues.push(`mirror_primary_document_path_invalid:${id}:pdf:${pdfPath}`);
    } else {
      requireFile(pdfPath);
      const absolutePdf = resolve(root, pdfPath);
      if (existsSync(absolutePdf)) {
        const bytes = statSync(absolutePdf).size;
        if (Number(primary.pdf_bytes) !== bytes) issues.push(`mirror_primary_document_size_mismatch:${id}:pdf:${primary.pdf_bytes || 0}:${bytes}`);
        if (readFileSync(absolutePdf).subarray(0, 4).toString('latin1') !== '%PDF') issues.push(`mirror_primary_document_magic_invalid:${id}:pdf`);
        const actualHash = sha256(absolutePdf);
        if (actualHash !== String(primary.pdf_sha256 || '').toLowerCase()) issues.push(`mirror_primary_document_hash_mismatch:${id}:pdf`);
        if (pdfMatch[1].toLowerCase() !== actualHash.slice(0, 8)) issues.push(`mirror_primary_document_version_mismatch:${id}:pdf`);
      }
    }

    const docxUrl = String(primary.docx_url || '');
    const docxPattern = new RegExp(`^https://github\\.com/Yaojingwen2002/janet-public-site/releases/download/mirror-plan-documents-v1/JW-LTBF-${id}-experiment-source-([a-f0-9]{8})\\.docx$`, 'i');
    const docxMatch = docxUrl.match(docxPattern);
    if (!docxMatch) issues.push(`mirror_primary_document_url_invalid:${id}:docx:${docxUrl}`);
    const expectedDocxHash = String(primary.docx_sha256 || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expectedDocxHash)) issues.push(`mirror_primary_document_hash_invalid:${id}:docx`);
    if (docxMatch && docxMatch[1].toLowerCase() !== expectedDocxHash.slice(0, 8)) issues.push(`mirror_primary_document_version_mismatch:${id}:docx`);

    if (hasMirrorLocalArchive) {
      const localDocxPath = `镜场计划/tests/JW-LTBF-${id}/${String(primary.download_name || '')}`;
      requireFile(localDocxPath);
      const absoluteDocx = resolve(root, localDocxPath);
      if (existsSync(absoluteDocx)) {
        const bytes = statSync(absoluteDocx).size;
        if (Number(primary.docx_bytes) !== bytes) issues.push(`mirror_primary_document_size_mismatch:${id}:docx:${primary.docx_bytes || 0}:${bytes}`);
        if (readFileSync(absoluteDocx).subarray(0, 4).toString('latin1') !== 'PK\u0003\u0004') issues.push(`mirror_primary_document_magic_invalid:${id}:docx`);
        if (sha256(absoluteDocx) !== expectedDocxHash) issues.push(`mirror_primary_document_hash_mismatch:${id}:docx`);
      }
    }
  }
}

const mirrorPublicDocumentRoot = 'assets/works/mirror-plan/documents';
const mirrorPublicDocumentFiles = walk(mirrorPublicDocumentRoot).sort();
const expectedMirrorPublicDocumentFiles = [
  'assets/works/mirror-plan/documents/01/JW-LTBF-01-experiment-archive-a5fa47bb.pdf',
  'assets/works/mirror-plan/documents/02/JW-LTBF-02-experiment-archive-45c7f9a8.pdf',
  'assets/works/mirror-plan/documents/03/JW-LTBF-03-experiment-archive-ff12e78b.pdf',
  'assets/works/mirror-plan/documents/04/JW-LTBF-04-experiment-archive-bb576e80.pdf'
].sort();
if (mirrorPublicDocumentFiles.join('\n') !== expectedMirrorPublicDocumentFiles.join('\n')) {
  issues.push(`mirror_public_document_set_invalid:${mirrorPublicDocumentFiles.join(',')}`);
}
if (mirrorPublicDocumentFiles.some((path) => /\.docx$/i.test(path))) issues.push('mirror_docx_must_not_enter_pages_artifact');

const homepage = existsSync(resolve(root, 'index.html')) ? readFileSync(resolve(root, 'index.html'), 'utf8') : '';
const updateNoticeScript = existsSync(resolve(root, 'scripts/update-notice.js'))
  ? readFileSync(resolve(root, 'scripts/update-notice.js'), 'utf8')
  : '';
const visualLab = existsSync(resolve(root, 'gpt-image2-handbook.html'))
  ? readFileSync(resolve(root, 'gpt-image2-handbook.html'), 'utf8')
  : '';
const mirrorPage = existsSync(resolve(root, 'mirror-plan.html'))
  ? readFileSync(resolve(root, 'mirror-plan.html'), 'utf8')
  : '';

if (!homepage.includes('styles/update-notice.css?v=third-layout-20260717')) issues.push('update_notice_css_missing');
if (!homepage.includes('scripts/update-notice.js?v=third-layout-20260717')) issues.push('update_notice_script_missing');
if (!updateNoticeScript.includes("Date.parse('2026-07-17T00:00:00+08:00')")) issues.push('update_notice_start_invalid');
if (!updateNoticeScript.includes("Date.parse('2026-07-27T00:00:00+08:00')")) issues.push('update_notice_end_invalid');
if (!updateNoticeScript.includes('第三次版式革新')) issues.push('update_notice_release_copy_missing');
if (!visualLab.includes('href="mirror-plan.html"')) issues.push('visual_lab_mirror_entry_missing');
if (!mirrorPage.includes('href="gpt-image2-handbook.html"')) issues.push('mirror_visual_lab_return_missing');
if (!mirrorPage.includes('data-janet-experiment="signal-wave-17"')) issues.push('mirror_experiment_shell_missing');
if (!mirrorPage.includes('<meta name="janet-public-artifact" content="true">')) issues.push('mirror_public_artifact_marker_missing');
if (!mirrorPage.includes('完整实验文档')) issues.push('mirror_complete_document_heading_missing');
if (!mirrorPage.includes('下载 DOCX 源文件')) issues.push('mirror_docx_source_link_missing');
if (/网页摘要|冻结候选|已冻结|准备中/.test(mirrorPage)) issues.push('mirror_management_copy_present');

const sitemap = existsSync(resolve(root, 'sitemap.xml')) ? readFileSync(resolve(root, 'sitemap.xml'), 'utf8') : '';
if (latestOutputPath && !sitemap.includes(latestOutputPath)) issues.push('sitemap_latest_missing');
for (const edition of editions.filter((item) => item.url)) {
  if (!sitemap.includes(localPathFromUrl(edition.url))) issues.push(`sitemap_edition_missing:${edition.edition_id}`);
}

const forbiddenRoots = ['.github', 'codex-briefing-system', 'docs', '镜场计划'];
for (const path of forbiddenRoots) {
  if (existsSync(resolve(root, path))) issues.push(`private_or_source_path_in_artifact:${path}`);
}
for (const file of walk('.')) {
  if (/(^|\/)\._|(^|\/)\.DS_Store$/.test(file)) issues.push(`mac_metadata_in_artifact:${file}`);
  if (/JANET-FULL-PROFILE|Janet完整档案/i.test(file)) issues.push(`private_profile_in_artifact:${file}`);
}

if (issues.length) {
  console.error(JSON.stringify({ status: 'current_site_qa_blocked', root, issues }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'current_site_qa_ready',
  latest,
  editions: editions.length,
  artifact_files: walk('.').length
}, null, 2));
