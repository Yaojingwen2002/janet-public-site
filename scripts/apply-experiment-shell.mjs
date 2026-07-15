#!/usr/bin/env node

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const dataDir = join(root, 'data');
const marker = 'signal-wave-16';
const cursorCss = '<link rel="stylesheet" href="../../styles/signal-cursor.css?v=experiment-wave-16">';
const experimentCss = '<link rel="stylesheet" href="../../styles/experiment-pages.css?v=experiment-wave-16">';
const cursorScript = '<script src="../../scripts/signal-cursor.js?v=experiment-wave-16"></script>';

function briefingOutputs() {
  return readdirSync(dataDir)
    .map((name) => join(dataDir, name, 'output.html'))
    .filter((file) => {
      try {
        return statSync(file).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

function addBodyClass(html) {
  return html.replace(/<body([^>]*)>/i, (match, attributes) => {
    const classMatch = attributes.match(/\sclass=(['"])(.*?)\1/i);
    if (!classMatch) return `<body${attributes} class="briefing-output-page">`;

    const classes = classMatch[2].split(/\s+/).filter(Boolean);
    if (!classes.includes('briefing-output-page')) classes.push('briefing-output-page');
    return match.replace(classMatch[0], ` class="${classes.join(' ')}"`);
  });
}

function migrate(html) {
  let next = html;

  next = next.replace(
    /<html\b([^>]*)>/i,
    (match, attributes) => {
      const cleaned = attributes.replace(/\sdata-janet-experiment=(['"])[^'"]*\1/i, '');
      return `<html${cleaned} data-janet-experiment="${marker}">`;
    }
  );

  next = next
    .replace(/\s*<link[^>]+styles\/signal-cursor\.css[^>]*>/gi, '')
    .replace(/\s*<link[^>]+styles\/experiment-pages\.css[^>]*>/gi, '')
    .replace(/\s*<script[^>]+scripts\/signal-cursor\.js[^>]*><\/script>/gi, '');

  next = next.replace(
    /<\/head>/i,
    `\n  ${cursorCss}\n  ${experimentCss}\n</head>`
  );

  next = addBodyClass(next);

  next = next
    .replace(/^\s*<a href="\.\.\/\.\.\/gpt-image2-handbook\.html">.*?<\/a>\s*$/gim, '')
    .replace(/^\s*<a href="\.\.\/\.\.\/shuttle-universe\.html">.*?<\/a>\s*$/gim, '')
    .replace(/^\s*<a href="\.\.\/\.\.\/misaligned-scenes\.html">.*?<\/a>\s*$/gim, '');

  next = next.replace(/\s*<\/body>/i, `\n  ${cursorScript}\n</body>`);
  return next;
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

const files = briefingOutputs();
const changed = [];
const issues = [];

for (const file of files) {
  const before = readFileSync(file, 'utf8');
  const after = migrate(before);
  const label = relative(root, file);

  if (after !== before) {
    writeFileSync(file, after);
    changed.push(label);
  }

  if (!after.includes(`data-janet-experiment="${marker}"`)) issues.push(`${label}:marker`);
  if (!after.includes('class="briefing-output-page"')) issues.push(`${label}:body_class`);
  if (count(after, 'styles/experiment-pages.css?v=experiment-wave-16') !== 1) issues.push(`${label}:experiment_css`);
  if (count(after, 'styles/signal-cursor.css?v=experiment-wave-16') !== 1) issues.push(`${label}:cursor_css`);
  if (count(after, 'scripts/signal-cursor.js?v=experiment-wave-16') !== 1) issues.push(`${label}:cursor_script`);
}

if (issues.length) {
  console.error(JSON.stringify({ status: 'experiment_shell_failed', issues }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'experiment_shell_ready',
  outputs: files.length,
  changed: changed.length,
  marker
}, null, 2));
