import http from 'node:http';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {arStats,nextMidnight} from './stats.mjs';
const root = fileURLToPath(new URL('../',import.meta.url));
const catalog=JSON.parse(await readFile(path.join(root,'data/weapons.json'),'utf8'));
const weaponIds=new Set(catalog.map(w=>w.id));
const folder = path.join(root,'.data');
await mkdir(folder,{recursive:true});
async function load(name) {try {return JSON.parse(await readFile(path.join(folder,name),'utf8'));} catch(e) {if(e.code === 'ENOENT') return null; throw e;}}
async function save(name,value) {const file=path.join(folder,name); await writeFile(file+'.tmp',JSON.stringify(value)); await rename(file+'.tmp',file);}
let baseline=await load('baseline.json'), progress=await load('progress.json'), running=false,error=null;
let last=0, cooldown=0, pumping=false;
const jobs=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function request(endpoint, interactive=false) {
  return new Promise((resolve,reject)=>{
    const job={endpoint,interactive,resolve,reject};
    if(interactive) {
      const index=jobs.findIndex(j=>!j.interactive);
      jobs.splice(index<0?jobs.length:index,0,job);
    } else jobs.push(job);
    pump();
  });
}
async function pump() {
  if(pumping) return;
  pumping=true;
  while(jobs.length) {
    // Wait before selecting the next job so new interactive work can take priority.
    await pause(Math.max(0,last+5000-Date.now(),cooldown-Date.now()));
    const job=jobs.shift();
    try {
      last=Date.now();
      const response=await fetch('https://wbapi.wbpjs.com'+job.endpoint,{signal:AbortSignal.timeout(15000)});
      if(response.status===429) {
        const raw=response.headers.get('retry-after');
        const delay=Number(raw)*1000 || Date.parse(raw)-Date.now() || 60000;
        cooldown=Date.now()+Math.max(60000,delay);
        throw new Error(`WBAPI rate limit reached. Please try again in ${Math.ceil((cooldown-Date.now())/1000)} seconds.`);
      }
      if(!response.ok) throw new Error(`WBAPI HTTP ${response.status}. Please try again.`);
      job.resolve(await response.json());
    } catch(e) {job.reject(e.name==='TimeoutError'?new Error('WBAPI timed out. Please try again.'):e);}
  }
  pumping=false;
}
const rankings=['xp','killsElo','gamesElo','timeAlive'];
async function refresh() {
  if(running) return;
  running=true; error=null;
  const deadline=Date.now()+Number(process.env.WB_COLLECTION_BUDGET_MS||Infinity);
  const checkBudget=()=>{if(Date.now()>=deadline) throw new Error("Collection checkpoint saved; continuing on the next scheduled run.");};
  try {
    progress ||= {startedAt:new Date().toISOString(),metric:0,offset:0,uids:[],index:0,sum:0,contributors:0};
    const seen=new Set(progress.uids);
    while(progress.metric<rankings.length) {
      checkBudget();
      const rows=await request(`/players/ranking/${rankings[progress.metric]}?limit=100&offset=${progress.offset}`);
      if(!Array.isArray(rows)) throw new Error('Unexpected ranking response');
      for(const row of rows) {
        if(typeof row.uid!=='string' || !row.uid) throw new Error('Ranking contains an invalid UID');
        if(!seen.has(row.uid)) {seen.add(row.uid);progress.uids.push(row.uid);}
      }
      if(rows.length<100) {progress.metric++;progress.offset=0;} else progress.offset+=100;
      await save('progress.json',progress);
    }
    while(progress.index<progress.uids.length) {
      checkBudget();
      const player=await request('/players/getPlayer?uid='+encodeURIComponent(progress.uids[progress.index]));
      const stats=arStats(player);
      progress.weaponTotals ||= {};
      progress.multiWeaponProfiles=(progress.multiWeaponProfiles||0)+1;
      for(const weapon of catalog) {
        const row=arStats(player,weapon.id);
        const total=progress.weaponTotals[weapon.id] ||= {sum:0,contributors:0};
        if(row.accuracy!==null) {total.sum+=row.accuracy;total.contributors++;}
      }
      if(stats.accuracy!==null) {progress.sum+=stats.accuracy;progress.contributors++;}
      progress.index++; await save('progress.json',progress);
    }
    if(!progress.contributors) throw new Error('No eligible AR accuracy observations; previous baseline retained');
    const result={accuracy:progress.sum/progress.contributors,contributors:progress.contributors,players:progress.uids.length,startedAt:progress.startedAt,completedAt:new Date().toISOString()};
    result.weapons=Object.fromEntries(Object.entries(progress.weaponTotals||{}).filter(([,v])=>v.contributors>0).map(([id,v])=>[id,{accuracy:v.sum/v.contributors,contributors:v.contributors,players:progress.multiWeaponProfiles,startedAt:progress.startedAt,completedAt:result.completedAt}]));
    await save('baseline.json',result); baseline=result;
    await save('progress.json',null);progress=null;
  } catch(e) {error=e.message; console.error('Refresh paused:',error); if(process.env.WB_DISABLE_SCHEDULER!=='1' && process.env.WB_COLLECT_ONLY!=='1') retryTimer=setTimeout(refresh,5*60*1000);} finally {running=false;}
}
// Every UTC midnight starts a refresh or continues the existing census. Never overlap runs.
let timer, retryTimer;
function schedule() {timer=setTimeout(()=>{refresh();schedule();},nextMidnight()-Date.now());}
schedule();
if(process.env.WB_COLLECT_ONLY==='1') {
 clearTimeout(timer);
 const stopAt=Date.now()+Number(process.env.WB_COLLECTION_BUDGET_MS||17400000);
 if(progress || !baseline || baseline.completedAt.slice(0,10)!==new Date().toISOString().slice(0,10)) {
   while(Date.now()<stopAt) {
     process.env.WB_COLLECTION_BUDGET_MS=String(stopAt-Date.now());
     await refresh();
     if(!progress || Date.now()>=stopAt) break;
     await pause(Math.min(60000,stopAt-Date.now()));
   }
 }
}
else if(process.env.WB_DISABLE_SCHEDULER==='1') clearTimeout(timer);
else if(progress || !baseline || baseline.completedAt.slice(0,10)!==new Date().toISOString().slice(0,10)) refresh();
const publicFiles=new Set(['weapon-engine.mjs','weapon-page.mjs','profile-stats.mjs',...catalog.map(w=>'weapons/'+w.slug+'.html'),'ar-page.css','theme.css','cursor.mjs','favicon.ico','assets/favicon-32.png','assets/favicon-64.png','assets/war-brokers-analytics-logo.png','combat.mjs','index.html','players/index.html','weapons/index.html','weapons/ar-rifle.html','leaderboards/index.html','information/index.html']);
const server=http.createServer(async(req,res)=>{
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  try {
    const url=new URL(req.url,'http://localhost');
    if(req.method!=='GET' && req.method!=='HEAD') return json(405,{error:'GET required'});
    if(url.pathname==='/api/baseline') {
      const id=url.searchParams.get('weapon')||'p61';
      if(!weaponIds.has(id)) return json(400,{error:'Unknown weapon'});
      const selected=baseline?.weapons?.[id] || (id==='p61'?baseline:null);
      return json(200,{baseline:selected,running,error,progress:progress?{playersDiscovered:progress.uids.length,playersFetched:progress.index}:null});
    }
    if(url.pathname==='/api/player') {
      const uid=url.searchParams.get('uid');
      const id=url.searchParams.get('weapon')||'p61';
      if(!weaponIds.has(id)) return json(400,{error:'Unknown weapon'});
      if(!uid || uid.length>128 || /[\s,]/.test(uid)) return json(400,{error:'Invalid UID'});
      try {return json(200,arStats(await request('/players/getPlayer?uid='+encodeURIComponent(uid),true),id));} catch(e) {return json(502,{error:e.message});}
    }
    let file=decodeURIComponent(url.pathname).slice(1);if(!file || file.endsWith('/')) file+='index.html';
    if(!publicFiles.has(file)) return json(404,{error:'Not found'});
    const body=await readFile(path.join(root,file));
    res.writeHead(200,{'Cache-Control':'no-cache','Content-Length':body.length,'Content-Type':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.ico')?'image/x-icon':file.endsWith('.png')?'image/png':file.endsWith('.mjs')?'text/javascript; charset=utf-8':'text/html; charset=utf-8'});res.end(req.method==='HEAD'?undefined:body);
  } catch(e) {if(!res.headersSent) json(500,{error:'Request failed'}); else res.end();}
});
if(process.env.WB_COLLECT_ONLY!=='1') server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('Open http://localhost:4173/weapons/ar-rifle.html'));
