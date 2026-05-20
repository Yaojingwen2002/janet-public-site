# Legacy Green Visual Generator

Step 35-U7-A keeps the existing green SVG generator as a backup only.

## Current generator locations

- `.github/scripts/daily-news-generator.mjs` `visualTitle`
- `.github/scripts/daily-news-generator.mjs` `visualPattern`
- `.github/scripts/daily-news-generator.mjs` `visualSvg`
- `.github/scripts/daily-news-generator.mjs` `writeNewsVisual`

## Current behavior

The generator writes local SVG files into `assets/news-visuals/`:

- `YYYY-MM-DD-lead.svg`
- `YYYY-MM-DD-signal-1.svg`
- `YYYY-MM-DD-signal-2.svg`
- `YYYY-MM-DD-signal-3.svg`

The visuals share the Janet dark/green style and choose simple geometry from category-like signals. They do not resolve source article images, official share images, open-license images, or story-specific visual facts.

## Backup status

The latest visible legacy assets were copied to:

- `assets/visuals-legacy/news-visuals-2026-05-20/`

This is documentation and backup only. Frontend rendering is unchanged in Step 35-U7-A.
