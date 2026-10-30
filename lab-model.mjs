import {rangeDamage,firingPattern,deterministicTime,shotOutcomes,expectedTime,expectedTriggerCount} from './weapon-engine.mjs';
import {expectedKillsPerMagazine,reliability,accuracyForTime} from './combat.mjs';
export const METRICS={damage:{label:'Dmg',unit:''},bodyShots:{label:'bSTK',unit:''},headShots:{label:'hSTK',unit:''},bttk:{label:'bTTK',unit:'s'},httk:{label:'hTTK',unit:'s'},ettk:{label:'eTTK',unit:'s'},vttk:{label:'vTTK',unit:'s'},expectedShots:{label:'Expected STK',unit:''},killsPerMag:{label:'Kills / mag',unit:''},dps:{label:'DPS',unit:''}};
export const fmt=(v,digits=2)=>v===Infinity?'∞':v===null||v===undefined||!Number.isFinite(v)?'—':Number(v.toFixed(digits)).toString();
export const precise=v=>Number.isFinite(v)?v.toFixed(10):fmt(v);
export const escapeHtml=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateWeapon(w){
 const errors=[];
 for(const [key,label,min,max] of [['baseDamage','Base damage',0.01,10000],['headDamage','Headshot damage',0,40000],['rps','RPS',0.01,1000],['magazine','Magazine size',1,500],['reload','Reload time',0.001,120],['swap','Swap time',0,120],['runSpeed','Run speed',0,300],['pellets','Pellets',1,32]]) if(!Number.isFinite(w[key])||w[key]<min||w[key]>max)errors.push(`${label} must be between ${min} and ${max}.`);
 if(!['bullet','shotgun','projectile','explosive'].includes(w.kind))errors.push('Select a supported weapon model.');
 if(!Number.isInteger(w.magazine))errors.push('Magazine size must be a whole number.');
 if(!Number.isInteger(w.pellets))errors.push('Pellet count must be a whole number.');
 if(!w.range||!Number.isFinite(w.range.cliff)||w.range.cliff<0||!Number.isFinite(w.range.plateau)||w.range.plateau<=w.range.cliff||w.range.plateau>5000)errors.push('Plateau must be greater than the cliff, within 5,000m.');
 if(!Number.isFinite(w.range?.endDamage)||w.range.endDamage<0||w.range.endDamage>10000)errors.push('End damage must be between 0 and 10,000.');
 if(w.projectileLimit!==null && (!Number.isFinite(w.projectileLimit)||w.projectileLimit<=0||w.projectileLimit>5000))errors.push('Projectile limit must be blank or between 0 and 5,000m.');
 if(!w.name?.trim())errors.push('Give the weapon a name.');
 return errors;
}
export function editablePreset(source){
 const w=structuredClone(source);
 w.headDamage=source.headDamage??source.baseDamage;w.pellets=source.pellets||1;w.projectileLimit=source.projectileLimit??null;
 w.range=structuredClone(source.range||{cliff:0,plateau:source.blast?.radius||250,endDamage:source.blast?.endDamage??source.baseDamage});
 if(source.kind==='explosive')w.baseDamage=source.blast.baseDamage;
 w.swap=source.swap??0;w.runSpeed=source.runSpeed??100;w.crouchRecoil=source.crouchRecoil??(source.slug==='ar-rifle'?80:null);w.zoom=source.zoom??(source.slug==='ar-rifle'?2:null);w.ammo=source.ammo??(source.slug==='ar-rifle'?'Rifle Ammo':'');
 return w;
}
export function multiplier(w){return w.headDamage===null?1:w.headDamage/w.baseDamage;}
export function outcomesFor(w,aim){const m=multiplier(w);return shotOutcomes(aim.accuracy,aim.headshot,m,w.kind==='shotgun'?w.pellets:1);}
export function damageAt(w,d,scenario='published'){
 if(w.kind==='explosive')return rangeDamage({baseDamage:w.blast?.baseDamage??w.baseDamage,range:w.range},d,{rangeModel:scenario});
 return rangeDamage(w,d,{rangeModel:scenario});
}
function options(aim){return {accuracy:aim.accuracy,headshot:aim.headshot,rangeModel:aim.rangeModel||'published',pattern:aim.pattern||'standard',burstSize:aim.burstSize,burstGap:aim.burstGap};}
export function metricValue(w,d,key,aim){
 const damage=damageAt(w,d,aim.rangeModel);if(key==='damage')return damage;
 if(damage===null||damage<=0||w.kind==='explosive')return null;
 const h=multiplier(w),pellets=w.kind==='shotgun'?w.pellets:1;
 if(key==='bodyShots')return Math.ceil(375/damage-1e-10);
 if(key==='headShots'&&h===0)return Infinity;
 if(key==='httk'&&h===0)return Infinity;
 if(key==='headShots')return Math.ceil(375/(damage*h)-1e-10);
 const firing=firingPattern(w,{...options(aim),reloads:aim.reloads});
 if(key==='bttk'||key==='httk')return deterministicTime(Math.ceil(375/(damage*(key==='httk'?h:1))-1e-10),firing);
 if(key==='dps')return firing.error?null:damage*firing.period/firing.gaps.reduce((a,b)=>a+b,0);
 const outcomes=outcomesFor(w,{...aim,accuracy:key==='ettk'?1:aim.accuracy});if(!outcomes)return null;
 const unit=damage/pellets;
 if(key==='expectedShots')return expectedTriggerCount(375,unit,outcomes);
 if(key==='killsPerMag'){
  if(Math.ceil(375/unit)*w.magazine*outcomes.length>3e6)return null;
  return expectedKillsPerMagazine(damage,aim.accuracy,aim.headshot,w.magazine,375,{multiplier:h,pellets});
 }
 return expectedTime(375,unit,outcomes,firing);
}
export function rowAt(w,d,aim){return {distance:d,...Object.fromEntries(Object.keys(METRICS).map(k=>[k,metricValue(w,d,k,aim)]))};}
export function engagementAt(w,d,time,aim){
 if(w.kind==='explosive')return {reason:'Blast-distance damage only. Projectile, detonation and lock-on mechanics are not modelled as rifle TTK.'};
 const damage=damageAt(w,d,aim.rangeModel);if(damage===null||damage<=0)return {reason:'No supported damage prediction at this distance (check the projectile limit).'};
 const h=multiplier(w),pellets=w.kind==='shotgun'?w.pellets:1,outcomes=outcomesFor(w,aim);
 if(!outcomes)return {reason:'Deterministic metrics are available. Probabilistic metrics require a headshot multiplier of 1, 2, 3 or 4.'};
 const expected=metricValue(w,d,'expectedShots',aim),units=Math.ceil(375/(damage/pellets));
 const safe=units*Math.min(20000,Math.max(w.magazine,Math.ceil(Number.isFinite(expected)?expected*12:20000)))*outcomes.length<8e6;
 const timing={rps:w.rps,magazine:w.magazine,reload:w.reload,reloads:aim.reloads,multiplier:h,pellets};
 const distribution=aim.pattern==='burst'||!safe?{median:null,p90:null,withinTime:null,oneMagazine:null}:reliability(damage,aim.accuracy,aim.headshot,time,timing);
 const noReload={...aim,reloads:false};
 const fasterA=metricValue(w,d,'vttk',{...noReload,accuracy:Math.min(1,aim.accuracy+.05)}),fasterH=metricValue(w,d,'vttk',{...noReload,headshot:Math.min(1,aim.headshot+.05)}),mean=metricValue(w,d,'vttk',noReload);
 return {...distribution,expectedShots:expected,killsPerMag:metricValue(w,d,'killsPerMag',aim),requiredAccuracy:aim.pattern==='burst'?null:accuracyForTime(damage,aim.headshot,time,w.rps,{multiplier:h,pellets}),accuracyGain:Number.isFinite(mean)&&Number.isFinite(fasterA)?mean-fasterA:null,headshotGain:Number.isFinite(mean)&&Number.isFinite(fasterH)?mean-fasterH:null,limited:!safe||aim.pattern==='burst'};
}
export function sampleDistances({maxDistance=250,interval=25,count=8,even=false,endpoint=true,start=0}){
 if(even)return Array.from({length:count},(_,i)=>start+(maxDistance-start)*i/(endpoint?count-1:count));
 const out=Array.from({length:endpoint?count-1:count},(_,i)=>start+i*interval).filter(d=>d<=maxDistance);if(endpoint)out.push(maxDistance);return [...new Set(out)].sort((a,b)=>a-b);
}
export function graphDistances(w,max,start=0){
 const out=new Set([start,max,w.range?.cliff,w.range?.plateau,w.projectileLimit].filter(d=>Number.isFinite(d)&&d>=start&&d<=max));
 const step=Math.max(1,(max-start)/1600);for(let d=start;d<max;d+=step)out.add(d);
 if(w.kind!=='explosive'&&w.range && w.baseDamage!==w.range.endDamage){
  for(const factor of [1,multiplier(w)])for(let n=1;n<=Math.min(512,Math.ceil(375/Math.max(.01,w.range.endDamage*factor)));n++){
   const dmg=375/(n*factor),t=(dmg-w.baseDamage)/(w.range.endDamage-w.baseDamage),d=w.range.cliff+t*(w.range.plateau-w.range.cliff);
   if(t>0&&t<1&&d>=start&&d<=max){out.add(d);out.add(Math.min(max,d+1e-5));}
  }
 }
 return [...out].sort((a,b)=>a-b);
}
export function csvCell(value){const string=String(value??'');return '"'+(typeof value==='string'&&/^[=+\-@\t\r]/.test(string)?"'"+string:string).replaceAll('"','""')+'"';}
export function exportCsv(series,aim,settings,engagement){
 const rows=[['record_type','weapon','field','distance_m','value','unit']];
 for(const {weapon,rows:data} of series){
  const config={sourceUrl:weapon.sourceUrl||'Custom user scenario',name:weapon.name,kind:weapon.kind,baseDamage:weapon.baseDamage,headDamage:weapon.headDamage,endDamage:weapon.range?.endDamage,cliff:weapon.range?.cliff,plateau:weapon.range?.plateau,magazine:weapon.magazine,rps:weapon.rps,reload:weapon.reload,swap:weapon.swap,runSpeed:weapon.runSpeed,pellets:weapon.pellets,projectileLimit:weapon.projectileLimit,ammo:weapon.ammo,zoom:weapon.zoom,crouchRecoil:weapon.crouchRecoil,fireModes:(weapon.fireModes||[]).join(' / '),...aim,...settings};
  for(const [key,value] of Object.entries(config))rows.push(['configuration',weapon.name,key,'',value,'']);
  for(const row of data)for(const [key,m] of Object.entries(METRICS))rows.push(['range',weapon.name,key,precise(row.distance),precise(row[key]),m.unit]);
  for(const [key,value] of Object.entries(engagement?.[weapon.slug]||{}))rows.push(['engagement',weapon.name,key,settings.engagementDistance,typeof value==='number'?precise(value):value,['withinTime','oneMagazine','requiredAccuracy'].includes(key)?'fraction':['median','p90','accuracyGain','headshotGain'].includes(key)?'s':'']);
 }
 return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
