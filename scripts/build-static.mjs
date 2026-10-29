import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),dest=path.join(root,'_site');
execFileSync('python3',[path.join(root,'scripts/build-weapons.py')],{stdio:'inherit'});
await mkdir(dest,{recursive:true});
for(const name of ['theme.css','ar-page.css','cursor.mjs','weapon-page.mjs','combat.mjs','weapon-engine.mjs','profile-stats.mjs','favicon.ico']) await copyFile(path.join(root,name),path.join(dest,name));
for(const folder of ['','weapons','players','leaderboards','information']) {
 await mkdir(path.join(dest,folder),{recursive:true});
 for(const name of await readdir(path.join(root,folder))) {
  if(!name.endsWith('.html')) continue;
  const relative=folder?'../':'';
  let html=await readFile(path.join(root,folder,name),'utf8');
  html=html.replace('</head>','<meta name="wb-hosting" content="static"></head>').replaceAll('href="/favicon.ico','href="'+relative+'favicon.ico').replaceAll('href="/assets/','href="'+relative+'assets/');
  await writeFile(path.join(dest,folder,name),html);
 }
}
await mkdir(path.join(dest,'assets'),{recursive:true});
for(const name of ['war-brokers-analytics-logo.png','favicon-32.png','favicon-64.png']) await copyFile(path.join(root,'assets',name),path.join(dest,'assets',name));
let baseline={weapons:{}};
try {baseline=JSON.parse(await readFile(path.join(root,'assets/daily-baseline.json'),'utf8'));} catch(e) {if(e.code!=='ENOENT') throw e;}
await writeFile(path.join(dest,'assets/daily-baseline.json'),JSON.stringify(baseline));
await writeFile(path.join(dest,'.nojekyll'),'');
console.log('Static site packaged in _site/; no private collector state included.');
