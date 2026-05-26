# Step 35-U13-B：Incremental News Store Architecture

## Why

- Old generator fetched raw feed items during daily publish.
- Failure run 26430236096 showed raw_items=3043 but selected_count=2.
- New architecture separates harvest from daily edition.

## Design References

- Scrapy item pipeline: clean, validate, dedupe, store.
- Huginn event graph: agents create and consume events.
- FreshRSS: long-running feed aggregation, tags/API/CLI.
- RSS conditional GET: ETag / Last-Modified.

## Files Added

- `.github/scripts/harvest-news-items.mjs`
- `.github/scripts/build-daily-candidates.mjs`
- `scripts/qa-news-store.mjs`
- `.github/workflows/news-store-harvest.yml`
- `data/news-store/items-YYYY-MM.jsonl`
- `data/news-store/sources-status.json`
- `data/news-store/dedupe-index.json`
- `data/news-store/harvest-run-status.json`
- `data/news-store/daily-candidates.json`
- `data/news-store/news-store-check.json`

## Files Changed

- None of the Daily Janet News publishing workflow files were changed in this step.

## Data Store

- Items JSONL: `data/news-store/items-YYYY-MM.jsonl`
- Source status: `data/news-store/sources-status.json`
- Dedupe index: `data/news-store/dedupe-index.json`
- Daily candidates: `data/news-store/daily-candidates.json`
- QA check: `data/news-store/news-store-check.json`

## First Run Metrics

- raw_items_seen: 542
- items_considered: 542
- new_items_added: 533
- duplicate_items: 5
- invalid_items: 4
- qualified_count: 200
- selected_count: 12
- publish_recommendation: full_edition
- window_hours: 24
- source_success_count: 20
- source_error_count: 2
- source_not_modified_count: 0

## What This Step Does Not Do

- Does not publish a daily edition.
- Does not update MANIFEST.
- Does not replace Daily Janet News workflow.
- Does not modify iGPT-Image2 handbook.
- Does not change site design.

## Next Step

- U13-C: Connect daily-news-generator to read daily-candidates.json.
- U13-D: Keep RSS fallback but make publishability contract use selected candidate count, not raw items.
