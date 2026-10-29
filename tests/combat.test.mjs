import test from 'node:test';
import assert from 'node:assert/strict';
import {expectedAmmo,reliability,accuracyForTime,shotTime,shotsByTime} from '../combat.mjs';
test('deterministic body and headshot kills',()=>{
 assert.equal(expectedAmmo(60,1,0),7);assert.equal(expectedAmmo(60,1,1),4);
 const r=reliability(60,1,0,1);assert.equal(r.oneMagazine,1);assert.equal(r.withinTime,1);assert.equal(r.median,6/8.108);assert.equal(r.p90,r.median);
});
test('one hit target follows geometric distribution',()=>{
 const r=reliability(375,0.5,0,0);assert.equal(r.withinTime,0.5);assert.equal(r.median,0);assert.equal(r.p90,3/8.108);
 assert.equal(expectedAmmo(375,0.5,0),2);
});
test('reload replaces gap only after full magazine',()=>{
 const opts={reloads:true};assert.equal(shotTime(30,opts),29/8.108);
 assert(Math.abs(shotTime(31,opts)-(29/8.108+1.61))<1e-10);
 assert.equal(shotsByTime(shotTime(31,opts),opts),31);
 assert(reliability(6,1,0,10,opts).withinTime<reliability(6,1,0,10).withinTime);
});
test('inverse accuracy reaches mean time target',()=>{
 const p=accuracyForTime(60,0.4,2);assert(p>0&&p<1);assert(Math.abs((expectedAmmo(60,p,0.4)-1)/8.108-2)<1e-9);
 assert.equal(accuracyForTime(60,0,0),null);
});
test('zero accuracy and magazine impossibility',()=>{
 assert.equal(expectedAmmo(60,0,0),Infinity);assert.equal(reliability(60,0,0,2).p90,Infinity);
 assert.equal(reliability(6,1,0,2).oneMagazine,0);
});

test('expected kills per magazine counts complete kills and discards overkill',async()=>{
 const {expectedKillsPerMagazine:kills}=await import('../combat.mjs');
 assert.equal(kills(60,1,0),4);
 assert.equal(kills(60,1,1),7);
 assert.equal(kills(60,0,0),0);
 assert(Math.abs(kills(375,0.5,0)-15)<1e-10);
 assert.equal(kills(60,1,0,6),0);
});

test('pellet model and noncritical projectiles use weapon-specific outcomes',()=>{
 assert.equal(expectedAmmo(288,1,0,375,{pellets:9}),2);
 assert.equal(expectedAmmo(288,1,1,375,{pellets:9}),1);
 assert.equal(expectedAmmo(375,1,1,375,{multiplier:1}),1);
 assert.equal(reliability(288,1,0,2,{pellets:9,rps:0.952,magazine:5}).oneMagazine,1);
});
test('magazine changes affect kill counts and reload timing',async()=>{
 const {expectedKillsPerMagazine:kills}=await import('../combat.mjs');
 assert.equal(kills(60,1,0,7),1);assert.equal(kills(60,1,0,14),2);
 assert(shotTime(31,{magazine:50,reloads:true})<shotTime(31,{magazine:30,reloads:true}));
});
