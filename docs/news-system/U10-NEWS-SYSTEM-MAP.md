# U10 News System Map

This map records the production news system inside the `janet-public-site` repository.

## Source Of Truth

- Production repo: `janet-public-site`
- Reference/archive repo: local Janet archive and deployment notes
- Current content truth source: `data/<edition_id>/content.json`
- Homepage derivative: `data/<edition_id>/news-summary.json`
- Rendered page derivative: `data/<edition_id>/output.html`
- Latest pointer: `data/MANIFEST.json`
- Public index: `data/news-index.json`
- Status outlet: `data/daily-news-run-status.json`

## Workflow

Production workflow:

- `.github/workflows/daily-news-pages.yml`

Current schedule:

- `10 0 * * *`
- GitHub Actions cron uses UTC.
- `00:10 UTC = 08:10 Asia/Shanghai / Asia/Taipei`.

## Content Generation Scripts

- `.github/scripts/daily-news-generator.mjs`
  - Fetches public sources.
  - Builds raw/story/module/cover/homepage/detail layers.
  - Resolves story visuals.
  - Writes `content.json`, `news-summary.json`, `output.html`, run status, snapshots, and check inputs.
- `.github/scripts/build-news-index.mjs`
  - Builds `data/news-index.json` from `MANIFEST` and edition files.
- `.github/scripts/source-coverage-audit.mjs`
  - Summarizes source pool coverage into `data/source-coverage-report.json`.
- `.github/scripts/run-daily-release.mjs`
  - Single daily release runner added in U10-0.
  - Calls generation, indexing, audits, QA, and final release gate in one sequence.
  - It is available as the future single entrypoint. The workflow still keeps explicit steps for safer rollout.

## Frontend Render Scripts

- `scripts/news.js`
  - Hydrates homepage Janet news block from `news-summary.json` and `content.json`.
- `scripts/news-archive.js`
  - Hydrates `news.html` archive from `data/news-index.json`.
  - Archive cards link directly to the generated briefing output.

## Active QA Scripts

- `.github/scripts/qa-daily-news-output.mjs`
  - Legacy umbrella QA for edition files, automation result, editorial quality, and news experience.
- `scripts/qa-live-source-stability.mjs`
  - Checks live source snapshot and target date stability.
- `scripts/qa-section-hydration.mjs`
  - Blocks empty sections and generic fallback copy.
- `scripts/qa-homepage-assembly.mjs`
  - Blocks duplicate homepage story slots.
- `scripts/qa-semantic-copy.mjs`
  - Blocks semantic duplicate/crosswire/template problems.
- `scripts/qa-editorial-architecture.mjs`
  - Blocks missing v2 architecture layers and copy collisions.
- `scripts/qa-homepage-surface-copy.mjs`
  - Blocks homepage surface copy templates.
- `scripts/qa-news-visuals.mjs`
  - Blocks missing/placeholder/legacy visuals.
- `scripts/qa-public-reader-copy.mjs`
  - Blocks debug copy, missing URLs, source mismatch, and compact layout regressions.
- `scripts/qa-site-polish.mjs`
  - Checks site SEO/polish assets.
- `scripts/qa-main-ux.mjs`
  - Final UX integration check.
- `scripts/qa-release-gate.mjs`
  - New U10-0 final release gate.
  - Reads the core check JSON files and blocks release if template copy leaks remain.

## Final Gate JSON

Production final checks:

- `data/public-reader-copy-check.json`
- `data/main-ux-check.json`
- `data/semantic-copy-check.json`
- `data/news-visuals-check.json`
- `data/homepage-surface-copy-check.json`
- `data/release-gate-check.json`

Intermediate or diagnostic checks:

- `data/editorial-architecture-check.json`
- `data/editorial-redesign-check.json`
- `data/homepage-assembly-check.json`
- `data/live-source-stability-check.json`
- `data/section-hydration-check.json`
- `data/source-coverage-report.json`
- `data/semantic-copy-debug.json`

## Removed In U10-0

These files were removed because they were one-off audit tools, were not referenced by the workflow, were not imported or executed by production scripts, and their coverage is now represented by active QA plus `qa-release-gate.mjs`.

- `scripts/audit-homepage-surface-copy.mjs`
- `scripts/audit-news-visuals.mjs`
- `scripts/audit-semantic-copy.mjs`
- `data/homepage-surface-copy-audit.json`
- `data/news-visuals-audit.json`
- `data/semantic-copy-audit.json`

Kept intentionally:

- `scripts/audit-public-reader-copy.mjs`
- `data/public-reader-copy-audit.json`

Reason: `scripts/qa-public-reader-copy.mjs` still reads the audit JSON for reader-copy fixed-count context, and the workflow uploads it as a debug artifact.

## Duplicate Or Confusing Areas Still Present

- `content.json`, `news-summary.json`, and `output.html` are still all produced by `daily-news-generator.mjs`.
- `news-summary.json` should remain a homepage derivative, not an independent content source.
- `output.html` should remain render-only and should not create new editorial copy.
- Multiple QA scripts remain active for now. `run-daily-release.mjs` provides the future single entrypoint without changing behavior in this step.

## Files Not Deleted

These remain because the workflow or frontend still uses them:

- `.github/workflows/daily-news-pages.yml`
- `.github/scripts/daily-news-generator.mjs`
- `.github/scripts/build-news-index.mjs`
- `.github/scripts/qa-daily-news-output.mjs`
- `.github/scripts/source-coverage-audit.mjs`
- `scripts/news.js`
- `scripts/news-archive.js`
- `scripts/qa-public-reader-copy.mjs`
- `scripts/qa-main-ux.mjs`
- `scripts/qa-semantic-copy.mjs`
- `scripts/qa-news-visuals.mjs`
- `data/MANIFEST.json`
- `data/news-index.json`
- `data/daily-news-run-status.json`
