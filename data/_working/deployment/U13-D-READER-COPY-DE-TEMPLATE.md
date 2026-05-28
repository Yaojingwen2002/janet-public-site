# Step 35-U13-D：Reader Copy De-template

## Fixed

- Removed public labels:
  - Janet 的判断是
  - Janet 锐评
  - 破防点
  - 槽点
  - 这件事要拆成三层看
  - 接下来要盯的是
- Removed duplicate headline card from full morning paper.
- Kept internal editorial fields available for backend use.
- Regenerated 2026-05-27-v4.
- Added QA guards to prevent recurrence.

## Validation

- public-reader-copy QA: passed
- homepage-surface-copy QA: passed
- homepage-assembly QA: passed
- section hydration QA: passed
- semantic copy QA: passed with warnings only
- main UX QA: passed
- grep result: zero hits in data/2026-05-27-v4, scripts/news.js, and data/*check.json for the reader-facing forbidden phrases
- duplicate headline result: no standalone headline section; LangSmith appears only in the lead/editorial copy, not as a repeated ordinary section card
- online output.html: HTTP 200 at https://yaojingwen2002.github.io/janet-public-site/data/2026-05-27-v4/output.html

## Notes

- No News Store Harvest trigger.
- No Daily Janet News trigger.
- No iGPT-Image2 change.
