# Changelog

所有主站、账号系统、晨报模板、项目文档和镜场计划变更都按日期记录在这里。公开仓库只收录可读文档、站点代码和轻量测试资产；参考帧、5 秒视频切片、生成候选图等重素材保留在本地或私有存储，不直接公开发布。

## 2026-06-16

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
