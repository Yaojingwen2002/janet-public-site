#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

const status = await json('data/mirror-plan-status.json');
const index = await json('data/mirror-plan/experiments/index.json');
const documentIndex = await json('data/works/documents/mirror-plan/index.json');
const project = await json('data/works/projects/mirror-plan.json');
const experiments = await Promise.all(
  index.experiments.map((item) => json(item.data_url))
);

const required = [
  'id',
  'sequence',
  'title',
  'status',
  'status_label',
  'scene',
  'shot_scale',
  'hypothesis',
  'methods',
  'result_summary',
  'conclusion',
  'next_step',
  'images',
  'stats',
  'updated_at'
];
const ids = new Set();
const sequences = new Set();
const sourceImages = new Set();
const documentedIds = new Set(documentIndex.documents.map((item) => item.id));

for (const experiment of experiments) {
  for (const field of required) {
    check(Object.hasOwn(experiment, field), `${experiment.id || 'unknown'} missing ${field}`);
  }
  check(/^JW-LTBF-\d{2}$/.test(experiment.id), `${experiment.id} has invalid id`);
  check(!ids.has(experiment.id), `${experiment.id} is duplicated`);
  check(!sequences.has(experiment.sequence), `sequence ${experiment.sequence} is duplicated`);
  ids.add(experiment.id);
  sequences.add(experiment.sequence);
  check(Array.isArray(experiment.methods) && experiment.methods.length === 3, `${experiment.id} needs A/B/C methods`);
  check(Boolean(experiment.hypothesis.trim()), `${experiment.id} has empty hypothesis`);
  check(Boolean(experiment.result_summary.trim()), `${experiment.id} has empty result summary`);
  check(Boolean(experiment.conclusion.trim()), `${experiment.id} has empty conclusion`);
  check(Boolean(experiment.next_step.trim()), `${experiment.id} has empty next step`);
  check(await exists(experiment.images.source), `${experiment.id} source derivative is missing`);
  check(!sourceImages.has(experiment.images.source), `${experiment.id} reuses another atlas source`);
  sourceImages.add(experiment.images.source);
  for (const variant of experiment.images.variants) {
    check(await exists(variant.src), `${experiment.id} ${variant.id} result derivative is missing`);
  }
  if (experiment.document_id) {
    check(documentedIds.has(experiment.document_id), `${experiment.id} points to an orphan document`);
  }
  check(
    !/(?:\/Users\/|\/Volumes\/|file:\/\/|\\\\Users\\\\)/.test(JSON.stringify(experiment)),
    `${experiment.id} exposes a local filesystem path`
  );
}

for (const documentItem of documentIndex.documents) {
  const linked = experiments.find((experiment) => experiment.document_id === documentItem.id);
  check(Boolean(linked), `document ${documentItem.id} has no experiment`);
}

check(experiments.length === 14, 'atlas must contain exactly 14 experiments');
check(status.planned_atlas_frames === experiments.length, 'status atlas total is stale');
check(status.public_atlas_frames === sourceImages.size, 'status public atlas count is stale');
check(status.documented_experiments === documentIndex.documents.length, 'document count is stale');
check(status.documents === documentIndex.documents.length, 'research record count is stale');
check(project.works.length === experiments.length, 'project work list is stale');
check(project.work_count === experiments.length, 'project work count is stale');
check(
  experiments.some((experiment) => experiment.id === status.current_experiment && experiment.status === 'active'),
  'current experiment is not the active experiment'
);
check(
  status.generated_images === experiments.reduce(
    (total, experiment) => total + Number(experiment.stats.image_count || 0),
    0
  ),
  'generated image count is stale'
);
check(
  status.last_research_update === experiments.map((experiment) => experiment.updated_at).sort().at(-1),
  'last research update is stale'
);
check(
  status.catalog_hash === index.catalog_hash &&
  experiments.every((experiment) => experiment.catalog_hash === index.catalog_hash),
  'catalog hash differs across generated data'
);
check(
  !/(?:\/Users\/|\/Volumes\/|file:\/\/|\\\\Users\\\\)/.test(JSON.stringify({ status, index, project })),
  'public mirror metadata exposes a local filesystem path'
);

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  console.error(`mirror_data_invalid failures=${failures.length}`);
  process.exit(1);
}

console.log(`mirror_data_valid experiments=${experiments.length} documents=${documentIndex.documents.length}`);
