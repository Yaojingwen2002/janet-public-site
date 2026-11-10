import fs from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildNarration,contentHash} from './narration.mjs';
import {createHash} from 'node:crypto';
import {stripHtml} from './lib.mjs';
import {dueBriefingDate,validBriefingDate,editorialIssues,imageType} from './verification-contract.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function inspectLive({date,base='https://yaojingwen2002.github.io/janet-public-site/',fetcher=fetch}){
 if(!validBriefingDate(date))throw Error('invalid_date');
 const results=[],buffers=new Map();
 async function get(path){let last;for(let n=0;n<2;n++){try{const r=await fetcher(new URL(path,base),{cache:'no-store',signal:AbortSignal.timeout(path.endsWith('/narration.m4a')?90000:30000)});const b=Buffer.from(await r.arrayBuffer());last={path,status:r.status,bytes:b.length};if(r.ok){buffers.set(path,b);last.sha256=hash(b);last.git_blob_sha1=createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');results.push(last);return last;}if(r.status===404)break;}catch{last={path,status:0,error:'connection_failed'};}}results.push(last);return last;}
 const cp=`data/${date}/content.json`;await get(cp);
 if(!buffers.has(cp))return {date,status:results[0].status===404?'missing':'check_failed',ok:false,repair:results[0].status===404?'full_pipeline':'review_connectivity',results};
 let content;try{content=JSON.parse(buffers.get(cp));}catch{return {date,status:'invalid_content',ok:false,repair:'review_content',results};}
 const issues=editorialIssues(content,date);
 if(issues.length)return {date,status:'invalid_content',ok:false,repair:'review_content',issues,results};
 const items=Object.values(content.sections).flatMap(x=>x.items);
 if(new Set(items.map(x=>x.image)).size!==17)issues.push('duplicate_images');
 if(items.some(x=>['title','body','janet_take','source','url'].some(k=>!String(x[k]||'').trim())))issues.push('missing_editorial_field');
 const paths=['','index.html','news.html','data/news-index.json',`data/${date}/output.html`,`data/${date}/cover.png`];
 for(const item of items){if(!/^images\/[A-Za-z0-9_.-]+\.(png|jpe?g|webp|gif|avif)$/i.test(item.image||''))issues.push('unsafe_image_path');else paths.push(`data/${date}/${item.image}`);}
 const audioPaths=['narration.json','narration.txt','narration.m4a'].map(x=>`data/${date}/${x}`);paths.push(...audioPaths,'scripts/briefing-audio.js','styles/briefing-audio.css');
 let cursor=0;await Promise.all(Array.from({length:4},async()=>{while(cursor<paths.length)await get(paths[cursor++]);}));
 const uncertain=results.filter(x=>x.status!==200&&x.status!==404);
 if(uncertain.length)return {date,status:'check_failed',ok:false,repair:'review_connectivity',verified_at:new Date().toISOString(),issues:['network_unverified'],results};
 for(const path of [`data/${date}/cover.png`,...items.map(x=>`data/${date}/${x.image}`)])if(buffers.has(path)&&!imageType(buffers.get(path)))issues.push('image_file:'+path);
 try{const index=JSON.parse(buffers.get('data/news-index.json'));if(index.latest_edition_id!==date||!index.editions?.some(x=>x.edition_id===date))issues.push('index_not_current');}catch{issues.push('index_unavailable');}
 for(const path of ['index.html','news.html',`data/${date}/output.html`])if(!buffers.get(path)?.toString().includes('scripts/briefing-audio.js'))issues.push('player_not_connected');
 const rendered=stripHtml(buffers.get(`data/${date}/output.html`)?.toString()||'');
 const plain=value=>String(value).replace(/\s+/g,' ').trim();
 for(const [key,value]of Object.entries({intro:content.intro_text,trend:content.trend}))if(!rendered.includes(plain(value)))issues.push('output_text_mismatch:'+key);
 for(const [i,item]of items.entries())for(const key of ['title','body','janet_take'])if(!rendered.includes(plain(item[key])))issues.push('output_text_mismatch:'+i+':'+key);
 let narration;
 try{narration=JSON.parse(buffers.get(audioPaths[0]));const expected=buildNarration(content);if(narration.date!==date||narration.content_sha256!==contentHash(content))issues.push('audio_stale');if(narration.item_count!==17||!Array.isArray(narration.chapters)||narration.chapters.length!==20||!narration.chapters.every((x,i)=>x?.text===expected.segments[i].text&&x?.id===expected.segments[i].id&&x?.title===expected.segments[i].title))issues.push('audio_incomplete');if(hash(buffers.get(audioPaths[2])||'')!==narration.audio_sha256)issues.push('audio_hash');if(buffers.get(audioPaths[1])?.toString()!==expected.segments.map(x=>x.text).join('\n\n')+'\n')issues.push('transcript_mismatch');}catch{issues.push('audio_unavailable');}
 if(narration){let end=0;for(const chapter of Array.isArray(narration.chapters)?narration.chapters:[]){if(!chapter||!Number.isFinite(chapter.start)||!Number.isFinite(chapter.duration)||chapter.duration<=0||Math.abs(chapter.start-end)>.03){issues.push('audio_timing');continue;}end=chapter.start+chapter.duration;}if(!Number.isFinite(narration.duration)||narration.duration<300||Math.abs(end-narration.duration)>1)issues.push('audio_duration');const audio=buffers.get(audioPaths[2]);if(!audio||audio.length<100000||audio.toString('ascii',4,8)!=='ftyp')issues.push('audio_file');}
 const failures=results.filter(x=>x.status!==200);const audioOnly=failures.every(x=>audioPaths.includes(x.path))&&issues.every(x=>/audio_|transcript_/.test(x));
 const ok=!issues.length&&!failures.length;
 return {date,status:ok?'published':audioOnly?'audio_incomplete':'deployment_incomplete',ok,repair:ok?'none':audioOnly?'audio_only':'review_deployment',verified_at:new Date().toISOString(),content_sha256:contentHash(content),duration:narration?.duration,audio_sha256:typeof narration?.audio_sha256==='string'?narration.audio_sha256:undefined,item_count:17,issues:[...new Set(issues)],results};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const date=process.argv.slice(2).find(x=>/^\d{4}-\d\d-\d\d$/.test(x))||dueBriefingDate(),r=await inspectLive({date});const out=new URL(`../runs/${date}/live-verification.json`,import.meta.url);fs.mkdirSync(new URL('./',out),{recursive:true});fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1;
}
