# News Content Contract v5

U10-A should move Janet Daily News toward a single content truth source.

## Source Of Truth

`content.json` is the content truth source.

`news-summary.json` is a homepage derivative.

`output.html` is render-only and must not create new editorial copy.

## Target Shape

```json
{
  "edition_id": "2026-05-22-v4",
  "date": "2026-05-22",
  "daily_editorial_summary": {
    "title": "",
    "body": "400字当天总评，Janet锐评加工",
    "source_story_ids": []
  },
  "lead_story_id": "",
  "stories": [
    {
      "story_id": "",
      "title": "15字内刺客标题",
      "source": "",
      "url": "",
      "original_title": "",
      "key_data": [],
      "content": "300字左右新闻正文，包含 Janet 锐评：",
      "janet_take": "约100字锐评",
      "visual": {}
    }
  ]
}
```

## Homepage Rules

- Main homepage top uses `daily_editorial_summary`.
- Homepage top does not copy the lead story.
- Homepage cards are shorter derivatives of story content.
- Homepage must not create new facts.
- Homepage must not repeat story title, module title, and daily title in the same surface.

## Daily Page Rules

- The daily page does not show “今日封面”.
- The daily page does not repeat “今天值得看”.
- Each story body has information density.
- Each story has `Janet 锐评：`.
- Each story keeps original source URL.

## Story Rules

- Title: 15 Chinese characters where possible.
- Body: about 300 Chinese characters.
- Janet take: about 100 Chinese characters.
- Must include concrete object, action, data or product, and affected audience.
- Must not use source/category-only copy.

## Forbidden Copy

- 今日封面
- 重点是
- 值得看，因为
- 出现新进展
- 开始生成内容
- 发布词落到了
- 把某某放进某某语境

## Rendering Contract

- `content.json` owns editorial copy.
- `news-summary.json` may shorten copy for homepage, but must remain derived.
- `output.html` may only render existing fields.
- QA release gate blocks template copy before deploy.
