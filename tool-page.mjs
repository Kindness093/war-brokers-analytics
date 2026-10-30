import {METRICS,fmt,precise,escapeHtml as esc,editablePreset,validateWeapon,rowAt,metricValue,engagementAt,sampleDistances,graphDistances,exportCsv} from './lab-model.mjs';
import {drawGraph,COLOURS} from './lab-chart.mjs';
import {csvDownload,pngDownload,svgDownload} from './lab-export.mjs';
const $=id=>document.getElementById(id),mode=document.body.dataset.tool;
let catalog=[],selected=[],custom=null,sourceSlug='ar-rifle',state=null,timer=0,rangeEdited=false,customFromLink=null;
const query=new URLSearchParams(location.search);
const number=id=>$(id).value.trim()===''?NaN:Number($(id).value);
const nullable=id=>$(id).value.trim()===''?null:Number($(id).value);
const fields=[['name','Name','text'],['kind','Damage model','kind'],['baseDamage','Base Dmg','number',.01,10000,.01],['headDamage','Headshot Dmg','number',0,40000,.01],['endDamage','End Dmg','number',0,10000,.01],['cliff','Cliff (m)','number',0,4999,.01],['plateau','Plateau (m)','number',.01,5000,.01],['magazine','Magazine size','number',1,500,1],['rps','Rounds per second','number',.01,1000,.001],['reload','Reload time (s)','number',.001,120,.001],['pellets','Pellets per trigger','number',1,32,1],['projectileLimit','Projectile limit (m; optional)','number',.01,5000,.01],['swap','Swap time (s)','number',0,120,.01],['runSpeed','Run speed (%)','number',0,300,.1],['ammo','Ammunition','text'],['zoom','Default zoom (×; optional)','number',0,100,.1],['crouchRecoil','Crouch recoil (%; optional)','number',0,100,.1],['fireModes','Fire modes (reference text)','text']];
function fieldHtml([key,label,type,min,max,step]){const id='edit-'+key;return `<div class="lab-field"><label for="${id}">${label}</label>${type==='kind'?`<select id="${id}"><option value="bullet">Bullet</option><option value="shotgun">Independent pellets</option><option value="projectile">Projectile (travel time excluded)</option><option value="explosive">Explosion (blast distance)</option></select>`:`<input id="${id}" type="${type}" ${type==='number'?`min="${min}" max="${max}" step="${step}"`:'maxlength="80"'} ${['projectileLimit','ammo','zoom','crouchRecoil'].includes(key)?'placeholder="Not set"':''}>`}</div>`;}
function fillEditor(w){
 custom=structuredClone(w);
 const values={...w,...w.range,fireModes:(w.fireModes||[]).join(' / ')};
 for(const [key]of fields)$('edit-'+key).value=values[key]??'';
 $('edit-kind').value=w.kind;
}
function readEditor(){
 const w={...custom,slug:'custom-weapon',custom:true,name:$('edit-name').value.trim().slice(0,80),kind:$('edit-kind').value,range:{cliff:number('edit-cliff'),plateau:number('edit-plateau'),endDamage:number('edit-endDamage')}};
 for(const key of ['baseDamage','headDamage','magazine','rps','reload','pellets','swap','runSpeed'])w[key]=number('edit-'+key);
 w.projectileLimit=nullable('edit-projectileLimit');w.zoom=nullable('edit-zoom');w.crouchRecoil=nullable('edit-crouchRecoil');w.ammo=$('edit-ammo').value;w.fireModes=$('edit-fireModes').value.split('/').map(s=>s.trim()).filter(Boolean);
 if(w.kind==='explosive')w.blast={baseDamage:w.baseDamage,radius:w.range.plateau,endDamage:w.range.endDamage};else delete w.blast;
 return w;
}
function weaponOptions(value){return (customFromLink?`<option value="custom-weapon" ${value==='custom-weapon'?'selected':''}>Custom: ${esc(customFromLink.name)}</option>`:'')+catalog.map(w=>`<option value="${w.slug}" ${value===w.slug?'selected':''}>${esc(w.name)}</option>`).join('');}
function renderSlots(){
 $('weapon-slots').innerHTML=selected.map((slug,i)=>`<div class="weapon-slot" style="--series-colour:${COLOURS[i]}"><label for="weapon-${i}">Weapon ${i+1}</label><select id="weapon-${i}" data-slot="${i}">${weaponOptions(slug)}</select><button type="button" data-remove="${i}" ${selected.length===1?'disabled':''} aria-label="Remove weapon ${i+1}">Remove</button></div>`).join('');
 $('add-weapon').disabled=selected.length>=3;
}
function presetFor(slug){return slug==='custom-weapon'?customFromLink:catalog.find(w=>w.slug===slug);}
function updateRange(weapons){if(!rangeEdited){const max=Math.max(...weapons.map(w=>w.kind==='explosive'?(w.blast?.radius||w.range.plateau):w.range.plateau));$('maxDistance').value=max;$('interval').value=max>1000?200:max>500?100:max>300?50:25;}}
function error(message){state=null;$('lab-errors').textContent=message;$('lab-errors').hidden=!message;for(const id of ['export-csv','export-png','export-svg'])$(id).disabled=true;if(message){$('chart-output').replaceChildren();$('range-output').replaceChildren();$('engagement-output').replaceChildren();}}
function checks(weapons){
 const errors=[];if(mode==='calculator')errors.push(...validateWeapon(weapons[0]));
 for(const [id,label,min,max]of [['accuracy','Accuracy',0,100],['headshot','Headshot frequency',0,100],['maxDistance','Graph endpoint',.01,5000],['interval','Range interval',.1,5000],['count','Sample count',2,20],['engagementDistance','Engagement distance',0,5000],['timeTarget','Time target',0,60]])if(!Number.isFinite(number(id))||number(id)<min||number(id)>max)errors.push(`${label} must be between ${min} and ${max}.`);
 if(Number.isFinite(number('maxDistance'))&&Number.isFinite(number('interval'))&&number('maxDistance')/number('interval')>200)errors.push('Choose a larger interval: at most 200 distance ticks can be displayed.');
 if(!Number.isInteger(number('count')))errors.push('Sample count must be a whole number.');
 if(new Set(weapons.map(w=>w.slug)).size!==weapons.length)errors.push('Choose different weapons for each slot.');
 if(weapons.some(w=>w.kind==='explosive')&&!weapons.every(w=>w.kind==='explosive'))errors.push('Blast distance and shooter distance are different axes. Compare launchers together, or compare non-explosive weapons together.');
 if($('pattern').value==='burst'&&(!Number.isInteger(number('burstSize'))||number('burstSize')<2||number('burstSize')>12||!Number.isFinite(number('burstGap'))||number('burstGap')<=0||number('burstGap')>120))errors.push('Custom burst timing needs 2–12 rounds and a positive last-shot-to-next-burst gap.');
 if(mode==='calculator')for(const [key,label,max]of [['zoom','Zoom',100],['crouchRecoil','Crouch recoil',100]]){const value=nullable('edit-'+key);if(value!==null&&(!Number.isFinite(value)||value<0||value>max))errors.push(`${label} must be blank or between 0 and ${max}.`);}
 return errors;
}
const numberSpan=(value,unit='')=>`<span title="${precise(value)}${unit}">${fmt(value)}${unit}</span>`;
function statPreview(w){
 const stats=[['Base Dmg',w.baseDamage,''],['Headshot Dmg',w.headDamage,''],['End Dmg',w.range.endDamage,''],['Cliff',w.range.cliff,'m'],['Plateau',w.range.plateau,'m'],['Magazine',w.magazine,''],['RPS',w.rps,''],['Reload',w.reload,'s'],['Swap',w.swap,'s'],['Run speed',w.runSpeed,'%'],['Dmg differential',w.baseDamage-w.range.endDamage,''],['Drop-off rate',(w.baseDamage-w.range.endDamage)/(w.range.plateau-w.range.cliff),' / m'],['Zoom',w.zoom,'×'],['Crouch recoil',w.crouchRecoil,'%']];
 if(w.kind==='shotgun')stats.push(['Pellets',w.pellets,'']);
 if(w.projectileLimit)stats.push(['Projectile limit',w.projectileLimit,'m']);
 $('preview-summary').innerHTML=`<h2>${esc(w.name)}</h2><p class="hint">Custom scenario based on ${esc(catalog.find(x=>x.slug===sourceSlug)?.name||'an imported scenario')}. Edits do not change the wiki reference pages.</p><div class="stats">${stats.map(([name,v,u])=>`<p><strong>${name}:</strong> ${numberSpan(v,u)}</p>`).join('')}<p><strong>Ammunition:</strong><span>${esc(w.ammo||'Not set')}</span></p><p><strong>Fire modes:</strong><span>${esc((w.fireModes||[]).join(' / ')||'Not set')}</span></p></div>`;
}
function rangeTable(series){
 return series.map((s,i)=>`<section class="series-table"><h3 style="color:${COLOURS[i]}">${esc(s.weapon.name)}</h3><div class="table-scroll"><table><thead><tr><th>Distance</th>${Object.values(METRICS).map(m=>`<th>${m.label}</th>`).join('')}</tr></thead><tbody>${s.rows.map(row=>`<tr><td>${numberSpan(row.distance,'m')}</td>${Object.entries(METRICS).map(([key,m])=>`<td>${numberSpan(row[key],m.unit)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`).join('');
}
function engagementTable(weapons,results,settings){
 const descriptions=[['withinTime',`Chance to kill within ${fmt(settings.timeTarget)}s`,'%'],['oneMagazine','Chance to kill with one magazine','%'],['median','Median TTK','s'],['p90','90th-percentile TTK','s'],['expectedShots','Expected shots to kill',''],['killsPerMag','Expected kills per magazine',''],['requiredAccuracy',`Accuracy for mean TTK ≤ ${fmt(settings.timeTarget)}s (without reloads)`,'%'],['accuracyGain','Mean TTK benefit: +5 points accuracy','s'],['headshotGain','Mean TTK benefit: +5 points headshots','s']];
 return `<div class="table-scroll"><table><thead><tr><th>Metric at ${fmt(settings.engagementDistance)}m</th>${weapons.map((w,i)=>`<th style="color:${COLOURS[i]}">${esc(w.name)}</th>`).join('')}</tr></thead><tbody>${descriptions.map(([key,label,unit])=>`<tr><td>${label}</td>${weapons.map(w=>{const v=results[w.slug][key];return `<td>${numberSpan(unit==='%'&&v!==null&&v!==undefined?v*100:v,unit)}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div>${weapons.map(w=>results[w.slug].reason?`<p class="hint">${esc(w.name)}: ${esc(results[w.slug].reason)}</p>`:results[w.slug].limited?`<p class="hint">${esc(w.name)}: percentile/time-target calculations are unavailable for custom bursts or scenarios beyond the computation limit. Other supported metrics remain available.</p>`:'').join('')}<p class="hint">A dash means unavailable or an impossible accuracy target. Kills count consecutive fresh targets and discard overkill. Aim benefits and inverse accuracy exclude reloads.</p>`;
}
function render(){
 try{
  const weapons=mode==='calculator'?[readEditor()]:selected.map(presetFor);
  const errors=checks(weapons);if(errors.length){error(errors.join(' '));return;}
  error('');const blast=weapons.every(w=>w.kind==='explosive');
  $('metric').querySelectorAll('option').forEach(option=>option.disabled=blast&&option.value!=='damage');if(blast)$('metric').value='damage';
  const aim={accuracy:number('accuracy')/100,headshot:number('headshot')/100,reloads:$('reloads').checked,rangeModel:$('rangeModel').value,pattern:$('pattern').value,burstSize:number('burstSize'),burstGap:number('burstGap')};
  const settings={maxDistance:number('maxDistance'),interval:number('interval'),count:number('count'),even:$('evenSpacing').checked,endpoint:$('includeEndpoint').checked,start:0,engagementDistance:number('engagementDistance'),timeTarget:number('timeTarget'),blast,boundaries:$('showBoundaries').checked,labels:[...document.querySelectorAll('#point-datasets input:checked')].map(el=>el.value)};
  const distances=sampleDistances(settings),metric=$('metric').value;
  const series=weapons.map(weapon=>({weapon,rows:distances.map(d=>rowAt(weapon,d,aim)),points:graphDistances(weapon,settings.maxDistance).map(distance=>({distance,value:metricValue(weapon,distance,metric,aim)}))}));
  const engagement=Object.fromEntries(weapons.map(w=>[w.slug,engagementAt(w,settings.engagementDistance,settings.timeTarget,aim)]));
  const notes=['Independent shot outcomes; fixed 375 HP; no projectile flight, movement, spread correlation or shell-by-shell reload model. Shotgun accuracy is a manual per-pellet scenario, not an API hit/fired ratio.',aim.pattern==='burst'?'Custom burst timing is user supplied. A magazine boundary resets burst phase.':'Uniform firing; the first shot occurs at time zero. Reloads replace the normal shot gap.',blast?'Blast distance is measured from the explosion. Rifle-style kill predictions are unavailable.':'Falloff follows each weapon’s labelled wiki endpoints, or the explicitly selected base-damage scenario.'];
  for(const w of weapons){if(w.projectileLimit)notes.push(`${w.name}: projectile limit ${w.projectileLimit}m; predictions past it are unavailable.`);const ratio=w.headDamage/w.baseDamage;if(w.kind!=='explosive'&&(!Number.isInteger(ratio)||ratio<1||ratio>4))notes.push(`${w.name}: headshot damage may be edited freely, but exact probabilistic metrics require a 1×, 2×, 3× or 4× damage multiplier.`);}
  if(mode==='calculator')statPreview(weapons[0]);
  $('chart-output').hidden=false;
  drawGraph($('chart-output'),series,metric,settings);
  $('range-output').innerHTML=rangeTable(series);$('engagement-output').innerHTML=engagementTable(weapons,engagement,settings);
  $('model-notes').innerHTML=notes.map(note=>`<p class="hint">${esc(note)}</p>`).join('');
  $('chart-output').hidden=!$('showGraph').checked;$('range-section').hidden=!$('showTable').checked;
  $('distance-label').textContent=blast?'Blast distance':'Shooter distance';
  state={title:mode==='calculator'?weapons[0].name+' · custom weapon analysis':'Weapon comparison',series,aim,settings,engagement,notes};
  for(const id of ['export-csv','export-png','export-svg'])$(id).disabled=false;
 }catch(e){console.error(e);error('This scenario could not be calculated. Check the entered values and numerical limits.');}
}
function schedule(){clearTimeout(timer);timer=setTimeout(render,100);}
async function init(){
 try{const response=await fetch(new URL('./data/weapons.json',import.meta.url));if(!response.ok)throw Error();catalog=(await response.json()).map(editablePreset);}catch{error('Weapon presets could not be loaded. Reload the page to try again.');return;}
 $('metric').innerHTML=Object.entries(METRICS).map(([key,m])=>`<option value="${key}">${m.label}${m.unit?' ('+m.unit+')':''}</option>`).join('');
 $('point-datasets').innerHTML=[['distance','Distance'],...Object.entries(METRICS).map(([k,m])=>[k,m.label])].map(([key,label])=>`<label><input type="checkbox" value="${key}" ${key==='distance'?'checked':''}> ${label}</label>`).join('');
 if(mode==='calculator'){
  $('editor-fields').innerHTML=fields.map(fieldHtml).join('');$('preset').innerHTML=catalog.map(w=>`<option value="${w.slug}">${esc(w.name)}</option>`).join('');
  sourceSlug=catalog.some(w=>w.slug===query.get('template'))?query.get('template'):'ar-rifle';$('preset').value=sourceSlug;fillEditor(catalog.find(w=>w.slug===sourceSlug));
  $('preset').addEventListener('change',()=>{sourceSlug=$('preset').value;fillEditor(catalog.find(w=>w.slug===sourceSlug));rangeEdited=false;updateRange([custom]);render();});
  $('reset-preset').addEventListener('click',()=>{fillEditor(catalog.find(w=>w.slug===sourceSlug));rangeEdited=false;updateRange([custom]);render();});
  $('compare-custom').addEventListener('click',()=>{render();if(!state)return;const w=state.series[0].weapon;const clean=Object.fromEntries(['slug','name','kind','baseDamage','headDamage','range','magazine','rps','reload','swap','runSpeed','pellets','projectileLimit','blast','ammo','zoom','crouchRecoil','fireModes'].map(k=>[k,w[k]]));location.href='compare.html?custom='+encodeURIComponent(JSON.stringify(clean));});
  updateRange([custom]);
 }else{
  if(query.has('custom'))try{const imported=JSON.parse(query.get('custom'));imported.slug='custom-weapon';if(!validateWeapon(imported).length)customFromLink=imported;}catch{}
  selected=(query.get('weapons')||query.get('weapon')||'ar-rifle,ak-rifle').split(',').filter(slug=>catalog.some(w=>w.slug===slug)).slice(0,3);selected=[...new Set(selected)];if(customFromLink)selected=['custom-weapon',...selected].slice(0,3);if(!selected.length)selected=['ar-rifle'];
  renderSlots();updateRange(selected.map(presetFor));
  $('add-weapon').addEventListener('click',()=>{if(selected.length>=3)return;const next=catalog.find(w=>!selected.includes(w.slug));selected.push(next.slug);renderSlots();updateRange(selected.map(presetFor));render();});
  $('weapon-slots').addEventListener('change',event=>{if(event.target.matches('[data-slot]')){selected[Number(event.target.dataset.slot)]=event.target.value;updateRange(selected.map(presetFor));render();}});
  $('weapon-slots').addEventListener('click',event=>{const button=event.target.closest('[data-remove]');if(button&&selected.length>1){selected.splice(Number(button.dataset.remove),1);renderSlots();updateRange(selected.map(presetFor));render();}});
 }
 $('lab-form').addEventListener('submit',event=>event.preventDefault());
 $('lab-form').addEventListener('input',event=>{if(['maxDistance','interval'].includes(event.target.id))rangeEdited=true;if(mode==='calculator'&&['edit-plateau','edit-kind'].includes(event.target.id)&&!rangeEdited){const w=readEditor();if(Number.isFinite(w.range.plateau))updateRange([w]);}schedule();});
 $('lab-form').addEventListener('change',schedule);
 $('export-csv').addEventListener('click',()=>{render();if(state)csvDownload(state,mode==='calculator'?'custom-weapon':'weapon-comparison');});
 $('export-svg').addEventListener('click',()=>{render();if(state)svgDownload(state,$('lab-chart'),mode==='calculator'?'custom-weapon':'weapon-comparison');});
 $('export-png').addEventListener('click',async()=>{render();if(!state)return;const button=$('export-png');button.disabled=true;$('export-status').textContent='Rendering image…';try{await pngDownload(state,$('lab-chart'),mode==='calculator'?'custom-weapon':'weapon-comparison');$('export-status').textContent='Image exported.';}catch(e){$('export-status').textContent=e.message;}finally{button.disabled=!state;}});
 render();
}
init();
