# iGPT-Image2 Prompt 来源内部表

这张表用于 Janet 内部判断哪些来源可以公开引用、哪些只能作为结构研究，哪些可以进入手册正文。新增 prompt 必须满足：主体明确、场景明确、构图明确、光线明确、色彩明确、材质明确、约束明确、可改造、不依赖导演名/演员名/真实 IP、能迁移到短剧/长剧/电影图片素材。

## 优先级来源

1. OpenAI GPT Image prompting guide
2. fal.ai GPT Image 2 Prompting Guide
3. EvoLink GPT Image 2 Prompts
4. YouMind awesome-gpt-image-2
5. Midlibrary Cinematic Styles

## 来源矩阵

| 来源名称 | 网址 | 类型 | 适合 Janet 哪个模块 | 可直接参考的结构 | 风险点 | 是否可公开引用 | 是否可进入手册正文 |
|---|---|---|---|---|---|---|---|
| OpenAI GPT Image prompting guide | https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide | 官方 | 结构化提示词骨架 / 图文一致性 / 局部编辑 | 目标 + 主体 + 场景 + 关键细节 + 输出用途 + 明确约束 | 只引用方法和能力边界，不复制官方示例图和完整示例 prompt。 | 是，公开引用链接和方法论。 | 是，作为方法论和字段标准。 |
| OpenAI Image Generation API Guide | https://developers.openai.com/api/docs/guides/image-generation | 官方 | 参数边界 / 生成与编辑工作流 / 输出规格 | model + prompt + size + quality + background + edit/mask 输入 | API 参数会迭代，正文要写成能力边界，不写死全部参数。 | 是。 | 是，放在工具设置与生成流程章节。 |
| fal.ai GPT Image 2 Prompting Guide | https://fal.ai/learn/tools/prompting-gpt-image-2 | 库 | 七字段 prompt 骨架 / 生产型提示词模板 | Scene / Subject / Important details / Use case / Constraints | 商业站示例不能原样搬；只吸收字段顺序和约束写法。 | 是，引用链接和结构。 | 是，重写成 Janet 字段模板。 |
| EvoLink GPT Image 2 Prompts | https://evolink.ai/gpt-image-2-prompts | 库 | 案例拆解 / 产品图 / UI / 角色设定 | 短标题 + 场景目标 + 相机/光线/材质细节 + 负面约束 | 图库式案例授权不清；避免直接复用商业 prompt 和图片。 | 可以引用链接，不公开复刻 prompt。 | 部分进入，必须 Janet 原创改写。 |
| YouMind awesome-gpt-image-2 | https://github.com/YouMind-OpenLab/awesome-gpt-image-2 | 库 | 案例雷达 / 灵感索引 / prompt 分类 | 案例标题 + 效果图 + 原 prompt + 来源索引 | 大量来自公开社媒，授权混杂；不能把社媒 prompt 当自有内容。 | 可以引用仓库链接。 | 只进来源索引，不直接进正文。 |
| YouMind GPT Image 2 Prompts website | https://youmind.com/gpt-image-2-prompts | 库 | 灵感检索 / 分类导航 | 按主题浏览 + 复制 prompt + 看原始来源 | 站内内容主要来自公开来源；公开正文只做结构化评注。 | 可以引用链接。 | 只进参考索引，不搬原文。 |
| wuyoscar GPT Image2 Skill | https://github.com/wuyoscar/GPT-Image2-Skill | 库 | 技能化工作流 / 批量生成 / 参考图处理 | 输入图或目标 + prompt gallery + CLI/skill 工作流 | 仓库内容可学流程，不能替代 Janet 自己的风格规则。 | 可以引用仓库。 | 部分进入，作为 workflow 章节。 |
| Morphic ChatGPT Images 2.0 prompt library | https://morphic.com/resources/how-to/chatgpt-images-2.0-prompts | 案例 | 案例灵感库 / 类目覆盖检查 | 按用途分组的 prompt 卡片 | 示例版权和平台策略不稳定；只做题材扫描。 | 可以引用链接。 | 不直接进入，只做选题池。 |
| BananaProAI GPT Image prompt library | https://bananaproai.com/prompts/gpt-image-prompt/ | 案例 | 商业图 / 产品图 / 海报灵感 | 用途 + 成品方向 + prompt 文案 | 商业图库风险；需去品牌、去真实 IP、去平台语法。 | 可以引用链接。 | 不直接进入，只做改写样本。 |
| 2Slides GPT Image 2 prompts | https://2slides.com/products/gpt-image-2-prompts | 案例 | 演示文稿 / PPT 图像 / 商务视觉 | 场景图 + 版式图 + 商务用途 prompt | 偏商业模板，容易模板感重；正文要补主体、构图、光线和约束。 | 可以引用链接。 | 部分进入，需 Janet 化重写。 |
| Midlibrary Cinematic Styles | https://midlibrary.io/feature/cinematic | 影视 | 影视风格 / 镜头语言 / 光线色彩词库 | 风格名称 + 视觉特征 + 样图对照 | 不能写某导演风格，不能照搬样图；只提取镜头、光线、色彩、材质语言。 | 可以引用链接。 | 是，作为视觉词库，不作为复刻模板。 |
| Midjourney Image Prompts 文档 | https://docs.midjourney.com/hc/en-us/articles/32040250122381-Image-Prompts | 影视 | 参考图 / 图像影响 / 风格迁移边界 | image reference + text prompt + 权重/影响说明 | 平台语法不能直接迁移到 GPT Image2；需翻译成自然语言约束。 | 可以引用链接。 | 部分进入，作为参考图章节。 |
| Midjourney Prompt Basics | https://docs.midjourney.com/hc/en-us/articles/32023408776205-Prompt-Basics | 影视 | 基础字段校验 / 构图光线色彩补全 | Subject / Medium / Environment / Lighting / Color / Mood | Midjourney 语法和参数不要直接写进 GPT Image2 正文。 | 可以引用链接。 | 部分进入，作为字段检查清单。 |
| freestylefly/awesome-gpt-image-2 | https://github.com/freestylefly/awesome-gpt-image-2 | 库 | 现有 50 组来源案例 / 案例拆解参考 | gallery case + 原始来源 + prompt + MIT 仓库标记 | 部分 prompt 包含真实品牌、人物、IP 或平台化表达；不直接作为 Janet 安全 prompt。 | 可以引用仓库与原始链接。 | 作为旧案例拆解保留；新增正文需安全改写。 |
| Janet 影像参考室 | internal://janet/image-reference-room | 参考图 | 参考图筛选 / 图像素材归档 / 本地审美库 | 参考图编号 + 可用元素 + 禁用元素 + 可迁移场景 | 内部资产不可公开外链；公开页面只写抽象方法。 | 否。 | 是，转写成方法，不暴露内部素材。 |
| 风格反推 | internal://janet/style-reverse-engineering | 参考图 | 风格拆解 / 去导演化 / 去 IP 化 | 画面事实 + 镜头 + 光线 + 色彩 + 材质 + 禁止复刻对象 | 不能写真实导演、演员、角色或片名；只保留可迁移视觉变量。 | 否。 | 是，作为 Janet 自研核心模块。 |
| 首尾帧 prompt | internal://janet/first-last-frame-prompts | 参考图 | 短剧 / 长剧 / 电影图片素材 / 视频转场 | 首帧状态 + 变化动作 + 尾帧状态 + 连续性约束 | 要避免复刻现成影视镜头；只写原创场景调度。 | 否。 | 是，作为高优先级正文模块。 |
| 华语影像视觉研究 | internal://janet/sinic-visual-research | 参考图 | 华语场景 / 地域材质 / 生活质感 | 地域场景 + 人物关系 + 空间物件 + 光线色彩 + 可迁移用途 | 不要复刻具体电影海报、剧照、演员或角色。 | 否。 | 是，作为 Janet 手册差异化模块。 |

## 不直接收录规则

- 写真实品牌 logo 的，不进正文。
- 写真实演员/角色的，不进正文。
- 写“某某导演风格”的，不进正文。
- 复刻电影海报版式的，不进正文。
- 只堆 8K、cinematic、ultra realistic 的，不进正文。
- 没有构图、光线、色彩、约束的，不进正文。
- 太依赖平台特定语法的，不直接进正文，先翻译成自然语言字段。
