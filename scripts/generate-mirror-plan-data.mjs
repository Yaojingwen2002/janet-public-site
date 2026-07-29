#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(root, 'data/mirror-plan/atlas-catalog.json');
const experimentRoot = path.join(root, 'data/mirror-plan/experiments');
const indexPath = path.join(experimentRoot, 'index.json');
const statusPath = path.join(root, 'data/mirror-plan-status.json');
const projectPath = path.join(root, 'data/works/projects/mirror-plan.json');
const checkOnly = process.argv.includes('--check');

const catalogText = await readFile(catalogPath, 'utf8');
const catalog = JSON.parse(catalogText);
const catalogHash = createHash('sha256').update(catalogText).digest('hex');

function serialise(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function publicWork(experiment) {
  return {
    id: experiment.id.toLowerCase(),
    sequence: experiment.sequence,
    display_number: String(experiment.sequence).padStart(2, '0'),
    project_id: 'mirror-plan',
    title: `${experiment.id.replace('JW-LTBF-', 'S0-')} ${experiment.title}`,
    type: 'visual-calibration',
    status: experiment.status_label,
    status_code: experiment.status,
    summary: experiment.result_summary,
    tags: [
      experiment.scene,
      experiment.shot_scale,
      ...experiment.tags
    ],
    url: `mirror-plan.html?experiment=${experiment.id}`,
    reader_json: experiment.document_id
      ? `data/works/documents/mirror-plan/jw-ltbf-${String(experiment.sequence).padStart(2, '0')}.json`
      : null,
    thumbnail: experiment.images.source,
    cover: experiment.images.source,
    images: experiment.images.variants.map((variant) => variant.src),
    stats: experiment.stats
  };
}

const experiments = catalog.experiments.map((experiment) => ({
  schema_version: 1,
  catalog_hash: catalogHash,
  ...experiment
}));

const index = {
  schema_version: 1,
  catalog_hash: catalogHash,
  updated_at: catalog.status_updated_at,
  experiment_count: experiments.length,
  experiments: experiments.map((experiment) => ({
    id: experiment.id,
    sequence: experiment.sequence,
    title: experiment.title,
    status: experiment.status,
    data_url: `data/mirror-plan/experiments/${experiment.id}.json`,
    source_image: experiment.images.source,
    document_id: experiment.document_id
  }))
};

const documented = experiments.filter((experiment) => experiment.document_id);
const completed = experiments.filter((experiment) =>
  ['frozen', 'freeze_candidate', 'stage_closed'].includes(experiment.status)
);
const active = experiments.filter((experiment) => experiment.status === 'active');
const scheduled = experiments.filter((experiment) => experiment.status === 'scheduled');
const current = active[0] || documented.at(-1) || experiments[0];
const generatedImages = experiments.reduce(
  (total, experiment) => total + Number(experiment.stats.image_count || 0),
  0
);
const lastResearchUpdate = experiments
  .map((experiment) => experiment.updated_at)
  .sort()
  .at(-1);
const currentVariants = current.images.variants.slice(0, 3);
const featuredPreviews = documented.slice(0, 4).map((experiment) => {
  const preferred = experiment.images.variants.find((variant) => variant.id === 'B') ||
    experiment.images.variants[0];
  return {
    id: experiment.id,
    label: experiment.id.replace('JW-LTBF-', 'S0-'),
    src: preferred?.src || experiment.images.source,
    alt: `${experiment.title} ${preferred ? `${preferred.id} 版结果` : '母图衍生图'}`
  };
});

const status = {
  schema_version: 1,
  catalog_hash: catalogHash,
  phase_id: catalog.phase_id,
  phase_label: catalog.phase_label,
  project_status: active.length ? 'active' : 'published_archive',
  current_experiment: current.id,
  current_experiment_label: current.status_label,
  completed_experiments: completed.length,
  documented_experiments: documented.length,
  active_experiments: active.length,
  scheduled_experiments: scheduled.length,
  planned_atlas_frames: experiments.length,
  public_atlas_frames: experiments.length,
  generated_images: generatedImages,
  documents: documented.length,
  last_research_update: lastResearchUpdate,
  status_updated_at: catalog.status_updated_at,
  next_step: current.next_step,
  public_boundary: catalog.public_boundary,
  atlas_index: 'data/mirror-plan/experiments/index.json',
  preview_images: currentVariants.map((variant) => ({
    id: variant.id,
    label: `${variant.id} / ${variant.label}`,
    src: variant.src,
    alt: `${current.title} ${variant.id} 版实验结果`
  })),
  featured_previews: featuredPreviews
};

const project = {
  id: 'mirror-plan',
  title: '镜场计划',
  type: 'AI Director Visual R&D',
  source_path_label: '镜场计划 / S0 实验观测站',
  description: '以 14 张母图构成实验图谱，公开低分辨率研究衍生图，并用编号记录追踪 A/B/C 变量、失败证据与阶段判断。',
  method: [
    '原片视觉分析',
    '原创安全转译',
    'A/B/C 单变量测试',
    'Janet 肉眼评价',
    '完整过程与证据归档'
  ],
  tags: ['镜场计划', 'AI 导演', '实验图谱', '视觉校准', '安全转译'],
  work_count: experiments.length,
  completed_experiment_count: completed.length,
  preparing_experiment_count: scheduled.length,
  active_experiment_count: active.length,
  documented_experiment_count: documented.length,
  document_count: documented.length,
  experiment_index: 'data/mirror-plan/experiments/index.json',
  document_index: 'data/works/documents/mirror-plan/index.json',
  url: 'mirror-plan.html',
  thumbnail: current.images.source,
  cover: current.images.source,
  works: experiments.map(publicWork),
  public_boundary: [
    '公开 14 张母图的低分辨率研究衍生图，以及 01–05 的选定 A/B/C 结果',
    '原始视频、全分辨率母图、内部 Prompt 和完整测试工作目录不进入公开产物',
    '01–04 保留完整 PDF 阅读版与 DOCX 下载；05 在形成完整归档前只显示实验状态',
    '待排期项目明确标记为未测试，不用占位结论冒充成果'
  ]
};

const expected = new Map([
  [indexPath, index],
  [statusPath, status],
  [projectPath, project],
  ...experiments.map((experiment) => [
    path.join(experimentRoot, `${experiment.id}.json`),
    experiment
  ])
]);

if (checkOnly) {
  const mismatches = [];
  for (const [file, value] of expected) {
    try {
      const currentValue = JSON.parse(await readFile(file, 'utf8'));
      if (JSON.stringify(currentValue) !== JSON.stringify(value)) {
        mismatches.push(path.relative(root, file));
      }
    } catch {
      mismatches.push(path.relative(root, file));
    }
  }
  if (mismatches.length) {
    console.error(`mirror_data_stale files=${mismatches.join(',')}`);
    process.exit(1);
  }
  console.log(`mirror_data_current experiments=${experiments.length} catalog_hash=${catalogHash.slice(0, 12)}`);
  process.exit(0);
}

await mkdir(experimentRoot, { recursive: true });
for (const [file, value] of expected) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, serialise(value));
}

console.log(`mirror_data_ready experiments=${experiments.length} catalog_hash=${catalogHash.slice(0, 12)}`);
