# Janet Daily News Scripts

## Files

- `rss-source-pool.json`
- `editorial-rules.json`
- `daily-news-generator.mjs`
- `build-news-index.mjs`
- `qa-daily-news-output.mjs`
- `send-daily-briefing-email.mjs`
- `send-subscription-welcome-email.mjs`
- `qa-email-template.mjs`

The legacy daily generator and news-store writer are disabled. The active briefing generator lives in `codex-briefing-system`; this directory still owns the mail sender and historical harvesting utilities.

## Manual mail test

```bash
DRY_RUN=true node .github/scripts/send-daily-briefing-email.mjs
DRY_RUN=true node .github/scripts/send-subscription-welcome-email.mjs
```

`send-daily-briefing-email.mjs` reads `data/news-index.json`, loads the latest `output.html`, fetches formal Supabase Auth/profile email users with a service-role key, skips explicit opt-outs, sends the briefing through SMTP, and writes `newsletter_subscribers.last_sent_at`. It must run with secrets from GitHub Actions, not hardcoded credentials.

Before sending, `qa-email-template.mjs` verifies that the personalized reader name and Janet logo are present, web-only controls are removed, and every email image and internal link uses an absolute HTTPS URL. Set `EMAIL_PREVIEW_DIR=/tmp/janet-email-preview` to write local daily and welcome HTML previews.

The daily briefing email workflow is triggered after a successful `Briefing YYYY-MM-DD` GitHub Pages deploy on `main`, with the 09:20 Asia/Taipei schedule kept as a fallback. Duplicate sends are blocked by `newsletter_subscribers.last_sent_at`.

`send-subscription-welcome-email.mjs` sends the designed subscription success email for new `newsletter_subscribers.subscribed = true` rows, then writes `welcome_sent_at`. Its recurring schedule is disabled; use manual dispatch only when needed.

The active briefing window and editorial contract are defined by `codex-briefing-system/prompts/editorial-system.md`. Pages deployment uses `scripts/qa-current-site.mjs`; the old generator QA files here are historical only.
