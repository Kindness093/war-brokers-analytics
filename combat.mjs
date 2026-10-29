import {shotOutcomes,expectedTriggerCount} from "./weapon-engine.mjs";
// Independent shot outcomes, fixed accuracy and conditional headshot probability.
export function expectedAmmo(damage,accuracy,headshot,health=375,options={}) {
  if(!Number.isFinite(damage)||damage<=0) return NaN;
  return expectedTriggerCount(health,damage/(options.pellets||1),shotOutcomes(accuracy,headshot,options.multiplier||2,options.pellets||1));
}
export function shotTime(shots,{rps=8.108,magazine=30,reload=1.61,reloads=false}={}) {
  if(!Number.isFinite(shots)) return Infinity;
  if(shots<=0) return 0;
  return (shots-1)/rps+(reloads?Math.floor((shots-1)/magazine)*Math.max(0,reload-1/rps):0);
}
export function shotsByTime(seconds,options={}) {
  if(seconds<0) return 0;
  let lo=0,hi=Math.floor(seconds*(options.rps||8.108))+2;
  while(lo+1<hi) {const mid=Math.floor((lo+hi)/2);if(shotTime(mid,options)<=seconds+1e-10) lo=mid;else hi=mid;}
  return lo;
}
export function reliability(damage,accuracy,headshot,seconds,options={}) {
  if(!Number.isFinite(damage)||damage<=0) return {withinTime:null,oneMagazine:null,median:null,p90:null};
  const outcomes=shotOutcomes(accuracy,headshot,options.multiplier||2,options.pellets||1);
  const units=Math.ceil(375/(damage/(options.pellets||1))), deadline=shotsByTime(seconds,options),magazine=options.magazine||30;
  if(accuracy===0) return {withinTime:0,oneMagazine:0,median:Infinity,p90:Infinity};
  let state=new Float64Array(units);state[0]=1;
  let median=null,p90=null,withinTime=deadline===0?0:null,oneMagazine=null;
  // Bounded computation; unavailable quantiles are explicitly reported, never extrapolated.
  const limit=20000;
  for(let n=1;n<=limit;n++) {
    const next=new Float64Array(units);
    for(let u=0;u<units;u++) {
      for(let k=0;k<outcomes.length;k++) if(u+k<units) next[u+k]+=state[u]*outcomes[k];
    }
    state=next;
    const cdf=Math.max(0,Math.min(1,1-state.reduce((a,b)=>a+b,0)));
    if(median===null && cdf>=0.5-1e-12) median=shotTime(n,options);
    if(p90===null && cdf>=0.9-1e-12) p90=shotTime(n,options);
    if(n===deadline) withinTime=cdf;
    if(n===magazine) oneMagazine=cdf;
    if(n>=Math.max(deadline,magazine) && p90!==null) break;
  }
  return {withinTime,oneMagazine,median,p90};
}
export function accuracyForTime(damage,headshot,target,rps=8.108,options={}) {
  if(!Number.isFinite(damage)||damage<=0) return null;
  const mean=p=>(expectedAmmo(damage,p,headshot,375,options)-1)/rps;
  if(mean(1)>target+1e-12) return null;
  let lo=0,hi=1;
  for(let i=0;i<50;i++) {const mid=(lo+hi)/2;if(mean(mid)>target) lo=mid;else hi=mid;}
  return hi;
}

// Consecutive fresh targets: excess damage from a killing shot is discarded.
export function expectedKillsPerMagazine(damage,accuracy,headshot,magazine=30,health=375,options={}) {
  if(!Number.isFinite(damage) || damage<=0) return NaN;
  const outcomes=shotOutcomes(accuracy,headshot,options.multiplier||2,options.pellets||1);
  const units=Math.ceil(health/(damage/(options.pellets||1)));
  let state=new Float64Array(units);state[0]=1;
  let kills=0;
  for(let shot=0;shot<magazine;shot++) {
    const next=new Float64Array(units);
    for(let u=0;u<units;u++) {
      for(const [dealt,chance] of outcomes.entries()) {
        const mass=state[u]*chance;
        if(u+dealt>=units) {kills+=mass;next[0]+=mass;}
        else next[u+dealt]+=mass;
      }
    }
    state=next;
  }
  return kills;
}
