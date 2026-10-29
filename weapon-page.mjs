import {rangeDamage} from "./weapon-engine.mjs";

import {expectedAmmo as ammo, reliability as rel, accuracyForTime as inverse, expectedKillsPerMagazine as kills} from "./combat.mjs";
import {arStats} from "./profile-stats.mjs";
const STATIC=document.querySelector('meta[name="wb-hosting"]')?.content==="static";
const SITE_ROOT=new URL('./',import.meta.url);
let lastPublicRequest=0;
async function fetchProfileStats(uid) {
  if(!STATIC) return fetch(new URL('api/player?weapon='+WEAPON.id+'&uid='+encodeURIComponent(uid),SITE_ROOT),{signal:AbortSignal.timeout(90000)});
  const wait=Math.max(0,lastPublicRequest+5000-Date.now());
  if(wait) await new Promise(resolve=>setTimeout(resolve,wait));
  lastPublicRequest=Date.now();
  const response=await fetch('https://wbapi.wbpjs.com/players/getPlayer?uid='+encodeURIComponent(uid),{signal:AbortSignal.timeout(30000)});
  if(!response.ok) return response;
  return {ok:true,json:async()=>arStats(await response.json(),WEAPON.id)};
}
const WEAPON=JSON.parse(document.getElementById("weapon-config").textContent);
const MODEL={pellets:WEAPON.pellets||1,multiplier:WEAPON.headDamage?WEAPON.headDamage/WEAPON.baseDamage:1};
const expectedAmmo=(d,p,h)=>ammo(d,p,h,375,MODEL);
const reliability=(d,p,h,t,o)=>rel(d,p,h,t,{...MODEL,rps:WEAPON.rps,magazine:WEAPON.magazine,reload:WEAPON.reload,...o});
const accuracyForTime=(d,h,t)=>inverse(d,h,t,WEAPON.rps,MODEL);
const expectedKillsPerMagazine=(d,p,h,m)=>kills(d,p,h,m,375,MODEL);
"use strict";

const BASE_DAMAGE = WEAPON.baseDamage;
const END_DAMAGE = WEAPON.range?.endDamage ?? WEAPON.baseDamage;
const DROP_CLIFF = WEAPON.range?.cliff ?? 100;
const DROP_PLATEAU = WEAPON.range?.plateau ?? 250;
const RPS = WEAPON.rps;
const HEAD_MULTIPLIER = MODEL.multiplier;
const $ = id => document.getElementById(id);

let uidAverages = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function numberValue(id, fallback, min, max) {
  const value = Number($(id).value);
  return Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function fmt(value, digits = 2) {
  if (value === Infinity) return "∞";
  if (value === null || !Number.isFinite(value)) return "—";
  return Number(value.toFixed(digits)).toString();
}

function precise(value) {
  return Number.isFinite(value) ? value.toFixed(10) : fmt(value);
}
function hoverNumber(value, suffix = "") {
  return `<span title="${precise(value)}${suffix}">${fmt(value)}${suffix}</span>`;
}

function connectSlider(numberId, sliderId, labelId, suffix = "") {
  const input = $(numberId);
  const slider = $(sliderId);
  const label = $(labelId);

  function sync(source) {
    let value = Number(source.value);
    if (!Number.isFinite(value)) return;

    const min = Number(input.min);
    const max = Number(input.max);
    value = clamp(value, min, max);

    input.value = value;
    slider.value = value;
    label.textContent = fmt(value, 1) + suffix;
    render();
  }

  input.addEventListener("input", () => sync(input));
  slider.addEventListener("input", () => sync(slider));
}

function damageAt(distance) {
  return rangeDamage(WEAPON,distance,{rangeModel:$("rangeScenario").value==="base"?"base":"published"}) ?? NaN;
}

function shotsToKill(damage, multiplier = 1) {
  const health = 375;
  return Math.max(1, Math.ceil(health / (damage * multiplier)));
}

function ttk(shots) {
  return shots === Infinity ? Infinity : Math.max(0, shots - 1) / RPS;
}

/*
  Calculates expected shots recursively.
  A miss repeats the same remaining-health state, so misses are handled
  algebraically rather than by a recursive self-call.
*/
function expectedShots(health,bodyDamage,headDamage,headChance,accuracy) {
  return expectedAmmo(bodyDamage,accuracy,headChance);
}

function getDistances() {
  const interval = Math.round(numberValue("interval", 25, 1, DROP_PLATEAU));
  const count = Math.round(numberValue("count", 8, 2, 20));
  const start = $("startAtCliff").checked ? DROP_CLIFF : 0;
  const end = DROP_PLATEAU;
  const includeEndpoint = $("includeEndpoint").checked;

  if ($("evenSpacing").checked) {
    if (includeEndpoint) {
      return Array.from({length: count}, (_, i) =>
        Math.round((start + (end - start) * i / (count - 1)) * 100) / 100
      );
    }

    return Array.from({length: count}, (_, i) =>
      Math.round((start + (end - start) * i / count) * 100) / 100
    );
  }

  const values = [];
  const regularSlots = includeEndpoint ? count - 1 : count;

  for (let i = 0; i < regularSlots; i++) {
    const distance = start + i * interval;
    if (distance > end) break;
    values.push(distance);
  }

  if (includeEndpoint) {
    if (values.length < count) values.push(end);
    else values[values.length - 1] = end;
  }

  return [...new Set(values.map(v => Math.round(v * 100) / 100))]
    .sort((a, b) => a - b)
    .slice(0, count);
}

function render() {
  const dropRate=WEAPON.blast ? WEAPON.blast.baseDamage/WEAPON.blast.radius :
    Number.isFinite(WEAPON.range?.endDamage)?(BASE_DAMAGE-END_DAMAGE)/(DROP_PLATEAU-DROP_CLIFF):NaN;
  $("dropRate").textContent=Number.isFinite(dropRate)?fmt(dropRate)+" damage/m":"Unknown";
  $("dropRate").title=precise(dropRate)+" damage/m";

  $("interval").disabled = $("evenSpacing").checked;
  $("intervalSlider").disabled = $("evenSpacing").checked;

  const distances = getDistances();
  $("samplingSummary").textContent =
    "Output distances: " + distances.map(d => fmt(d) + " m").join(", ");

  $("graphSection").hidden = !$("showGraph").checked;
  $("tableSection").hidden = !$("showTable").checked;

  const health = 375;
  const accuracy = numberValue("accuracy", WEAPON.defaultAccuracy, 0, 100) / 100;
  const headshotChance = numberValue("headshot", WEAPON.defaultHeadshot, 0, 100) / 100;

  const rows = distances.map(distance => {
    const damage = damageAt(distance);
    const bodyShots = shotsToKill(damage);
    const headShots = shotsToKill(damage, HEAD_MULTIPLIER);

    const expectedHitShots = WEAPON.kind==="explosive"?NaN:expectedShots(
      health, damage, damage * HEAD_MULTIPLIER, headshotChance, 1
    );

    const expectedAccurateShots = WEAPON.kind==="explosive"?NaN:expectedShots(
      health, damage, damage * HEAD_MULTIPLIER, headshotChance, accuracy
    );

    return {
      distance,
      damage,
      bodyShots,
      headShots,
      bttk: WEAPON.kind==="explosive"?NaN:ttk(bodyShots),
      httk: WEAPON.kind==="explosive"?NaN:ttk(headShots),
      ettk: ttk(expectedHitShots),
      vttk: ttk(expectedAccurateShots)
    };
  });

  $("results").innerHTML = rows.map(r => `
    <tr>
      <td title="${precise(r.distance)} m">${fmt(r.distance)} m</td>
      <td title="${precise(r.damage)} damage">${fmt(r.damage)}</td>
      <td title="${precise(r.bodyShots)}">${fmt(r.bodyShots)}</td>
      <td title="${precise(r.headShots)}">${fmt(r.headShots)}</td>
      <td title="${precise(r.bttk)} seconds">${fmt(r.bttk)}s</td>
      <td title="${precise(r.httk)} seconds">${fmt(r.httk)}s</td>
      <td title="${precise(r.ettk)} seconds">${fmt(r.ettk)}s</td>
      <td title="${precise(r.vttk)} seconds">${fmt(r.vttk)}s</td>
    </tr>
  `).join("");

  if(WEAPON.kind!=="explosive") {drawChart(rows);renderEngagement();}
}

function renderEngagement() {
  const distance=numberValue("engagementRange",Math.min(150,DROP_PLATEAU),0,DROP_PLATEAU),time=numberValue("targetTime",2,0,60);
  const damage=damageAt(distance),p=numberValue("accuracy",WEAPON.defaultAccuracy,0,100)/100;
  const head=numberValue("headshot",WEAPON.defaultHeadshot,0,100)/100;
  if(!Number.isFinite(damage)) {$("engagementResults").textContent="No damage or kill prediction is available beyond this weapon’s projectile limit ("+WEAPON.projectileLimit+"m).";return;}
  const reloads=$("reliabilityReloads").checked;
  const magazine=Math.round(numberValue("magazineSize",WEAPON.magazine,1,500));
  const stats=reliability(damage,p,head,time,{reloads,magazine});
  const ammo=expectedAmmo(damage,p,head),mean=ttk(ammo);
  const required=accuracyForTime(damage,head,time);
  const gainAccuracy=mean-ttk(expectedAmmo(damage,Math.min(1,p+0.05),head));
  const gainHeads=mean-ttk(expectedAmmo(damage,p,Math.min(1,head+0.05)));
  const seconds=v=>v===null?"Unavailable (computation limit)":hoverNumber(v,"s");
  const percent=v=>v===null?"Unavailable (computation limit)":hoverNumber(100*v,"%");
  const gain=v=>Number.isFinite(v)?hoverNumber(v,"s")+" faster":"Unavailable";
  const items=[
    ["Chance to kill within "+fmt(time)+"s",percent(stats.withinTime)],
    ["Chance to kill with one "+magazine+"-round magazine",percent(stats.oneMagazine)],
    ["Median TTK (50% chance of a kill by this time)",seconds(stats.median)],
    ["90th-percentile TTK (90% chance of a kill by this time)",seconds(stats.p90)],
    ["Expected shots to kill (includes misses)",hoverNumber(ammo)],
    ["Expected kills per "+magazine+"-round magazine",hoverNumber(expectedKillsPerMagazine(damage,p,head,magazine))],
    ["Accuracy needed for mean TTK ≤ "+fmt(time)+"s (excludes reloads)",required===null?"Impossible even at 100% accuracy":percent(required)],
    ["Mean TTK benefit from +5 percentage points of accuracy",gain(gainAccuracy)],
    ["Mean TTK benefit from +5 percentage points of headshot frequency",gain(gainHeads)]
  ];
  $("engagementResults").innerHTML=`<p><strong>${hoverNumber(distance," m")}</strong> · ${hoverNumber(damage)} damage per body hit · percentile timing ${reloads?"includes":"excludes"} reloads.</p><table><thead><tr><th>Metric</th><th>Result</th></tr></thead><tbody>${items.map(([label,value])=>`<tr><td>${label}</td><td>${value}</td></tr>`).join("")}</tbody></table><p class="hint">Kills per magazine assumes consecutive fresh targets, discards excess damage after each kill, and excludes switching delays. Aim benefits use mean TTK excluding reloads; increases stop at 100%. Reload choice applies only to the time-target probability and percentiles.</p>`;
}
["engagementRange","targetTime","magazineSize","reliabilityReloads"].forEach(id=>$(id).addEventListener("input",renderEngagement));

const graphMetrics = {
  distance: {label:"Distance", unit:"m"},
  damage: {label:"Damage", unit:""},
  bodyShots: {label:"bSTK", unit:""},
  headShots: {label:"hSTK", unit:""},
  bttk: {label:"bTTK", unit:"s"}, httk: {label:"hTTK", unit:"s"},
  ettk: {label:"eTTK", unit:"s"}, vttk: {label:"vTTK", unit:"s"}
};
for (const id of ["leftMetric", "rightMetric"]) {
  $(id).innerHTML = (id === "rightMetric" ? '<option value="">None</option>' : "") +
    Object.entries(graphMetrics).filter(([key]) => key !== "distance").map(([key,m]) => `<option value="${key}">${m.label}${m.unit ? " ("+m.unit+")" : ""}</option>`).join("");
  $(id).value = id === "leftMetric" ? "damage" : "";
  $(id).addEventListener("change", render);
}
$("pointMetrics").innerHTML = Object.entries(graphMetrics).map(([key,m]) => `<label><input type="checkbox" value="${key}" ${key === "distance" ? "checked" : ""}> ${m.label}</label>`).join("");
$("pointMetrics").addEventListener("change", render);

// Monotone Hermite interpolation: passes through every calculated value,
// preserves flat regions and avoids overshooting between neighboring samples.
function smoothCalculatedPath(points) {
  if (!points.length) return "";
  const slopes=points.slice(1).map((p,i)=>(p[1]-points[i][1])/(p[0]-points[i][0]));
  const tangents=points.map((p,i)=>{
    if(i===0) return slopes[0] || 0;
    if(i===points.length-1) return slopes[i-1] || 0;
    const a=slopes[i-1], b=slopes[i];
    if(a*b<=0) return 0;
    const before=p[0]-points[i-1][0], after=points[i+1][0]-p[0];
    const w1=2*after+before, w2=after+2*before;
    return (w1+w2)/(w1/a+w2/b);
  });
  for(let i=0;i<slopes.length;i++) {
    if(slopes[i]===0) {tangents[i]=tangents[i+1]=0;continue;}
    const a=tangents[i]/slopes[i],b=tangents[i+1]/slopes[i],length=Math.hypot(a,b);
    if(length>3) {tangents[i]=3*a*slopes[i]/length;tangents[i+1]=3*b*slopes[i]/length;}
  }
  let path=`M ${points[0].join(" ")}`;
  for(let i=0;i<points.length-1;i++) {
    const [x0,y0]=points[i],[x1,y1]=points[i+1], dx=(x1-x0)/3;
    path+=` C ${x0+dx} ${y0+dx*tangents[i]} ${x1-dx} ${y1-dx*tangents[i+1]} ${x1} ${y1}`;
  }
  return path;
}

function drawChart(rows) {
  const svg = $("chart");
  const labels = [...$("pointMetrics").querySelectorAll("input:checked")].map(input => input.value);
  const W = Math.max(1000, rows.length * 115 + 160), H = 410 + labels.length * 17;
  const L = 85, R = 85, T = 30, plotH = 300, plotW = W-L-R;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.style.minWidth = rows.length > 10 ? W + "px" : "0";
  const start = $("startAtCliff").checked ? DROP_CLIFF : 0;
  const interval = Math.round(numberValue("interval",25,1,DROP_PLATEAU));
  const end = start + (Math.floor((DROP_PLATEAU-start)/interval)+1)*interval;
  const x = d => L+(d-start)/(end-start)*plotW;
  const health = 375, accuracy = numberValue("accuracy",WEAPON.defaultAccuracy,0,100)/100;
  const head = numberValue("headshot",WEAPON.defaultHeadshot,0,100)/100;
  // Include every deterministic STK threshold, even when it falls between table samples.
  const distances = new Set([start, DROP_CLIFF, DROP_PLATEAU, ...(WEAPON.projectileLimit?[WEAPON.projectileLimit]:[]), ...rows.map(r=>r.distance)]);
  for (let d=start; d<DROP_PLATEAU; d++) distances.add(d);
  for (const multiplier of [1,HEAD_MULTIPLIER]) {
    for (let n=1; n<=Math.ceil(health/(END_DAMAGE*multiplier)); n++) {
      const damage = health/(n*multiplier);
      if (damage>END_DAMAGE && damage<BASE_DAMAGE) {
        const d=DROP_CLIFF+(BASE_DAMAGE-damage)/(BASE_DAMAGE-END_DAMAGE)*(DROP_PLATEAU-DROP_CLIFF);
        distances.add(d); distances.add(Math.min(DROP_PLATEAU,d+0.00001));
      }
    }
  }
  const samples = [...distances].filter(d=>d>=start && d<=DROP_PLATEAU).sort((a,b)=>a-b).map(distance=>{
    const damage=damageAt(distance);
    return {distance,damage,bodyShots:shotsToKill(damage),headShots:shotsToKill(damage,HEAD_MULTIPLIER),
      bttk:ttk(shotsToKill(damage)),httk:ttk(shotsToKill(damage,HEAD_MULTIPLIER)),
      ettk:ttk(expectedShots(health,damage,damage*HEAD_MULTIPLIER,head,1)),
      vttk:ttk(expectedShots(health,damage,damage*HEAD_MULTIPLIER,head,accuracy))};
  });
  const axes = [{key:$("leftMetric").value,color:"#efbb43",right:false}];
  if ($("rightMetric").value && $("rightMetric").value !== axes[0].key) axes.push({key:$("rightMetric").value,color:"#db303c",right:true});
  let out=`<rect x="${L}" y="${T}" width="${plotW}" height="${plotH}" fill="#292929" stroke="#aaa"/>`;
  const tickCount = Math.round((end-start)/interval);
  for(let i=0;i<=tickCount;i++) {
    const d=start+i*interval,xx=x(d);
    out+=`<line x1="${xx}" y1="${T}" x2="${xx}" y2="${T+plotH}" stroke="#383838"/><text x="${xx}" y="${T+plotH+20+labels.length*17}" text-anchor="middle" font-size="11" data-distance-tick="true">${d}m</text>`;
  }
  for(const d of ($("rangeScenario").value==="base"?[]:[DROP_CLIFF,DROP_PLATEAU])) out+=`<line x1="${x(d)}" y1="${T}" x2="${x(d)}" y2="${T+plotH}" stroke="#efbb43" stroke-dasharray="5 4"/>`;
  // Small terrain silhouettes identify the two range boundaries.
  for(const [distance,name,pathData] of [
    [DROP_CLIFF,"Cliff","M -22 -12 H 12 V -6 L 3 -2 L -1 18"],
    [DROP_PLATEAU,"Plateau","M -20 4 L -15 -3 H 15 L 20 4"]
  ]) {
    if(distance<start || distance>end || $("rangeScenario").value==="base") continue;
    out+=`<g transform="translate(${x(distance)} ${T+plotH*0.5}) scale(0.75)" role="img" aria-label="${name} at ${distance} metres"><title>${name}: ${distance} m</title><rect x="-30" y="-22" width="62" height="48" rx="3" fill="#292929"/><path d="${pathData}" fill="none" stroke="#efbb43" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }
  for(const axis of axes) {
    const metric=graphMetrics[axis.key];
    const finite=samples.map(r=>r[axis.key]).filter(Number.isFinite);
    const max=Math.max(1,...finite), raw=max/5, base=10**Math.floor(Math.log10(raw));
    const step=[1,2,2.5,5,10].map(n=>n*base).find(n=>n>=raw);
    const ceiling=Math.ceil(max/step)*step;
    axis.y=value=>T+plotH-value/ceiling*plotH;
    for(let value=0;value<=ceiling+step/100;value+=step) {
      const yy=axis.y(value),xx=axis.right?W-R+10:L-10;
      if(!axis.right) out+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#444"/>`;
      out+=`<text x="${xx}" y="${yy+4}" text-anchor="${axis.right?"start":"end"}" fill="#efbb43" font-size="12">${fmt(value)}</text>`;
    }
    const titleX=axis.right?W-18:18;
    out+=`<text x="${titleX}" y="${T+plotH/2}" transform="rotate(${axis.right?90:-90} ${titleX} ${T+plotH/2})" text-anchor="middle" fill="#efbb43" font-size="13">${metric.label}${metric.unit?" ("+metric.unit+")":""}</text>`;
    const isTtk = ["bttk","httk","ettk","vttk"].includes(axis.key);
    const curveRows = samples;
    const points=curveRows.filter(r=>Number.isFinite(r[axis.key])).map(r=>[x(r.distance),axis.y(r[axis.key])]);
    if(points.length) {
      if(isTtk) out+=`<path d="${smoothCalculatedPath(points)}" fill="none" stroke="${axis.color}" stroke-width="2"/>`;
      else out+=`<polyline points="${points.map(p=>p.join(",")).join(" ")}" fill="none" stroke="${axis.color}" stroke-width="2"/>`;
    }
    else out+=`<text x="${W/2}" y="${T+20+(axis.right?20:0)}" text-anchor="middle" fill="#efbb43">${metric.label}: ∞ (zero accuracy)</text>`;

  }
  for(const axis of axes) {
    const metric=graphMetrics[axis.key];
    for(const row of rows) if(Number.isFinite(row[axis.key])) out+=`<circle cx="${x(row.distance)}" cy="${axis.y(row[axis.key])}" r="4" fill="#292929" stroke="${axis.right?"#efbb43":"#db303c"}" stroke-width="2"><title>${precise(row.distance)} m: ${metric.label} ${precise(row[axis.key])}${metric.unit==="s"?"s":metric.unit?" "+metric.unit:""}</title></circle>`;
  }
  out+=`<text x="${W/2}" y="${T+plotH+43+labels.length*17}" text-anchor="middle" font-size="13" data-distance-title="true">Distance (m)</text>`;
  if(labels.length) rows.forEach(row=>{
    const column=x(row.distance);
    // Anchor the dataset to the lower plotted marker when both axes are visible.
    const markerYs=axes.filter(axis=>Number.isFinite(row[axis.key])).map(axis=>axis.y(row[axis.key]));
    if(!markerYs.length) return;
    const top=Math.min(...markerYs),bottom=Math.max(...markerYs);
    const blockHeight=(labels.length-1)*17+13;
    const between=markerYs.length===2 && bottom-top>=blockHeight+24;
    const labelTop=between ? (top+bottom-blockHeight)/2+10 : bottom+17;
    out+=`<g data-point-label="true" data-between="${between}" data-fallback-y="${bottom+17-labelTop}">`;
    labels.forEach((key,j)=>{
      const metric=graphMetrics[key];
      out+=`<text x="${column}" y="${labelTop+j*17}" text-anchor="middle" font-size="11" paint-order="stroke" stroke="#292929" stroke-width="3" stroke-linejoin="round" fill="#efbb43"><title>${metric.label}: ${precise(row[key])}${metric.unit==="s"?"s":metric.unit?" "+metric.unit:""}</title>${key==="distance"?"":(key==="damage"?"Dmg":metric.label)+": "}${fmt(row[key])}${metric.unit?(metric.unit==="s"?"s":" "+metric.unit):""}</text>`;
    });
    out+="</g>";
  });
  svg.setAttribute("aria-label",`${WEAPON.name} ${axes.map(a=>graphMetrics[a.key].label).join(" and ")} by distance`);
  svg.innerHTML=out;
  arrangePointLabels(svg, L, W-R, T+plotH, W, H);
}

function arrangePointLabels(svg, left, right, plotBottom, width, height) {
  const groups=[...svg.querySelectorAll("[data-point-label]")];
  const axisText=[...svg.querySelectorAll("text")].filter(el=>!el.closest("[data-point-label]") && !el.hasAttribute("data-distance-tick") && !el.hasAttribute("data-distance-title"));
  const boxes=axisText.map(el=>el.getBBox());
  const overlaps=(a,b)=>a.x<b.x+b.width+8 && a.x+a.width+8>b.x && a.y<b.y+b.height+8 && a.y+a.height+8>b.y;
  let bottom=plotBottom;
  for(const group of groups) {
    const original=group.getBBox();
    // Keep labels inside the plot's horizontal bounds, clear of axis numbers.
    const dx=Math.max(left+8-original.x,Math.min(0,right-8-original.x-original.width));
    let dy=0;
    let box={x:original.x+dx,y:original.y,width:original.width,height:original.height};
    if(group.dataset.between==="true" && boxes.some(other=>overlaps(box,other))) {
      dy=Number(group.dataset.fallbackY);box.y=original.y+dy;
    }
    while(boxes.some(other=>overlaps(box,other))) {dy+=17;box.y=original.y+dy;}
    group.setAttribute("transform",`translate(${dx} ${dy})`);
    boxes.push(box);bottom=Math.max(bottom,box.y+box.height);
  }
  // Distance ticks occupy their own band below all point datasets.
  const tickY=Math.max(plotBottom+20,bottom+25);
  svg.querySelectorAll("[data-distance-tick]").forEach(el=>el.setAttribute("y",tickY));
  svg.querySelector("[data-distance-title]")?.setAttribute("y",tickY+25);
  svg.setAttribute("viewBox",`0 0 ${width} ${Math.max(height,tickY+45)}`);
}

/* UID inputs */
function addUidRow() {
  const row = document.createElement("div");
  row.className = "uid-row";
  row.innerHTML = '<textarea class="uid" rows="2" placeholder="Player UIDs"></textarea><button type="button" class="removeUid">Remove</button>';
  $("uidList").appendChild(row);
  row.querySelector("button").addEventListener("click", () => {
    if ($("uidList").querySelectorAll(".uid-row").length > 1) row.remove();
    else row.querySelector(".uid").value = "";
  });
}

document.querySelectorAll(".removeUid").forEach(button => {
  button.addEventListener("click", () => {
    const rows = $("uidList").querySelectorAll(".uid-row");
    if (rows.length > 1) button.closest(".uid-row").remove();
    else button.closest(".uid-row").querySelector(".uid").value = "";
  });
});

$("addUid").addEventListener("click", addUidRow);

$("loadUids").addEventListener("click", async () => {
  const uids = [...new Set([...document.querySelectorAll(".uid")].flatMap(input => input.value.trim().split(/[\s,]+/)).filter(Boolean))];
  if (!uids.length) { $("uidStatus").textContent = "Enter at least one UID."; return; }
  $("loadUids").disabled = true;
  $("applyUid").disabled = true;
  uidAverages = null;
  $("playerResults").replaceChildren();
  const rows = [];
  let failures = 0;
  for (const [i, uid] of uids.entries()) {
    $("uidStatus").textContent = `Loading ${i + 1} of ${uids.length}… (API requests are paced; please allow a few seconds.)`;
    const line = document.createElement("p");
    try {
      const response = await fetchProfileStats(uid);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Lookup failed");
      rows.push(data);
      line.textContent = `${uid}: accuracy ${data.accuracy === null ? "unavailable" : fmt(data.accuracy) + "%"}; headshots ${data.headshotFrequency === null ? "unavailable" : fmt(data.headshotFrequency) + "%"}`;
    } catch (error) { failures++; line.textContent = `${uid}: ${error.message}`; }
    $("playerResults").append(line);
  }
  const average = key => { const values = rows.map(r => r[key]).filter(Number.isFinite); return values.length ? values.reduce((a,b) => a+b,0)/values.length : null; };
  uidAverages = {accuracy: average("accuracy"), headshotFrequency: average("headshotFrequency")};
  $("uidAccuracy").textContent = uidAverages.accuracy === null ? "Unavailable" : fmt(uidAverages.accuracy) + "%";
  $("uidHeadshot").textContent = uidAverages.headshotFrequency === null ? "Unavailable" : fmt(uidAverages.headshotFrequency) + "%";
  $("applyUid").disabled = uidAverages.accuracy === null && uidAverages.headshotFrequency === null;
  $("uidStatus").textContent = `${rows.length} loaded; ${failures} failed. Accuracy contributors: ${rows.filter(r => r.accuracy !== null).length}.`;
  if (!$("applyUid").disabled) $("applyUid").click();
  $("loadUids").disabled = false;
});

$("applyUid").addEventListener("click", () => {
  if (!uidAverages) return;
  if(WEAPON.kind==="shotgun") {$("uidStatus").textContent+=" Shotgun counter averages are shown for reference; set pellet accuracy manually.";return;}

  if (uidAverages.accuracy !== null) {
    $("accuracy").value = clamp(uidAverages.accuracy, 0, 100);
    $("accuracySlider").value = $("accuracy").value;
    $("accuracyValue").textContent = fmt(Number($("accuracy").value), 1) + "%";
  }

  if (uidAverages.headshotFrequency !== null) {
    $("headshot").value = clamp(uidAverages.headshotFrequency, 0, 100);
    $("headshotSlider").value = $("headshot").value;
    $("headshotValue").textContent = fmt(Number($("headshot").value), 1) + "%";
  }

  render();
});

connectSlider("interval", "intervalSlider", "intervalValue", " m");
connectSlider("count", "countSlider", "countValue", "");
connectSlider("accuracy", "accuracySlider", "accuracyValue", "%");
connectSlider("headshot", "headshotSlider", "headshotValue", "%");


[
  "includeEndpoint", "startAtCliff", "evenSpacing", "rangeScenario",
  "showGraph", "showTable"
].forEach(id => $(id).addEventListener("change", render));

let baseline = null, accuracyEdited = false;
["accuracy", "accuracySlider"].forEach(id => $(id).addEventListener("input", () => accuracyEdited = true));
function applyBaseline() {
  if(WEAPON.kind==="shotgun") return;
  if (!baseline) return;
  $("accuracy").value = $("accuracySlider").value = baseline.accuracy;
  $("accuracyValue").textContent = fmt(baseline.accuracy, 1) + "%";
  render();
}
$("applyUid").addEventListener("click", () => accuracyEdited = true);
$("useBaseline").addEventListener("click", () => { accuracyEdited = false; applyBaseline(); });
async function loadBaseline() {
  try {
    const response = await fetch(STATIC?new URL('assets/daily-baseline.json',SITE_ROOT):new URL('api/baseline?weapon='+WEAPON.id,SITE_ROOT));
    if (!response.ok) throw new Error("service unavailable");
    let data = await response.json();
    if(STATIC) data={baseline:data.weapons?.[WEAPON.id]||(WEAPON.id==='p61'&&Number.isFinite(data.accuracy)?data:null),running:false,progress:data.collection||null,error:'Hosted snapshot; the daily collector runs separately via GitHub Actions.'};
    baseline = data.baseline;
    const progressText = data.progress
      ? ` Current collection: accuracies pulled from ${data.progress.playersFetched} players; ${data.progress.playersDiscovered} unique players discovered so far.`
      : "";
    $("useBaseline").disabled = !baseline;
    $("baselineStatus").textContent = baseline
      ? `Daily default: ${fmt(baseline.accuracy)}% · ${baseline.contributors} eligible players out of ${baseline.players} fetched · completed ${baseline.completedAt}. Coverage: union of four public lifetime rankings. ${data.running ? "Refresh in progress." : ""} ${data.error || ""}`
      : `No completed daily baseline yet. Using the displayed manual accuracy until this weapon’s daily average completes. ${data.running ? "First collection in progress." : ""} ${data.error || ""}`;
    $("baselineStatus").textContent += progressText;
    if (!accuracyEdited && WEAPON.kind!=="shotgun") applyBaseline();
  } catch { $("baselineStatus").textContent = "Daily average unavailable. Using the displayed manual accuracy as the temporary default."; }
}
loadBaseline();
setInterval(loadBaseline, 60000);
render();
