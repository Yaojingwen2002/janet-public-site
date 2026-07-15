#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'assets/vendor/three.module.js',
  'assets/globe/natural-earth-110m-land.geojson',
  'data/source-locations.json',
  'scripts/home-theme.js',
  'scripts/signal-globe.js',
  'styles/signal-globe.css'
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

if (!issues.length) {
  const index = read('index.html');
  const script = read('scripts/signal-globe.js');
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
  if (!index.includes('data-signal-card')) issues.push('homepage_missing_signal_card');
  if (!index.includes('data-signal-center-coordinates')) issues.push('homepage_missing_center_coordinates');
  if (!index.includes('data-signal-source-coordinates')) issues.push('homepage_missing_source_coordinates');
  if (!index.includes('scripts/home-theme.js')) issues.push('homepage_missing_theme_linkage');
  if (!script.includes("from '../assets/vendor/three.module.js'")) issues.push('three_not_local');
  if (!script.includes("fetch('data/news-index.json')")) issues.push('latest_news_mapping_missing');
  if (!script.includes('cardHover')) issues.push('card_pause_state_missing');
  if (!script.includes('rotateOnWorldAxis')) issues.push('drag_rotation_missing');
  if (!script.includes('vector3ToLatLng')) issues.push('center_coordinate_math_missing');
  if (!script.includes('formatCoordinates(source.lat, source.lng)')) issues.push('source_coordinate_readout_missing');
  if (!script.includes("stage.addEventListener('wheel', onWheel")) issues.push('wheel_zoom_missing');
  if (!script.includes('zoomVelocity')) issues.push('inertial_zoom_missing');
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
  scroll_theme_linkage: true,
  wheel_zoom: true,
  inertial_motion: true
}, null, 2));
