import { access, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const passes = [];

function pass(message) {
  passes.push(message);
}

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function readJson(relativePath) {
  return JSON.parse(await read(relativePath));
}

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

const status = await readJson('data/mirror-plan-status.json');
const project = await readJson('data/works/projects/mirror-plan.json');
const index = await readJson('data/works/documents/mirror-plan/index.json');
const handbook = await readJson('data/gpt-image2-handbook/handbook-cases.json');
const schema = await readJson('data/schemas/mirror-plan-status.schema.json');
const experimentSchema = await readJson('data/schemas/mirror-plan-experiment.schema.json');
const atlasIndex = await readJson('data/mirror-plan/experiments/index.json');

assert(status.schema_version === 1, 'mirror status schema version is 1');
assert(schema.properties?.schema_version?.const === 1, 'mirror status schema declares version 1');
assert(/^S\d+$/.test(status.phase_id), 'mirror phase id is valid');
assert(/^JW-LTBF-\d{2}$/.test(status.current_experiment), 'current experiment id is valid');
assert(/^\d{4}-\d{2}-\d{2}$/.test(status.last_research_update), 'research update date is ISO formatted');
assert(status.documented_experiments === index.documents.length, 'documented experiment count matches document index');
assert(status.completed_experiments === project.completed_experiment_count, 'completed experiment count matches project data');
assert(status.documents === project.document_count, 'document count matches project data');
assert(status.documents === index.documents.length, 'status document count matches document index');
assert(
  status.public_atlas_frames === atlasIndex.experiments.length,
  'public frame count matches atlas index'
);
assert(
  atlasIndex.experiment_count === atlasIndex.experiments.length,
  'atlas index count matches experiment entries'
);
assert(
  atlasIndex.experiments.length === project.work_count,
  'atlas index count matches project work count'
);
assert(
  experimentSchema.properties?.schema_version?.const === 1,
  'mirror experiment schema declares version 1'
);

const generatedImageCount = project.works.reduce(
  (total, work) => total + Number(work.stats?.image_count || 0),
  0
);
assert(status.generated_images === generatedImageCount, 'generated image count matches experiment statistics');

const activeWork = project.works.find((work) => work.status_code === 'active');
assert(
  activeWork?.id?.toUpperCase() === status.current_experiment,
  'current experiment matches active project work'
);

for (const preview of status.preview_images) {
  assert(
    preview.src.startsWith('assets/works/mirror-plan/') && await exists(preview.src),
    `public preview exists: ${preview.id}`
  );
}

for (const experiment of atlasIndex.experiments) {
  assert(await exists(experiment.source_image), `atlas source exists: ${experiment.id}`);
  assert(await exists(experiment.data_url), `experiment data exists: ${experiment.id}`);
}

assert(Array.isArray(handbook) && handbook.length === 100, 'GPT Image 2 handbook keeps 100 records');

const pagePolicies = {
  'index.html': 'ambient',
  'news.html': 'ambient',
  'gpt-image2-handbook.html': 'ambient',
  'mirror-plan.html': 'ambient',
  'portfolio.html': 'media',
  'project-detail.html': 'media',
  'shuttle-universe.html': 'media',
  'misaligned-scenes.html': 'media',
  'marvel-ten.html': 'media',
  '404.html': 'silent',
  'auth/reset-password.html': 'silent',
  'codex-briefing-system/templates/template.html': 'ambient'
};

for (const [page, policy] of Object.entries(pagePolicies)) {
  const html = await read(page);
  assert(
    html.includes(`data-audio-policy="${policy}"`),
    `${page} uses ${policy} audio policy`
  );
  assert(
    html.includes('site-audio.js'),
    `${page} loads shared site audio controller`
  );
}

const v4Pages = [
  'index.html',
  'news.html',
  'portfolio.html',
  'project-detail.html',
  'gpt-image2-handbook.html',
  'mirror-plan.html',
  'shuttle-universe.html',
  'misaligned-scenes.html',
  '404.html',
  'auth/reset-password.html'
];

for (const page of v4Pages) {
  const html = await read(page);
  assert(html.includes('data-janet-design="poster-v4"'), `${page} opts into poster V4`);
  assert(html.includes('material-system-v4.css'), `${page} loads material system V4`);
  assert(html.includes('potato-center-v4.css'), `${page} loads potato center V4`);
  assert(html.includes('potato-center.js'), `${page} loads potato center controller`);
}

const marvel = await read('marvel-ten.html');
assert(!marvel.includes('data-janet-design="poster-v4"'), 'Marvel page keeps its independent visual identity');

const mirrorHtml = await read('mirror-plan.html');
const handbookHtml = await read('gpt-image2-handbook.html');
const pagesBuild = await read('.github/scripts/build-pages-artifact.sh');
for (const [page, html] of [
  ['mirror-plan.html', mirrorHtml],
  ['gpt-image2-handbook.html', handbookHtml]
]) {
  assert(html.includes('scripts/mirror-research.js'), `${page} reads shared mirror status`);
  assert(!html.includes('S0 · Experimental'), `${page} has no hardcoded phase pill`);
  assert(!html.includes('01–03'), `${page} has no stale three-document claim`);
}

assert(
  pagesBuild.includes('mirror-plan-status.json'),
  'Pages artifact copies shared mirror status'
);
assert(
  pagesBuild.includes('mirror-plan-status.schema.json'),
  'Pages artifact copies mirror status schema'
);

const potatoScript = await read('scripts/potato-center.js');
assert(!potatoScript.includes('GitHub 登录'), 'V4 potato center has no GitHub login UI');

const potatoAsset = 'assets/ui/potato-center/potato-body-v4.webp';
const potatoBytes = (await stat(path.join(root, potatoAsset))).size;
assert(potatoBytes <= 120 * 1024, `potato asset stays under 120KB (${potatoBytes} bytes)`);

const publicFiles = [
  'index.html',
  'news.html',
  'portfolio.html',
  'project-detail.html',
  'gpt-image2-handbook.html',
  'mirror-plan.html',
  '404.html',
  'auth/reset-password.html',
  'scripts/potato-center.js',
  'scripts/nav.js',
  'scripts/signal-globe.js',
  'scripts/site-audio.js',
  'scripts/mirror-research.js',
  'styles/material-system-v4.css',
  'styles/potato-center-v4.css',
  'styles/signal-globe-v4.css',
  'styles/site-audio-v4.css',
  'styles/mirror-observatory-v4.css',
  'data/mirror-plan-status.json'
];

for (const file of publicFiles) {
  const content = await read(file);
  assert(
    !/(?:\/Users\/|\/Volumes\/|file:\/\/|\\\\Users\\\\)/.test(content),
    `${file} contains no local filesystem path`
  );
}

console.log(`Poster V4 QA: ${passes.length} passed, ${failures.length} failed`);
passes.forEach((message) => console.log(`PASS ${message}`));
failures.forEach((message) => console.error(`FAIL ${message}`));

if (failures.length) process.exitCode = 1;
