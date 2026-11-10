const COUNTS = {news: 5, models: 4, insights: 4, insights2: 3, tools: 1};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;

// The next edition becomes due at 08:00 Taipei, exactly midnight UTC.
export const dueBriefingDate = (now = new Date()) => new Date(now).toISOString().slice(0, 10);
export function validBriefingDate(date) {
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) return false;
  const time = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
}

export function editorialIssues(content, date) {
  if (!object(content)) return ['content_shape'];
  const issues = [];
  if (content.date !== date) issues.push('content_date');
  if (!object(content.sections)) return [...issues, 'sections_shape'];
  const keys = Object.keys(content.sections);
  if (keys.length !== 5 || keys.some(key => !(key in COUNTS))) issues.push('section_keys');
  for (const [key, count] of Object.entries(COUNTS)) {
    const items = content.sections[key]?.items;
    if (!Array.isArray(items) || items.length !== count) issues.push('count_' + key);
    else if (items.some(item => !object(item))) issues.push('item_shape_' + key);
  }
  if (issues.length) return issues;
  if (!object(content.cover) || !text(content.cover.title) || !text(content.cover.subtitle)) issues.push('cover_text');
  const volume = ['string', 'number'].includes(typeof content.vol) ? Number(content.vol) : NaN;
  if (!text(content.intro_text) || !text(content.trend) || !Number.isInteger(volume) || volume < 1) issues.push('missing_intro_field');
  const items = Object.keys(COUNTS).flatMap(key => content.sections[key].items);
  if (items.some(item => ['title', 'body', 'janet_take', 'source', 'url'].some(key => !text(item[key])))) issues.push('missing_editorial_field');
  for (const item of items) {
    try {
      if (!['http:', 'https:'].includes(new URL(item.url).protocol)) issues.push('unsafe_source_url');
    } catch { issues.push('unsafe_source_url'); }
    if (typeof item.image !== 'string' || !/^images\/[A-Za-z0-9_.-]+\.(png|jpe?g|webp|gif|avif)$/i.test(item.image)) issues.push('unsafe_image_path');
  }
  if (new Set(items.map(item => item.image)).size !== 17) issues.push('duplicate_images');
  return [...new Set(issues)];
}

export function imageType(bytes) {
  if (!bytes) return null;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
  if (/^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return 'gif';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (bytes.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(bytes.toString('ascii', 8, 40))) return 'avif';
  return null;
}
