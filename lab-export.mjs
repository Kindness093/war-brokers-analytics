import {escapeHtml,fmt,precise,METRICS,exportCsv} from './lab-model.mjs';
import {COLOURS} from './lab-chart.mjs';
export function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export function csvDownload(state,name){download(new Blob([exportCsv(state.series,state.aim,state.settings,state.engagement)],{type:'text/csv;charset=utf-8'}),name+'.csv');}
function line(text,x,y,size=13,fill='#eeeae4',anchor='start'){return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${escapeHtml(text)}</text>`;}
function wrap(text,limit=125){const result=[];let current='';for(const word of String(text).split(/\s+/)){if((current+' '+word).length>limit){result.push(current);current=word;}else current+=(current?' ':'')+word;}if(current)result.push(current);return result;}
export function reportSvg(state,chart){
 let y=45,body=line(state.title,32,y,26,'#efbb43');y+=30;
 body+=line(`Aim scenario: ${fmt(state.aim.accuracy*100)}% accuracy · ${fmt(state.aim.headshot*100)}% headshots · ${state.aim.reloads?'reload-inclusive':'uninterrupted'} timing`,32,y,13,'#c7bfb5');y+=25;
 body+=line(`Model: ${state.settings.blast?'blast distance only':state.aim.rangeModel==='base'?'base damage without falloff':'published or custom range curve'} · first shot at 0s`,32,y,12,'#c7bfb5');y+=28;
 state.series.forEach(({weapon:w},i)=>{
  body+=line(w.name,32,y,18,COLOURS[i]);y+=22;
  for(const text of wrap(`Base ${fmt(w.baseDamage)} · end ${fmt(w.range?.endDamage)} · cliff ${fmt(w.range?.cliff)}m · plateau ${fmt(w.range?.plateau)}m · head Dmg ${fmt(w.headDamage)} · ${w.magazine} rounds · ${fmt(w.rps)} RPS · reload ${fmt(w.reload)}s`,132)){body+=line(text,32,y,12);y+=18;}
  for(const text of wrap(`Model ${w.kind} · pellets ${w.pellets||1} · swap ${fmt(w.swap)}s · run speed ${fmt(w.runSpeed)}% · projectile limit ${w.projectileLimit===null||w.projectileLimit===undefined?'none':fmt(w.projectileLimit)+'m'} · ammo ${w.ammo||'not set'} · zoom ${fmt(w.zoom)}× · crouch recoil ${fmt(w.crouchRecoil)}% · fire modes ${(w.fireModes||[]).join(' / ')||'not set'}`,132)){body+=line(text,32,y,12);y+=18;}
 });
 const vb=chart.viewBox.baseVal,chartHeight=vb.height*1136/vb.width;
 body+=`<svg x="32" y="${y}" width="1136" height="${chartHeight}" viewBox="0 0 ${vb.width} ${vb.height}">${chart.innerHTML}</svg>`;y+=chartHeight+30;
 const columns=['distance',...Object.keys(METRICS)],cw=1136/columns.length;
 state.series.forEach(({weapon,rows},i)=>{
  body+=line(weapon.name+' · range outputs',32,y,17,COLOURS[i]);y+=25;
  body+=`<rect x="32" y="${y-16}" width="1136" height="25" fill="#352d25"/>`;
  columns.forEach((k,j)=>body+=line(k==='distance'?'Distance':METRICS[k].label,32+cw*(j+.5),y,10,'#efbb43','middle'));y+=26;
  rows.forEach((row,n)=>{
   if(n%2===0)body+=`<rect x="32" y="${y-16}" width="1136" height="25" fill="#292725"/>`;
   columns.forEach((k,j)=>body+=line(fmt(row[k])+(k==='distance'?'m':METRICS[k].unit),32+cw*(j+.5),y,11,'#eeeae4','middle'));y+=25;
  });y+=22;
  const entries=Object.entries(state.engagement[weapon.slug]||{});
  if(entries.length){body+=line(`Engagement at ${fmt(state.settings.engagementDistance)}m`,32,y,15,'#ed8934');y+=22;for(const [key,value]of entries){if(typeof value==='boolean')continue;const labels={withinTime:'Kill probability by target time',oneMagazine:'One-magazine kill probability',median:'Median TTK',p90:'90th-percentile TTK',expectedShots:'Expected STK',killsPerMag:'Expected kills per magazine',requiredAccuracy:'Accuracy for target mean TTK',accuracyGain:'TTK benefit from +5 accuracy points',headshotGain:'TTK benefit from +5 headshot points'};const percentage=['withinTime','oneMagazine','requiredAccuracy'].includes(key),seconds=['median','p90','accuracyGain','headshotGain'].includes(key);const text=`${labels[key]||key}: ${value===null?'Unavailable':typeof value==='number'?fmt(percentage?value*100:value)+(percentage?'%':seconds?'s':''):String(value)}`;for(const part of wrap(text,140)){body+=line(part,32,y,12);y+=18;}}y+=18;}
 });
 for(const note of state.notes)for(const part of wrap(note,145)){body+=line(part,32,y,11,'#b5afaa');y+=17;}
 body+=line('War Brokers Analytics · Custom scenarios are not official game statistics · Canadian English',32,y+15,11,'#b5afaa');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${Math.ceil(y+45)}" viewBox="0 0 1200 ${Math.ceil(y+45)}" font-family="Arial,Helvetica,sans-serif"><rect width="1200" height="100%" fill="#222120"/>${body}</svg>`;
}
export async function pngDownload(state,chart,name){
 const svg=reportSvg(state,chart),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
 try{
  const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Could not render image export.'));image.src=url;});
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const context=canvas.getContext('2d');if(!context)throw new Error('Image export is not available in this browser.');context.drawImage(image,0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Image export failed. Try exporting SVG instead.');download(blob,name+'.png');
 }finally{URL.revokeObjectURL(url);}
}
export function svgDownload(state,chart,name){download(new Blob([reportSvg(state,chart)],{type:'image/svg+xml;charset=utf-8'}),name+'.svg');}
