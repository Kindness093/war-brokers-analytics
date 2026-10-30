import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {editablePreset,validateWeapon,metricValue,rowAt,engagementAt,sampleDistances,graphDistances,exportCsv} from '../lab-model.mjs';
import {smoothPath} from '../lab-chart.mjs';
const catalog=JSON.parse(await readFile(new URL('../data/weapons.json',import.meta.url)));
const ar=editablePreset(catalog.find(w=>w.slug==='ar-rifle'));
const aim={accuracy:1,headshot:0,reloads:false,rangeModel:'published'};
test('calculator AR preset matches source maths and edits do not mutate presets',()=>{
 assert.deepEqual(validateWeapon(ar),[]);
 assert.equal(metricValue(ar,0,'bodyShots',aim),7);
 assert.equal(metricValue(ar,0,'bttk',aim),6/8.108);
 assert.equal(metricValue(ar,205,'damage',aim),6);
 const changed=structuredClone(ar);changed.baseDamage=100;changed.headDamage=200;changed.magazine=50;
 assert.equal(metricValue(changed,0,'bodyShots',aim),4);
 assert.equal(metricValue(changed,0,'killsPerMag',aim),12);
 assert.equal(ar.baseDamage,60);assert.equal(ar.magazine,30);
});
test('three distinct weapon series share range sampling and have different results',()=>{
 const weapons=catalog.slice(0,3).map(editablePreset),distances=sampleDistances({maxDistance:205,interval:25,count:8,endpoint:true});
 assert.equal(distances.length,8);assert.equal(distances.at(-1),205);
 const rows=weapons.map(w=>rowAt(w,0,aim));assert.deepEqual(rows.map(r=>r.damage),[60,65,67]);
 assert(graphDistances(weapons[0],205).includes(100));
});
test('pellet and blast presets retain their distinct distance models',()=>{
 const shotgun=editablePreset(catalog.find(w=>w.slug==='shotgun')),rpg=editablePreset(catalog.find(w=>w.slug==='rpg'));
 assert.equal(metricValue(shotgun,0,'expectedShots',aim),2);
 assert.equal(metricValue(rpg,0,'damage',aim),200);assert.equal(metricValue(rpg,36.6,'damage',aim),0);
 assert.equal(metricValue(rpg,0,'bttk',aim),null);
 assert(engagementAt(rpg,10,2,aim).reason);
});
test('invalid limits, zero aim, fractional critical damage and projectile cutoff are explicit',()=>{
 assert(validateWeapon({...ar,range:{cliff:100,plateau:50,endDamage:6}}).length);
 assert(validateWeapon({...ar,magazine:1.5}).length);
 assert.equal(metricValue(ar,0,'vttk',{...aim,accuracy:0}),Infinity);
 assert.equal(metricValue(ar,0,'killsPerMag',{...aim,accuracy:0}),0);
 const fractional={...ar,headDamage:125};assert.equal(metricValue(fractional,0,'ettk',aim),null);assert(engagementAt(fractional,0,2,aim).reason);
 const sniper=editablePreset(catalog.find(w=>w.slug==='sniper-rifle'));assert.equal(metricValue(sniper,1300,'damage',aim),null);
});
test('CSV includes custom configuration and precise results, and neutralises spreadsheet formulas',()=>{
 const w={...ar,name:'=SUM(1,2)',magazine:50};const csv=exportCsv([{weapon:w,rows:[rowAt(w,0,aim)]}],aim,{engagementDistance:0},{});
 assert(csv.includes("'=SUM(1,2)"));assert(csv.includes('"magazine","","50"'));assert(csv.includes('"0.7400098668"'));
});
test('smooth chart passes through calculated points and retains plateaus',()=>{
 const path=smoothPath([[0,1],[25,1],[50,2],[100,5]]);assert(path.startsWith('M 0 1'));assert(path.endsWith('100 5'));assert(!/NaN|Infinity/.test(path));
});

test('extreme custom scenarios stop at numerical limits instead of blocking the graph',()=>{
 const extreme={...ar,baseDamage:0.1,headDamage:0.2,magazine:500,range:{cliff:0,plateau:200,endDamage:0.01}};
 assert.equal(metricValue(extreme,0,'vttk',{...aim,reloads:true}),null);
 assert.equal(metricValue(extreme,0,'killsPerMag',aim),null);
 assert.equal(metricValue(extreme,0,'bodyShots',aim),3750);
});
