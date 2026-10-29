import test from 'node:test';
import assert from 'node:assert/strict';
import {arStats,nextMidnight} from '../scripts/stats.mjs';
const player=(f,h,heads=0)=>({shots_fired_zoomed:{p61:f},shots_fired_unzoomed:{p61:0},shots_hit_zoomed:{p61:h},shots_hit_unzoomed:{p61:0},headshots:{p61:heads}});
test('accuracy and conditional headshots',()=>assert.deepEqual(arStats(player(100,25,5)),{accuracy:25,headshotFrequency:20}));
test('real zero hits is eligible; missing and impossible counters are unavailable',()=>{
 assert.equal(arStats(player(100,0)).accuracy,0);
 for(const p of [{},player(0,0),player(10,11)]) assert.equal(arStats(p).accuracy,null);
 assert.equal(arStats(player(100,25,26)).headshotFrequency,null);
});
test('UTC midnight crosses month and year independently of local timezone',()=>assert.equal(new Date(nextMidnight(Date.parse('2026-12-31T23:59:59Z'))).toISOString(),'2027-01-01T00:00:00.000Z'));
