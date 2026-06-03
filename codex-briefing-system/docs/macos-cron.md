# macOS Reminder Design

当前默认使用 Codex App automation。`launchd` 或 cron 只作为备用提醒，不是主流程。

## 当前 Codex App 自动化

每天 08:00 CST 自动跑完整流程：

- 生成当天 `runs/YYYY-MM-DD/briefing-task.md`
- 使用 Codex App 能力搜索、核验、去重、写稿
- 生成 `runs/YYYY-MM-DD/content.json`
- 生成真实 `runs/YYYY-MM-DD/cover.png`
- 运行 `bash scripts/postprocess-briefing.sh YYYY-MM-DD --publish`
- 同步到 `../janet-public-site/data/YYYY-MM-DD/`
- 更新 `MANIFEST.json` 和 `news-index.json`
- git commit + push，触发 GitHub Pages
- 检查线上 `index.html`、`news.html`、当天 `content.json`、`output.html`、`cover.png`

每天 09:00 CST 只做全站扫描：

- 检查当天 `content.json`、`output.html`、`cover.png` 是否已经生成
- 检查 `../janet-public-site/data/YYYY-MM-DD/` 是否已有当天三件套
- 检查 `MANIFEST.json` 和 `news-index.json` 是否指向当天
- 检查线上 `index.html`、`news.html`、当天 `content.json`、`output.html`、`cover.png` 是否 200
- 如果缺文件、QA 失败、主站没同步或图片丢失，只报告问题，不补写、不发布

## 备用 cron：08:00 准备

```cron
0 8 * * * cd /Volumes/Janet/janet-public-site/codex-briefing-system && /bin/bash scripts/run-codex-briefing.sh >> /Volumes/Janet/janet-public-site/codex-briefing-system/runs/cron.log 2>&1
```

## 备用 cron：09:00 复查

```cron
0 9 * * * cd /Volumes/Janet/janet-public-site/codex-briefing-system && /bin/bash scripts/check-briefing-published.sh "$(TZ=Asia/Taipei date +\\%F)" >> /Volumes/Janet/janet-public-site/codex-briefing-system/runs/review.log 2>&1
```

## Codex App 操作

cron 之后，在 Codex App 中打开：

```text
/Volumes/Janet/janet-public-site/codex-briefing-system
```

执行当天任务文件：

```text
runs/YYYY-MM-DD/briefing-task.md
```

Codex App 写出：

```text
runs/YYYY-MM-DD/content.json
```

## 后处理 / 08:00 同步

生成并同步主站：

```bash
bash scripts/postprocess-briefing.sh YYYY-MM-DD --publish
```

09:00 只扫描缺漏：

```bash
bash scripts/check-briefing-published.sh YYYY-MM-DD
```

## 未来 CLI 可选模式

只有当：

```bash
command -v codex
```

有结果时，才能考虑：

```bash
bash scripts/run-codex-briefing.sh YYYY-MM-DD --cli
```

当前默认不使用该模式。
