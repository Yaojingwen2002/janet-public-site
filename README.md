# Janet Public Site

Public GitHub Pages site for Janet's personal homepage, portfolio, AI daily news, and visual research entry points.

## Public URL

https://yaojingwen2002.github.io/janet-public-site/

## Current Release

Latest documented release: `2026-07-11`

- Change log: `CHANGELOG.md`
- Account and navigation system: Potato Center
- Latest reliability pass: batched Supabase engagement reads, current publish QA, minimal Pages artifact, and automatic sitemap
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
- Local guest fallback; Supabase anonymous sign-in is currently disabled
- Password reset through `auth/reset-password.html`
- No magic link as the main login flow
- Usernames allow 3-20 English letters, numbers, and underscores only. Reserved names such as `janet`, `admin`, `system`, `root`, `official`, `support`, and `moderator` are blocked.
- Email/password accounts are subscribed to the daily briefing email by default and can opt out from Potato Center.

Supabase setup and SQL are documented in `docs/supabase-setup.md`.

## Daily News Automation

The local Codex briefing system is the only daily briefing generator. GitHub Actions deploys the completed site and sends email; it does not write the briefing.

Schedule, all in `Asia/Taipei`:

- `08:00`: full briefing generation, QA, commit, push, Pages verification, and publish-triggered email
- `09:00`: read-only site scan; it never repairs or publishes
- `09:15`: recovery run that publishes only when the current date is genuinely missing

Generator and publish path:

- `codex-briefing-system/scripts/run-codex-briefing.sh`
- `codex-briefing-system/scripts/postprocess-briefing.sh YYYY-MM-DD --publish`
- `codex-briefing-system/scripts/sync-to-site.sh`

The retired `.github/workflows/daily-news-pages.yml` and news-store harvest workflow remain disabled so there is only one writer.

Important status files:

- `codex-briefing-system/runs/YYYY-MM-DD/`
- `data/news-index.json`
- `data/MANIFEST.json`

Daily briefing email:

- Workflow: `.github/workflows/send-daily-briefing-email.yml`
- Sender: `.github/scripts/send-daily-briefing-email.mjs`
- Primary trigger: after a `Briefing YYYY-MM-DD` deploy completes successfully on `main`, so a freshly published briefing is mailed immediately after it is live
- Fallback schedule: `01:20 UTC / 09:20 Asia/Taipei`, in case the publish-triggered email did not run
- Recipients: formal email accounts from Supabase Auth and `profiles`; `newsletter_subscribers.subscribed = false` or `user_metadata.newsletter_opt_in = false` is treated as an opt-out block
- Manual sends can set `recipient_email` and `force_send=true` from the workflow dispatch panel.
- Subscription welcome email: `.github/workflows/send-subscription-welcome-email.yml`; the recurring schedule is disabled because subscription success now shows in the site UI, but manual `recipient_email` dispatch is still available.
- Secrets required: `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`; `SUPABASE_URL` is optional because the public project URL is already in `scripts/supabase-config.js`
- Never commit SMTP passwords or Supabase service-role keys to this repository.

The local generator uses the active Codex search and image-generation capabilities. SMTP and the Supabase service-role key stay in GitHub Secrets; no private credentials belong in the repository.

## Current News Behavior

The latest published edition must match in both `data/MANIFEST.json` and `data/news-index.json.latest_edition_id`. A publish is complete only after the dated `content.json`, `output.html`, and `cover.png` exist, Pages succeeds, and all live URLs return 200.

## News Experience

- News archive: `news.html`
- News cards link to original source URLs where applicable
- Standalone story detail and automation status pages have been removed
- Daily output pages inherit account/navigation integration from `codex-briefing-system/templates/template.html`; generated `data/YYYY-MM-DD/output.html` files should not be hand-edited.

## Editorial System

Current editorial references:

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

Current release checks:

```bash
node scripts/build-sitemap.mjs
bash .github/scripts/build-pages-artifact.sh /tmp/janet-public-site
node scripts/qa-current-site.mjs --root /tmp/janet-public-site
```

The deploy gate checks current pointers, the 5-4-4-3-1 structure, source URLs, images, HTML references, favicon coverage, sitemap coverage, and the public artifact boundary. Older May-era `scripts/qa-*.mjs` reports are retained as historical diagnostics and are not the current deploy gate.

## Deployment

`Deploy Janet Site to GitHub Pages` runs on every `main` push. It builds `_site`, excludes source systems and private/internal documents, runs `qa-current-site.mjs`, uploads the verified artifact, and then deploys Pages. `Daily Janet News` is disabled.

Before publishing account/navigation changes, check:

- `git status --short --branch`
- `grep -RInE "signInWithOtp|service_role|service-role" scripts *.html auth styles 2>/dev/null`
- Main page loads the Potato Center instead of the old visitor modal.
