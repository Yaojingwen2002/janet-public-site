# Janet Daily News Scripts

## Files

- `rss-source-pool.json`
- `editorial-rules.json`
- `daily-news-generator.mjs`
- `build-news-index.mjs`
- `qa-daily-news-output.mjs`
- `send-daily-briefing-email.mjs`
- `send-subscription-welcome-email.mjs`

## Manual test

```bash
node .github/scripts/daily-news-generator.mjs --date 2026-05-15
node .github/scripts/build-news-index.mjs
node .github/scripts/qa-daily-news-output.mjs
DRY_RUN=true node .github/scripts/send-daily-briefing-email.mjs
DRY_RUN=true node .github/scripts/send-subscription-welcome-email.mjs
```

`send-daily-briefing-email.mjs` reads `data/news-index.json`, loads the latest `output.html`, fetches formal Supabase Auth/profile email users with a service-role key, skips explicit opt-outs, sends the briefing through SMTP, and writes `newsletter_subscribers.last_sent_at`. It must run with secrets from GitHub Actions, not hardcoded credentials.

The daily briefing email workflow is triggered after a successful `Briefing YYYY-MM-DD` GitHub Pages deploy on `main`, with the 09:20 Asia/Taipei schedule kept as a fallback. Duplicate sends are blocked by `newsletter_subscribers.last_sent_at`.

`send-subscription-welcome-email.mjs` sends the designed subscription success email for new `newsletter_subscribers.subscribed = true` rows, then writes `welcome_sent_at`. Its recurring schedule is disabled; use manual dispatch only when needed.

## Time window

Asia/Shanghai
previous_day 17:00 <= published_at < current_day 09:00

## Editorial quality

`editorial-rules.json` demotes status reports, outage posts, monthly reports, event posts, and generic marketing copy. The generator scores stories before choosing the lead, while the release gate and current QA files decide whether an edition can ship.
