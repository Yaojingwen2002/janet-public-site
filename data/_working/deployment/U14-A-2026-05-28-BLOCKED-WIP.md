# Step 35-U14-A：2026-05-28 Daily News WIP / Blocked

## Current status

2026-05-28 edition exists locally but is not safe to publish.

## Local state

- `data/2026-05-28-v4/` exists.
- `daily-news-run-status.json` target_date is `2026-05-28`.
- Current status is still `published_limited_edition`.
- Included stories recovered from 5 to 9.
- `generic_fallback_blocked` has been reduced to 0.
- 05-28 title crosswire fixes were partially applied.

## Current blocker

Hard grep still finds Hugging Face / ITBench-AA public-copy residue:

- `Frontier Models Score Below`
- original title leaking into public content
- `Hugging Face把ITBench-AA放到公开比较里...`
- `ITBench-AA如果真要做 AI 治疗或安全评估...`

This means the title was improved, but body / summary / story_facts / cover_summary still need cleanup.

## Do not commit yet

Do not commit or push until:

- `data/2026-05-28-v4/output.html`
- `data/2026-05-28-v4/content.json`
- `data/2026-05-28-v4/news-summary.json`

are clean in reader-facing fields, QA passes, and MANIFEST/news-index are valid.

## Safety

- News Store Harvest was not triggered.
- Daily Janet News was not triggered.
- iGPT-Image2 was not changed.
