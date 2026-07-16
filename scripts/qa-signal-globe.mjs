#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'assets/vendor/three.module.js',
  'assets/globe/natural-earth-110m-land.geojson',
  'data/source-locations.json',
  'assets/works/cinematic-lab/cover-v2.webp',
  'scripts/home-theme.js',
  'scripts/apply-experiment-shell.mjs',
  'scripts/editorial-motion.js',
  'scripts/news.js',
  'scripts/reactions.js',
  'scripts/signal-cursor.js',
  'scripts/signal-globe.js',
  'styles/signal-cursor.css',
  'styles/signal-globe.css',
  'styles/experiment-editorial.css'
];
const experimentPages = [
  '404.html',
  'gpt-image2-handbook.html',
  'index.html',
  'misaligned-scenes.html',
  'news.html',
  'portfolio.html',
  'project-detail.html',
  'shuttle-universe.html',
  'auth/reset-password.html',
  'codex-briefing-system/templates/template.html'
];
const issues = [];

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) issues.push(`missing:${file}`);
}

function read(file) {
  return readFileSync(resolve(root, file), 'utf8');
}

function json(file) {
  return JSON.parse(read(file));
}

function briefingOutputs() {
  return readdirSync(resolve(root, 'data'))
    .map((name) => `data/${name}/output.html`)
    .filter((file) => {
      try {
        return statSync(resolve(root, file)).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

if (!issues.length) {
  const index = read('index.html');
  const script = read('scripts/signal-globe.js');
  const news = read('scripts/news.js');
  const reactions = read('scripts/reactions.js');
  const cursor = read('scripts/signal-cursor.js');
  const globeStyles = read('styles/signal-globe.css');
  const experimentStyles = read('styles/experiment-editorial.css');
  const editorialMotion = read('scripts/editorial-motion.js');
  const marvel = read('marvel-ten.html');
  const template = read('codex-briefing-system/templates/template.html');
  const outputs = briefingOutputs();
  const works = json('data/works/works-manifest.json');
  const build = read('.github/scripts/build-pages-artifact.sh');
  const sources = json('data/source-locations.json');
  const poolRaw = json('.github/scripts/rss-source-pool.json');
  const pool = Array.isArray(poolRaw) ? poolRaw : poolRaw.sources || [];
  const land = json('assets/globe/natural-earth-110m-land.geojson');
  const sourceIds = sources.map((source) => source.id);
  const poolIds = pool.map((source) => source.id);

  if (!index.includes('styles/signal-globe.css')) issues.push('homepage_missing_globe_css');
  if (!index.includes('scripts/signal-globe.js')) issues.push('homepage_missing_globe_script');
  if (!index.includes('id="signal-globe-canvas"')) issues.push('homepage_missing_globe_canvas');
  if (!index.includes('data-signal-story-layer')) issues.push('homepage_missing_story_layer');
  if (!index.includes('data-signal-connectors')) issues.push('homepage_missing_connector_layer');
  if (!index.includes('data-signal-center-coordinates')) issues.push('homepage_missing_center_coordinates');
  if (!index.includes('data-signal-source-coordinates')) issues.push('homepage_missing_source_coordinates');
  if (!index.includes('scripts/home-theme.js')) issues.push('homepage_missing_theme_linkage');
  if (!script.includes("from '../assets/vendor/three.module.js'")) issues.push('three_not_local');
  if (!script.includes("fetch('data/news-index.json')")) issues.push('latest_news_mapping_missing');
  if (!script.includes('cardHover')) issues.push('card_pause_state_missing');
  if (!script.includes('buildStoryCards')) issues.push('persistent_story_cards_missing');
  if (!script.includes('updateStoryConnector')) issues.push('story_leader_update_missing');
  if (!globeStyles.includes('.signal-story-leader')) issues.push('story_leader_style_missing');
  if (!globeStyles.includes('-webkit-line-clamp: unset')) issues.push('compact_title_unclamp_missing');
  if (!script.includes("status = news ? 'news' : source.enabled ? 'quiet'")) issues.push('quiet_source_status_missing');
  if (!script.includes("body: String(item.body || item.summary || '').trim()")) issues.push('expanded_story_body_missing');
  if (!script.includes('rotateOnWorldAxis')) issues.push('drag_rotation_missing');
  if (!script.includes('vector3ToLatLng')) issues.push('center_coordinate_math_missing');
  if (!script.includes('formatCoordinates(source.lat, source.lng)')) issues.push('source_coordinate_readout_missing');
  if (!script.includes("stage.addEventListener('wheel', onWheel")) issues.push('wheel_zoom_missing');
  if (!script.includes('zoomVelocity')) issues.push('inertial_zoom_missing');
  if (!script.includes('const visibleLimit = focusedStory ? 0 : 2')) issues.push('mobile_overlap_guard_missing');
  if (!index.includes('scripts/signal-cursor.js')) issues.push('homepage_missing_cursor_script');
  if (!cursor.includes("is-dragging")) issues.push('cursor_drag_state_missing');
  if (!cursor.includes("is-wait")) issues.push('cursor_wait_state_missing');
  if (!cursor.includes('janet-cursor__grip')) issues.push('cursor_grip_missing');
  if (cursor.includes("mark.textContent = '<>'")) issues.push('cursor_angle_brackets_still_present');
  if (!cursor.includes('distance > 80 ? .86 : .72')) issues.push('cursor_dynamic_follow_missing');
  if (!script.includes('const DRAG_HORIZONTAL = .0058')) issues.push('responsive_globe_drag_missing');
  for (const page of experimentPages) {
    const html = read(page);
    if (!html.includes('data-janet-experiment="signal-wave-17"')) issues.push(`experiment_marker_missing:${page}`);
    if (!html.includes('signal-cursor.css?v=experiment-wave-17')) issues.push(`experiment_cursor_css_missing:${page}`);
    if (!html.includes('signal-cursor.js?v=experiment-wave-17')) issues.push(`experiment_cursor_script_missing:${page}`);
    if (!html.includes('editorial-motion.js?v=experiment-wave-17')) issues.push(`experiment_motion_script_missing:${page}`);
    if (!html.includes('experiment-editorial.css?v=experiment-wave-17')) issues.push(`experiment_design_css_missing:${page}`);
    if (html.includes('<ul class="nav-links">')) issues.push(`duplicate_desktop_nav_present:${page}`);
  }
  if (marvel.includes('data-janet-experiment=')) issues.push('marvel_experiment_marker_present');
  if (marvel.includes('signal-cursor.css') || marvel.includes('signal-cursor.js')) issues.push('marvel_experiment_cursor_present');
  if (marvel.includes('experiment-pages.css') || marvel.includes('experiment-editorial.css')) issues.push('marvel_experiment_design_present');
  if (!template.includes('<body class="briefing-output-page">')) issues.push('briefing_template_body_class_missing');
  if (!experimentStyles.includes('--ed-cream: #f4f0e8')) issues.push('experiment_cream_palette_missing');
  if (!experimentStyles.includes('--ed-green-deep: #082d22')) issues.push('experiment_green_palette_missing');
  if (!experimentStyles.includes('body.home-experiment #works-library')) issues.push('homepage_works_override_missing');
  if (!experimentStyles.includes('body.briefing-output-page > .container')) issues.push('briefing_full_width_missing');
  if (!editorialMotion.includes("'.works-overview-card'")) issues.push('editorial_tilt_target_missing');
  if (!editorialMotion.includes('requestAnimationFrame(render)')) issues.push('editorial_tilt_spring_missing');
  if (outputs.length < 50) issues.push(`briefing_output_count_too_small:${outputs.length}`);
  for (const output of outputs) {
    const html = read(output);
    if (!html.includes('data-janet-experiment="signal-wave-17"')) issues.push(`briefing_marker_missing:${output}`);
    if (!html.includes('class="briefing-output-page"')) issues.push(`briefing_body_class_missing:${output}`);
    if (!html.includes('experiment-editorial.css?v=experiment-wave-17')) issues.push(`briefing_design_css_missing:${output}`);
    if (!html.includes('editorial-motion.js?v=experiment-wave-17')) issues.push(`briefing_motion_missing:${output}`);
    if (!html.includes('signal-cursor.js?v=experiment-wave-17')) issues.push(`briefing_cursor_missing:${output}`);
  }
  if (!news.includes("currentReaderLabel() + ' 正在读今日晨报'")) issues.push('real_reader_activity_missing');
  if (news.includes('完整晨报已就绪')) issues.push('fixed_activity_copy_still_present');
  if (!reactions.includes('janet:briefing-shared')) issues.push('share_activity_event_missing');
  if (!JSON.stringify(works).includes('assets/works/cinematic-lab/cover-v2.webp')) issues.push('cinematic_lab_cover_not_linked');
  if (!build.includes('source-locations.json')) issues.push('pages_build_missing_source_locations');
  if (sources.length !== pool.length) issues.push(`source_count_mismatch:${sources.length}!=${pool.length}`);
  if (new Set(sourceIds).size !== sourceIds.length) issues.push('duplicate_source_ids');

  const missingLocations = sources.filter((source) =>
    !source.id || !source.display_name || !source.city || !source.country ||
    !Number.isFinite(source.lat) || !Number.isFinite(source.lng)
  );
  if (missingLocations.length) issues.push(`invalid_source_locations:${missingLocations.map((source) => source.id || 'unknown').join(',')}`);

  const missingFromGlobe = poolIds.filter((id) => !sourceIds.includes(id));
  const extraOnGlobe = sourceIds.filter((id) => !poolIds.includes(id));
  if (missingFromGlobe.length) issues.push(`pool_sources_missing:${missingFromGlobe.join(',')}`);
  if (extraOnGlobe.length) issues.push(`unknown_globe_sources:${extraOnGlobe.join(',')}`);
  if (!Array.isArray(land.features) || land.features.length < 100) issues.push('natural_earth_data_too_small');
}

if (issues.length) {
  console.error(JSON.stringify({ status: 'signal_globe_qa_failed', issues }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'signal_globe_qa_ready',
  sources: json('data/source-locations.json').length,
  engine: 'three.js',
  latest_news_mapping: true,
  coordinate_readout: true,
  persistent_story_cards: true,
  expanded_story_content: true,
  quiet_source_markers: true,
  scroll_theme_linkage: true,
  wheel_zoom: true,
  inertial_motion: true,
  marker_card_leaders: true,
  unclipped_compact_titles: true,
  mobile_overlap_guard: true,
  contextual_cursor_states: true,
  spring_editorial_cards: true,
  experimental_html_shells: experimentPages.length,
  briefing_outputs: briefingOutputs().length,
  marvel_independent_design: true,
  real_reader_activity: true,
  cinematic_lab_cover: true
}, null, 2));
