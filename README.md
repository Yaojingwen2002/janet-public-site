# Janet Public Site

Public GitHub Pages site for Janet's personal homepage, portfolio, AI daily news, and visual research entry points.

## Public URL

https://yaojingwen2002.github.io/janet-public-site/

## Current Release

Latest documented release: `2026-06-17`

- Change log: `CHANGELOG.md`
- Account and navigation system: Potato Center
- Latest UI polish: wide homepage and portfolio cards with card-level entry
- Local preview used for the latest check: `http://localhost:8098/`
- GitHub Pages URL: `https://yaojingwen2002.github.io/janet-public-site/`

## Core Pages

- Home: `index.html`
- News archive: `news.html`
- Portfolio: `portfolio.html`
- Project detail: `project-detail.html`
- iGPT-Image2 handbook: `gpt-image2-handbook.html`
- Shuttle Universe: `shuttle-universe.html`
- Misaligned Scenes: `misaligned-scenes.html`
- Password reset: `auth/reset-password.html`
- 404 page: `404.html`

## Account And Navigation

The upper-right navigation is now the Potato Center:

- Left half: identity and account center
- Right half: site-wide menu
- Logged-out label: `登`
- Guest label: `游`
- Signed-in label: first Chinese character, first uppercase Latin character, or email initial

Implemented files:

- `styles/potato-center.css`
- `scripts/potato-center.js`
- `scripts/auth.js`
- `auth/reset-password.html`

Auth mode:

- Supabase email/password
- Supabase anonymous guest sign-in
- Password reset through `auth/reset-password.html`
- No magic link as the main login flow
- Usernames allow 3-20 English letters, numbers, and underscores only. Reserved names such as `janet`, `admin`, `system`, `root`, `official`, `support`, and `moderator` are blocked.
- Email/password accounts are subscribed to the daily briefing email by default and can opt out from Potato Center.

Supabase setup and SQL are documented in `docs/supabase-setup.md`.

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

Daily briefing email:

- Workflow: `.github/workflows/send-daily-briefing-email.yml`
- Sender: `.github/scripts/send-daily-briefing-email.mjs`
- Schedule: `01:20 UTC / 09:20 Asia/Taipei`, after the morning briefing should exist
- Recipients: formal email accounts from Supabase Auth and `profiles`; `newsletter_subscribers.subscribed = false` or `user_metadata.newsletter_opt_in = false` is treated as an opt-out block
- Manual sends can set `recipient_email` and `force_send=true` from the workflow dispatch panel.
- Subscription welcome email: `.github/workflows/send-subscription-welcome-email.yml`, checking new subscribers every 15 minutes and also supporting manual `recipient_email` dispatch.
- Secrets required: `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`; `SUPABASE_URL` is optional because the public project URL is already in `scripts/supabase-config.js`
- Never commit SMTP passwords or Supabase service-role keys to this repository.

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
- Daily output pages inherit account/navigation integration from `codex-briefing-system/templates/template.html`; generated `data/YYYY-MM-DD/output.html` files should not be hand-edited.

## Editorial System

Current editorial references:

- `docs/editorial/JANET-FULL-PROFILE.md`
- `docs/editorial/JANET-EDITORIAL-VOICE.md`
- `docs/editorial/NEWS-CONTENT-CONTRACT.v5.md`
- `docs/editorial/OLD-NEWS-STYLE-EXAMPLES.md`

## Mirror Plan

`镜场计划` is Janet's cinematic visual research track.

Current repository role:

- Keep a readable project entry and public-safe documentation.
- Preserve latest test records and planning assets.
- Do not publish raw reference frames, 5-second clips, or unreviewed generation outputs directly from this public site.

Current public-safe files:

- `镜场计划/README.md`
- `镜场计划/docs/镜场计划_独立项目完全迁移说明书.docx`
- `镜场计划/docs/镜场计划_可视化执行路线图.docx`
- `镜场计划/docs/镜场计划_让子弹飞S0-01图像测试调整过程记录.docx`
- `镜场计划/excels/镜场计划_S0导演电影复刻测试候选表.xlsx`
- `镜场计划/tests/s0-director-replication/S0-01-test-record-summary.md`

Latest Mirror Plan status:

- S0-01 image test has a v0.1 record.
- H/I are the current better variants.
- Next step: keep S0-01 as the calibration sample until it passes the scoring table 3 consecutive times, then move to `02_huang_white_interior_closeup.jpg`.

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

Before publishing account/navigation changes, check:

- `git status --short --branch`
- `grep -RInE "signInWithOtp|service_role|service-role" scripts *.html auth styles 2>/dev/null`
- Main page loads the Potato Center instead of the old visitor modal.
