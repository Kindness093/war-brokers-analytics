import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {arStats} from '../scripts/stats.mjs';
test('every primary weapon has a generated page and its own API identifier',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../data/weapons.json',import.meta.url)));
 assert.equal(catalog.length,23);assert.equal(new Set(catalog.map(w=>w.id)).size,23);
 for(const w of catalog) {
  const page=await readFile(new URL('../weapons/'+w.slug+'.html',import.meta.url),'utf8');
  assert(!page.includes('{{'));assert(page.includes('"id": "'+w.id+'"'));
  assert(page.includes('id="magazineSize"'));assert(page.includes('weapon-page.mjs'));
 }
});
test('weapon-specific counters never inherit the AR accuracy',()=>{
 const p={shots_fired_zoomed:{p61:100,p62:100},shots_fired_unzoomed:{p61:0,p62:0},shots_hit_zoomed:{p61:20,p62:40},shots_hit_unzoomed:{p61:0,p62:0},headshots:{p61:5,p62:10}};
 assert.equal(arStats(p,'p61').accuracy,20);assert.equal(arStats(p,'p62').accuracy,40);assert.equal(arStats(p,'p89').accuracy,null);
});

test('wiki graph endpoints drive weapon damage and respect projectile limits',async()=>{
 const {rangeDamage}=await import('../weapon-engine.mjs');
 const catalog=JSON.parse(await readFile(new URL('../data/weapons.json',import.meta.url)));
 const sources=JSON.parse(await readFile(new URL('../data/wiki-range-chart-sources.json',import.meta.url)));
 for(const w of catalog) {
  const s=sources.find(s=>s.slug===w.slug);assert(s.chart);assert(s.transcribed);
  if(w.kind==='explosive') {assert.equal(w.blast.endDamage,0);continue;}
  assert.equal(rangeDamage(w,0),w.baseDamage);
  assert.equal(rangeDamage(w,w.range.cliff),w.baseDamage);
  if(!w.projectileLimit) {
   assert.equal(rangeDamage(w,w.range.plateau),w.range.endDamage);
   const mid=(w.range.cliff+w.range.plateau)/2;
   assert(Math.abs(rangeDamage(w,mid)-(w.baseDamage+w.range.endDamage)/2)<1e-8);
  } else assert.equal(rangeDamage(w,w.projectileLimit+1),null);
 }
 assert.equal(catalog.find(w=>w.slug==='ak-rifle').range.plateau,155);
 assert.equal(catalog.find(w=>w.slug==='mp7').range.plateau,170);
});
