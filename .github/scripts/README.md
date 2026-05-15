# Janet Daily News Scripts

This folder contains the public GitHub Actions generator for Janet daily news.

- `rss-source-pool.json` lists public RSS / Atom sources.
- `daily-news-generator.mjs` fetches public feeds, filters by `published_at`, writes v4 news data, and updates `data/MANIFEST.json` when enough fresh stories exist.

No paid API, secret, npm install, or local working directory is required.
