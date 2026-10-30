import {fmt,precise,escapeHtml,METRICS} from './lab-model.mjs';
export const COLOURS=['#efbb43','#db303c','#ed8934'];
export const POINT_COLOURS=['#db303c','#efbb43','#eeeae4'];
export function smoothPath(points){
 if(!points.length)return '';
 const slopes=points.slice(1).map((p,i)=>(p[1]-points[i][1])/(p[0]-points[i][0]));
 const m=points.map((p,i)=>{if(i===0)return slopes[0]||0;if(i===points.length-1)return slopes[i-1]||0;const a=slopes[i-1],b=slopes[i];if(a*b<=0)return 0;const before=p[0]-points[i-1][0],after=points[i+1][0]-p[0],w1=2*after+before,w2=after+2*before;return (w1+w2)/(w1/a+w2/b);});
 for(let i=0;i<slopes.length;i++){if(!slopes[i]){m[i]=m[i+1]=0;continue;}const a=m[i]/slopes[i],b=m[i+1]/slopes[i],len=Math.hypot(a,b);if(len>3){m[i]=3*a*slopes[i]/len;m[i+1]=3*b*slopes[i]/len;}}
 let d=`M ${points[0].join(' ')}`;for(let i=0;i<points.length-1;i++){const [x,y]=points[i],[nx,ny]=points[i+1],dx=(nx-x)/3;d+=` C ${x+dx} ${y+dx*m[i]} ${nx-dx} ${ny-dx*m[i+1]} ${nx} ${ny}`;}return d;
}
export function drawGraph(container,series,key,settings){
 const width=1100,L=78,R=30,T=62,plotH=300,plotW=width-L-R;
 const end=settings.start+(Math.floor((settings.maxDistance-settings.start)/settings.interval)+1)*settings.interval;
 const metric=METRICS[key],values=series.flatMap(s=>s.points.map(p=>p.value)).filter(Number.isFinite),max=Math.max(1,...values),raw=max/5,base=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].map(n=>n*base).find(n=>n>=raw),ceiling=Math.ceil(max/step)*step;
 const x=d=>L+(d-settings.start)/(end-settings.start)*plotW,y=v=>T+plotH-v/ceiling*plotH;
 let out=`<rect width="${width}" height="500" fill="#292929"/><rect x="${L}" y="${T}" width="${plotW}" height="${plotH}" fill="#292929" stroke="#777"/>`;
 series.forEach((s,i)=>{const xx=L+i*plotW/series.length;out+=`<path d="M${xx} 25h24" stroke="${COLOURS[i]}" stroke-width="3"/><circle cx="${xx+12}" cy="25" r="4" fill="#292929" stroke="${POINT_COLOURS[i]}" stroke-width="2"/><text x="${xx+33}" y="30" fill="${COLOURS[i]}" font-size="13"><title>${escapeHtml(s.weapon.name)}</title>${escapeHtml(s.weapon.name.length>30?s.weapon.name.slice(0,28)+'…':s.weapon.name)}</text>`;});
 for(let v=0;v<=ceiling+step/100;v+=step)out+=`<path d="M${L} ${y(v)}H${width-R}" stroke="#45413d"/><text x="${L-12}" y="${y(v)+4}" fill="#efbb43" text-anchor="end" font-size="12">${fmt(v)}</text>`;
 const ticks=Math.round((end-settings.start)/settings.interval);
 for(let i=0;i<=ticks;i++){const d=settings.start+i*settings.interval;out+=`<path d="M${x(d)} ${T}V${T+plotH}" stroke="#363330"/><text data-distance-tick x="${x(d)}" y="${T+plotH+22}" fill="#efbb43" text-anchor="middle" font-size="11">${fmt(d)}m</text>`;}
 if(settings.boundaries)series.forEach((s,i)=>{
  for(const [d,label,path] of [[s.weapon.range?.cliff,'Cliff','M-22 -12H12V-6L3 -2L-1 18'],[s.weapon.range?.plateau,'Plateau','M-20 4L-15 -3H15L20 4']])if(Number.isFinite(d)&&d>=settings.start&&d<=settings.maxDistance)out+=`<path d="M${x(d)} ${T}V${T+plotH}" stroke="${COLOURS[i]}" stroke-opacity=".6" stroke-dasharray="5 4"/><g transform="translate(${x(d)} ${T+plotH*.5}) scale(.65)"><title>${escapeHtml(s.weapon.name)} ${label}: ${precise(d)}m</title><rect x="-30" y="-22" width="62" height="48" fill="#292929"/><path d="${path}" fill="none" stroke="${COLOURS[i]}" stroke-width="2"/></g>`;
 });
 series.forEach((s,i)=>{
  let segment=[];const flush=()=>{if(segment.length)out+=`<path d="${['ettk','vttk'].includes(key)?smoothPath(segment):segment.map((p,j)=>(j?'L':'M')+p.join(' ')).join(' ')}" fill="none" stroke="${COLOURS[i]}" stroke-width="2"/>`;segment=[];};
  for(const p of s.points){if(Number.isFinite(p.value))segment.push([x(p.distance),y(p.value)]);else flush();}flush();
  if(!s.points.some(p=>Number.isFinite(p.value)))out+=`<text x="${L+15}" y="${T+22+i*20}" fill="${COLOURS[i]}" font-size="12">${escapeHtml(s.weapon.name)}: ${s.points.some(p=>p.value===Infinity)?'∞':'unavailable'} for this metric</text>`;
 });
 series.forEach((s,i)=>{for(const row of s.rows)if(Number.isFinite(row[key]))out+=`<circle cx="${x(row.distance)}" cy="${y(row[key])}" r="4" fill="#292929" stroke="${POINT_COLOURS[i]}" stroke-width="2"><title>${escapeHtml(s.weapon.name)} · ${precise(row.distance)}m · ${metric.label}: ${precise(row[key])}${metric.unit}</title></circle>`;});
 series.forEach((s,i)=>{for(const row of s.rows){if(!Number.isFinite(row[key])||!settings.labels.length)continue;out+='<g data-point-label>';settings.labels.forEach((k,j)=>{const m=METRICS[k];out+=`<text x="${x(row.distance)}" y="${y(row[key])+18+j*16}" text-anchor="middle" font-size="11" fill="${COLOURS[i]}" stroke="#292929" stroke-width="3" paint-order="stroke"><title>${escapeHtml(s.weapon.name)} · ${k==='distance'?'Distance':m.label}: ${precise(row[k])}${m?.unit||''}</title>${k==='distance'?fmt(row.distance)+'m':m.label+': '+fmt(row[k])+m.unit}</text>`;});out+='</g>';}});
 out+=`<text x="20" y="${T+plotH/2}" transform="rotate(-90 20 ${T+plotH/2})" text-anchor="middle" font-size="13" fill="#efbb43">${metric.label}${metric.unit?' ('+metric.unit+')':''}</text><text data-distance-title x="${L+plotW/2}" y="${T+plotH+48}" text-anchor="middle" font-size="13" fill="#efbb43">${settings.blast?'Distance from explosion':'Distance'} (m)</text>`;
 container.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" id="lab-chart" viewBox="0 0 ${width} 440" role="img" aria-label="${escapeHtml(metric.label)} comparison by distance" style="width:100%;font-family:Arial,sans-serif">${out}</svg>`;
 const svg=container.firstElementChild,obstacles=[...svg.querySelectorAll('text:not([data-distance-tick]):not([data-distance-title])')].filter(e=>!e.closest('[data-point-label]')).map(e=>e.getBBox());let bottom=T+plotH;
 for(const group of svg.querySelectorAll('[data-point-label]')){
  const b=group.getBBox(),dx=Math.max(L+8-b.x,Math.min(0,width-R-8-b.x-b.width));let dy=0,box={x:b.x+dx,y:b.y,width:b.width,height:b.height};
  while(obstacles.some(o=>box.x<o.x+o.width+8&&box.x+box.width+8>o.x&&box.y<o.y+o.height+8&&box.y+box.height+8>o.y)){dy+=16;box.y=b.y+dy;}
  group.setAttribute('transform',`translate(${dx} ${dy})`);obstacles.push(box);bottom=Math.max(bottom,box.y+box.height);
 }
 const tickY=bottom+24;svg.querySelectorAll('[data-distance-tick]').forEach(e=>e.setAttribute('y',tickY));svg.querySelector('[data-distance-title]').setAttribute('y',tickY+26);svg.setAttribute('viewBox',`0 0 ${width} ${tickY+45}`);
 return svg;
}
