# iGPT-Image2 提示词手册

## 项目来源

本项目基于公开 GitHub 仓库 [freestylefly/awesome-gpt-image-2](https://github.com/freestylefly/awesome-gpt-image-2) 整理。第一阶段优先处理 `docs/gallery-part-1.md` 中靠前的 20 个案例，并参考 `docs/templates.md` 与 `data/style-library.json` 的分类结构。

## 使用方式

- 站内页面：`gpt-image2-handbook.html`
- 数据文件：`data/gpt-image2-handbook/handbook-cases.json`
- 前端脚本：`scripts/gpt-image2-handbook.js`
- 页面样式：`styles/gpt-image2-handbook.css`

每张卡都把原始提示词拆成主题、主体、构图、镜头、材质、文字约束、负面约束和输出规格，方便继续生成、改写和复用。

## 数据结构

每条案例保留原案例编号、原始 GitHub 链接、来源仓库、作者、原始创作者、MIT License 标记和完整提示词。Janet 站内只做结构化整理，不声称拥有原仓库内容版权。

## 图片生成说明

本页不直接复用原仓库案例图。站内案例图统一整理到 `assets/works/igpt-image2-handbook/`，并通过 `data/gpt-image2-handbook/handbook-cases.json` 关联到 20 个案例。

## License 说明

原仓库采用 MIT License。站内整理时保留来源、作者与原始链接。后续重生成图片仅用于 Janet 网站中的学习与案例展示。
