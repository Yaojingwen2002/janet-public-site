#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] || process.cwd());
const dataRoot = resolve(root, 'data');
let updated = 0;
let greetingScriptsAdded = 0;

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

console.log(`pages_artifact_html_ready favicons_added=${updated} greeting_scripts_added=${greetingScriptsAdded}`);
