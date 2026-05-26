# Janet Public Site

Public GitHub Pages site for Janet's personal homepage, portfolio, and AI daily news.

## Public URL

https://yaojingwen2002.github.io/janet-public-site/

## Core Pages

- Home: `index.html`
- Portfolio: `portfolio.html`
- News archive: `news.html`
- Project detail: `project-detail.html`
- 404 page: `404.html`

## Daily News Automation

This site uses GitHub Actions to generate Janet daily news.

Schedule:

- `00:10 UTC`
- `08:10 Asia/Shanghai / Asia/Taipei`

Workflow:

- `.github/workflows/daily-news-pages.yml`

Generator:

- `.github/scripts/daily-news-generator.mjs`

RSS source pool:

- `.github/scripts/rss-source-pool.json`

Release runner:

- `.github/scripts/run-daily-release.mjs`

Important status files:

- `data/daily-news-run-status.json`
- `data/release-gate-check.json`
- `data/news-index.json`
- `data/MANIFEST.json`

Notes:

- No paid API is required.
- No secrets are required.
- Sample data is not used.
- If fresh news is below the publish threshold, the workflow may keep the latest published edition and record the reason in `data/daily-news-run-status.json`.

## Current News Behavior

The latest published edition is controlled by `data/MANIFEST.json`.

A workflow run can finish successfully without creating a new edition when fresh source count is below the minimum publish threshold. In that case:

- `created_new_edition = false`
- `no_new_edition_reason` records the reason
- `data/daily-news-run-status.json` remains the source of run status truth

## News Experience

- News archive: `news.html`
- News cards link to original source URLs where applicable
- Standalone story detail and automation status pages have been removed

## Editorial System

Current editorial references:

- `docs/editorial/JANET-FULL-PROFILE.md`
- `docs/editorial/JANET-EDITORIAL-VOICE.md`
- `docs/editorial/NEWS-CONTENT-CONTRACT.v5.md`
- `docs/editorial/OLD-NEWS-STYLE-EXAMPLES.md`

## QA

Key QA files include:

- `.github/scripts/qa-daily-news-output.mjs`
- `scripts/qa-release-gate.mjs`
- `scripts/qa-public-reader-copy.mjs`
- `scripts/qa-main-ux.mjs`
- `scripts/qa-news-visuals.mjs`
- `scripts/qa-semantic-copy.mjs`
- `scripts/qa-live-source-stability.mjs`

## Deployment

GitHub Pages deploys from this repository.

Pages deployment may be handled by:

- `Deploy Janet Site to GitHub Pages`
- `Daily Janet News` workflow after successful generation and QA
