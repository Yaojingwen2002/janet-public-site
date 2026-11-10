import fs from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {cstWindow,formatCstDate,normalizeUrl,stripHtml} from './lib.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const clean=s=>stripHtml(String(s||'')).trim();
const field=(s,k)=>s.match(new RegExp(`<${k}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${k}>`,'i'))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g,'').trim()||'';
export function feedItems(xml){return [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi)].map(([s])=>({title:clean(field(s,'title')),url:field(s,'link')||s.match(/<link\b[^>]*href=["']([^"']+)/i)?.[1],published_at:field(s,'pubDate')||field(s,'published')||field(s,'dc:date'),summary:clean(field(s,'description')||field(s,'summary')).slice(0,700)}));}
export function normalizeCandidates(raw,source,date){
 const {start,end}=cstWindow(date);
 return raw.flatMap(x=>{
  let u;try{u=new URL(x.url,source.home);if(!['https:','http:'].includes(u.protocol))return [];}catch{return [];}
  const rawDate=String(x.published_at||'');const dateOnly=/^\d{4}-\d\d-\d\d$/.test(rawDate);const t=Date.parse(rawDate);
  const exact=Number.isFinite(t)&&!dateOnly;
  const midnight=exact&&new Date(t).toISOString().endsWith('T00:00:00.000Z');
  const inside=exact&&t>=start&&t<=end;
  if(exact&&!inside&&!midnight)return [];
  if(!inside&&Number.isFinite(t)&&Math.abs(t-start)>86400000)return [];
  const url=normalizeUrl(u.href),title=clean(x.title);if(!title||!url)return [];
  return [{id:createHash('sha256').update(url).digest('hex').slice(0,16),event_key:x.event_key||url,title,url,published_at:exact?new Date(t).toISOString():null,published_raw:rawDate,time_status:inside&&!midnight?'in_window':'needs_time_review',source_id:source.id,source:source.name,channel:source.channel,tier:source.tier,summary:clean(x.summary).slice(0,700),review_status:'unreviewed'}];
 });
}
export function dedupeCandidates(rows){const map=new Map();for(const x of rows){const key=x.event_key||normalizeUrl(x.url);const old=map.get(key);if(!old)map.set(key,{...x,also_seen_in:[]});else if(old.source_id!==x.source_id&&!old.also_seen_in.includes(x.source_id))old.also_seen_in.push(x.source_id);}return [...map.values()].sort((a,b)=>String(b.published_at||'').localeCompare(String(a.published_at||'')));}
export async function collect({date,fetcher=fetch,root=ROOT}={}){
 const pool=JSON.parse(fs.readFileSync(resolve(root,'data/briefing-sources.json')));const sourceResults=[];const rows=[];let cursor=0;
 await Promise.all(Array.from({length:4},async()=>{while(cursor<pool.sources.length){const s=pool.sources[cursor++];if(s.format==='manual'){sourceResults.push({id:s.id,status:'manual',count:0});continue;}
  try{let response;for(let n=0;n<2;n++){try{const headers={'User-Agent':'JanetNewsDesk/1.0','Accept':s.format==='rss'?'application/rss+xml, application/atom+xml, application/xml':'application/json'};if(s.format==='github'&&process.env.GH_TOKEN)headers.Authorization=`Bearer ${process.env.GH_TOKEN}`;response=await fetcher(s.url,{headers,signal:AbortSignal.timeout(20000)});if(response.ok)break;}catch(e){if(n===1)throw e;}}
   if(!response?.ok)throw Error(`HTTP_${response?.status||'unavailable'}`);
   let raw;
   if(s.format==='rss'){const xml=await response.text();if(!/<(?:rss|feed)\b/i.test(xml))throw Error('invalid_feed');raw=feedItems(xml);}
   else{const d=await response.json();if(s.format==='github'){if(!Array.isArray(d))throw Error('invalid_release_list');raw=d.filter(x=>!x.draft).map(x=>({event_key:s.repo+'@'+(x.body?.match(/^##\s*\[([^\]]+)/m)?.[1]||x.tag_name),title:`${s.name} ${x.tag_name}`,url:s.repo==='n8n-io/n8n'&&['stable','beta'].includes(x.tag_name)&&x.body?.match(/^##\s*\[([^\]]+)/m)?`https://github.com/${s.repo}/releases/tag/n8n%40${x.body.match(/^##\s*\[([^\]]+)/m)[1]}`:x.html_url,published_at:x.published_at,summary:x.body}));}
    else {if(!Array.isArray(d.allBlogs))throw Error('invalid_blog_list');raw=d.allBlogs.map(x=>({title:x.title,url:'https://huggingface.co'+x.url,published_at:x.publishedAt,summary:''}));}}
   const items=normalizeCandidates(raw,s,date);rows.push(...items);sourceResults.push({id:s.id,status:'ok',raw_count:items.length,count:dedupeCandidates(items).length,checked_at:new Date().toISOString()});
  }catch(e){sourceResults.push({id:s.id,status:'failed',count:0,checked_at:new Date().toISOString(),error:/HTTP_\d+|invalid_\w+/.exec(String(e))?.[0]||'connection_failed'});}
 }}));
 const {start,end}=cstWindow(date);return {schema_version:1,date,timezone:'Asia/Taipei',generated_at:new Date().toISOString(),window:{start:start.toISOString(),end:end.toISOString()},policy:pool.policy,source_results:sourceResults,candidates:dedupeCandidates(rows)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const date=process.argv.find(x=>/^\d{4}-\d\d-\d\d$/.test(x))||formatCstDate(new Date());
 const d=await collect({date});const out=resolve(ROOT,'data/briefing-candidates.json');
 const old=fs.existsSync(out)?JSON.parse(fs.readFileSync(out)):null;if(old?.date>date)throw Error('refuse_to_replace_newer_collection');
 fs.writeFileSync(out,JSON.stringify(d,null,2)+'\n');console.log(JSON.stringify({date,candidates:d.candidates.length,failed:d.source_results.filter(x=>x.status==='failed').map(x=>x.id)}));
 if(d.source_results.filter(x=>x.status==='ok').length===0)process.exitCode=1;
}
