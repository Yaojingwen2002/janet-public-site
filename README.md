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

No paid API is required.
No secrets are required.
The generator only uses public RSS / Atom / official feeds.
