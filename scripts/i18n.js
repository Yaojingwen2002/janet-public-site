// i18n.js — 轻量双语切换（中文 ↔ English）

(function() {
  // ── 翻译字典 ─────────────────────────────────────────────
  const dicts = {
    zh: {
      'i18n-nav-brand': 'Janet',
      'i18n-nav-news': '快车箱',
      'i18n-nav-universe': '穿梭宇宙',
      'i18n-nav-cases': '案例',
      'i18n-nav-about': '关于',
      'i18n-nav-contact': '联系',
      'i18n-hero-eyebrow': 'AI 情报快车 · 视频世界观 IP',
      'i18n-hero-title': '过滤 AI 噪音，<br>把创意开进<span class="accent">新宇宙</span>',
      'i18n-hero-sub': '我是 Janet Yao，Janet 快车箱主理人，也是「穿梭宇宙」的创作者。一边用每日晨报筛掉 AI 圈的泡沫，一边用 AI 视频构建角色穿梭的视觉世界观。',
      'i18n-hero-btn1': '阅读今日快车箱',
      'i18n-hero-btn2': '进入穿梭宇宙',
      'i18n-hero-btn3': '查看全部项目案例 →',
      'i18n-hero-product1-label': 'Janet 快车箱',
      'i18n-hero-product1-title': '每日 AI 情报过滤器',
      'i18n-hero-product1-desc': '全球 AI 前沿 / Janet 锐评 / 公众号沉淀',
      'i18n-hero-product2-label': '穿梭宇宙',
      'i18n-hero-product2-title': 'AI 视频世界观 IP',
      'i18n-hero-product2-desc': '角色穿梭 / 后跟随镜头 / 运动控制',
      'i18n-news-title': 'Janet 快车箱',
      'i18n-news-desc': '每日精选全球 AI 前沿，只保留真正有洞察、可落地、值得继续追踪的信息。',
      'i18n-news-btn1': '📰 阅读今日完整晨报',
      'i18n-news-btn2': '📚 浏览全部晨报归档',
      'i18n-about-title': '关于 Janet',
      'i18n-about-name': 'Janet Yao',
      'i18n-about-role': 'AI 内容产品创作者',
      'i18n-about-p1': '我用中国创作者视角观察全球 AI：哪些是真进展，哪些只是公关话术；哪些能落地，哪些只是泡沫。',
      'i18n-about-p2': 'Janet 快车箱负责过滤信息，穿梭宇宙负责释放想象力。一个偏判断，一个偏表达，共同构成我的 AI 内容产品系统。',
      'i18n-about-skills': '技能偏好：营销 40% + 批判思考 50% + 创作者代言 30% + 技术权威 20%',
      'i18n-about-style': '风格：毒舌吐槽 + 大胆预测 + 技术乐观 + 朋友聊天',
      'i18n-about-proof1-title': '内容判断',
      'i18n-about-proof1-desc': '过滤 AI 噪音，保留真正有价值的信息',
      'i18n-about-proof2-title': '视觉叙事',
      'i18n-about-proof2-desc': '用镜头和运动控制构建 AI 视频表达',
      'i18n-about-proof3-title': '产品沉淀',
      'i18n-about-proof3-desc': '把晨报、视频和案例库变成长期资产',
      'i18n-about-tags': ['AI 晨报', '内容产品', '穿梭宇宙', 'AI 视频', '创作者 IP'],
      'i18n-projects-title': '最新项目案例',
      'i18n-projects-desc': '每个作品不只是一个视频，而是一份完整的创作档案：概念、世界观、镜头运动、提示词结构和成品复盘。',
      'i18n-universe-title': '穿梭宇宙',
      'i18n-universe-seeall': '查看案例库 →',
      'i18n-universe-kicker': 'AI 视频世界观 IP',
      'i18n-universe-h3': '一个用 AI 视频搭建的角色穿梭世界观。',
      'i18n-universe-p1': '「穿梭宇宙」不是普通的视频作品集，而是一个持续更新的 AI 视频 IP 实验。每条视频都会围绕一个角色、一种陌生世界、一条运动路径和一种镜头语言展开。',
      'i18n-universe-p2': '我关注的不只是"AI 能不能生成画面"，而是角色如何进入场景、镜头如何跟随、速度如何被感知、观众能不能在几秒内记住这个世界。',
      'i18n-universe-point1-title': '角色穿梭',
      'i18n-universe-point1-desc': '用熟悉角色进入陌生场景，建立第一眼记忆点。',
      'i18n-universe-point2-title': '运动控制',
      'i18n-universe-point2-desc': '后跟随、漂移、非直线路径，让视频有真实穿越感。',
      'i18n-universe-point3-title': '项目拆解',
      'i18n-universe-point3-desc': '每个作品都沉淀成 Concept、World、Motion、Prompt 的完整案例。',
      'i18n-universe-process1': '01 设定角色与世界',
      'i18n-universe-process2': '02 控制镜头运动',
      'i18n-universe-process3': '03 生成视频版本',
      'i18n-universe-process4': '04 复盘成项目案例',
      'i18n-universe-btn2': '进入项目案例库',
      'i18n-universe-system1': '核心创意',
      'i18n-universe-system1-desc': '这个角色为什么要进入这个世界？',
      'i18n-universe-system2': '世界设定',
      'i18n-universe-system2-desc': '场景、材质、氛围和视觉风格如何统一？',
      'i18n-universe-system3': '镜头运动',
      'i18n-universe-system3-desc': '如何用运动路径制造穿梭感？',
      'i18n-universe-system4': '提示词结构',
      'i18n-universe-system4-desc': '如何把画面、速度、镜头和情绪写成可复用模板？',
      'i18n-projects-universe-name': '穿梭宇宙',
      'i18n-projects-universe-role': '用 AI 穿越每一个世界',
      'i18n-projects-universe-p1': 'AI 生成的角色穿梭视频账号。不是"AI 展示号"，而是"世界观 IP 号"。观众记住的不是"AI 做得真像"，而是"这个角色穿越到那个世界好酷"。',
      'i18n-projects-universe-p2': '内容公式：[知名 IP 角色] × [陌生场景] × [标志性骑乘物] × [独特风格]',
      'i18n-projects-universe-p3': '更新频率：日更 1 条 | 5-10 秒 | 9:16 竖屏',
      'i18n-projects-universe-tags': ['AI 动画', 'IP 穿梭', '世界观 IP', '日更'],
      'i18n-projects-fastbox-name': 'Janet 快车箱',
      'i18n-projects-fastbox-role': 'AI 科技晨报 · 每日更新',
      'i18n-projects-fastbox-p1': '每日 AI 晨报，通过「Janet 快车箱」公众号发布。5+4+4+3+1 分析框架：5 条重磅新闻 + 4 个模型更新 + 4 个技术洞察 + 3 个投资角度 + 1 个必备工具。',
      'i18n-projects-fastbox-tags': ['AI 晨报', '公众号', '自动化'],
      'i18n-videos-title': '最新视频',
      'i18n-videos-seeall': '查看全部 →',
      'i18n-work-title': '精选作品',
      'i18n-contact-title': '联系我',
      'i18n-contact-h2': '一起聊聊',
      'i18n-contact-p': '如果你想交流 AI 趋势、内容产品、视频创作，或者有合作想法，可以通过下面的方式联系我。',
      'i18n-contact-phone': '电话',
      'i18n-contact-email': '邮箱',
      'i18n-contact-wechat': '微信公众号',
      'i18n-contact-twitter': 'X',
      'i18n-contact-github': 'GitHub',
      'i18n-contact-linkedin': 'LinkedIn',
      'i18n-contact-hours': '10:00 - 18:00 中国时间',
      'i18n-contact-inquiry': '项目合作 / 内容合作',
      'i18n-contact-biz': '公众号 · 每日 AI 晨报',
      'i18n-contact-tech': 'AI 观察与技术想法',
      'i18n-contact-design': '设计系统与 AI 工具',
      'i18n-contact-prof': '职业主页',
      'i18n-footer': '© 2026 Janet Yao · 保留所有权利。',
      'i18n-footer2': '由 AI 协作搭建 · 被好奇心驱动',
      'i18n-backtop': '↑',
      'i18n-back-home': '← 返回首页',
    },
    en: {
      'i18n-nav-brand': 'Janet',
      'i18n-nav-news': 'Briefing',
      'i18n-nav-universe': 'Universe',
      'i18n-nav-cases': 'Cases',
      'i18n-nav-about': 'About',
      'i18n-nav-contact': 'Contact',
      'i18n-hero-eyebrow': 'AI Briefing · Video World IP',
      'i18n-hero-title': 'Filtering AI noise,<br>building a <span class="accent">new universe</span>',
      'i18n-hero-sub': "I am Janet Yao, the creator behind Janet's Express Box and Time Travel Universe. I filter AI hype through a daily briefing, and build visual worlds through AI-powered character crossover videos.",
      'i18n-hero-btn1': "Read today's briefing",
      'i18n-hero-btn2': 'Enter the universe',
      'i18n-hero-btn3': 'View all project cases →',
      'i18n-hero-product1-label': "Janet's Express Box",
      'i18n-hero-product1-title': 'Daily AI signal filter',
      'i18n-hero-product1-desc': "Global AI / Janet's take / WeChat archive",
      'i18n-hero-product2-label': 'Time Travel Universe',
      'i18n-hero-product2-title': 'AI video world IP',
      'i18n-hero-product2-desc': 'Character crossover / rear-follow camera / motion control',
      'i18n-news-title': "Janet's Express Box",
      'i18n-news-desc': 'A daily filter for global AI signals — selected for insight, usefulness, and real-world value.',
      'i18n-news-btn1': "📰 Read today's full briefing",
      'i18n-news-btn2': '📚 Browse all briefing archives',
      'i18n-about-title': 'About Janet',
      'i18n-about-name': 'Janet Yao',
      'i18n-about-role': 'AI Content Product Builder',
      'i18n-about-p1': "I observe global AI from a Chinese creator's perspective: what is real progress, what is PR language, what can be deployed, and what is only hype.",
      'i18n-about-p2': "Janet's Express Box filters information. Time Travel Universe releases imagination. One is judgment, the other is expression — together they form my AI content product system.",
      'i18n-about-proof1-title': 'Editorial judgment',
      'i18n-about-proof1-desc': 'Filtering AI noise into useful signals',
      'i18n-about-proof2-title': 'Visual storytelling',
      'i18n-about-proof2-desc': 'Using camera and motion control to shape AI video',
      'i18n-about-proof3-title': 'Product archive',
      'i18n-about-proof3-desc': 'Turning briefings, videos, and cases into long-term assets',
      'i18n-about-tags': ['AI Briefing', 'Content Product', 'Time Travel Universe', 'AI Video', 'Creator IP'],
      'i18n-projects-title': 'Latest Project Cases',
      'i18n-projects-desc': 'Each work is more than a video. It is a creative case file: concept, world setting, camera motion, prompt structure, and final review.',
      'i18n-universe-title': 'Time Travel Universe',
      'i18n-universe-seeall': 'View case library →',
      'i18n-universe-kicker': 'AI VIDEO WORLD IP',
      'i18n-universe-h3': 'A character-travel world built with AI video.',
      'i18n-universe-p1': 'Time Travel Universe is not a normal video portfolio. It is an ongoing AI video IP experiment where each work is built around a character, an unfamiliar world, a motion path, and a camera language.',
      'i18n-universe-p2': 'I care less about whether AI can generate images, and more about how a character enters a scene, how the camera follows, how speed is felt, and whether the viewer remembers the world within seconds.',
      'i18n-universe-point1-title': 'Character travel',
      'i18n-universe-point1-desc': 'Place a familiar character into an unfamiliar setting to create an instant memory hook.',
      'i18n-universe-point2-title': 'Motion control',
      'i18n-universe-point2-desc': 'Use rear-follow, drift, and non-linear motion paths to create a real travel feeling.',
      'i18n-universe-point3-title': 'Project breakdown',
      'i18n-universe-point3-desc': 'Turn every work into a full case file: Concept, World, Motion, and Prompt.',
      'i18n-universe-process1': '01 Set character and world',
      'i18n-universe-process2': '02 Control camera motion',
      'i18n-universe-process3': '03 Generate video versions',
      'i18n-universe-process4': '04 Review as project case',
      'i18n-universe-btn2': 'Enter case library',
      'i18n-universe-system1': 'Concept',
      'i18n-universe-system1-desc': 'Why does this character enter this world?',
      'i18n-universe-system2': 'World setting',
      'i18n-universe-system2-desc': 'How do the scene, material, mood, and visual style stay consistent?',
      'i18n-universe-system3': 'Motion direction',
      'i18n-universe-system3-desc': 'How does the motion path create the feeling of travel?',
      'i18n-universe-system4': 'Prompt structure',
      'i18n-universe-system4-desc': 'How do image, speed, camera, and emotion become a reusable template?',
      'i18n-projects-universe-name': '穿梭宇宙',
      'i18n-projects-universe-role': 'AI-Powered Character Time Travel',
      'i18n-projects-universe-p1': 'AI-generated character crossover videos. Not an "AI showcase" — a "worldview IP." Viewers remember "this character in that world is so cool," not "AI looks realistic."',
      'i18n-projects-universe-p2': 'Formula: [Famous IP Character] × [Unfamiliar Setting] × [Iconic Ride] × [Unique Style]',
      'i18n-projects-universe-p3': 'Daily 1 video | 5-10s | 9:16 vertical',
      'i18n-projects-universe-tags': ['AI Animation', 'IP Crossover', 'Worldview IP', 'Daily'],
      'i18n-projects-fastbox-name': "Janet's Express Box",
      'i18n-projects-fastbox-role': 'Daily AI Briefing System',
      'i18n-projects-fastbox-p1': 'Daily AI briefing published via WeChat Official Account. 5+4+4+3+1 framework: 5 headlines + 4 model updates + 4 tech insights + 3 investment angles + 1 must-have tool.',
      'i18n-projects-fastbox-tags': ['AI Briefing', 'WeChat OA', 'Automation'],
      'i18n-videos-title': 'Recent Videos',
      'i18n-videos-seeall': 'See all →',
      'i18n-work-title': 'Selected Work',
      'i18n-contact-title': 'Connect',
      'i18n-contact-h2': 'Get in Touch',
      'i18n-contact-p': "If you want to discuss AI trends, content products, video creation, or potential collaborations, here are the best ways to reach me.",
      'i18n-contact-phone': 'Phone',
      'i18n-contact-email': 'Email',
      'i18n-contact-wechat': 'WeChat Official Account',
      'i18n-contact-twitter': 'X',
      'i18n-contact-github': 'GitHub',
      'i18n-contact-linkedin': 'LinkedIn',
      'i18n-contact-hours': '10:00 - 18:00 China Time',
      'i18n-contact-inquiry': 'Project / content collaboration',
      'i18n-contact-biz': 'Official Account · Daily AI Briefing',
      'i18n-contact-tech': 'AI notes and technical thoughts',
      'i18n-contact-design': 'Design systems and AI tools',
      'i18n-contact-prof': 'Professional profile',
      'i18n-footer': '© 2026 Janet Yao · All rights reserved.',
      'i18n-footer2': 'Built with AI · Powered by curiosity',
      'i18n-backtop': '↑',
      'i18n-back-home': '← Back to Home',
    }
  };

  let currentLang = 'zh';

  function applyLang(lang) {
    currentLang = lang;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    const dict = dicts[lang];

    // 按 data-i18n 属性替换文本
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = dict[key];
      if (!val) return;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = val;
      } else if (el.tagName === 'IMG') {
        el.alt = val;
      } else if (el.tagName === 'TITLE') {
        document.title = val;
      } else {
        el.innerHTML = val;
      }
    });

    // 处理数组型翻译（标签）
    document.querySelectorAll('[data-i18n-arr]').forEach(el => {
      const key = el.getAttribute('data-i18n-arr');
      const arr = dict[key];
      if (!arr) return;
      el.innerHTML = arr.map(t => `<span class="tag tag-outline">${t}</span>`).join('');
    });

    // 切换按钮文字
    const btn = document.getElementById('lang-toggle');
    if (btn) btn.textContent = lang === 'zh' ? 'EN' : '中文';
  }

  // ── 初始化 ─────────────────────────────────────────────
  function init() {
    // 从 localStorage 读取偏好
    const saved = localStorage.getItem('lang');
    if (saved && dicts[saved]) currentLang = saved;

    // 首次加载
    applyLang(currentLang);

    // 创建切换按钮（注入到 nav-inner）
    const navInner = document.querySelector('.nav-inner');
    if (navInner) {
      const btn = document.createElement('button');
      btn.id = 'lang-toggle';
      btn.textContent = currentLang === 'zh' ? 'EN' : '中文';
      btn.addEventListener('click', () => {
        currentLang = currentLang === 'zh' ? 'en' : 'zh';
        localStorage.setItem('lang', currentLang);
        applyLang(currentLang);
      });
      navInner.appendChild(btn);
    }
  }

  // DOM ready 后执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露给全局
  window.i18n = { applyLang, dicts, getLang: () => currentLang };
})();
