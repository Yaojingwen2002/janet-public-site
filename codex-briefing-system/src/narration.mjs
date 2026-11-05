import { createHash } from 'node:crypto';

export const COLUMNS = [
  ['news', '全球要闻'], ['models', '模型动态'], ['insights', '技术深度'],
  ['insights2', '投资视角'], ['tools', '今日工具箱']
];
export const contentHash = content => createHash('sha256').update(JSON.stringify(content)).digest('hex');

// Keep every editorial field intact. Only the connective language is added.
export function buildNarration(content) {
  const [year, month, day] = content.date.split('-').map(Number);
  const segments = [];
  const add = (id, title, text, extra = {}) => segments.push({ id, title, text, ...extra });
  add('opening', '开场', `各位听众，欢迎收听 Janet 每日晨报。今天是${year}年${month}月${day}日，第${content.vol}期。\n${content.cover.title}。\n${content.cover.subtitle}。\n${content.intro_text}\n本期为您完整播报十七条新闻，每条新闻后紧接 Janet 锐评。`);
  add('trend', '今日趋势', `首先关注今日趋势。\n${content.trend}`);
  let number = 0;
  for (const [section, label] of COLUMNS) {
    for (const [index, item] of content.sections[section].items.entries()) {
      number++;
      const transition = index === 0 ? `下面进入${label}。\n` : '';
      add(`${section}-${index}`, item.title,
        `${transition}第${number}条。${item.title}。\n据${item.source}报道。\n${item.body}\nJanet 锐评。\n${item.janet_take}`,
        { section, item_index: index, source_url: item.url || item.link });
    }
  }
  add('closing', '结束语', '以上是本期 Janet 每日晨报的全部内容。感谢收听。保持好奇，保持判断。我们下期再见。');
  return { schema_version: 1, date: content.date, title: content.cover.title,
    content_sha256: contentHash(content), item_count: number, voice: 'zh-CN-XiaoxiaoNeural',
    voice_label: '普通话女声 · AI 播报', rate: '-3%', segments };
}
