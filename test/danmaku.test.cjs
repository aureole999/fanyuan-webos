const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {matchEpisodes,title}=require('../src/danmaku-match.cjs');
const {DanmakuService,mergeResults}=require('../src/danmaku.cjs');
const {DanmakuSettings}=require('../src/danmaku-settings.cjs');
const {renderItems,fixedWindow,computeDanmakuLayout,danmakuOptionLabel,danmakuTypesSummary}=require('../frontend/danmaku.cjs');
const requestContext={subjectId:1,subjectPrimaryName:'测试番',subjectNames:['测试番','Test'],subjectPublishDate:'2024-05-01',episodeId:2,episodeSort:13,episodeEp:1,episodeName:'重逢',episodeNames:['重逢','再会']};
test('exact translated title wins over conflicting numbering; sort precedes ep; full-width title punctuation normalizes',()=>{
 const rows=[{id:'a',subjectName:'x',episodeName:'第1话 开始',number:'1'},{id:'b',subjectName:'x',episodeName:'第13话 再会',number:'13'}];assert.equal(matchEpisodes(requestContext,rows).episode.id,'b');
 assert.equal(matchEpisodes({...requestContext,episodeNames:[],episodeName:'unknown'},rows).method,'exactSort');assert.equal(title('第18话 ラム／レム'),title('ラム / レム'));
});

test('split season mapping uses season numbering; never fuzzy-matches to the first part with the same ep',()=>{
 const splitSeason={selfIndex:1,baseNames:['测试番'],parts:[{subjectId:1,names:['测试番'],markers:[],firstSort:1,episodeCount:12},{subjectId:2,names:['测试番 第2部分'],markers:['第2部分'],firstSort:13,episodeCount:12}]};
 const r={...requestContext,subjectNames:['测试番 第2部分'],splitSeason,episodeName:'未知',episodeNames:[]};const rows=Array.from({length:24},(_,i)=>({id:String(i+1),subjectName:'测试番',episodeName:'第'+(i+1)+'话',number:String(i+1)}));assert.equal(matchEpisodes(r,rows,false).episode.id,'13');assert.equal(matchEpisodes(r,rows.slice(0,12),false),null);
});

test('source-specific switches and delay apply before sorted rendering; fixed windows use seek-safe time lookup',()=>{
 const raw=[{id:1,serviceId:'custom:dandan',time:10,mode:'TOP'},{id:2,serviceId:'bilibili',time:9,mode:'NORMAL'}];const r=renderItems(raw,{'custom:dandan':{shift:3},bilibili:{enabled:false}});assert.equal(r.length,1);assert.equal(r[0].time,13);assert.equal(r[0].mode,5);assert.equal(fixedWindow(r,14).length,1);assert.equal(fixedWindow(r,20).length,0);
});

test('disabled or unconfigured service performs zero metadata or danmaku network calls',async()=>{
 for(const customEnabled of [false,true]){
  let calls=0;const settings={status:()=>({customEnabled}),custom:()=>({})};
  const s=new DanmakuService({settings,request:async()=>{calls++;throw Error('unexpected');}});
  const r=await s.load({subjectId:1,sort:1});assert.equal(calls,0);assert.equal(r.items.length,0);assert.deepEqual(r.providers.map(x=>x.id),['custom']);assert.equal(r.providers[0].status,customEnabled?'notConfigured':'disabled');
 }
});
test('old independent provider settings are discarded while private server settings survive migration',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fanyuan-migrate-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'danmaku-settings.json'),JSON.stringify({appId:'old-app',appSecret:'old-secret',animeko:true,dandanplay:true,customEnabled:true,customUrl:'https://self.example',customToken:'keep-token'}));
 const s=new DanmakuSettings(dir);await s.init();assert.equal(s.custom().token,'keep-token');assert.equal(s.status().preferredSource,'dandan');
 assert.ok(!('animeko' in s.status()));assert.ok(!('appId' in s.status()));assert.ok(!JSON.stringify(s.status()).includes('keep-token'));
 await s.configure({animeko:true,appSecret:'ignored',customToken:''});const raw=JSON.parse(fs.readFileSync(path.join(dir,'danmaku-settings.json')));
 assert.deepEqual(Object.keys(raw).sort(),['customEnabled','customToken','customUrl']);assert.equal(raw.customToken,'keep-token');assert.equal(fs.statSync(path.join(dir,'danmaku-settings.json')).mode&0o777,0o600);
 const restored=new DanmakuSettings(dir);await restored.init();assert.equal(restored.status().customEnabled,true);assert.equal(restored.custom().token,'keep-token');
});
test('episode metadata still paginates beyond 100 entries for split-season matching',async()=>{
 const offsets=[];const s=new DanmakuService({request:async url=>{const u=new URL(url),offset=Number(u.searchParams.get('offset'));offsets.push(offset);return {text:JSON.stringify({total:120,data:Array.from({length:offset?20:100},(_,i)=>({id:900+offset+i,sort:offset+i+1,ep:offset+i+1}))})};}});
 const r=await s.context({subjectId:1,sort:115});assert.deepEqual(offsets,[0,100]);assert.equal(r.episodeId,1014);
});

test('season-local source number resolves Bangumi continuous sort without losing the title',async()=>{
 const s=new DanmakuService({request:async()=>({text:JSON.stringify({total:2,data:[{id:2901,sort:29,ep:1,name_cn:'那我们走吧'},{id:2902,sort:30,ep:2,name_cn:'下一集'}]})})});
 const r=await s.context({subjectId:9,sort:'01'});assert.equal(r.episodeSort,29);assert.equal(r.episodeEp,1);assert.equal(r.episodeName,'那我们走吧');assert.equal(r.mappingMethod,'seasonEpisode');
});

test('complete source episode numbers disambiguate overlapping season-local and continuous numbers',async()=>{
 const episodes=Array.from({length:12},(_,i)=>({id:100+i,sort:12+i,ep:i+1,name_cn:'标题'+i}));
 const s=new DanmakuService({request:async()=>({text:JSON.stringify({total:episodes.length,data:episodes})})});
 const local=await s.context({subjectId:7,sort:12,sourceEpisodeNumbers:Array.from({length:12},(_,i)=>i+1)});assert.equal(local.episodeSort,23);assert.equal(local.episodeEp,12);assert.equal(local.mappingMethod,'sourcePageEpisode');
 const merged=await s.context({subjectId:7,sort:12,sourceEpisodeNumbers:Array.from({length:23},(_,i)=>i+1)});assert.equal(merged.episodeSort,12);assert.equal(merged.episodeEp,1);
 const continuous=await s.context({subjectId:7,sort:23,sourceEpisodeNumbers:Array.from({length:12},(_,i)=>i+12)});assert.equal(continuous.episodeSort,23);
});
test('a complete one-based source page identifies an included zero-numbered prologue',async()=>{
 const episodes=Array.from({length:13},(_,i)=>({id:200+i,sort:i,ep:i+1,name_cn:i?'正片'+i:'序章'}));
 const s=new DanmakuService({request:async()=>({text:JSON.stringify({total:13,data:episodes})})});
 const oneBased=await s.context({subjectId:8,sort:1,sourceEpisodeNumbers:Array.from({length:13},(_,i)=>i+1)});assert.equal(oneBased.episodeSort,0);assert.equal(oneBased.episodeName,'序章');
 const zeroBased=await s.context({subjectId:8,sort:1,sourceEpisodeNumbers:Array.from({length:13},(_,i)=>i)});assert.equal(zeroBased.episodeSort,1);assert.equal(zeroBased.episodeName,'正片1');
});
test('specials require an exact episode title and cannot fall back to main-episode numbering',()=>{
 const r={...requestContext,episodeType:1,episodeSort:24,episodeEp:0,episodeNames:['特别篇'],episodeName:'特别篇'};
 const main=[{id:'24',subjectName:'测试番',number:24,episodeName:'普通正片'}];assert.equal(matchEpisodes(r,main),null);
 assert.equal(matchEpisodes(r,main.concat({id:'sp',subjectName:'测试番',number:99,episodeName:'特别篇'})).episode.id,'sp');
});
test('danmaku style layout computes display area tracks, line gap, speed, density, and type switches',()=>{
 const oneThird=computeDanmakuLayout({danmakuArea:0.33,danmakuLineGap:10,danmakuScale:1,danmakuSpeed:1.25,danmakuDensity:'sparse',danmakuWeight:700,danmakuStroke:1.5,danmakuBottom:true,danmakuColor:false},1000);
 assert.equal(oneThird.trackHeight,38);assert.equal(oneThird.trackCount,8);assert.equal(oneThird.durationSec,6.4);assert.equal(oneThird.maxVisible,16);assert.equal(oneThird.separationPx,96);assert.equal(oneThird.fontWeight,700);assert.equal(oneThird.strokeWidthPx,1.8);assert.equal(oneThird.enableBottom,true);assert.equal(oneThird.enableColor,false);
 const wideGap=computeDanmakuLayout({danmakuArea:0.33,danmakuLineGap:28,danmakuScale:1},1000);
 assert.equal(wideGap.trackHeight,56);assert.equal(wideGap.trackCount,5);
 assert.equal(danmakuOptionLabel('area',0.33),'上方 1/3');assert.equal(danmakuOptionLabel('lineGap',18),'宽松 18px');
 assert.equal(danmakuTypesSummary({danmakuFloating:true,danmakuTop:true,danmakuBottom:false,danmakuColor:false}),'滚动 · 顶部 · 纯白');
});
