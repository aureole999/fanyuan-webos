'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const subjects=require('./fixtures/multiseason/subjects.json'),videos=require('./fixtures/multiseason/videos.json'),danmu=require('./fixtures/multiseason/danmu.json');
const {matchPage,seasonParts}=require('../src/episode-matching.cjs');
const groups=[[979,980,6985],[277554,325585,373247,444557],[140001,278826,316247,425998,510728]];
function context(id){return {subject:subjects.find(s=>s.id===id),series:subjects.filter(s=>groups.find(g=>g.includes(id)).includes(s.id))};}
function video(source,suffix,channel=0){const d=videos.find(v=>v.sourceId===source&&v.subject.url.endsWith(suffix));assert.ok(d,suffix);return {name:d.subject.name,episodes:d.channels[channel].episodes};}
function matched(id,source,suffix,sort,channel=0){const r=matchPage(context(id),video(source,suffix,channel)),m=r.matches.find(x=>Number(x.episode.sort)===sort);return {r,m};}
const cases=[
 [979,'source-c','/1087',1,1],
 [980,'source-c','/1087',13,13],
 [980,'source-a','/5963.html',13,1],
 [6985,'source-c','/1087',25,25],
 [325585,'source-c','/633',12,1],
 [325585,'source-a','/2250.html',12,12],
 [373247,'source-c','/636',0,1],
 [373247,'source-c','/636',1,2],
 [444557,'source-a','/106.html',13,1],
 [444557,'source-b','/2024578657.html',13,1],
 [316247,'source-c','/1395',39,14],
 [316247,'source-a','/3056.html',39,14],
 [316247,'source-b','/2020355197.html',39,14],
 [510728,'source-c','/2893',59,1],
 [510728,'source-a','/10777.html',59,9],
 [510728,'source-b','/202430393.html',59,9]
];
for(const [id,source,url,sort,n] of cases)test('captured video '+id+' sort '+sort+' on '+source+url,()=>{const {r,m}=matched(id,source,url,sort);assert.ok(m,JSON.stringify({reason:r.reason,kind:r.kind,mode:r.mode}));assert.equal(Number(m.row.sort),n);});
test('observed duplicate chapter names and unknown OVA cuts are not auto-mapped',()=>{
 assert.equal(matched(444557,'source-c','/2073',13).r.reason,'duplicateEpisodeTitle');
 assert.equal(matched(6985,'source-a','/7502.html',25).r.available,0);
});
test('captured zero-episode and missing-episode pages never map by array index',()=>{
 const r=matched(373247,'source-c','/636',12);assert.equal(r.m,undefined);
 const p=video('source-b','/2021215153.html');assert.ok(!p.episodes.some(e=>Number(e.sort)===13));
 const ctx=context(316247),result=matchPage(ctx,p);assert.equal(Number(result.matches.find(m=>m.episode.sort===39).row.sort),14);
});
test('season groups follow contiguous Bangumi numbering and retain prologue 0',()=>{
 assert.deepEqual(seasonParts(context(980)).map(s=>s.id),[980]);
 assert.deepEqual(seasonParts(context(444557)).map(s=>s.id),[373247,444557]);
 assert.deepEqual(seasonParts(context(510728)).map(s=>s.id),[425998,510728]);
});
const danmuCases=[[980,'1855737577',13,1],[6985,'1503820908',25,1],[325585,'15954',12,12],[373247,'1479655249',1,1],[444557,'1505809653',13,1],[316247,'1120863733',39,14],[510728,'1211700612',59,9],[510728,'510728',59,59]];
for(const [id,anime,sort,n] of danmuCases)test('captured danmu '+id+' sort '+sort+' in '+anime,()=>{
 const d=danmu.find(d=>d.anime.id===anime),page={danmaku:true,name:d.rows[0].subjectName,episodes:d.rows.map(e=>({...e,name:e.episodeName,genericTitle:!e.episodeName}))};
 const r=matchPage(context(id),page),m=r.matches.find(x=>x.episode.sort===sort);assert.ok(m,JSON.stringify({kind:r.kind,reason:r.reason,mode:r.mode}));assert.equal(Number(m.row.number),n);
});
module.exports={context,video};
const {BangumiContext}=require('../src/bangumi-context.cjs'),{SourceMatcher,canonicalDetail}=require('../src/source-matcher.cjs'),{CustomDanmaku}=require('../src/custom-danmaku.cjs');
function repository(){return new BangumiContext(async url=>{
 const u=new URL(url);if(u.pathname==='/v0/episodes'){const s=subjects.find(s=>s.id===Number(u.searchParams.get('subject_id')));if(!s)throw Error('Unrecorded subject');return {data:s.episodes,total:s.episodes.length};}
 const m=/\/subjects\/(\d+)(\/subjects)?$/.exec(u.pathname),s=m&&subjects.find(s=>s.id===Number(m[1]));if(!s)throw Error('Unrecorded request');
 return m[2]?s.relations:{...s,name:s.originalName,infobox:[{key:'别名',value:s.aliases.map(v=>({v}))}]};
});}
const searches=require('./fixtures/multiseason/video-searches.json');
function sourceService(){const engine={search:async(id,q)=>{const r=searches.find(x=>x.source===id&&x.query===q);return r&&r.items||[];},detail:async(id,subject)=>{const d=videos.find(d=>d.sourceId===id&&d.subject.url===subject.url);if(!d)throw Error('Unrecorded detail');return JSON.parse(JSON.stringify(d));}};return new SourceMatcher(()=>engine,repository());}
for(const [id,source,expected] of [[980,'source-c',13],[325585,'source-c',1],[325585,'source-a',1],[444557,'source-a',1],[316247,'source-c',14],[510728,'source-c',1]])test('source search-to-detail replay '+id+' '+source,async()=>{
 const result=await sourceService().search(source,{...subjects.find(s=>s.id===id),bgmId:id});assert.ok(result.detail,'no mapped detail');const e=result.detail.channels[0].episodes.find(e=>!e.unavailable);assert.equal(Number(e.sourceSort),expected);assert.equal(e.bgmSubjectId,id);assert.ok(e.bgmEpisodeId);assert.equal(result.detail.subject.bgmId,id);
});
test('canonical detail keeps a missing chapter unavailable rather than shifting subsequent positions',()=>{
 const raw=videos.find(v=>v.sourceId==='source-c'&&v.subject.id==='636'),d=canonicalDetail(raw,context(373247));assert.equal(d.channels[0].episodes.length,13);assert.equal(d.channels[0].episodes[0].sort,'0');assert.equal(d.channels[0].episodes[1].sourceSort,'2');assert.equal(d.channels[0].episodes[12].unavailable,true);
});
for(const [id,sort,expected] of [[980,13,'1'],[325585,12,'12'],[373247,1,'1'],[444557,13,'1'],[316247,39,'14'],[510728,59,'9']])test('automatic configured-service replay '+id+' '+sort,async()=>{
 const ctx=context(id),group=groups.find(g=>g.includes(id)),data=danmu.filter(d=>group.some(k=>subjectNamesForFixture(k).some(n=>d.anime.name.includes(n)))||group.includes(277554)&&/无职/.test(d.anime.name)||group.includes(140001)&&/从零/.test(d.anime.name)||group.includes(979)&&/黑礁/.test(d.anime.name));
 const calls=[];const client=new CustomDanmaku({config:()=>({url:'https://fixture.invalid',token:'fixture-only'}),request:async raw=>{
  const u=new URL(raw);if(u.pathname.endsWith('/search/anime'))return {text:JSON.stringify({animes:data.map(d=>({animeId:d.anime.id,animeTitle:d.anime.name,source:d.anime.source,bangumiId:d.anime.sourceKey,startDate:d.anime.date}))})};
  const m=/\/bangumi\/(\d+)$/.exec(u.pathname);if(m){const d=data.find(d=>d.anime.id===m[1]);return {text:JSON.stringify({bangumi:{animeTitle:d.anime.name,bangumiId:d.anime.sourceKey,episodes:d.rows.map(r=>({episodeId:r.id,episodeNumber:r.number,episodeTitle:r.displayName}))}})};}
  const c=/\/comment\/(\d+)$/.exec(u.pathname);if(c){calls.push(c[1]);return {text:JSON.stringify({comments:[{cid:1,p:'1,1,16777215,[dandan]fixture',m:'fixture'}]})};}
  throw Error('Unrecorded network request');
 }});
 const ep=ctx.subject.episodes.find(e=>e.type===0&&e.sort===sort),r=await client.load({subjectId:id,subjectPrimaryName:ctx.subject.name,subjectNames:[ctx.subject.name,ctx.subject.originalName].concat(ctx.subject.aliases),subjectPublishDate:ctx.subject.date,episodeId:ep.id,episodeSort:sort,episodeEp:ep.ep,episodeName:ep.name_cn||ep.name,episodeNames:[ep.name_cn,ep.name],matchingContext:ctx});
 assert.equal(r.status,'ok',JSON.stringify(client.diagnostics()));assert.equal(calls.length,1);const picked=data.flatMap(d=>d.rows).find(e=>e.id===calls[0]);assert.equal(picked.number,expected);if(id===510728)assert.match(r.match.subjectName,/袭击篇/);
});
function subjectNamesForFixture(id){const s=subjects.find(s=>s.id===id);return [s.name,s.originalName];}
const holdout=require('./fixtures/multiseason/holdout.json');
for(const [id,source,suffix,n] of [[240760,'source-c','/1742',1],[240760,'source-a','/8400.html',1],[240760,'source-b','/201913844.html',1],[331887,'source-c','/151',1],[331887,'source-a','/1853.html',12],[331887,'source-b','/2021512514.html',12],[263750,'source-c','/1526',13],[263750,'source-a','/11931.html',13],[263750,'source-b','/2019355438.html',1],[203387,'source-c','/1227',1],[203387,'source-a','/2244.html',1],[203387,'source-b','/2017941328.html',1]])test('independent captured page '+id+' '+source,()=>{
 const ctx=holdout.contexts.find(c=>c.subject.id===id),v=holdout.videos.find(v=>v.sourceId===source&&v.subject.url.endsWith(suffix));assert.ok(v,suffix);const r=matchPage(ctx,{name:v.subject.name,episodes:v.channels[0].episodes}),first=ctx.subject.episodes.find(e=>e.type===0),m=r.matches.find(m=>m.episode.id===first.id);if(id===203387&&source!=='source-c'){assert.equal(r.available,0);const confirmed=matchPage(ctx,{name:v.subject.name,episodes:v.channels[0].episodes,confirmed:true});assert.equal(Number(confirmed.matches.find(m=>m.episode.id===first.id).row.sort),n);}else{assert.ok(m,r.reason);assert.equal(Number(m.row.sort),n);}
});
test('unrecognised financial season labels require manual confirmation and never auto-select neighbouring seasons',()=>{
 const ctx=holdout.contexts.find(c=>c.subject.id===203387);assert.ok(!require('../src/episode-matching.cjs').subjectNames(ctx.subject).includes('夏目友人帐 第6季'));for(const v of holdout.videos.filter(v=>/第七季/.test(v.subject.name)))assert.equal(matchPage(ctx,{name:v.subject.name,episodes:v.channels[0].episodes}).available,0,v.subject.name);
});
test('a numbered special between split parts cannot be mistaken for the first chapter of the second part',()=>{
 const ctx=holdout.contexts.find(c=>c.subject.id===331887);assert.equal(ctx.series.find(s=>s.id===302189).inlineSpecialCount,1);
 const first=ctx.series.find(s=>s.id===302189);const raw={name:first.name,episodes:Array.from({length:12},(_,i)=>({id:'short-'+i,sort:i+1,name:'第'+(i+1)+'集'}))};assert.equal(matchPage(ctx,raw).available,0);
});

test('captured source OVA retains its separate Bangumi identity instead of becoming another main episode',()=>{
 const raw=videos.find(v=>v.sourceId==='source-c'&&v.subject.id==='633'),d=canonicalDetail(raw,context(325585)),eps=d.channels[0].episodes;
 assert.equal(eps.filter(e=>e.type==='main').length,12);const sp=eps.find(e=>e.type==='sp');assert.equal(sp.bgmEpisodeId,1066854);assert.equal(sp.unavailable,undefined);assert.equal(sp.sourceSort,'1');assert.equal(sp.sort,'24');
});

test('canonical labels do not replace raw rule template inputs when resolving or reopening playback',()=>{
 const {sourceSubject,sourceEpisode}=require('../src/source-matcher.cjs'),raw=videos.find(v=>v.sourceId==='source-c'&&v.subject.id==='1395'),d=canonicalDetail(raw,context(316247)),ep=d.channels[0].episodes[0];
 assert.equal(d.subject.name,'Re：从零开始的异世界生活 第二季 后半部分');assert.equal(sourceSubject(d.subject).name,raw.subject.name);assert.equal(sourceEpisode(ep).sort,'14');assert.equal(sourceEpisode(ep).name,raw.channels[0].episodes.find(e=>e.sort==='14').name);assert.equal(ep.sort,'39');
});
test('more episodes are the exact unmatched complement, retaining source order and independent identities',()=>{
 const raw=videos.find(v=>v.sourceId==='source-c'&&v.subject.id==='1087'),d=canonicalDetail(raw,context(980)),ch=d.channels[0];
 assert.equal(ch.episodes.length,12);assert.deepEqual(ch.unmatchedEpisodes.map(e=>Number(e.sort)),[1,2,3,4,5,6,7,8,9,10,11,12,25,26,27,28,29]);
 assert.equal(new Set(ch.episodes.concat(ch.unmatchedEpisodes).map(e=>e.id)).size,29);
 const {sourcePlayback}=require('../frontend/detail-episodes.cjs'),p=sourcePlayback(d,ch.unmatchedEpisodes[0],0);assert.equal(p.subject.bgmId,undefined);assert.equal(p.episode.bgmEpisodeId,undefined);assert.equal(p.episode.sort,'1');assert.equal(p.subject.name,'黑礁');assert.equal(p.channels[0].episodes.length,29);assert.equal(p.channels[0].episodes[12].sort,'13');assert.equal(p.channels[0].episodes[12].bgmEpisodeId,undefined);assert.equal(p.hasNext,true);assert.equal(sourcePlayback(d,ch.unmatchedEpisodes[ch.unmatchedEpisodes.length-1],0).hasNext,false);
});
test('source availability probes search exactly once, distinguish title matches from candidates and coalesce cached calls',async()=>{
 let searches=0;const records=videos.filter(v=>v.sourceId==='source-a'&&/^黑礁/.test(v.subject.name)).map(v=>v.subject);let engine={search:async(id,q)=>{searches++;assert.equal(q,'黑礁');return records;},detail:()=>{throw Error('Probing must not read episode pages');}};
 const service=new SourceMatcher(()=>engine,{context:async()=>context(980)}),[a,b]=await Promise.all([service.probe('source-a',{bgmId:980,name:'黑礁 The Second Barrage'}),service.probe('source-a',{bgmId:980,name:'黑礁 The Second Barrage'})]);
 assert.deepEqual(a,{matchCount:1,candidateCount:2});assert.deepEqual(a,b);assert.equal(searches,1);await service.probe('source-a',{bgmId:980});assert.equal(searches,1);engine={...engine};await service.probe('source-a',{bgmId:980});assert.equal(searches,2);
});
test('failed availability probes are retryable errors, never cached as zero matches',async()=>{
 let calls=0;const service=new SourceMatcher(()=>engine,{context:async()=>context(980)}),engine={search:async()=>{if(++calls===1)throw Error('offline');return [];}};await assert.rejects(service.probe('x',{bgmId:980}),/offline/);assert.deepEqual(await service.probe('x',{bgmId:980}),{matchCount:0,candidateCount:0});assert.equal(calls,2);
});
test('captured old-source 9x episode remains available in More without shifting the second-season mapping',()=>{
 const raw=require('./fixtures/multiseason/black-lagoon-old-source.json'),d=canonicalDetail(raw,context(980)),ch=d.channels[0];assert.equal(ch.episodes.length,12);assert.equal(ch.episodes[0].sourceSort,'13');assert.equal(ch.unmatchedEpisodes.length,18);const special=ch.unmatchedEpisodes.find(e=>e.name==='第9x集');assert.ok(special);const p=require('../frontend/detail-episodes.cjs').sourcePlayback(d,special,0);assert.equal(p.episode.name,'第9x集');assert.equal(p.episode.id,special.id);assert.equal(p.episode.bgmEpisodeId,undefined);assert.equal(p.channels[0].episodes.length,30);
});
test('manual source page search returns exact matches and candidates without resolving or auto-selecting',async()=>{
 const records=videos.filter(v=>v.sourceId==='source-a'&&/^黑礁/.test(v.subject.name)).map(v=>v.subject),engine={search:async()=>records,detail:()=>{throw Error('Manual picker must not read episode pages');}},service=new SourceMatcher(()=>engine,{context:async()=>context(980)});
 const r=await service.search('source-a',{bgmId:980,name:context(980).subject.name},true);assert.ok(r.manualRequired);assert.equal(r.detail,undefined);assert.equal(new Set(r.items.map(s=>s.url)).size,r.items.length);assert.equal(r.items[0].matchKind,'own');assert.ok(r.items.some(s=>s.matchKind!=='own'));assert.equal(r.items.length,records.length);
});

test('a confirmed page with a repeated chapter maps it once and stays playable when nothing maps',()=>{
 const {canonicalDetail}=require('../src/source-matcher.cjs');
 const subject={id:9,bgmId:9,name:'测试番',name_cn:'测试番',originalName:'テスト',date:'2024-01-01',episodes:[1,2,3].map(n=>({id:900+n,type:0,sort:n,ep:n,name_cn:['开端之章','第二个故事','最后的旅程'][n-1]}))};
 const ctx={subject,series:[subject]};
 // Episode 2 is listed twice, as sites do for a re-upload.
 const page={subject:{name:'测试番',url:'u'},channels:[{name:'线路1',episodes:[{id:'a1',sort:'1',name:'第1集 开端之章'},{id:'a2',sort:'2',name:'第2集 第二个故事'},{id:'a2b',sort:'2',name:'第2集 第二个故事'},{id:'a3',sort:'3',name:'第3集 最后的旅程'}]}]};
 // Automatic matching stays strict; the page the user picks maps 1-3 with the first copy of 2.
 assert.throws(()=>canonicalDetail(page,ctx,false),e=>e.code==='EPISODE_MAPPING_UNCERTAIN');
 const confirmed=canonicalDetail(page,ctx,true);
 assert.deepEqual(confirmed.channels[0].episodes.map(e=>e.id),['a1','a2','a3']);assert.deepEqual(confirmed.channels[0].unmatchedEpisodes.map(e=>e.id),['a2b']);
 // A confirmed page whose chapters cannot be placed offers them all as unmatched episodes.
 const odd={subject:{name:'测试番',url:'u'},channels:[{name:'线路1',episodes:[{id:'x1',sort:'1',name:'花絮'},{id:'x2',sort:'1',name:'花絮'}]}]};
 assert.throws(()=>canonicalDetail(odd,ctx,false),e=>e.code==='EPISODE_MAPPING_UNCERTAIN');
 const kept=canonicalDetail(odd,ctx,true);
 assert.ok(kept.channels[0].episodes.every(e=>e.unavailable));assert.deepEqual(kept.channels[0].unmatchedEpisodes.map(e=>e.id),['x1','x2']);
});

test('captured Black Lagoon episode 4 matches the unaccented dandan title automatically',()=>{
 const captured=require('./fixtures/multiseason/black-lagoon-dandan.json');
 const result=matchPage(captured.context,{name:captured.rows[0].subjectName,danmaku:true,confirmed:true,episodes:captured.rows.map(e=>({...e,name:e.episodeName,genericTitle:!e.episodeName}))});
 const found=result.matches.find(m=>m.episode.id===1477);assert.ok(found,result.reason);assert.equal(Number(found.row.number),4);assert.equal(found.method,'title');assert.match(found.row.episodeName,/Ruckkehr/);
 const conflict=JSON.parse(JSON.stringify(captured.rows));conflict.find(e=>Number(e.number)===4).episodeName='A completely different chapter';
 const rejected=matchPage(captured.context,{name:conflict[0].subjectName,danmaku:true,confirmed:true,episodes:conflict.map(e=>({...e,name:e.episodeName}))});assert.ok(!rejected.matches.some(m=>m.episode.id===1477));
});
test('episode title accent folding supports Latin combining marks and preserves kana voicing',()=>{
 const {episodeTitle}=require('../src/episode-matching.cjs');
 for(const [a,b] of [['Die Rückkehr des Adlers','Die Ruckkehr des Adlers'],['Die Ru\u0308ckkehr des Adlers','Die Ruckkehr des Adlers'],['Café résumé','Cafe resume']])assert.equal(episodeTitle(a),episodeTitle(b));
 assert.notEqual(episodeTitle('かみの物語'),episodeTitle('がみの物語'));assert.equal(episodeTitle('がみの物語'),episodeTitle('か\u3099みの物語'));
});
