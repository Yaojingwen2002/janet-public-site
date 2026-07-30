# Janet V4 字体审计

审计日期：2026-07-29

## 结论

V4 不向公开产物新增第三方字体文件。网站继续使用操作系统字体栈，并把四种排版角色固定为：

| 角色 | CSS token | 字体栈 | 用途 |
|---|---|---|---|
| 品牌 | `--font-brand` | Avenir Next / SF Pro Display / PingFang SC / system sans | Janet 英文标识旁的短标签 |
| 展示 | `--font-display` | Avenir Next / SF Pro Display / PingFang SC / system sans | Hero、页面标题、分区标题 |
| 正文 | `--font-body` | SF Pro Text / PingFang SC / Microsoft YaHei / system sans | 中文正文、表单、按钮 |
| 数据 | `--font-mono` | SF Mono / Menlo / Consolas / ui-monospace | 日期、坐标、实验编号、状态 |

## 授权与加载

- 仓库没有打包 Avenir、SF Pro 或 PingFang 字体文件，也不从第三方 CDN 下载字体。
- 这些名称只作为本机系统字体候选；设备没有对应字体时，自动回退到系统 sans-serif。
- 因此公开站没有新增字体授权文件、跨域字体请求或字体阻塞渲染。
- Janet Logo 继续使用已确认的图片/SVG lockup，不用网页字体重画。

## 中文覆盖

- macOS / iOS：优先 PingFang SC。
- Windows：优先 Microsoft YaHei。
- Android 与其他系统：使用系统 sans-serif。
- 中英文混排、数字和标点均由系统字体完成，不发生缺字后再下载字体的布局跳动。

## V4 排版约束

- 字号只在固定断点切换，不使用 `vw` 连续缩放。
- V4 设计层把负字距统一归零。
- 手机、平板、PC、宽屏分别使用冻结字号阶梯。
- 正文默认 16–18px，卡片标题 18–24px，页面标题 38–64px，首页主标题 48–88px。
