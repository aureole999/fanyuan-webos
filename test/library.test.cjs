const test=require('node:test'),assert=require('node:assert/strict');
const {makeLibrary,seriesKey}=require('../frontend/library.cjs');
function store(){const data={};return {data,getItem:k=>data[k]||null,setItem:(k,v)=>{data[k]=v;}};}
const subject={id:'123',bgmId:400602,name:'葬送的芙莉莲',url:'https://source.test/123',sourceId:'one',cover:'https://example.test/cover.jpg'};
const ep={id:'ep-1',name:'第1集',sort:'1',url:'https://source.test/ep1',videoUrl:'https://video.test/private-signed?token=secret',channelMatch:'A'};
test('watch progress persists by source and episode, without expiring media URLs',()=>{const st=store(),lib=makeLibrary(st);assert.equal(lib.saveProgress('one',subject,ep,123.8,1400),true);assert.equal(makeLibrary(st).progress('one',subject,ep).position,123);assert.equal(makeLibrary(st).progress('two',subject,ep),null);assert.ok(!JSON.stringify(st.data).includes('secret'));assert.ok(!JSON.stringify(st.data).includes('videoUrl'));assert.equal(lib.history().length,1);});
test('history keeps the newest episode per series and completed state',()=>{const lib=makeLibrary(store());lib.saveProgress('one',subject,ep,1400,1400,true);assert.equal(lib.progress('one',subject,ep).completed,true);lib.saveProgress('one',subject,{...ep,id:'ep-2',sort:'2'},75,1400);assert.equal(lib.history().length,1);assert.equal(lib.history()[0].episode.id,'ep-2');assert.equal(lib.progress('one',subject,ep).completed,true);});
test('local favorites preserve metadata and independent wish/watching/done state',()=>{const st=store(),lib=makeLibrary(st);assert.equal(lib.toggleFavorite(subject),true);assert.equal(lib.favoriteStatus(subject),'wish');lib.setFavoriteStatus(subject,'watching');assert.equal(makeLibrary(st).favoriteStatus({...subject,sourceId:'two'}),'watching');lib.setFavoriteStatus(subject,'bad');assert.equal(lib.favoriteStatus(subject),'watching');assert.equal(lib.toggleFavorite(subject),false);assert.equal(lib.favorites().length,0);});
test('invalid positions are ignored and clearing history preserves favorites',()=>{const lib=makeLibrary(store());lib.toggleFavorite(subject);assert.equal(lib.saveProgress('one',subject,ep,0,Infinity),false);assert.equal(lib.saveProgress('one',subject,ep,-5,1400),false);assert.equal(lib.history().length,0);lib.saveProgress('one',subject,ep,30,1400);lib.clearHistory();assert.equal(lib.progress('one',subject,ep),null);assert.equal(lib.favorites().length,1);});
test('settings, search history, danmaku matching and offsets survive reload',()=>{const st=store(),a=makeLibrary(st);a.setSettings({danmaku:false,gridCols:5});a.addSearch('夏目友人帐');a.addSearch('葬送的芙莉莲');a.addSearch('夏目友人帐');a.setMapping(subject,400602);a.setOffset(subject,-3);const b=makeLibrary(st);assert.equal(b.settings().gridCols,5);assert.equal(b.settings().danmaku,false);assert.deepEqual(b.searchHistory(),['夏目友人帐','葬送的芙莉莲']);assert.equal(b.mapping(subject),400602);assert.equal(b.offset(subject),-3);});
test('per-source visibility and timing persist independently',()=>{
 const st=store(),a=makeLibrary(st);a.setDanmakuSource('custom:dandan',{enabled:false,shift:2});
 assert.deepEqual(makeLibrary(st).danmakuSources()['custom:dandan'],{enabled:false,shift:2});
});
test('custom manual match saves stable source identity and episode number instead of service cache IDs',()=>{
 const st=store(),a=makeLibrary(st),choice={query:'测试番',subjectName:'测试番 from youku',source:'youku',sourceKey:'show-code',episodeNumber:'1',episodeName:'重逢'};a.setCustomDanmakuMapping(subject,ep,choice);const b=makeLibrary(st);assert.deepEqual(b.customDanmakuMapping(subject,ep),choice);assert.equal(b.customDanmakuMapping(subject,{...ep,sort:2}),null);b.setCustomDanmakuMapping(subject,ep,null);assert.equal(b.customDanmakuMapping(subject,ep),null);
});

test('episode list reads one progress snapshot, with fresh data after a write',()=>{
 const st=store(),lib=makeLibrary(st);lib.saveProgress('one',subject,ep,30,1400);
 let reads=0;const get=st.getItem;st.getItem=k=>{if(k==='fanyuan_progress')reads++;return get(k);};
 const lookup=lib.progressLookup();for(let i=0;i<1100;i++)assert.equal(lookup('one',subject,{id:'missing-'+i}),null);
 assert.equal(lookup('one',subject,ep).position,30);assert.equal(reads,1);assert.equal(lookup('two',subject,ep),null);
 lib.saveProgress('one',subject,ep,60,1400);assert.equal(lib.progressLookup()('one',subject,ep).position,60);
});

test('per-series source survives metadata enrichment and keeps seasons independent',()=>{
 const st=store(),a=makeLibrary(st),plain={name:subject.name};
 a.setSourceFor(plain,'two');const b=makeLibrary(st);assert.equal(b.sourceFor(subject),'two');
 b.setSourceFor(subject,'three');assert.equal(b.sourceFor({...subject,sourceId:'one'}),'three');
 assert.equal(b.sourceFor({...subject,bgmId:400603}),null);assert.equal(b.sourceFor({name:subject.name+' 第二季'}),null);
 b.saveProgress('one',subject,ep,15,100);assert.equal(b.sourceFor(subject),'three');assert.equal(b.latestProgress(plain).position,15);
 assert.equal(st.getItem('sourceId'),null);
});
const {playbackTarget}=require('../frontend/library.cjs');
test('resume matches episode number/type across sources, never reused IDs or first episode',()=>{
 const entry={sourceId:'one',episode:{id:'ep1',sort:3,type:'main'},position:120};
 const detail={subject:{sourceId:'two'},channels:[{episodes:[{id:'ep1',sort:1,type:'main'},{id:'special',sort:3,type:'sp'},{id:'new3',sort:'3',type:'main'}]}]};
 assert.deepEqual(playbackTarget(detail,entry),{episode:detail.channels[0].episodes[2],channelIndex:0,startAt:120});
 assert.equal(playbackTarget(detail,{...entry,episode:{sort:7}}),null);
 assert.equal(playbackTarget(detail,{...entry,episode:{sort:''}}),null);
 assert.equal(playbackTarget({...detail,channels:[{episodes:[{sort:3},{sort:'3'}]}]},entry),null);
 assert.equal(playbackTarget(detail,null).episode.sort,1);
});

test('canonical episode progress survives switching sources and still reads old source-keyed progress',()=>{
 const lib=makeLibrary(store());lib.saveProgress('one',subject,ep,40,1400);assert.equal(lib.progress('one',subject,{...ep,bgmEpisodeId:999}).position,40);
 lib.saveProgress('one',subject,{...ep,bgmEpisodeId:999},80,1400);
 assert.equal(lib.progress('two',{...subject,url:'https://new.invalid'},{id:'another',bgmEpisodeId:999}).position,80);
});

test('a missing canonical identity never falls back to the same number of another chapter',()=>{
 const d={subject:{sourceId:'two'},channels:[{episodes:[{id:'new',sort:1,bgmEpisodeId:222,type:'main'}]}]};assert.equal(playbackTarget(d,{sourceId:'one',episode:{id:'old',sort:1,bgmEpisodeId:111},position:30}),null);
 assert.equal(playbackTarget({...d,channels:[{episodes:[{id:'missing',sort:1,unavailable:true},{id:'second',sort:2}]}]},null),null);
});

test('manual video page selection persists per Bangumi subject and source, without storing transient media URLs',()=>{
 const st=store(),lib=makeLibrary(st);lib.setVideoMapping(subject,'one',{id:'page',name:'用户选择的页面',url:'https://source.test/page',videoUrl:'https://signed.invalid/private'});assert.equal(makeLibrary(st).videoMapping(subject,'one').id,'page');assert.equal(lib.videoMapping({...subject,bgmId:123},'one'),null);assert.equal(lib.videoMapping(subject,'two'),null);assert.ok(!JSON.stringify(st.data).includes('signed.invalid'));lib.setVideoMapping(subject,'one',null);assert.equal(lib.videoMapping(subject,'one'),null);
});

test('unmatched source playback keeps its manual identity when saved for continue watching',()=>{
 const lib=makeLibrary(store());lib.saveProgress('one',{...subject,bgmId:undefined},{...ep,type:'unmatched',unmatched:true},40,1400);assert.equal(lib.history()[0].episode.unmatched,true);assert.equal(lib.history()[0].subject.bgmId,undefined);
});
