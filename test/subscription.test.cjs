const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {SubscriptionManager,readSubscription,reconcile,HOUR,DEFAULT_URL}=require('../src/subscription.cjs');
// A synthetic rule in the Animeko media-source format; no third-party rules ship with the app.
const original={id:'fixture-json-api',factoryId:'json-api',version:1,arguments:{name:'示例接口源',tier:0,searchConfig:{baseUrl:'https://api.example.test',search:{request:{url:'https://api.example.test/search',method:'POST',body:'{"q":"{keyword}"}'},selectItems:'$[*]',selectName:'$.title',selectId:'$.id'},subject:{request:{url:'https://api.example.test/detail',method:'POST',body:'{"id":{id}}'},channelFormatId:'grouped',channelFormatGrouped:{selectChannels:'$.sources[*]',selectChannelName:'$.name'},episodes:{selectEpisodes:'$.episodes[*]',selectName:'$.title',selectId:'$.id',selectSort:'$.episode_number'}}}}};
original.arguments.searchConfig.subject={channelFormatId:'none',episodes:{}};
function fixture(id,name){return Object.assign({},JSON.parse(JSON.stringify(original)),{id,arguments:Object.assign({},original.arguments,{name:name||id})});}
async function setup(t,request,now){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fanyuan-subs-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const m=new SubscriptionManager({dir,bundled:[fixture('keep')],request,now});await m.init();return m;}
const document=rules=>JSON.stringify({schemaVersion:2,name:'测试订阅',mediaSources:rules});
test('original current and legacy subscription envelopes; future schema never falls back silently',()=>{
 assert.equal(readSubscription(document([original])).rules[0].id,original.id);
 assert.equal(readSubscription(JSON.stringify({exportedMediaSourceDataList:{mediaSources:[original]}})).rules.length,1);
 assert.equal(readSubscription(JSON.stringify({mediaSources:[]})).rules.length,0);
 assert.throws(()=>readSubscription(JSON.stringify({schemaVersion:3,mediaSources:[original],exportedMediaSourceDataList:{mediaSources:[original]}})),e=>e.requiresNewerApp===true);
 assert.throws(()=>readSubscription(document([original,original])),/重复/);
});
test('remote IDs survive renaming and reordering, unsupported revisions retain old config, removed entries disappear',()=>{
 const keep=fixture('keep','旧名'),removed=fixture('removed');const sub={id:'default',entries:[{instanceId:'keep',enabled:false,rule:keep},{instanceId:'removed',enabled:true,rule:removed}]};
 let changed=fixture('keep','新名'),r=reconcile(sub,[fixture('added'),changed]);
 assert.deepEqual(r.entries.map(e=>e.instanceId),['added','keep']);assert.equal(r.entries[1].enabled,false);assert.equal(r.entries[1].rule.arguments.name,'新名');
 changed.version=9;r=reconcile(sub,[changed]);assert.equal(r.unsupportedCount,1);assert.deepEqual(r.entries[0].rule,keep);
 const bt={id:'bt',factoryId:'rss',version:1,arguments:{name:'BT'}};assert.equal(reconcile(sub,[bt]).entries.length,0);
});
test('fetch raw published JSON, persist across service restart, hourly auto-check and forced manual refresh',async t=>{
 let n=0,clock=1000;const raw=document([fixture('keep','新名称'),fixture('new')]);const request=async url=>{assert.equal(url,DEFAULT_URL);n++;return {text:raw};};
 const m=await setup(t,request,()=>clock);await m.updateAll(false);assert.equal(n,1);assert.equal(m.status().subscriptions[0].updatePeriod,HOUR);assert.equal(m.state.subscriptions[0].raw,raw);
 await m.updateAll(false);assert.equal(n,1);clock+=HOUR+1;await m.updateAll(false);assert.equal(n,2);await m.update('default',true);assert.equal(n,3);
 const restored=new SubscriptionManager({dir:m.dir,bundled:[fixture('keep')],request,now:()=>clock});await restored.init();assert.deepEqual(restored.rules(),m.rules());assert.equal(restored.state.subscriptions[0].raw,raw);
 await restored.updateAll(false);assert.equal(n,3);
});
test('offline and newer-schema failures retain last working rules and successful update timestamp',async t=>{
 let mode='ok',clock=1;const m=await setup(t,async()=>{if(mode==='offline')throw Error('offline');return {text:mode==='new'?JSON.stringify({schemaVersion:99,mediaSources:[]}):document([fixture('keep','updated')])};},()=>clock);
 await m.updateAll(true);const previous=JSON.stringify(m.rules()),success=m.state.subscriptions[0].lastSuccess;mode='offline';clock++;await m.updateAll(true);assert.equal(JSON.stringify(m.rules()),previous);assert.equal(m.state.subscriptions[0].lastSuccess,success);assert.match(m.status().subscriptions[0].lastUpdated.error.message,/offline/);
 mode='new';clock++;await m.updateAll(true);assert.equal(JSON.stringify(m.rules()),previous);assert.equal(m.status().subscriptions[0].lastUpdated.error.requiresNewerApp,true);
});
test('concurrent refreshes coalesce; removal during download does not restore the subscription and retains downloaded sources',async t=>{
 let finish;const m=await setup(t,()=>new Promise(r=>{finish=r;}));const a=m.update('default',true),b=m.update('default',true);assert.equal(a,b);await m.remove('default');finish({text:document([fixture('new')])});await a;assert.equal(m.status().subscriptions.length,0);assert.deepEqual(m.rules().map(r=>r.id),['keep']);
});
test('pause only stops auto refresh, retains cached sources, and persisted config does not reset after restart',async t=>{
 let requests=0;const m=await setup(t,async()=>{requests++;return {text:document([fixture('keep')])};});await m.configure('default',{enabled:false,updatePeriod:6*HOUR});await m.updateAll(false);assert.equal(requests,0);assert.equal(m.rules().length,1);
 const reload=new SubscriptionManager({dir:m.dir,bundled:[],request:async()=>{throw Error('not needed');}});await reload.init();assert.equal(reload.status().subscriptions[0].enabled,false);assert.equal(reload.status().subscriptions[0].updatePeriod,6*HOUR);
});
test('direct request failure uses the original public subscription proxy; future schemas bypass proxy',async t=>{
 const urls=[];const m=await setup(t,async url=>{urls.push(url);if(url===DEFAULT_URL)throw Error('blocked');return {text:document([fixture('keep')])};});m.proxyBase='https://api.animeko.org';await m.updateAll(true);assert.equal(urls.length,2);assert.match(urls[1],/\/v1\/subs\/proxy\?url=/);assert.equal(m.status().subscriptions[0].lastUpdated.via,'proxy');
});
test('corrupted primary cache restores prior valid backup; distinct subscriptions never collide on source IDs',async t=>{
 const m=await setup(t,async()=>({text:document([fixture('keep'),fixture('new')])}));await m.updateAll(true);await m.add('https://example.test/custom.json');assert.equal(new Set(m.rules().map(r=>r.id)).size,4);
 await m.configure('default',{updatePeriod:12*HOUR});fs.writeFileSync(path.join(m.dir,'subscriptions.json'),'{broken');const restored=new SubscriptionManager({dir:m.dir,bundled:[],request:async()=>{throw Error('offline');}});await restored.init();assert.equal(restored.rules().length,4);assert.match(restored.storageError,/损坏/);
});

test('removing and readding the same custom URL preserves prior instances without ID collisions',async t=>{
 const m=await setup(t,async()=>({text:document([fixture('keep')])}));
 await m.add('https://example.test/list.json');const first=m.status().subscriptions.find(s=>s.id!=='default').id;await m.remove(first);await m.add('https://example.test/list.json');
 assert.equal(m.rules().length,3);assert.equal(new Set(m.rules().map(r=>r.id)).size,3);
 const restored=new SubscriptionManager({dir:m.dir,bundled:[]});await restored.init();assert.equal(restored.rules().length,3);
});
