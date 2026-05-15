# Janet Public Site

This repository contains the public static build for Janet site.

It is intended for GitHub Pages deployment from the repository root.

No source workspace, working data, engineering scripts, local secrets, or package archives are included.

## Daily News Automation

This public site uses GitHub Actions to generate Janet daily news automatically.

Schedule:

- 00:37 UTC
- 08:37 Asia/Shanghai

Workflow:

- `.github/workflows/daily-news-pages.yml`

Generator:

- `.github/scripts/daily-news-generator.mjs`

Status:

- `data/daily-news-run-status.json`
- `data/daily-news-automation-result.json`

No paid API is required.  
No secrets are required.  
The generator only uses public RSS / Atom / official feeds.

## Daily News Automation Status

Current status: live.

- Workflow: `.github/workflows/daily-news-pages.yml`
- Schedule: 00:37 UTC / 08:37 Asia/Shanghai
- Source type: public RSS / Atom / official feeds
- Paid API required: no
- Secret required: no
- Sample data: not used

Public status files:

- `data/daily-news-run-status.json`
- `data/daily-news-automation-result.json`
- `data/daily-news-automation-acceptance.json`

Latest verified manual run:

- Status: `published_full_edition`
- Edition: `2026-05-15-v4`
- Included stories: 16
