import fs from 'node:fs';
import {extname, resolve, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO = fileURLToPath(new URL('../', import.meta.url));
const textExtensions = new Set(['.html','.json','.jsonl','.js','.css','.txt','.xml','.svg','.webmanifest']);
export function unusedNewsImages(files, text, structuredEditions) {
  const haystack = text.toLowerCase();
  return files.filter(file => {
    const match = file.path.match(/^data\/(\d{4}-\d\d-\d\d(?:-v\d+)?)\/images\/([^/]+)$/);
    if (!match || !structuredEditions.has(match[1])) return false;
    const name = match[2];
    if (!/^[A-Za-z0-9_.-]+\.(png|jpe?g|webp|gif|avif)$/i.test(name)) return false;
    // A basename anywhere in public text is enough to keep a file, including
    // references from another edition, embedded CSS, JSON or a runtime script.
    return !haystack.includes(name.toLowerCase());
  });
}

export function pruneCopies(root) {
  root = resolve(root);
  if (root === resolve(REPO) || !fs.existsSync(resolve(root,'index.html')) ||
      !fs.readFileSync(resolve(root,'mirror-plan.html'),'utf8').includes('janet-public-artifact')) {
    throw Error('Only a prepared public artifact can be pruned; repository originals must stay intact.');
  }
  const files = [];
  function walk(dir) { for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const p = resolve(dir,entry.name);
    if(entry.isDirectory()) walk(p);
    else if(entry.isFile()) files.push({path:relative(root,p).split('\\').join('/'),size:fs.statSync(p).size});
  }}
  walk(root);
  const text = files.filter(x=>textExtensions.has(extname(x.path).toLowerCase()))
    .map(x=>fs.readFileSync(resolve(root,x.path),'utf8')).join('\n');
  const structured = new Set();
  for(const id of JSON.parse(fs.readFileSync(resolve(root,'data/MANIFEST.json'),'utf8'))) {
    try { const c=JSON.parse(fs.readFileSync(resolve(root,'data',id,'content.json'),'utf8'));
      if(c.sections && fs.existsSync(resolve(root,'data',id,'output.html'))) structured.add(id);
    } catch { /* Preserve all media in editions without a complete source record. */ }
  }
  const removed = unusedNewsImages(files,text,structured);
  for(const file of removed) fs.unlinkSync(resolve(root,file.path));
  const report={removed_files:removed.length,saved_bytes:removed.reduce((a,x)=>a+x.size,0),files:removed};
  fs.writeFileSync(root+'.pruned-images.json',JSON.stringify(report,null,2)+'\n');
  return report;
}
if(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report=pruneCopies(process.argv[2]||'_site');
  console.log(`pages_image_copies_pruned files=${report.removed_files} saved_bytes=${report.saved_bytes} originals=preserved`);
}
