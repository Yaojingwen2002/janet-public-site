# Janet Daily News Scripts

## Files

- `rss-source-pool.json`
- `editorial-rules.json`
- `daily-news-generator.mjs`
- `build-news-index.mjs`
- `qa-daily-news-output.mjs`

## Manual test

```bash
node .github/scripts/daily-news-generator.mjs --date 2026-05-15
node .github/scripts/build-news-index.mjs
node .github/scripts/qa-daily-news-output.mjs
```

## Time window

Asia/Shanghai
previous_day 17:00 <= published_at < current_day 09:00

## Editorial quality

`editorial-rules.json` demotes status reports, outage posts, monthly reports, event posts, and generic marketing copy. The generator scores stories before choosing the lead, while the release gate and current QA files decide whether an edition can ship.
