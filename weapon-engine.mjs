// One model for every weapon view, comparison, table, and export.
export const TARGET_HP = 375;
const finite = v => typeof v === 'number' && Number.isFinite(v);
const positive = v => finite(v) && v > 0;
const clip = v => Math.min(1, Math.max(0, v));

export function rangeDamage(weapon, distance, {rangeModel='published',damageScale=1}={}) {
  if (!positive(weapon?.baseDamage) || !finite(distance) || distance < 0 || !positive(damageScale)) return null;
  if (finite(weapon.projectileLimit) && distance > weapon.projectileLimit) return null;
  const base = weapon.baseDamage * damageScale;
  if (distance === 0 || rangeModel === 'base') return base;
  const range = rangeModel === 'starter' && weapon.starterRange ? weapon.starterRange : weapon.range;
  if (!range || !finite(range.cliff)) return null;
  if (distance <= range.cliff) return base;
  if (!positive(range.plateau) || !finite(range.endDamage) || range.endDamage < 0 || range.plateau <= range.cliff) return null;
  if (distance >= range.plateau) return range.endDamage * damageScale;
  return (weapon.baseDamage + (range.endDamage-weapon.baseDamage)*(distance-range.cliff)/(range.plateau-range.cliff)) * damageScale;
}

// Probability mass over damage units in one trigger pull. Shotguns use an
// explicitly modelled independent pellet distribution, never bullet-hit ratios.
export function shotOutcomes(accuracy, headshot, multiplier=2, pellets=1) {
  if (!finite(accuracy) || !finite(headshot) || accuracy<0 || accuracy>1 || headshot<0 || headshot>1 || !Number.isInteger(multiplier) || multiplier<1 || multiplier>4 || !Number.isInteger(pellets) || pellets<1 || pellets>32) return null;
  const single = new Array(multiplier+1).fill(0);
  single[0]=1-accuracy;single[1]+=accuracy*(1-headshot);single[multiplier]+=accuracy*headshot;
  let distribution=[1];
  for(let n=0;n<pellets;n++){
    const next=new Array(distribution.length+multiplier).fill(0);
    for(let i=0;i<distribution.length;i++)for(let j=0;j<single.length;j++)next[i+j]+=distribution[i]*single[j];
    distribution=next;
  }
  return distribution;
}

export function expectedTriggerCount(health, damageUnit, outcomes) {
  if(!positive(health)||!positive(damageUnit)||!Array.isArray(outcomes))return null;
  const n=Math.ceil(health/damageUnit-1e-10);
  if(n>6000)return null;
  const p0=outcomes[0];if(p0>=1)return Infinity;
  const values=new Float64Array(n+1);
  for(let h=1;h<=n;h++){
    let e=1;for(let k=1;k<outcomes.length;k++)if(h>k)e+=outcomes[k]*values[h-k];
    values[h]=e/(1-p0);
  }
  return values[n];
}

export function firingPattern(weapon,{reloads=false,pattern='standard',burstSize=null,burstGap=null}={}) {
  if(!positive(weapon?.rps))return {error:'A verified firing rate is unavailable.'};
  const interval=1/weapon.rps;
  if(pattern==='burst'&&(!Number.isInteger(burstSize)||burstSize<2||burstSize>12||!positive(burstGap)))return {error:'Burst timing is not published. Enter a burst size and last-to-next-burst gap in Advanced Settings.'};
  if(reloads&&(!Number.isInteger(weapon.magazine)||weapon.magazine<1||!positive(weapon.reload)))return {error:'Magazine capacity or reload timing is unavailable.'};
  const period=reloads?weapon.magazine:pattern==='burst'?burstSize:1;
  if(period>500)return {error:'This firing cycle is outside the supported numerical bounds.'};
  const gaps=Array.from({length:period},(_,p)=>{
    const fired=p+1;
    if(reloads&&fired===period)return Math.max(interval,weapon.reload);
    if(pattern==='burst'&&fired%burstSize===0)return Math.max(interval,burstGap);
    return interval;
  });
  return {gaps,period,interval};
}

// Exact finite-state expectation. Zero-damage outcomes cycle through magazine
// phases. Close that loop algebraically instead of truncating a probability tail.
export function expectedTime(health, damageUnit, outcomes, firing) {
  if(!outcomes||firing?.error||!positive(health)||!positive(damageUnit))return null;
  const p0=outcomes[0],n=Math.ceil(health/damageUnit-1e-10);
  if(p0>=1)return Infinity;if(n>6000)return null;
  if(firing.period===1)return Math.max(0,expectedTriggerCount(health,damageUnit,outcomes)-1)*firing.gaps[0];
  const period=firing.period,maxK=outcomes.length-1,rows=Array.from({length:maxK+1},()=>new Float64Array(period));
  const denominator=p0===0?1:-Math.expm1(period*Math.log(p0));
  for(let h=1;h<=n;h++){
    const constants=new Float64Array(period),row=rows[h%(maxK+1)];
    for(let p=0;p<period;p++){
      const next=(p+1)%period;let survival=p0,value=0;
      for(let k=1;k<=maxK;k++)if(h>k){survival+=outcomes[k];value+=outcomes[k]*rows[(h-k)%(maxK+1)][next];}
      constants[p]=survival*firing.gaps[p]+value;
    }
    let weighted=0,power=1;
    for(let p=0;p<period;p++){weighted+=power*constants[p];power*=p0;}
    row[0]=weighted/denominator;
    for(let p=period-1;p>=1;p--)row[p]=constants[p]+p0*row[(p+1)%period];
  }
  return rows[n%(maxK+1)][0];
}

export function deterministicTime(shots,firing) {
  if(!Number.isInteger(shots)||shots<1||firing?.error)return null;
  const gaps=firing.gaps,completed=shots-1,cycles=Math.floor(completed/gaps.length),remainder=completed%gaps.length;
  return cycles*gaps.reduce((a,b)=>a+b,0)+gaps.slice(0,remainder).reduce((a,b)=>a+b,0);
}

export function analyzeWeapon(weapon,distance=0,options={}) {
  const out={distance,damage:null,headDamage:null,bodyShots:null,headShots:null,bttk:null,httk:null,ettk:null,vttk:null,reloadBttk:null,reloadHttk:null,reloadEttk:null,reloadVttk:null,dps:null,sustainedDps:null,reason:'',warnings:[]};
  const damage=rangeDamage(weapon,distance,options);out.damage=damage;
  const supported=['bullet','shotgun','melee','projectile','mounted'].includes(weapon?.kind);
  if(!supported){out.reason='Splash, deployment, healing, or effect mechanics do not have a verified point-target TTK model.';return out;}
  if(weapon.kind==='melee'&&distance>0){out.reason='Melee reach is unverified. Contact-only calculations are available at 0 m.';return out;}
  if(damage===null){out.reason='Numeric falloff data is incomplete at this distance. Choose the explicitly labelled base-damage scenario to compare without falloff.';return out;}
  if(!positive(damage)){out.reason='This model deals no damage at the selected distance.';return out;}
  const firing=firingPattern(weapon,{...options,reloads:false});if(firing.error){out.reason=firing.error;return out;}
  const hp=positive(options.health)?options.health:TARGET_HP;
  const multiplier=positive(weapon.headDamage)?weapon.headDamage/weapon.baseDamage:null;
  out.headDamage=multiplier===null?null:damage*multiplier;
  out.bodyShots=Math.ceil(hp/damage-1e-10);out.headShots=out.headDamage?Math.ceil(hp/out.headDamage-1e-10):null;
  out.bttk=deterministicTime(out.bodyShots,firing);out.httk=out.headShots?deterministicTime(out.headShots,firing):null;
  out.dps=damage*firing.period/firing.gaps.reduce((a,b)=>a+b,0);
  const reloadFiring=firingPattern(weapon,{...options,reloads:true});
  out.reloadBttk=out.bodyShots<=weapon.magazine?out.bttk:deterministicTime(out.bodyShots,reloadFiring);
  out.reloadHttk=out.headShots===null?null:out.headShots<=weapon.magazine?out.httk:deterministicTime(out.headShots,reloadFiring);
  if(!reloadFiring.error)out.sustainedDps=damage*weapon.magazine/reloadFiring.gaps.reduce((a,b)=>a+b,0);
  if(out.bodyShots>weapon.magazine)out.warnings.push('A bodyshot kill exceeds one magazine. Compare uninterrupted and reload-inclusive TTK.');
  if(weapon.kind==='melee') {out.warnings.push('Melee critical hits may be backstabs, not headshots. Accuracy probabilities are not applied.');return out;}
  if(weapon.kind==='projectile')out.warnings.push('Projectile travel time, trajectory and impact mechanics are excluded.');
  const pellets=weapon.kind==='shotgun'?weapon.pellets:1;
  if(weapon.kind==='shotgun')out.warnings.push('Shotgun scenario assumes independent pellets. Bullet accuracy baselines cannot establish pellet hit probability.');
  if(!Number.isInteger(pellets)||pellets<1){out.reason='Pellet count is not verified.';return out;}
  const head=options.headshot;
  if(!finite(head)||head<0||head>1){out.reason='A conditional headshot frequency is required for expected TTK.';return out;}
  const h=multiplier??(head===0?1:null);
  if(!Number.isInteger(h)||h<1||h>4){out.reason='The verified critical-damage model is not supported by the discrete expectation engine.';return out;}
  const unit=damage/pellets,hit=shotOutcomes(1,head,h,pellets);
  out.ettk=expectedTime(hp,unit,hit,firing);
  out.reloadEttk=expectedTime(hp,unit,hit,reloadFiring);
  if(finite(options.accuracy)&&options.accuracy>=0&&options.accuracy<=1){
    const all=shotOutcomes(options.accuracy,head,h,pellets);
    out.vttk=expectedTime(hp,unit,all,firing);out.reloadVttk=expectedTime(hp,unit,all,reloadFiring);
  }else out.reason='No eligible accuracy baseline. Load custom players or set a manual modifier.';
  return out;
}

export function weaponDistances(weapon,{interval=25,count=8,endpoint=true,atCliff=false,even=false,maxDistance=250,rangeModel='published'}={}) {
  const range=rangeModel==='starter'?weapon.starterRange:weapon.range;
  const end=positive(range?.plateau)?range.plateau:maxDistance,start=atCliff&&finite(range?.cliff)?range.cliff:0;
  count=Math.max(2,Math.min(20,Math.round(count)));interval=Math.max(1,Math.min(1000,Math.round(interval)));
  if(even)return Array.from({length:count},(_,i)=>start+(end-start)*i/(endpoint?count-1:count));
  const list=Array.from({length:endpoint?count-1:count},(_,i)=>start+i*interval).filter(v=>v<=end);
  if(endpoint)list.push(end);return [...new Set(list)].sort((a,b)=>a-b);
}

export function parseUids(raw,maximum=10) {
  const unique=[...new Set(String(raw).split(/[\s,;]+/).filter(Boolean).map(s=>s.toLowerCase()))];
  return {valid:unique.filter(s=>/^[a-f\d]{24}$/.test(s)).slice(0,maximum),invalid:unique.filter(s=>!/^[a-f\d]{24}$/.test(s)),overflow:Math.max(0,unique.filter(s=>/^[a-f\d]{24}$/.test(s)).length-maximum)};
}

const counter=(object,id)=>object&&typeof object==='object'&&finite(object[id])&&object[id]>=0?object[id]:null;
export function accuracyRow(player,id,mode='combined',minimumShots=100) {
  if(!id)return {eligible:false,reason:'No verified API weapon identifier.'};
  const zoom=mode==='zoomed',unzoom=mode==='unzoomed';
  let fired,hits;
  if(zoom||unzoom){fired=counter(player['shots_fired_'+(zoom?'zoomed':'unzoomed')],id);hits=counter(player['shots_hit_'+(zoom?'zoomed':'unzoomed')],id);}
  else {const fields=['shots_fired_zoomed','shots_fired_unzoomed','shots_hit_zoomed','shots_hit_unzoomed'].map(k=>counter(player[k],id));if(fields.some(v=>v===null))return {eligible:false,reason:'Missing mode counters.'};fired=fields[0]+fields[1];hits=fields[2]+fields[3];}
  if(fired===null||hits===null)return {eligible:false,reason:'Missing weapon counters.'};
  if(fired===0)return {eligible:false,reason:'Zero recorded shots.',fired,hits};
  if(hits>fired)return {eligible:false,reason:'Multi-hit or incompatible counters exceed fired shots.',fired,hits};
  const a=hits/fired;
  const z=counter(player.shots_hit_zoomed,id),u=counter(player.shots_hit_unzoomed,id),heads=counter(player.headshots,id);
  const allHits=z===null||u===null?null:z+u;
  const headshot=allHits>0&&heads!==null&&heads<=allHits?heads/allHits:null;
  if(fired<minimumShots)return {eligible:false,reason:`Fewer than ${minimumShots} shots.`,fired,hits,accuracy:a,headshot};
  return {eligible:true,accuracy:a,headshot,fired,hits};
}

export function cohort(rows,selection='all',minimumMembers=5) {
  const eligible=rows.filter(r=>r.eligible&&finite(r.accuracy)&&r.accuracy>=0&&r.accuracy<=1).sort((a,b)=>b.accuracy-a.accuracy);
  const fraction={all:1,'10':.1,'1':.01,'0.1':.001}[selection]??1;
  const n=fraction===1?eligible.length:Math.floor(eligible.length*fraction+1e-10);
  if(!n||(fraction<1&&n<minimumMembers))return {available:false,eligible:eligible.length,count:0,accuracy:null,headshot:null,shots:0,reason:`This cohort needs at least ${Math.ceil(minimumMembers/fraction)} eligible observed players; ${eligible.length} available.`};
  const selected=eligible.slice(0,n),heads=selected.filter(r=>finite(r.headshot));
  return {available:true,eligible:eligible.length,count:n,accuracy:selected.reduce((a,b)=>a+b.accuracy,0)/n,headshot:heads.length?heads.reduce((a,b)=>a+b.headshot,0)/heads.length:null,headshotCount:heads.length,shots:selected.reduce((a,b)=>a+b.fired,0),reason:'Per-player arithmetic mean; ranked by this weapon and selected firing mode inside the observed sample.'};
}

export function quantile(values,p) {if(!values.length)return null;const a=[...values].sort((x,y)=>x-y),i=(a.length-1)*clip(p),lo=Math.floor(i);return a[lo]+(a[Math.ceil(i)]-a[lo])*(i-lo);}
export function eloSummary(points,player) {
  const rows=points.filter(p=>finite(p.gamesELO)&&finite(p.killsELO));
  const result={count:rows.length,score:null,reason:'A rank-stratified observed sample cannot calibrate a population 0–100 consistency rating.',peers:0,expected:null,lower:null,upper:null,difference:null,residual:null,regression:null};
  if(rows.length>=3){const mx=rows.reduce((a,b)=>a+b.gamesELO,0)/rows.length,my=rows.reduce((a,b)=>a+b.killsELO,0)/rows.length;let covariance=0,variance=0;for(const p of rows){covariance+=(p.gamesELO-mx)*(p.killsELO-my);variance+=(p.gamesELO-mx)**2;}if(variance>0)result.regression={slope:covariance/variance,intercept:my-covariance/variance*mx};}
  if(!player||!finite(player.gamesELO)||!finite(player.killsELO))return result;
  const peers=rows.filter(p=>Math.abs(p.gamesELO-player.gamesELO)<=150&&(p.gamesELO!==player.gamesELO||p.killsELO!==player.killsELO));
  result.peers=peers.length;result.difference=player.killsELO-player.gamesELO;
  if(peers.length>=10){const ys=peers.map(p=>p.killsELO);result.expected=quantile(ys,.5);result.lower=quantile(ys,.1);result.upper=quantile(ys,.9);result.residual=player.killsELO-result.expected;}
  return result;
}
