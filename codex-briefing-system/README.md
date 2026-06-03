# Janet Codex Briefing System

当前默认流程是 **Codex App-native 自动流程**：08:00 全流程发布，09:00 全站扫描。

Janet 当前使用 OpenAI 官网下载的 Codex 桌面 App。当前系统不默认依赖 shell 里的 Codex CLI，也不默认调用 `codex exec`。

## 当前默认流程：08:00 自动全流程 + 09:00 全站扫描

## 每日时间规则

- 新闻时间窗口固定为：前一天 08:01 CST 到当天 08:00 CST，共 23 小时 59 分钟。
- 每天 08:00 CST 把当天晨报全流程跑完：写稿、封面、渲染、QA、同步 public site、git push、Pages 检查。
- 每天 09:00 CST 只做全站扫描：查网页是否有当天新闻、图片是否丢失、索引是否指向当天、线上文件是否 200。
- 09:00 只报告问题，不补写、不发布、不 git push。
- 不发布残缺晨报，不用窗口外旧闻补洞。

### 1. 准备当天任务

```bash
cd /Volumes/Janet/janet-public-site/codex-briefing-system
bash scripts/run-codex-briefing.sh
```

这一步只会生成：

```text
runs/YYYY-MM-DD/briefing-task.md
```

它不会发布，不会修改 `janet-public-site`，也不会默认调用 CLI。

### 2. 在 Codex App 中写稿

在 Codex App 中打开：

```text
/Volumes/Janet/janet-public-site/codex-briefing-system
```

让 Codex App 读取并执行：

```text
runs/YYYY-MM-DD/briefing-task.md
```

Codex App 负责：

- 新闻发现
- 原文阅读
- 来源核验
- 同事件合并
- 内容写作
- 生成 `runs/YYYY-MM-DD/content.json`

Codex App 可以使用它自身可用的搜索、浏览器、MCP 和文件读取能力。

### 3. 后处理并同步主站

```bash
bash scripts/postprocess-briefing.sh YYYY-MM-DD --publish
```

这一步会：

- 渲染 `runs/YYYY-MM-DD/output.html`
- QA 检查
- 复制 `runs/YYYY-MM-DD/content.json` 到 `../janet-public-site/data/YYYY-MM-DD/content.json`
- 复制 `runs/YYYY-MM-DD/output.html` 到 `../janet-public-site/data/YYYY-MM-DD/output.html`
- 复制 `runs/YYYY-MM-DD/cover.png` 到 `../janet-public-site/data/YYYY-MM-DD/cover.png`
- 更新 `../janet-public-site/data/MANIFEST.json`
- 更新 `../janet-public-site/data/news-index.json`
- 运行 public site 本地显示门禁 `node src/check-site-briefing.mjs YYYY-MM-DD`
- git add `data/YYYY-MM-DD/`
- git commit
- git push

### 4. 09:00 全站扫描，不补跑

09:00 扫描只检查：

- `runs/YYYY-MM-DD/content.json`
- `runs/YYYY-MM-DD/cover.png`
- `runs/YYYY-MM-DD/output.html`
- `../janet-public-site/data/YYYY-MM-DD/content.json`
- `../janet-public-site/data/YYYY-MM-DD/output.html`
- `../janet-public-site/data/YYYY-MM-DD/cover.png`
- `../janet-public-site/data/MANIFEST.json`
- `../janet-public-site/data/news-index.json`
- 线上 `index.html`
- 线上 `news.html`
- 线上 `data/YYYY-MM-DD/content.json`
- 线上 `data/YYYY-MM-DD/output.html`
- 线上 `data/YYYY-MM-DD/cover.png`

如果缺文件、QA 失败、主站没同步、图片丢失或线上 URL 不是 200，只报告问题，不补写、不发布。

## 当前自动化

- `janet-08-00`：每天 08:00 CST 自动跑完整晨报流程，生成、QA、同步 public site、commit、push、检查 Pages。
- `janet-09-00`：每天 09:00 CST 只做全站扫描，检查当天新闻是否显示、图片是否丢失、索引是否正确、线上文件是否 200。
- 如果 09:00 发现未生成、数量缺失、封面缺失、URL 缺失、QA 失败、内容不完整或主站未同步，只报告缺失项，不自动补跑。

## 未来可选流程：Codex CLI 自动化

只有当下面命令有结果时，才可以使用未来 CLI mode：

```bash
command -v codex
```

可选运行：

```bash
bash scripts/run-codex-briefing.sh YYYY-MM-DD --cli
```

当前不要把 CLI mode 当默认主流程。

## 项目边界

本项目不修改：

- `../janet-public-site/index.html`
- `../janet-public-site/portfolio.html`
- `../janet-public-site/news.html`
- `../janet-public-site/styles/*`
- `../janet-public-site/.github/scripts/daily-news-generator.mjs`

public site 只接收当天产物：

- `data/YYYY-MM-DD/content.json`
- `data/YYYY-MM-DD/output.html`

## 配置

```bash
cp .env.example .env
```

`.env` 只放本地路径：

```text
TEMPLATE_PATH=/Volumes/Janet/公众号 AI 推文/engineering/template.html
```

不要写任何搜索 API key 或模型 API key。

## 后处理命令

渲染：

```bash
node src/render-output.mjs YYYY-MM-DD
```

QA：

```bash
node src/qa-briefing.mjs YYYY-MM-DD
```

发布：

```bash
node src/publish-to-site.mjs YYYY-MM-DD
```

通常使用安全入口：

```bash
bash scripts/postprocess-briefing.sh YYYY-MM-DD
bash scripts/postprocess-briefing.sh YYYY-MM-DD --publish
```
