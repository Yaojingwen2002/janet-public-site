#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function argument(name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const sourceRootArg = argument('--source-root');
const outputRootArg = argument(
  '--output-root',
  path.join(repoRoot, 'assets/works/mirror-plan/research')
);

if (!sourceRootArg) {
  console.error('Usage: node scripts/build-mirror-plan-assets.mjs --source-root <mirror-plan-directory>');
  process.exit(1);
}

const sourceRoot = path.resolve(sourceRootArg);
const outputRoot = path.resolve(outputRootArg);
const frameRoot = path.join(sourceRoot, 'frames/让子弹飞/04_master_testset_14');
const testRoot = path.join(sourceRoot, 'tests');

const frames = [
  '01_dual_outdoor_closeup.jpg',
  '02_huang_white_interior_closeup.jpg',
  '03_huang_red_green_closeup.jpg',
  '04_interior_conflict_group.jpg',
  '05_tower_gate_power_space.jpg',
  '06_target_prop_closeup.jpg',
  '07_long_table_group_power.jpg',
  '08_overhead_pressure_closeup.jpg',
  '09_train_mountain_arrival_screenshot.png',
  '10_train_carriage_banquet_screenshot.png',
  '11_train_rear_mountain_action_screenshot.png',
  '12_target_face_closeup_screenshot.png',
  '13_carriage_crash_face_screenshot.png',
  '14_horse_courtyard_arrival_screenshot.png'
];

const experimentVariants = [
  {
    id: 'JW-LTBF-01',
    round: 'round-07',
    files: {
      A: 'JW-LTBF-01_A_baseline_r07.png',
      B: 'JW-LTBF-01_B_midtone_r07.png',
      C: 'JW-LTBF-01_C_shadow_r07.png',
      D: 'JW-LTBF-01_D_power_r07.png'
    }
  },
  {
    id: 'JW-LTBF-02',
    round: 'round-10',
    files: {
      A: 'JW-LTBF-02_A_r10.png',
      B: 'JW-LTBF-02_B_r10.png',
      C: 'JW-LTBF-02_C_r10.png'
    }
  },
  {
    id: 'JW-LTBF-03',
    round: 'round-03',
    files: {
      A: 'JW-LTBF-03_A_r03.png',
      B: 'JW-LTBF-03_B_r03.png',
      C: 'JW-LTBF-03_C_r03.png'
    }
  },
  {
    id: 'JW-LTBF-04',
    round: 'round-08',
    files: {
      A: 'JW-LTBF-04_A_r08.png',
      B: 'JW-LTBF-04_B_r08.png',
      C: 'JW-LTBF-04_C_r08.png'
    }
  },
  {
    id: 'JW-LTBF-05',
    round: 'round-06',
    files: {
      A: 'JW-LTBF-05_A_r06.png',
      B: 'JW-LTBF-05_B_r06.png',
      C: 'JW-LTBF-05_C_r06.png'
    }
  }
];

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${code}): ${stderr.trim()}`));
    });
  });
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function dimensions(file) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=s=x:p=0',
      file
    ]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed (${code}): ${stderr.trim()}`));
        return;
      }
      const [width, height] = stdout.trim().split('x').map(Number);
      resolve({ width, height });
    });
  });
}

async function derive(input, output, width, quality) {
  await mkdir(path.dirname(output), { recursive: true });
  await run('sips', [
    '--resampleHeightWidthMax', String(width),
    '--setProperty', 'format', 'jpeg',
    '--setProperty', 'formatOptions', String(quality),
    input,
    '--out', output
  ]);
  await run('sips', [
    '--deleteColorManagementProperties',
    '--deleteProperty', 'make',
    '--deleteProperty', 'model',
    '--deleteProperty', 'description',
    '--deleteProperty', 'copyright',
    '--deleteProperty', 'artist',
    output
  ]);
}

const manifest = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  policy: 'Web derivatives only. Source videos, full-resolution frames, prompts and local paths are excluded.',
  files: []
};

for (let index = 0; index < frames.length; index += 1) {
  const sourceLabel = `frames/让子弹飞/04_master_testset_14/${frames[index]}`;
  const input = path.join(frameRoot, frames[index]);
  const outputLabel = `atlas/${String(index + 1).padStart(2, '0')}.jpg`;
  const output = path.join(outputRoot, outputLabel);
  await derive(input, output, 1440, 78);
  const info = await stat(output);
  manifest.files.push({
    kind: 'atlas_frame',
    id: String(index + 1).padStart(2, '0'),
    source_label: sourceLabel,
    output: `assets/works/mirror-plan/research/${outputLabel}`,
    bytes: info.size,
    sha256: await sha256(output),
    ...await dimensions(output)
  });
}

for (const experiment of experimentVariants) {
  for (const [variant, filename] of Object.entries(experiment.files)) {
    const sourceLabel = `tests/${experiment.id}/${experiment.round}/${filename}`;
    const input = path.join(testRoot, experiment.id, experiment.round, filename);
    const outputLabel = `experiments/${experiment.id}/${variant}.jpg`;
    const output = path.join(outputRoot, outputLabel);
    await derive(input, output, 1440, 80);
    const info = await stat(output);
    manifest.files.push({
      kind: 'experiment_result',
      id: `${experiment.id}-${variant}`,
      experiment_id: experiment.id,
      variant,
      source_label: sourceLabel,
      output: `assets/works/mirror-plan/research/${outputLabel}`,
      bytes: info.size,
      sha256: await sha256(output),
      ...await dimensions(output)
    });
  }
}

const manifestPath = path.join(outputRoot, 'asset-manifest.json');
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`mirror_assets_ready files=${manifest.files.length} output=${path.relative(repoRoot, outputRoot)}`);
