'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {dailyPick,dayKey}=require('../frontend/discover.cjs');
const pool=Array.from({length:300},(_,i)=>({bgmId:i+1,name:'番'+(i+1)}));
test('daily picks are stable within a day, change the next day and skip watched or saved shows',()=>{
 const a=dailyPick(pool,[],8,'2026-11-3'),b=dailyPick(pool,[],8,'2026-11-3'),c=dailyPick(pool,[],8,'2026-11-4');
 assert.deepEqual(a.map(x=>x.bgmId),b.map(x=>x.bgmId));assert.notDeepEqual(a.map(x=>x.bgmId),c.map(x=>x.bgmId));assert.equal(new Set(a.map(x=>x.bgmId)).size,8);
 const seen=a.slice(0,3).map(x=>x.bgmId),d=dailyPick(pool,seen,8,'2026-11-3');assert.ok(d.every(x=>!seen.includes(x.bgmId)));assert.equal(d.length,8);
 assert.equal(pool.length,300);assert.equal(dayKey(new Date(2026,10,3)),'2026-11-3');
});
