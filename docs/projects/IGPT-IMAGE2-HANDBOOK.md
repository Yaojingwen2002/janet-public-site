# iGPT-Image2 提示词手册

## 项目来源

本项目是 Janet 站内的 iGPT-Image2 prompt handbook。当前版本共 100 组：

- 001-050：基于公开仓库 [freestylefly/awesome-gpt-image-2](https://github.com/freestylefly/awesome-gpt-image-2) 的来源案例拆解，保留来源、作者、链接与 license 标记。
- 051-100：基于 OpenAI 官方文档、GPT Image2 prompt 库、影视镜头语言资料和 Janet 自研模块做结构研究后，重新写成 Janet 安全 prompt。

新增 50 组没有直接搬外部 prompt 原文，也不使用真实品牌、真实演员、真实角色、导演名或真实 IP 作为生成依赖。

## 使用方式

- 站内页面：`gpt-image2-handbook.html`
- 手册数据：`data/gpt-image2-handbook/handbook-cases.json`
- 来源内部表：`data/gpt-image2-handbook/prompt-source-matrix.json`
- 来源说明文档：`docs/projects/IGPT-IMAGE2-SOURCE-MATRIX.md`
- 前端脚本：`scripts/gpt-image2-handbook.js`
- 页面样式：`styles/gpt-image2-handbook.css`

每张卡都把提示词拆成主题、主体、场景、构图、镜头、光线、色彩、材质、文字约束、负面约束和输出规格，方便继续生成、改写和复用。

## Janet Prompt 准入规则

能进入 Janet prompt 正文的内容必须满足：

- 主体明确
- 场景明确
- 构图明确
- 光线明确
- 色彩明确
- 材质明确
- 约束明确
- 可改造
- 不依赖导演名、演员名、真实 IP、真实品牌 logo
- 能迁移到短剧、长剧、电影图片素材

以下内容不直接收录：真实品牌 logo、真实演员或角色、某导演风格、复刻电影海报版式、只堆 8K/cinematic/ultra realistic、缺少构图/光线/色彩/约束、强依赖平台特定语法。

## 图片生成说明

001-050 已接入本地案例图，统一放在 `assets/works/igpt-image2-handbook/`。

051-100 目前是 prompt-only 结构卡，统一使用 `assets/works/igpt-image2-handbook/cover.svg` 作为临时封面，并在数据中标记 `image_status: "prompt_only_pending_visual"`。后续生成正式案例图后，只需要替换 `image` 路径和 `image_status`。

## License 说明

公开来源部分保留来源、作者与原始链接。新增 Janet 安全改写 prompt 属于站内原创整理，外部来源仅作为结构研究参考。
