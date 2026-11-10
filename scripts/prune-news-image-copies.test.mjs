import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {unusedNewsImages,pruneCopies} from './prune-news-image-copies.mjs';

test('keeps cross-page, JSON and script references, as well as uncertain legacy media',()=>{
 const files=['live.png','cross.jpg','dynamic.webp','unused.png'].map(name=>({path:'data/2026-11-10/images/'+name,size:10}));
 files.push({path:'data/2026-04-29/images/old.png',size:10},{path:'assets/works/unmentioned.png',size:10},{path:'data/2026-11-10/narration.m4a',size:10});
 const result=unusedNewsImages(files,'{"image":"images/live.png"}<img src="../2026-11-10/images/cross.jpg"><script>const image="dynamic.webp"</script>',new Set(['2026-11-10']));
 assert.deepEqual(result.map(x=>x.path),['data/2026-11-10/images/unused.png']);
});
test('prunes only prepared copies and keeps repository originals and all referenced images',()=>{
 const temp=fs.mkdtempSync(join(tmpdir(),'janet-pages-'));
 try {
  assert.throws(()=>pruneCopies(temp));
  fs.mkdirSync(join(temp,'data/2026-11-10/images'),{recursive:true});
  for(const [p,text] of Object.entries({'index.html':'<img src="data/2026-11-10/images/keep.png">','mirror-plan.html':'janet-public-artifact','data/MANIFEST.json':'["2026-11-10"]','data/2026-11-10/content.json':'{"sections":{}}','data/2026-11-10/output.html':'edition','data/2026-11-10/images/keep.png':'keep','data/2026-11-10/images/orphan.png':'unused'}))fs.writeFileSync(join(temp,p),text);
  const r=pruneCopies(temp);assert.equal(r.removed_files,1);assert.equal(r.saved_bytes,6);
  assert(fs.existsSync(join(temp,'data/2026-11-10/images/keep.png')));
  assert(!fs.existsSync(join(temp,'data/2026-11-10/images/orphan.png')));
 } finally {fs.rmSync(temp,{recursive:true,force:true});fs.rmSync(temp+'.pruned-images.json',{force:true});}
});
