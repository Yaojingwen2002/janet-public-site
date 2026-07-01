# Changelog

所有主站、账号系统、晨报模板、项目文档和镜场计划变更都按日期记录在这里。公开仓库只收录可读文档、站点代码和轻量测试资产；参考帧、5 秒视频切片、生成候选图等重素材保留在本地或私有存储，不直接公开发布。

## 2026-07-01

### 订阅与晨报邮件链路

- 类型：修复 / 工作流 / 文档。
- 涉及 commit：`96ee8e9 Fix auth newsletter subscription flow`、`27b6383 Add subscription welcome email workflow`、`51862dc Grant service role newsletter access`。
- 涉及文件：`.github/scripts/README.md`、`.github/scripts/send-daily-briefing-email.mjs`、`.github/scripts/send-subscription-welcome-email.mjs`、`.github/workflows/send-daily-briefing-email.yml`、`.github/workflows/send-subscription-welcome-email.yml`、`README.md`、`auth/reset-password.html`、`docs/editorial/JANET-FULL-PROFILE.md`、`docs/supabase-newsletter-repair.sql`、`docs/supabase-setup.md`、`scripts/auth.js`、`scripts/potato-center.js`、`styles/potato-center.css`。
- 具体改动：修复土豆中心注册时的 newsletter 订阅流程，补齐注册、订阅状态、Supabase 修复 SQL 和站点说明文档。
- 具体改动：新增每日晨报邮件发送脚本和 GitHub Actions workflow，并在脚本文档和 README 中说明触发方式。
- 具体改动：新增订阅欢迎邮件脚本和 workflow，作为站内订阅链路的邮件反馈实验。
- 具体改动：`docs/supabase-newsletter-repair.sql` 补充 `service_role` 对 `newsletter_subscribers` 的访问授权，保证服务端发信脚本可以读取订阅名单。
- 原因说明：把网站注册订阅、晨报邮件发送和 Supabase 权限修复放进同一条链路，避免土豆中心订阅成功但后端发信链路读不到用户。

### 移除欢迎邮件，改为网页撒花弹窗

- 类型：重构 / 新增。
- 涉及 commit：`bda9acb feat: replace welcome email with on-site celebration popup`。
- 涉及文件：`scripts/potato-center.js`、`styles/potato-center.css`、`.github/workflows/send-subscription-welcome-email.yml`。
- 具体改动：`scripts/potato-center.js` 在注册流程里判断 `newsletter` 勾选状态，订阅晨报时调用新增的 `showSubscriptionSuccess()`，直接在网页内弹出订阅成功反馈。
- 具体改动：`showSubscriptionSuccess()` 创建 `.potato-celebration` 覆盖层、`.pc-backdrop` 背景、品牌风格卡片和 Canvas 纸屑动画；动画使用 120 片 confetti，配色为墨绿 `#1A3A2A`、蒂芙尼绿 `#0ABAB5`、信号绿 `#18E299`、琥珀金 `#C9A84C` 等。
- 具体改动：弹窗支持点击空白处、点击关闭按钮或按 `Escape` 关闭，避免用户注册后被迫等待邮件确认反馈。
- 具体改动：`styles/potato-center.css` 新增 `.potato-celebration`、`.pc-backdrop`、`.pc-card`、`.pc-confetti`、`.pc-btn` 等样式，并加入 `pc-fade-in`、`pc-pop`、`pc-bounce` 动画。
- 具体改动：`.github/workflows/send-subscription-welcome-email.yml` 注释每 15 分钟一次的 `schedule`，保留 `workflow_dispatch` 手动触发入口。
- 原因说明：欢迎邮件链路过重且依赖 Supabase 权限和 SMTP；网页即时反馈更轻、更稳定，也符合土豆中心的品牌体验。

### 清理公开仓库中的 SMTP 授权码

- 类型：修复 / 安全。
- 涉及 commit：`96ee8e9 Fix auth newsletter subscription flow`。
- 涉及文件：`docs/editorial/JANET-FULL-PROFILE.md`。
- 具体改动：删除第 82 行原有的 QQ SMTP 明文授权码，不再把邮箱授权信息写入公开仓库。
- 具体改动：该行替换为“授权码只允许放在 GitHub Secrets / 本地私密配置中，不写入公开仓库”的提示语。
- 原因说明：SMTP 授权码属于敏感凭据，公开仓库只能保留配置位置说明，不能保留真实密钥或可复用口令。

### 晨报发布：2026-07-01

- 类型：内容发布 / 数据更新。
- 涉及 commit：`17fdf1b Briefing 2026-07-01`。
- 涉及文件：`data/2026-07-01/content.json`、`data/2026-07-01/output.html`、`data/2026-07-01/cover.png`、`data/2026-07-01/images/`、`data/MANIFEST.json`、`data/news-index.json`。
- 具体改动：新增 2026-07-01 晨报内容、封面、17 条新闻/模型/技术/投资/工具配图和静态 HTML 输出。
- 具体改动：更新站点晨报 manifest 与新闻索引，让归档页和首页入口能读取本期内容。
- 原因说明：这是公开站点的数据发布提交，属于网站内容更新。

## 2026-06-30

### 晨报发布：2026-06-30

- 类型：内容发布 / 数据更新。
- 涉及 commit：`a77d90d Briefing 2026-06-30`。
- 涉及文件：`data/2026-06-30/content.json`、`data/2026-06-30/output.html`、`data/2026-06-30/cover.png`、`data/2026-06-30/images/`、`data/MANIFEST.json`、`data/news-index.json`。
- 具体改动：新增 2026-06-30 晨报内容、封面、配图和静态 HTML 输出。
- 具体改动：更新站点晨报 manifest 与新闻索引，让本期进入公开归档。
- 原因说明：这是公开站点的数据发布提交，属于网站内容更新。

## 2026-06-24

### 晨报发布：2026-06-24

- 类型：内容发布 / 数据更新。
- 涉及 commit：`326539e Briefing 2026-06-24`。
- 涉及文件：`data/2026-06-24/content.json`、`data/2026-06-24/output.html`、`data/2026-06-24/cover.png`、`data/2026-06-24/images/`、`data/MANIFEST.json`、`data/news-index.json`。
- 具体改动：新增 2026-06-24 晨报内容、封面、配图和静态 HTML 输出。
- 具体改动：更新站点晨报 manifest 与新闻索引，让本期进入公开归档。
- 原因说明：这是公开站点的数据发布提交，属于网站内容更新。

## 2026-06-23

### 晨报发布：2026-06-23

- 类型：内容发布 / 数据更新。
- 涉及 commit：`59fbd19 Briefing 2026-06-23`。
- 涉及文件：`data/2026-06-23/content.json`、`data/2026-06-23/output.html`、`data/2026-06-23/cover.png`、`data/2026-06-23/images/`、`data/MANIFEST.json`、`data/news-index.json`。
- 具体改动：新增 2026-06-23 晨报内容、封面、配图和静态 HTML 输出。
- 具体改动：更新站点晨报 manifest 与新闻索引，让本期进入公开归档。
- 原因说明：这是公开站点的数据发布提交，属于网站内容更新。

### 清理晨报临时图片源

- 类型：清理 / 内容资产。
- 涉及 commit：`712eb59 Remove temporary briefing image sources`。
- 涉及文件：`data/2026-06-23/images/*.ppm`。
- 具体改动：删除 2026-06-23 晨报配图生成过程中残留的 `.ppm` 临时源文件。
- 原因说明：公开仓库只保留站点实际使用的图片资产，不保留中间格式。

## 2026-06-22

### 晨报发布：2026-06-22

- 类型：内容发布 / 数据更新。
- 涉及 commit：`206bcca Briefing 2026-06-22`、`ed745a6 Briefing 2026-06-22`。
- 涉及文件：`data/2026-06-22/content.json`、`data/2026-06-22/output.html`、`data/2026-06-22/cover.png`、`data/2026-06-22/images/`、`data/MANIFEST.json`、`data/news-index.json`。
- 具体改动：新增 2026-06-22 晨报内容、封面、配图和静态 HTML 输出。
- 具体改动：后续同日提交替换并补齐本期配图命名与新闻索引，让归档展示使用最终素材。
- 原因说明：这是公开站点的数据发布提交，属于网站内容更新。

### 晨报图片校验加固

- 类型：修复 / 质量控制。
- 涉及 commit：`fbc1e4a Harden briefing item image validation`。
- 涉及文件：`codex-briefing-system/src/ensure-item-images.mjs`、`codex-briefing-system/src/qa-briefing.mjs`。
- 具体改动：加固晨报条目图片检查逻辑，减少缺图、错图或未绑定图片进入公开输出的风险。
- 原因说明：晨报生成系统属于站点发布链路，图片校验直接影响公开页面质量。

### 镜场计划接入视觉参考实验室

- 类型：新增 / 页面内容。
- 涉及 commit：`3360804 Add Jingchang plan to visual reference lab`。
- 涉及文件：`404.html`、`assets/works/cinematic-lab/cover.svg`、`data/works/projects/igpt-image2-handbook.json`、`data/works/works-manifest.json`、`data/works/works/igpt-image2-handbook-cases.json`、`data/works/works/jingchang-plan-s0-lab.json`、`gpt-image2-handbook.html`、`index.html`、`misaligned-scenes.html`、`news.html`、`portfolio.html`、`project-detail.html`、`scripts/portfolio.js`、`scripts/potato-center.js`、`scripts/project-detail.js`、`shuttle-universe.html`、`styles/gpt-image2-handbook.css`、`styles/main.css`。
- 具体改动：新增镜场计划 S0 视觉参考实验室项目数据和封面资产，并把入口接入首页、作品库、项目详情和相关手写页面。
- 具体改动：更新 portfolio/project detail 脚本和主样式，保证新增项目能被站点项目系统正常读取和展示。
- 原因说明：这是网站作品系统和项目内容的公开更新，属于站点内容变更。

## 2026-06-21

### 晨报发布：2026-06-21

- 类型：内容发布 / 数据更新。
- 涉及 commit：`80f6262 Briefing 2026-06-21`。
- 涉及文件：`data/2026-06-21/content.json`、`data/2026-06-21/output.html`、`data/2026-06-21/cover.png`、`data/2026-06-21/images/`、`data/MANIFEST.json`、`data/news-index.json`。
- 具体改动：新增 2026-06-21 晨报内容、封面、配图和静态 HTML 输出。
- 具体改动：更新站点晨报 manifest 与新闻索引，让本期进入公开归档。
- 原因说明：这是公开站点的数据发布提交，属于网站内容更新。

## 2026-06-19

### 晨报发布：2026-06-19

- 类型：内容发布 / 数据更新。
- 涉及 commit：`b8cb21e Briefing 2026-06-19`。
- 涉及文件：`data/2026-06-19/content.json`、`data/2026-06-19/output.html`、`data/2026-06-19/cover.png`、`data/2026-06-19/images/`、`data/MANIFEST.json`、`data/news-index.json`。
- 具体改动：新增 2026-06-19 晨报内容、封面、配图和静态 HTML 输出。
- 具体改动：更新站点晨报 manifest 与新闻索引，让本期进入公开归档。
- 原因说明：这是公开站点的数据发布提交，属于网站内容更新。

## 2026-06-18

### 晨报发布：2026-06-18

- 类型：内容发布 / 数据更新。
- 涉及 commit：`dc7198b Briefing 2026-06-18`、`f8497d9 Briefing 2026-06-18`、`1e6315d Briefing 2026-06-18`、`96405e5 Briefing 2026-06-18`。
- 涉及文件：`data/2026-06-18/content.json`、`data/2026-06-18/output.html`、`data/2026-06-18/cover.png`、`data/2026-06-18/images/`、`data/MANIFEST.json`、`data/news-index.json`。
- 具体改动：新增 2026-06-18 晨报内容、封面、配图和静态 HTML 输出。
- 具体改动：同日多次提交继续修订本期内容、替换部分配图并更新新闻索引，最终以同日最后一次提交后的内容为准。
- 原因说明：这是公开站点的数据发布提交，属于网站内容更新。

### 晨报编辑风格与 QA 加固

- 类型：修复 / 模板和发布质量。
- 涉及 commit：`fcd8f59 Harden briefing editorial QA`、`5bba0a8 Tune briefing style toward editor voice`。
- 涉及文件：`codex-briefing-system/docs/acceptance-checklist.md`、`codex-briefing-system/prompts/briefing-task.md`、`codex-briefing-system/prompts/editorial-system.md`、`codex-briefing-system/src/check-site-briefing.mjs`、`codex-briefing-system/src/qa-briefing.mjs`、`codex-briefing-system/src/render-output.mjs`。
- 具体改动：加强晨报验收清单、任务提示词、编辑系统提示词和 QA 脚本，推动输出更贴近 Janet 编辑口吻。
- 具体改动：补强站点晨报检查与 HTML 渲染输出链路，降低格式、风格和公开页面 QA 漏检概率。
- 原因说明：晨报模板和 QA 工具属于网站内容生产链路，直接影响公开晨报页面质量。

## 2026-06-17

### 主站宽屏和按钮视觉强化

- 全站公共容器从窄版 `1080px` 扩到宽屏 `1680px`，首页、新闻归档、作品库和评论区在桌面大屏上铺得更满。
- 首页 Hero 文案区、快车箱模块和作品库说明区同步放宽，减少两侧大面积空白。
- 首页作品库项目卡改为整张卡可点击进入，不再在卡片底部显示“打开项目页面 / 查看项目作品”文字入口。
- `portfolio.html` 作品库项目卡同样改为整张卡可点击进入，筛选按钮只负责筛选，不再在卡片内部堆额外入口按钮。
- 全站 `.btn` 主按钮、次按钮和琥珀按钮统一加粗，并增加持续环绕动态边；不同功能按钮保留不同颜色气质。
- 土豆中心、评论/点赞/转发、晨报归档、手册筛选、图片预览、项目文档、返回顶部等按钮同步强化可见度。
- 视觉动效保留 `prefers-reduced-motion` 兼容入口，后续可继续按无障碍偏好降级。

### 按钮动态热修

- 移除按钮上的 `conic-gradient` 旋转线效果，避免出现一根斜线跨过按钮和页面。
- 全站按钮动态改为稳定的呼吸边框和轻光晕，不再使用转圈线条。
- 手写页面的 `main.css` 链接统一追加 `button-aura-20260617` 版本号，避免浏览器继续读取上一版旋转线缓存。
- 已复查首页顶部按钮、土豆中心、晨报互动按钮和完整晨报/新闻归档按钮。

### 土豆中心菜单热修

- 隐藏主站右上角重复的 `快车箱 / 作品库 / 关于 / 联系` 顶部导航，站点入口统一收进土豆中心。
- 土豆中心右半汉堡菜单从全屏覆盖层改为右上角卡片式下拉栏，不再锁定页面滚动，避免点击后屏幕位移。
- 登录卡片和站点菜单统一加入“向下铺卷 / 向上卷回”动效，再次点击或点击卡片外区域会收回。
- 汉堡按钮改为三条线动画幻化成叉号，关闭后再还原为三条线。
- 菜单和登录卡片保持互斥：打开站点菜单会收回登录卡，打开登录卡会收回站点菜单。
- `potato-center.css`、`potato-center.js`、`nav.js` 链接统一追加 `potato-roll-20260617` 版本号，覆盖线上缓存。

## 2026-06-16

### 土豆中心登录卡片热修

- 游客默认昵称从 `游客-XXXX` 改为 `guest_XXXXXX`，避免默认值自带非法 `-` 导致一键游客进入失败。
- 用户名/游客昵称/修改昵称统一限制为字母、数字、下划线，3-20 位。
- 土豆中心未登录态取消顶部三 tab，点击“登”首次只显示邮箱登录卡。
- 邮箱登录卡新增文字按钮：`还没有账户？`、`游客进入 ->`。
- 创建账号卡新增文字按钮：`已有账户？`、`游客进入`。
- 游客进入卡新增文字按钮：`账户登录`。
- 注册成功后不再让 `profiles` 更新失败阻断登录；如果注册后没有 session，会主动用邮箱密码登录一次。
- 线上 Supabase 未开启 Anonymous Sign-Ins 时，游客进入会退成本地游客身份，避免直接卡死。
- Auth 错误提示补充邮箱未确认、匿名登录未启用等真实原因，不再统一显示“操作失败”。

### 土豆中心账号系统

- 右上角统一改为“土豆中心”：左半是 1 个字符身份标识，右半是站点菜单。
- 新增 `styles/potato-center.css`，提供桌面端和移动端一致的椭圆双按钮、账号 dropdown、三 tab 登录面板和移动端菜单样式。
- 新增 `scripts/potato-center.js`，负责左半个人中心、右半站点导航、账号状态渲染、菜单互斥、错误提示和表单交互。
- 新增 `auth/reset-password.html`，支持 Supabase password recovery 回跳后的密码重置流程。
- `scripts/auth.js` 主流程从 magic link 改为 email/password + anonymous guest：
  - `signInWithPassword`
  - `signUp`
  - `signInAnonymously`
  - `updateUser`
  - `resetPasswordForEmail`
  - `signOut`
- 保留 `janet:auth-changed` 身份事件，评论和点赞继续通过同一身份层读取正式用户或游客身份。
- 游客身份使用 Supabase anonymous user，不再依赖本地假游客 ID。
- 修改密码优先使用 `currentPassword`，失败时 fallback 到旧密码验证再更新密码。
- 忘记密码 redirect 使用正式 GitHub Pages reset 页；本地开发时允许 `localhost` / `127.0.0.1`。

### 全站页面接入

- 已接入土豆中心的手写页面：
  - `index.html`
  - `news.html`
  - `portfolio.html`
  - `project-detail.html`
  - `shuttle-universe.html`
  - `misaligned-scenes.html`
  - `gpt-image2-handbook.html`
  - `404.html`
- `codex-briefing-system/templates/template.html` 已接入土豆中心源头，后续日报生成页通过模板继承，不手改 `data/YYYY-MM-DD/output.html`。
- `scripts/nav.js` 改为优先绑定 `data-potato-menu-trigger`，右半只控制站点菜单。
- `scripts/comments.js` 和 `scripts/reactions.js` 改为打开土豆中心身份面板，不再调用旧 visitor modal。

### Supabase 和公开文档

- `docs/supabase-setup.md` 新增 `profiles` 表、`handle_new_user()` trigger、profiles RLS、Anonymous Sign-Ins、Email password auth 和 redirect allow list 配置说明。
- `README.md` 更新为当前主站说明，加入土豆中心、Supabase、镜场计划和变更日志入口。
- 新增本文件作为公开修改日志。

### 发布验证

- 本地预览端口：`http://localhost:8097/`。
- 已用浏览器检查 9 个入口：每页 1 个土豆中心、1 个左半身份按钮、1 个右半菜单按钮、8 个菜单链接、旧登录 slot 为 0。
- 390px 移动宽度下 dropdown 未溢出。
- JS 语法检查通过：`scripts/auth.js`、`scripts/potato-center.js`、`scripts/nav.js`、`scripts/comments.js`、`scripts/reactions.js`。
- 安全 grep 为空：未发现 `signInWithOtp`、`service_role`、`service-role`。

### 未纳入本次发布的本地草稿

- `data/news-index-fixed.json` 和 `data/news-index.json.bak` 是无效 JSON 备份/草稿，不进入 git。
- `data/2026-06-12/content.json` 和 `data/2026-06-12/output.html` 当前是本地既有晨报草稿改动，不属于本次土豆中心/文档发布范围，未纳入本次提交。

## 2026-06-15

### 镜场计划 S0-01 最新测试记录

- 从桌面归档最新测试原件：`镜场计划/docs/镜场计划_让子弹飞S0-01图像测试调整过程记录.docx`。
- 新增可读摘要：`镜场计划/tests/s0-director-replication/S0-01-test-record-summary.md`。
- S0-01 当前结论：
  - H/I 是 v0.1 阶段较优版本。
  - 重点改进集中在肤色红润、中间调密度、墙面洁净旧化、右侧人物主导性和空间层次。
  - 仍需监控明星脸、灰雾、脏绿、过度做旧和肤色无血色。
- 下一步规则：
  - 继续以 S0-01 做单图校准样本。
  - S0-01 连续 3 次通过评分表后，再推进 `02_huang_white_interior_closeup.jpg`。
  - 公开 prompt 只使用描述性转译和安全转译，不出现导演名、电影名、演员名、角色名或具体剧照复刻。

## 2026-06-12

### 镜场计划路线图和候选表

- 从桌面归档镜场计划规划材料：
  - `镜场计划/docs/镜场计划_独立项目完全迁移说明书.docx`
  - `镜场计划/docs/镜场计划_可视化执行路线图.docx`
  - `镜场计划/excels/镜场计划_S0导演电影复刻测试候选表.xlsx`
- 新增 `镜场计划/README.md`，说明镜场计划当前状态、公开边界、资料结构和下一步。
- 当前产品方向：
  - Janet 主站只保留入口、品牌背书和精选案例。
  - 镜场计划长期应拆成独立项目：电影视觉分析、Prompt Builder、生成记录、审核记录和测试系统。
  - 第一阶段先做静态方法论、测试记录和可审核的安全转译，不公开参考帧和生成候选图。
