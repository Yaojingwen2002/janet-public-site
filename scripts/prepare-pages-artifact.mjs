#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] || process.cwd());
const dataRoot = resolve(root, 'data');
let updated = 0;
let brandIconsAdded = 0;
let brandLockupsAdded = 0;
let brandStylesAdded = 0;
let greetingScriptsAdded = 0;
let publicArtifactMarkersAdded = 0;

if (!existsSync(dataRoot)) throw new Error(`artifact_data_missing:${dataRoot}`);

for (const entry of readdirSync(dataRoot)) {
  const directory = resolve(dataRoot, entry);
  if (!statSync(directory).isDirectory() || !/^\d{4}-\d{2}-\d{2}(?:-v\d+)?$/.test(entry)) continue;
  const outputPath = resolve(directory, 'output.html');
  if (!existsSync(outputPath)) continue;
  const html = readFileSync(outputPath, 'utf8');
  let next = html;

  if (!/<link\b[^>]*rel=["'](?:shortcut )?icon["']/i.test(next)) {
    next = next.replace(
      /(<title>[\s\S]*?<\/title>)/i,
      '$1\n  <link rel="icon" type="image/svg+xml" href="../../assets/icons/logo-mark.svg">'
    );
    if (next === html) throw new Error(`artifact_title_missing:${entry}/output.html`);
    updated += 1;
  }

  if (!/apple-touch-icon/i.test(next)) {
    const withBrandIcons = next.replace(
      /<\/head>/i,
      '  <link rel="icon" type="image/png" sizes="32x32" href="../../assets/icons/favicon-32.png">\n'
        + '  <link rel="icon" type="image/png" sizes="16x16" href="../../assets/icons/favicon-16.png">\n'
        + '  <link rel="apple-touch-icon" sizes="180x180" href="../../assets/icons/apple-touch-icon.png">\n'
        + '</head>'
    );
    if (withBrandIcons === next) throw new Error(`artifact_head_missing:${entry}/output.html`);
    next = withBrandIcons;
    brandIconsAdded += 1;
  }

  if (!/styles\/brand-system\.css/i.test(next)) {
    const withBrandStyles = next.replace(
      /<\/head>/i,
      '  <link rel="stylesheet" href="../../styles/brand-system.css?v=brand-20260728-2">\n</head>'
    );
    if (withBrandStyles === next) throw new Error(`artifact_head_missing:${entry}/output.html`);
    next = withBrandStyles;
    brandStylesAdded += 1;
  }

  if (!/class=["']briefing-brand["']/i.test(next) && /<span\b[^>]*class=["']logo["']/i.test(next)) {
    const withBrandLockup = next.replace(
      /(<span\b[^>]*class=["']logo["'])/i,
      '<a class="briefing-brand" href="../../index.html" aria-label="返回 Janet 首页">\n'
        + '            <img src="../../assets/icons/logo-lockup-horizontal.svg" alt="Janet">\n'
        + '          </a>\n'
        + '          $1'
    );
    if (withBrandLockup === next) throw new Error(`artifact_logo_missing:${entry}/output.html`);
    next = withBrandLockup;
    brandLockupsAdded += 1;
  }

  if (!/scripts\/reader-greeting\.js/i.test(next)) {
    const withGreeting = next.replace(
      /<\/body>/i,
      '  <script src="../../scripts/reader-greeting.js"></script>\n</body>'
    );
    if (withGreeting === next) throw new Error(`artifact_body_missing:${entry}/output.html`);
    next = withGreeting;
    greetingScriptsAdded += 1;
  }

  if (next !== html) writeFileSync(outputPath, next, 'utf8');
}

const mirrorPagePath = resolve(root, 'mirror-plan.html');
if (existsSync(mirrorPagePath)) {
  const html = readFileSync(mirrorPagePath, 'utf8');
  if (!html.includes('name="janet-public-artifact"')) {
    const next = html.replace(
      /<\/head>/i,
      '  <meta name="janet-public-artifact" content="true">\n</head>'
    );
    if (next === html) throw new Error('artifact_mirror_head_missing');
    writeFileSync(mirrorPagePath, next, 'utf8');
    publicArtifactMarkersAdded += 1;
  }
}

console.log(`pages_artifact_html_ready favicons_added=${updated} brand_icons_added=${brandIconsAdded} brand_lockups_added=${brandLockupsAdded} brand_styles_added=${brandStylesAdded} greeting_scripts_added=${greetingScriptsAdded} public_artifact_markers_added=${publicArtifactMarkersAdded}`);
