# Step 35-U13-E：Headline Quality + Sentence Join Sanity

## Fixed

- Broken headline token cleanup.
- Entity list dedupe.
- Sentence join cleanup.
- Double punctuation cleanup.
- Watch-next prefix cleanup.
- QA guards added.

## Before

- Self-HostedLa带出自托管部署
- LangSmith、LangSmith...
- Strands research ass
- 先看继续看...
- 。。

## After

- headline: LangSmith 进入自托管运维
- lead intro: LangSmith、Kubernetes 和 Mission Control 这些线索，指向同一件事：AI 工具正在从演示层进入部署、监控和权限管理这些硬环节。
- watch_next example: 继续看升级、权限和审计方案。

## Validation

- public-reader-copy QA: passed
- homepage-surface-copy QA: passed
- semantic-copy QA: passed with warnings only
- main UX QA: passed
- news store QA: passed
- daily news output QA: passed
- grep result: zero hits in data/2026-05-27-v4, scripts/news.js, and data/*check.json for headline and sentence-join forbidden patterns

## Notes

- No News Store Harvest trigger.
- No Daily Janet News trigger.
- No iGPT-Image2 change.
