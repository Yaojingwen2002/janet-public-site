# Codex Janet Briefing Task

你正在非交互运行《Janet 快车箱》晨报。请独立完成新闻发现、原文核验、编辑决策、文案、图片、封面、JSON、QA、同步和发布，不要停在建议或半成品。

## 先读

1. `/Volumes/Janet/janet-public-site/codex-briefing-system/prompts/editorial-system.md`
2. `/Users/yaojw/.codex/janet-memory/Janet完整档案.md`
3. `/Users/yaojw/.codex/janet-memory/Janet编辑立场当前切片.md`
4. `/Volumes/Janet/公众号 AI 推文/engineering/docs/CONTENT_SCHEMA.md`
5. `/Volumes/Janet/janet-public-site/codex-briefing-system/templates/template.html`
6. 本系统最近 5 期 `/Volumes/Janet/janet-public-site/codex-briefing-system/runs/*/content.json` 和已有 `editorial-plan.json`

`editorial-system.md` 是最高编辑规范。私有档案只用于理解当前方向，不得复制进公开文件；带日期的立场切片不是永久人格。

## 参数

- 日期：`{{DATE}}`
- 期号：`{{VOL}}`
- 时间窗口：`{{WINDOW_START}}` 到 `{{WINDOW_END}}`，Asia/Taipei / CST
- 编辑决策：`{{RUN_EDITORIAL_PATH}}`
- 晨报 JSON：`{{RUN_CONTENT_PATH}}`
- 封面：`runs/{{DATE}}/cover.png`

## 不可改变的边界

- 当前网页模板、栏目顺序和 JSON schema 不改。
- 数量严格为 `news` 5、`models` 4、`insights` 4、`insights2` 3、`tools` 1。
- 每条必须有 `title`, `body`, `janet_take`, `source`, `url`，最终还必须有来源可追溯的本地图片。
- 只收时间窗口内可核验的新闻。同事件多源合并，不够 17 条就停止并报告，不用旧闻凑数。
- 不要把密钥、邮箱、授权码、私有档案或内部提示写进输出。

## 执行顺序

### 1. 发现和核验

- 使用当前可用的 Codex web search、browser/fetch 和原文阅读能力。
- 搜索词可带 `today` 或 `最新`，但最终以原文发布时间为准。
- 每条保留来源、发布时间、主体、产品/模型名、金额/参数/估值和原话语境。
- 涉及融资、参数、监管、开源、发布时间和引语时，必须回到原文核验。
- 无法确认发布时间、来源或核心事实的候选直接放弃。

### 2. 先做编辑决策，不写成稿

通读候选与本系统最近 5 期后，先写 `{{RUN_EDITORIAL_PATH}}`。必须是合法 JSON：

```json
{
  "date": "{{DATE}}",
  "narrative_mode": "threaded",
  "daily_question": "当天新闻共同回答的具体问题；constellation 时可以为空字符串",
  "reader_promise": "读者关掉晨报后应留下的一个具体认识",
  "narrative_evidence": [
    {
      "event_key": "稳定、简短、可比较的事件标识",
      "answer": "该事件对 daily_question 提供的独立答案"
    }
  ],
  "headline_removal_test": {
    "removed_event_key": "最强头条事件标识",
    "still_holds": true,
    "reason": "拿掉它后为什么仍成立"
  },
  "constellation_reason": "narrative_mode=constellation 时说明为什么不硬凑主线",
  "selected_items": [
    {
      "slot": "news[0]",
      "event_key": "事件标识",
      "depth": "focus",
      "full_expansion": true
    }
  ],
  "rejected_items": [
    {
      "event_key": "被放弃的候选",
      "reason": "旧、弱、重复或无法核验"
    }
  ]
}
```

编辑决策硬要求：

- `narrative_mode` 只能是 `threaded` 或 `constellation`。
- `selected_items` 必须与 17 个最终槽位一一对应；`focus` 3-5 条，其余为 `brief` 或 `reference`。
- 同一个 `event_key` 最多出现两次，只能有一次 `full_expansion: true`；第二次必须是 `reference`，禁止第三次。
- `threaded` 至少有 3 个独立事件提供不同答案，且拿掉最强头条后仍成立。
- 只有大词相同、没有共同问题时必须用 `constellation`，并说明原因。
- `rejected_items` 至少 1 条。

### 3. 写 `content.json`

只写合法 JSON 到 `{{RUN_CONTENT_PATH}}`：

```json
{
  "date": "{{DATE}}",
  "vol": "{{VOL}}",
  "intro_text": "不带姓名和固定问候的公共导语",
  "cover": {
    "title": "当日封面标题",
    "subtitle": "为什么今天值得看",
    "image_path": "runs/{{DATE}}/cover.png",
    "image_prompt": "用于 gpt-image-2 的封面生成提示词"
  },
  "trend": "允许 1-3 段；按编辑决策写，不填固定三段格子",
  "sections": {
    "news": { "items": [] },
    "models": { "items": [] },
    "insights": { "items": [] },
    "insights2": { "items": [] },
    "tools": { "items": [] }
  }
}
```

文案执行要点：

- 先按 `focus/brief/reference` 分配篇幅，再写标题、正文和锐评。
- 标题忠于本条新闻，不为统一主线扭曲事实；全期句式必须变化。
- `body` 把关键事实、数字、语境和限制讲完整，重点事件可长写，普通事件可短写。
- 每条都有 `janet_take`，但开头、长度、情绪和功能要变化。重点锐评 110-180 字，普通锐评 45-110 字。
- 不把 17 条都写成两句短判断，也不把 17 条都写成“判断 + 风险 + 建议”。
- 与最近 5 期比较，重写近似的趋势开头、隐喻、结论和锐评句式。
- `intro_text` 不得以 `Janet 早。`、`Jane 早。`、`读者早。` 或 `你好` 开头。

### 4. 图片与封面

- 每条优先抓原文 `og:image`、`twitter:image`、正文主图或官方产品图。
- 源站图不可用时搜索同一事件的公开新闻配图；不要拿无关 logo 凑数。
- 远程图交给后处理下载到 `runs/{{DATE}}/images/`，最终写回本地 `image` 路径并保留图片来源。
- 用 Codex App 内置 image generation / gpt-image-2 生成 21:9 `cover.png`。
- 封面图不生成日期、VOL 或大段文字；这些由 HTML/CSS 叠加。
- 封面失败最多重试 3 次；仍失败就停止，不能发布无封面晨报。

### 5. 两遍编辑复查

第一遍只查事实：

- 17 条是否都在窗口内，来源和 URL 是否可访问。
- 金额、参数、引语、发布时间、开源范围和监管动作是否与原文一致。
- 推断和预测是否被写成了事实。

第二遍只查人话和重复：

- 关掉晨报后，是否至少留下 3 个具体、可复述的判断。
- 有没有把同一事件讲到第三次，或用相同宏大名词伪装叙事。
- 有没有太多 `该、要、必须、先、别、不要`，把朋友写成了老师。
- 有没有大量等长、等句数、等开头的锐评。
- 把公司名替换后仍成立的空洞锐评必须重写。

### 6. 后处理和发布

确认 `{{RUN_EDITORIAL_PATH}}`、`{{RUN_CONTENT_PATH}}` 和 `runs/{{DATE}}/cover.png` 都已写入后，运行：

```bash
bash scripts/postprocess-briefing.sh {{DATE}} --publish
```

后处理负责图片本地化、渲染、QA、同步主站、git commit、push 和 Pages 检查。不要手动修改主站根目录页面，不要发布 QA 未通过的晨报。
