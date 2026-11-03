const test=require('node:test'),assert=require('node:assert/strict');
const {createSourceProbeSession}=require('../frontend/source-probes.cjs');
const tick=()=>new Promise(r=>setImmediate(r));
test('source badges start two probes, publish per-source results and preserve stable snapshots',async()=>{
 const pending=new Map(),started=[],s=createSourceProbeSession(['a','b','c'].map(id=>({id})),id=>{started.push(id);return new Promise((ok,fail)=>pending.set(id,{ok,fail}));});
 const first=s.get('a');assert.equal(s.get('a'),first);let updates=0;const off=s.subscribe('a',()=>updates++);s.start();s.start();assert.deepEqual(started,['a','b']);assert.equal(s.get('c').status,'pending');
 pending.get('a').ok({matchCount:1,candidateCount:2});await tick();assert.equal(s.get('a').status,'done');assert.equal(s.get('a').candidateCount,2);assert.deepEqual(started,['a','b','c']);assert.equal(updates,2);
 pending.get('b').fail(Error('offline'));pending.get('c').ok({matchCount:0,candidateCount:0});await tick();assert.equal(s.get('b').status,'error');assert.equal(s.get('c').status,'done');s.cancel();assert.doesNotThrow(off);
});
test('closing the source dialog cancels queued probes and ignores late results',async()=>{
 const pending=[],started=[],s=createSourceProbeSession(['a','b','c','d'].map(id=>({id})),id=>{started.push(id);return new Promise(r=>pending.push(r));});s.start();s.cancel();for(const resolve of pending)resolve({matchCount:9});await tick();assert.deepEqual(started,['a','b']);assert.equal(s.get('a').status,'loading');
});
