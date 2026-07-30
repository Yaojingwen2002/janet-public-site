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

const materialScenes = {
  'index.html': 'signal',
  'news.html': 'editorial',
  'portfolio.html': 'archive',
  'project-detail.html': 'archive',
  'gpt-image2-handbook.html': 'archive',
  'mirror-plan.html': 'archive',
  'shuttle-universe.html': 'media',
  'misaligned-scenes.html': 'media',
  '404.html': 'system',
  'auth/reset-password.html': 'system'
};

for (const page of v4Pages) {
  const html = await read(page);
  assert(html.includes('data-janet-design="poster-v4"'), `${page} opts into poster V4`);
  assert(html.includes('material-system-v4.css'), `${page} loads material system V4`);
  assert(html.includes('potato-center-v4.css'), `${page} loads potato center V4`);
  assert(html.includes('potato-center.js'), `${page} loads potato center controller`);
  assert(
    html.includes(`data-material-scene="${materialScenes[page]}"`),
    `${page} declares its material scene`
  );
  assert(html.includes('media-fallback-v4.js'), `${page} loads shared media fallback`);
}

const briefingTemplate = await read('codex-briefing-system/templates/template.html');
assert(
  briefingTemplate.includes('data-material-scene="editorial"'),
  'briefing template declares editorial material scene'
);
assert(
  briefingTemplate.includes('media-fallback-v4.js'),
  'briefing template loads shared media fallback'
);

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
assert(
  potatoScript.includes('name="remember"') && potatoScript.includes('remember: Boolean(data.remember)'),
  'potato center exposes a functional remember-me control'
);

const supabaseScript = await read('scripts/supabase-config.js');
const authScript = await read('scripts/auth.js');
assert(
  supabaseScript.includes("const AUTH_PERSISTENCE_KEY = 'janet_auth_persistence'"),
  'auth persistence uses one declared mode key'
);
assert(
  supabaseScript.includes("mode === 'session' ? 'session' : 'local'"),
  'auth persistence supports session and local modes'
);
assert(
  supabaseScript.includes('storageRemove(fallback, key)'),
  'auth tokens are removed from the non-selected storage'
);
assert(
  !/(?:localStorage|sessionStorage)\.setItem\([^)]*password/i.test(supabaseScript + authScript + potatoScript),
  'passwords are never written to Web Storage'
);

const resetPage = await read('auth/reset-password.html');
assert(resetPage.includes("event === 'PASSWORD_RECOVERY'"), 'reset page handles Supabase recovery events');
assert(resetPage.includes('history.replaceState'), 'reset page removes recovery tokens from the URL');
assert(resetPage.includes('重置链接已失效'), 'reset page has an explicit expired-link state');

const potatoAssets = [
  'assets/ui/potato-center/potato-body-v4.webp',
  'assets/ui/potato-center/potato-body-v4-1x.webp',
  'assets/ui/potato-center/potato-body-v4-2x.webp'
];
let potatoBytes = 0;
for (const asset of potatoAssets) {
  assert(await exists(asset), `potato asset exists: ${asset}`);
  if (await exists(asset)) potatoBytes += (await stat(path.join(root, asset))).size;
}
assert(potatoBytes <= 120 * 1024, `potato asset family stays under 120KB (${potatoBytes} bytes)`);

const materialAssets = [
  'assets/ui/material-v4/paper-grain.png',
  'assets/ui/material-v4/signal-grain.png',
  'assets/ui/material-v4/glass-grain.png'
];
let materialBytes = 0;
for (const asset of materialAssets) {
  assert(await exists(asset), `material texture exists: ${asset}`);
  if (await exists(asset)) materialBytes += (await stat(path.join(root, asset))).size;
}
assert(materialBytes <= 400 * 1024, `material textures stay under 400KB (${materialBytes} bytes)`);

assert(await exists('docs/POSTER_MATERIAL_V4_FONT_AUDIT.md'), 'font audit is documented');
assert(await exists('docs/poster-material-v4-component-sheet.html'), 'component sheet exists');

const materialCss = await read('styles/material-system-v4.css');
const potatoCss = await read('styles/potato-center-v4.css');
const globeCss = [
  await read('styles/signal-globe.css'),
  await read('styles/signal-globe-wave4.css'),
  await read('styles/signal-globe-wave5.css')
].join('\n');
assert(!/letter-spacing\s*:\s*-\S+/i.test(materialCss), 'material system has no negative letter spacing');
assert(!/font-size\s*:[^;{}]*vw/i.test(materialCss), 'material system has no viewport-scaled font size');
assert(potatoCss.includes('image-set('), 'potato center serves 1x and 2x responsive assets');

const indexHtml = await read('index.html');
for (const stylesheet of ['signal-globe.css', 'signal-globe-wave4.css', 'signal-globe-wave5.css']) {
  assert(indexHtml.includes(stylesheet), `homepage loads split globe stylesheet: ${stylesheet}`);
}

const globeScript = await read('scripts/signal-globe.js');
const globeV4Css = await read('styles/signal-globe-v4.css');
const threeMinPath = 'assets/vendor/three.module.min.js';
assert(await exists(threeMinPath), 'homepage bundles the minified Three.js module');
if (await exists(threeMinPath)) {
  const threeMinBytes = (await stat(path.join(root, threeMinPath))).size;
  assert(threeMinBytes <= 700 * 1024, `minified Three.js stays under 700KB (${threeMinBytes} bytes)`);
}
assert(globeScript.includes("three.module.min.js"), 'globe imports the minified Three.js module');
assert(globeScript.includes('activePointers: new Map()'), 'globe tracks independent touch pointers');
assert(globeScript.includes('state.pinching = true'), 'globe supports two-finger pinch zoom');
assert(globeScript.includes("stage.dataset.globeConstraint = 'rebounding'"), 'globe has visible-area rebound');
assert(globeScript.includes('data-signal-connectors'), 'globe binds the source-to-card connector layer');
assert(globeScript.includes('visibleMin: .22') && globeScript.includes('visibleMax: .3'), 'globe enforces the quarter-visible target');
assert(
  /signal-motion-toggle\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/m.test(globeV4Css),
  'globe motion control keeps a 44px target'
);
assert(
  /codex-carousel-progress\s*\{[\s\S]*?height:\s*44px;/m.test(globeV4Css),
  'news carousel controls keep a 44px target'
);
assert(globeCss.includes('.signal-story-logo'), 'globe cards include a source-logo layer');
assert(!/cdn\.simpleicons\.org/i.test(globeScript + globeCss + indexHtml), 'globe does not depend on remote source-logo CDNs');

const sourceLogoBlock = globeScript.match(/const SOURCE_LOGOS = \{([\s\S]*?)\n  \};/)?.[1] || '';
const sourceLogoSlugs = [...new Set(
  [...sourceLogoBlock.matchAll(/:\s*'([a-z0-9-]+)'/gi)].map((match) => match[1])
)];
assert(sourceLogoSlugs.length >= 12, 'globe declares a meaningful local source-logo set');
for (const slug of sourceLogoSlugs) {
  assert(await exists(`assets/icons/sources/${slug}.svg`), `local source logo exists: ${slug}`);
}

const worksManifest = await read('data/works/works-manifest.json');
const mirrorWork = await read('data/works/works/jingchang-plan-s0-lab.json');
assert(!worksManifest.includes('01–03'), 'works manifest has no stale three-experiment copy');
assert(!mirrorWork.includes('"document_count": 3'), 'mirror work exposes all four research records');

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
  'scripts/media-fallback-v4.js',
  'styles/material-system-v4.css',
  'styles/potato-center-v4.css',
  'styles/signal-globe.css',
  'styles/signal-globe-wave4.css',
  'styles/signal-globe-wave5.css',
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
