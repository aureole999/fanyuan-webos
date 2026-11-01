const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {CustomDanmaku,validateBase,rankAnimes,parseComments}=require('../src/custom-danmaku.cjs');
const {DanmakuSettings}=require('../src/danmaku-settings.cjs');const {DanmakuService}=require('../src/danmaku.cjs');
const ctx={subjectId:1,subjectPrimaryName:'测试番',subjectNames:['测试番'],subjectPublishDate:'2023-10-01',episodeId:100,episodeSort:1,episodeEp:1,episodeName:'重逢',episodeNames:['重逢']};
const anime=(id=1)=>({animeId:id,bangumiId:'platform-show',animeTitle:'测试番(2023)【日番】from youku',source:'youku',startDate:'2023-10-01'});
function detail(id=11){return {success:true,bangumi:{animeTitle:anime().animeTitle,bangumiId:'platform-show',episodes:[{episodeId:id,episodeNumber:'1',episodeTitle:'【youku】 第1集 重逢'}]}};}
const comments={count:1,comments:[{cid:7,p:'12.5,1,16777215,u',m:'测试弹幕'}],videoDuration:1500};
function make(fn){return new CustomDanmaku({config:()=>({url:'https://self.example/prefix',token:'private-token'}),request:async(url,options)=>({text:JSON.stringify(await fn(new URL(url),options))})});}
function normal(u){if(u.pathname.endsWith('/search/anime'))return {success:true,animes:[anime()]};if(u.pathname.includes('/bangumi/'))return detail();if(u.pathname.includes('/comment/'))return comments;throw Error('unexpected');}
test('custom server uses its own path Token and explicit JSON format, never official signing credentials',async()=>{
 const client=make((u,o)=>{assert.ok(u.pathname.startsWith('/prefix/private-token/api/v2/'));assert.equal(o.sameOriginRedirects,true);assert.equal(o.headers,undefined);if(u.pathname.includes('/comment/')){assert.equal(u.searchParams.get('format'),'json');assert.equal(u.searchParams.get('duration'),'true');}return normal(u);});
 const r=await client.load(ctx);assert.equal(r.items.length,1);assert.equal(r.items[0].serviceId,'custom:youku');assert.equal(r.items[0].time,12.5);assert.equal(r.videoDuration,1500);
});
test('title ranking prefers exact current title and original language over unrelated and dubbed seasons',()=>{
 const rows=[{name:'测试番 普通话(2023)【日番】from youku'},{name:'完全不同(2023)'},{name:'测试番(2023)【日番】from youku'}];assert.deepEqual(rankAnimes(rows,ctx),[rows[2]]);
});
test('Conan TV exact title outranks Dandan movies with unspaced source suffixes',()=>{
 const r={subjectNames:['名侦探柯南'],subjectPrimaryName:'名侦探柯南',subjectPublishDate:'1996-01-08'};
 const rows=[{name:'名侦探柯南VS怪盗基德(2024)【剧场版】from dandan&bahamut',source:'dandan',date:'2024-01-05'},{name:'名侦探柯南(1996)【动漫】from bahamut',source:'bahamut',date:'1996-01-01'}];
 assert.equal(rankAnimes(rows,r)[0],rows[1]);
});
test('Conan episode labels override consecutive server indices when episodes are missing',async()=>{
 const tv={animeId:30234,bangumiId:'30234',animeTitle:'名侦探柯南(1996)【动漫】from bahamut',source:'bahamut',startDate:'1996-01-01'},calls=[];
 const c=make(u=>{calls.push(u.pathname);if(u.pathname.endsWith('/search/anime'))return {animes:[tv]};if(u.pathname.includes('/bangumi/'))return {bangumi:{animeTitle:tv.animeTitle,bangumiId:'30234',episodes:[{episodeId:101,episodeNumber:'720',episodeTitle:'【bahamut】 第764集'},{episodeId:102,episodeNumber:'764',episodeTitle:'【bahamut】 第815集'}]}};if(u.pathname.endsWith('/comment/101'))return comments;throw Error('Wrong episode requested');});
 const r=await c.load({...ctx,subjectPrimaryName:'名侦探柯南',subjectNames:['名侦探柯南'],subjectPublishDate:'1996-01-08',episodeSort:764,episodeEp:764,episodeName:'柯南与平次 恋爱的暗号（后篇）'});
 assert.equal(r.episodeId,'101');assert.equal(r.match.episodeName,'【bahamut】 第764集');assert.ok(!calls.some(p=>p.endsWith('/comment/102')));
 const list=await c.episodeList({query:'名侦探柯南',subjectName:tv.animeTitle,source:'bahamut',sourceKey:'30234'});assert.equal(list[0].selection.episodeNumber,'764');
});
test('expired details trigger a new search and use regenerated IDs',async()=>{
 let searches=0;const ids=[];const c=make(u=>{if(u.pathname.endsWith('/search/anime'))return {animes:[anime(++searches)]};if(u.pathname.endsWith('/bangumi/1')){const e=Error('源站返回 HTTP 404');throw e;}if(u.pathname.includes('/bangumi/'))return detail(99);if(u.pathname.includes('/comment/')){ids.push(u.pathname.split('/').pop());return comments;}});
 const r=await c.load(ctx);assert.equal(searches,2);assert.deepEqual(ids,['99']);assert.equal(r.items.length,1);
});
test('a recycled 200-detail ID for a different show is rejected and resolved again',async()=>{
 let count=0;const c=make(u=>{if(u.pathname.endsWith('/search/anime'))return {animes:[anime(++count)]};if(u.pathname.endsWith('/bangumi/1'))return {bangumi:{animeTitle:'另一部番',episodes:[]}};if(u.pathname.includes('/bangumi/'))return detail(55);return comments;});
 assert.equal((await c.load(ctx)).episodeId,'55');assert.equal(count,2);
});
test('manual matching persists platform identity and episode number, never reuses saved transient IDs',async()=>{
 const c=make(u=>u.pathname.endsWith('/search/anime')?{animes:[anime(909)]}:u.pathname.includes('/bangumi/')?detail(888):comments);
 const selection={query:'测试番',subjectName:anime().animeTitle,source:'youku',sourceKey:'platform-show',episodeNumber:'1',episodeName:'重逢',id:'expired'};
 const r=await c.load(ctx,selection);assert.equal(r.episodeId,'888');assert.equal(r.match.method,'manual');
});
test('auth and rate-limit errors are actionable, non-retryable, and never echo Token-bearing URLs',async()=>{
 for(const status of [401,403,429]){let calls=0;const c=make(u=>{calls++;throw Error('源站返回 HTTP '+status+' '+u.href);});await assert.rejects(c.load(ctx),e=>e.statusCode===status&&e.noRetry&&!e.message.includes('private-token'));assert.equal(calls,1);}
});
test('transient comment 404 re-resolves IDs, while repeated successful loads reuse comment data',async()=>{
 let searches=0,requests=0;const c=make(u=>{if(u.pathname.endsWith('/search/anime'))return {animes:[anime(++searches)]};if(u.pathname.includes('/bangumi/'))return detail(searches*10);if(u.pathname.includes('/comment/')){requests++;if(requests===1)throw Error('源站返回 HTTP 404');return comments;}});
 assert.equal((await c.load(ctx)).items.length,1);assert.equal(requests,2);await c.load(ctx);assert.equal(requests,2);
});
test('manual source and episode listing is usable after server cache resets',async()=>{
 const c=make(normal),sources=await c.search('测试番'),list=await c.episodeList({query:'测试番',subjectName:sources[0].name,source:sources[0].source,sourceKey:sources[0].sourceKey});
 assert.equal(list[0].selection.episodeNumber,'1');assert.equal(list[0].selection.subjectName,anime().animeTitle);assert.equal(list[0].episodeName,'重逢');assert.equal(list[0].selection.id,undefined);
});
test('custom comment IDs are namespaced; malformed comments are dropped without corrupting modes',()=>{
 const data={comments:[{cid:1,p:'1,5,255,[BiliBili]u',m:'顶'},{cid:1,p:'2,4,16711680,u',m:'底'},{cid:1,p:'2,4,16711680,u',m:'底'},{cid:5,p:'bad,1,1,u',m:'坏'}]};const r=parseComments(data,'youku');assert.equal(r.length,2);assert.equal(r[0].mode,'TOP');assert.equal(r[1].mode,'BOTTOM');assert.notEqual(r[0].id,r[1].id);
});
test('custom config migrates old settings, preserves Token on blank entry, and never exposes it in public status',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fanyuan-custom-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.writeFileSync(path.join(dir,'danmaku-settings.json'),JSON.stringify({appId:'',appSecret:'',animeko:true,dandanplay:true}));
 const s=new DanmakuSettings(dir);await s.init();await s.configure({customUrl:'https://self.example/',customToken:'secret-to-keep',customEnabled:true});await s.configure({customToken:''});
 const reload=new DanmakuSettings(dir);await reload.init();assert.equal(reload.custom().token,'secret-to-keep');assert.equal(reload.status().customUrl,'https://self.example');assert.equal(reload.status().customEnabled,true);assert.ok(!JSON.stringify(reload.status()).includes('secret-to-keep'));await reload.configure({clearCustomToken:true});assert.equal(reload.status().hasCustomToken,false);
 assert.throws(()=>validateBase('https://username:password@self.example/'));assert.throws(()=>validateBase('https://self.example/?token=abc'));
});
test('custom provider works by source title when Bangumi fails, with no independent provider requests',async()=>{
 const settings={status:()=>({animeko:true,dandanplay:false,customEnabled:true}),credentials:()=>({}),custom:()=>({url:'https://self.example',token:'t'})};
 const s=new DanmakuService({settings,request:async url=>{const u=new URL(url);if(u.hostname==='self.example')return {text:JSON.stringify(normal(u))};throw Error('Bangumi offline');}});
 const r=await s.load({subject:{name:'测试番'},sort:1});assert.equal(r.providers.find(p=>p.id==='custom').status,'ok');assert.equal(r.items.length,1);
});

function platformAnime(source,id){return {...anime(id),source,bangumiId:source+'-show',animeTitle:'测试番(2023)【日番】from '+source};}
function platformDetail(source,id){return {bangumi:{animeTitle:platformAnime(source,1).animeTitle,bangumiId:source+'-show',episodes:[{episodeId:id,episodeNumber:'1',episodeTitle:'第1话 重逢'}]}};}
test('automatic matching prefers Dandanplay over earlier populated platform results',async()=>{
 const calls=[];const c=make(u=>{calls.push(u.pathname);if(u.pathname.endsWith('/search/anime'))return {animes:[platformAnime('renren',1),platformAnime('dandan',2)]};if(u.pathname.endsWith('/bangumi/2'))return platformDetail('dandan',22);if(u.pathname.endsWith('/comment/22'))return comments;throw Error('Dandanplay should win');});
 const r=await c.load(ctx);assert.equal(r.episodeId,'22');assert.equal(r.items[0].serviceId,'custom:dandan');assert.ok(!calls.some(p=>p.endsWith('/bangumi/1')));
});
test('empty or missing Dandanplay episodes fall back to another matching platform',async()=>{
 for(const missing of [false,true]){
  const c=make(u=>{if(u.pathname.endsWith('/search/anime'))return {animes:[platformAnime('renren',1),platformAnime('dandan',2)]};if(u.pathname.endsWith('/bangumi/2'))return missing?{bangumi:{...platformDetail('dandan',22).bangumi,episodes:[]}}:platformDetail('dandan',22);if(u.pathname.endsWith('/comment/22'))return {comments:[]};if(u.pathname.endsWith('/bangumi/1'))return platformDetail('renren',11);if(u.pathname.endsWith('/comment/11'))return comments;throw Error('unexpected');});
  assert.equal((await c.load(ctx)).items[0].serviceId,'custom:renren');
 }
});
test('explicit manual platform selection overrides automatic Dandanplay preference',async()=>{
 const c=make(u=>u.pathname.endsWith('/search/anime')?{animes:[platformAnime('renren',1),platformAnime('dandan',2)]}:u.pathname.endsWith('/bangumi/1')?platformDetail('renren',11):comments);
 const choice={query:'测试番',subjectName:platformAnime('renren',1).animeTitle,source:'renren',sourceKey:'renren-show',episodeNumber:'1',episodeName:'重逢'};
 const r=await c.load(ctx,choice);assert.equal(r.match.method,'manual');assert.equal(r.items[0].serviceId,'custom:renren');
});
test('service uses one comment provider; additional mirror requests are metadata-only',async()=>{
 const hosts=[];const settings={status:()=>({customEnabled:true,animeko:true,dandanplay:true}),custom:()=>({url:'https://self.example',token:'t'})};
 const s=new DanmakuService({settings,request:async url=>{const u=new URL(url);hosts.push(u.hostname);if(u.hostname==='api.danmaku.weeblify.app'){assert.match(u.searchParams.get('path'),/^\/v2\/(?:search\/anime\?|bangumi\/)/);assert.ok(!url.includes('/t/'));return {text:JSON.stringify({animes:[]})};}if(u.hostname==='self.example')return {text:JSON.stringify(normal(u))};if(u.hostname==='api.bgm.tv')return {text:JSON.stringify({data:[{id:100,sort:1,ep:1,name_cn:'重逢'}],total:1})};throw Error('removed provider requested');}});
 const r=await s.load({subjectId:1,sort:1,subject:{name:'测试番'}});assert.deepEqual(r.providers.map(x=>x.id),['custom']);assert.equal(r.items.length,1);assert.ok(hosts.every(h=>['self.example','api.bgm.tv','api.danmaku.weeblify.app'].includes(h)));
});

test('manual numeric episode identity survives leading zeros and blank titles never pick the wrong single episode',async()=>{
 const c=make(u=>u.pathname.endsWith('/search/anime')?{animes:[anime()]}:u.pathname.includes('/bangumi/')?{bangumi:{...detail().bangumi,episodes:[{episodeId:31,episodeNumber:'1',episodeTitle:'【youku】 第03集'}]}}:comments);
 const selection={query:'测试番',subjectName:anime().animeTitle,source:'youku',sourceKey:'platform-show',episodeNumber:'3',episodeName:''};
 assert.equal((await c.load(ctx,selection)).episodeId,'31');await assert.rejects(c.load(ctx,{...selection,episodeNumber:'4'}),/剧集已变化/);
});
test('automatic matching rejects another season/part even when its title contains the expected name',()=>{
 const r={...ctx,subjectNames:['测试番 第三季'],subjectPrimaryName:'测试番 第三季'};
 const rows=[{name:'测试番 第三季 第2部分(未知)【TV动画】from dandan',source:'dandan'},{name:'测试番(2023)【TV动画】from dandan',source:'dandan'},{name:'测试番 第三季(2023)【动画】from renren',source:'renren'}];
 assert.deepEqual(rankAnimes(rows,r),[rows[2]]);
});
test('searches declared aliases for preferred Dandanplay before accepting another platform',async()=>{
 const queries=[];const c=make(u=>{if(u.pathname.endsWith('/search/anime')){const q=u.searchParams.get('keyword');queries.push(q);return {animes:[platformAnime(q==='Test alternate'?'dandan':'renren',q==='Test alternate'?2:1)]};}if(u.pathname.endsWith('/bangumi/2'))return platformDetail('dandan',22);if(u.pathname.endsWith('/comment/22'))return comments;throw Error('Should choose Dandanplay found via alias');});
 const r=await c.load({...ctx,subjectNames:['测试番','Test alternate']});assert.equal(r.episodeId,'22');assert.deepEqual(queries,['测试番','Test alternate']);
 assert.ok(!JSON.stringify(c.diagnostics()).includes('private-token'));
});

test('season numerals and explicit Chinese season labels share identity while part markers remain distinct',()=>{
 const r={...ctx,subjectPrimaryName:'测试番 第二季 ～副标题～ 第2部分',subjectNames:['测试番 第二季 ～副标题～ 第2部分']};
 const rows=[{name:'测试番Ⅱ ～副标题～ 第二部分(2024)【TV动画】from dandan',source:'dandan'},{name:'测试番Ⅲ ～副标题～ 第二部分(2024)【TV动画】from dandan',source:'dandan'},{name:'测试番Ⅱ ～副标题～(2024)【TV动画】from dandan',source:'dandan'}];assert.deepEqual(rankAnimes(rows,r),[rows[0]]);
});
test('service special/opening labels do not inflate main-episode counts or acquire numeric fallback identities',async()=>{
 const c=make(u=>u.pathname.endsWith('/search/anime')?{animes:[anime()]}:{bangumi:{...detail().bangumi,episodes:[{episodeId:1,episodeNumber:'1',episodeTitle:'【youku】 第1话 正片'},{episodeId:2,episodeNumber:'2',episodeTitle:'【youku】 S1 番外編 特别故事'},{episodeId:3,episodeNumber:'3',episodeTitle:'【youku】 C1 Ending'}]}});
 const list=await c.episodeList({query:'测试番',subjectName:anime().animeTitle,source:'youku',sourceKey:'platform-show'});assert.equal(list[0].number,'1');assert.equal(list[1].number,null);assert.equal(list[1].episodeName,'特别故事');assert.equal(list[2].number,null);assert.equal(list[2].episodeName,'Ending');
});

test('subtitle-free fallback query still validates the complete declared subject name',async()=>{
 const name='测试番 ～长副标题～',queries=[];const a={...anime(),animeTitle:name+'(2023)【TV动画】from youku'};
 const c=make(u=>{if(u.pathname.endsWith('/search/anime')){const q=u.searchParams.get('keyword');queries.push(q);if(q===name)throw Error('HTTP 503');return {animes:[a]};}if(u.pathname.includes('/bangumi/'))return {bangumi:{...detail().bangumi,animeTitle:a.animeTitle}};return comments;});
 assert.equal((await c.load({...ctx,subjectPrimaryName:name,subjectNames:[name]})).items.length,1);assert.deepEqual(queries,[name,'测试番']);
});

function identityFixture(options={}){
 const state={metadataSearch:0,metadataDetails:0,customQueries:[],comments:[],generation:0};
 const current={...ctx,subjectId:88,subjectPrimaryName:'星旅 第三季',subjectNames:['星旅 第三季','星の旅 第3期','Star Journey Season 3'],subjectPublishDate:'2026-10-02',episodeName:'',episodeNames:[]};
 const client=make(u=>{
  if(u.hostname==='api.danmaku.weeblify.app'){
   assert.ok(!u.href.includes('private-token'));const path=u.searchParams.get('path');
   if(path.startsWith('/v2/search/anime?')){state.metadataSearch++;if(options.offline)throw Error('metadata offline');return {animes:[{animeId:700,animeTitle:'星旅 续篇'}]};}
   assert.equal(path,'/v2/bangumi/700');state.metadataDetails++;return {bangumi:{animeId:700,animeTitle:'星旅 续篇',bangumiUrl:options.falseHost?'https://bangumi.tv.attacker.example/subject/88':'https://bgm.tv/subject/'+(options.otherSubject?89:88)}};
  }
  assert.equal(u.hostname,'self.example');
  if(u.pathname.endsWith('/search/anime')){
   const q=u.searchParams.get('keyword');state.customQueries.push(q);state.generation++;
   if(q==='星旅 续篇')return {animes:[{animeId:100+state.generation,bangumiId:'700',animeTitle:'星旅 续篇(2026)【TV动画】from dandan',source:'dandan',startDate:'2026-10-02'}]};
   return {animes:[{animeId:1,bangumiId:'future-part',animeTitle:'星旅 第三季 第2部分(未知)【TV动画】from dandan',source:'dandan'},{animeId:2,bangumiId:'renren-show',animeTitle:'星旅 第三季(2026)【动画】from renren',source:'renren'}]};
  }
  if(u.pathname.includes('/bangumi/')){
   const verified=Number(u.pathname.split('/').pop())>100;
   return {bangumi:{animeTitle:verified?'星旅 续篇(2026)【TV动画】from dandan':'星旅 第三季(2026)【动画】from renren',bangumiId:verified?'700':'renren-show',episodes:[...Array.from({length:5},(_,i)=>({episodeId:(verified?state.generation*1000:200)+i+1,episodeNumber:i+1,episodeTitle:'第'+(i+1)+'话'})),...(options.cumulative?[{episodeId:999,episodeNumber:53,episodeTitle:'第53话'}]:[])]}};
  }
  if(u.pathname.includes('/comment/')){const id=Number(u.pathname.split('/').pop());state.comments.push(id);return id>1000?comments:{comments:[]};}
  throw Error('unexpected request');
 });return {client,current,state};
}
test('cross-database subject identity resolves a renamed season for all five episodes and caches only its stable identity',async()=>{
 const {client,current,state}=identityFixture();const results=[];
 for(let n=1;n<=5;n++){const r=await client.load({...current,episodeId:100+n,episodeSort:48+n,episodeEp:n});results.push(r);assert.equal(r.items.length,1);assert.equal(r.match.method,'auto:subjectId:exactEp');assert.equal(r.match.episodeName,'第'+n+'话');assert.equal(r.items[0].serviceId,'custom:dandan');}
 assert.equal(state.metadataSearch,1);assert.equal(state.metadataDetails,1);assert.equal(new Set(results.map(r=>r.episodeId)).size,5);assert.ok(results.every((r,i)=>Number(r.episodeId)%1000===i+1));
 assert.ok(state.customQueries.slice(-4).every(q=>q==='星旅 续篇'));assert.ok(!JSON.stringify(client.diagnostics()).includes('private-token'));
});
test('same franchise or matching year never substitutes for an exact cross-database subject ID',async()=>{
 for(const options of [{otherSubject:true},{falseHost:true},{offline:true}]){const {client,current,state}=identityFixture(options);const r=await client.load({...current,episodeSort:53,episodeEp:5});assert.equal(r.items.length,0);assert.ok(state.comments.every(id=>id<1000));assert.ok(!state.customQueries.includes('星旅 续篇'));}
});
test('an empty old manual episode mapping recovers the verified whole-season identity while populated manual choices keep precedence',async()=>{
 const {client,current}=identityFixture(),selection={query:'星旅 第三季',subjectName:'星旅 第三季(2026)【动画】from renren',source:'renren',sourceKey:'renren-show',episodeNumber:3,episodeName:''};
 const r=await client.load({...current,episodeSort:51,episodeEp:3},selection);assert.equal(r.items.length,1);assert.equal(r.match.method,'auto:subjectId:exactEp');assert.equal(r.match.episodeName,'第3话');
});
test('a confirmed season uses its local episode number ahead of another valid cumulative number',async()=>{
 const {client,current}=identityFixture({cumulative:true});const r=await client.load({...current,episodeSort:53,episodeEp:5});assert.equal(r.items.length,1);assert.equal(r.match.episodeName,'第5话');assert.notEqual(r.episodeId,'999');
});
test('identity caching never carries a renamed season into another Bangumi subject',async()=>{
 const {client,current}=identityFixture();assert.equal((await client.load({...current,episodeSort:49,episodeEp:1})).items.length,1);
 const other=await client.load({...current,subjectId:89,episodeSort:49,episodeEp:1});assert.equal(other.items.length,0);assert.ok(!other.match||!other.match.method.includes('subjectId'));
});
test('an empty manual choice is kept when recovery is unverified or the mirror is offline',async()=>{
 for(const options of [{otherSubject:true},{offline:true}]){
  const {client,current}=identityFixture(options),selection={query:'星旅 第三季',subjectName:'星旅 第三季(2026)【动画】from renren',source:'renren',sourceKey:'renren-show',episodeNumber:3,episodeName:''};
  const r=await client.load({...current,episodeSort:51,episodeEp:3},selection);assert.equal(r.items.length,0);assert.equal(r.match.method,'manual');assert.equal(r.match.subjectName,selection.subjectName);
 }
});
test('a mirror answer without a matching subject is remembered across episodes',async()=>{
 const {client,current,state}=identityFixture({otherSubject:true});
 await client.load({...current,episodeId:201,episodeSort:49,episodeEp:1});const searches=state.metadataSearch;assert.ok(searches>0);
 await client.load({...current,episodeId:202,episodeSort:50,episodeEp:2});assert.equal(state.metadataSearch,searches);
});
test('verified recovery does not repeat a title search that already ran',async()=>{
 const {client,current,state}=identityFixture();await client.load({...current,episodeSort:49,episodeEp:1});
 assert.equal(state.customQueries.filter(q=>q==='星旅 续篇').length,1);
});
