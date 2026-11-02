const test=require('node:test'),assert=require('node:assert/strict');
const {navigateTarget,spatialTarget,findGroupTarget,remoteKey,seekDelta,scrubStep,createSeekSession}=require('../frontend/navigation.cjs');
const rect=(left,top,width=100,height=60)=>({left,top,right:left+width,bottom:top+height});
const registry=new Map([
 ['sidebar-home',{group:'sidebar',row:0,col:0,rect:rect(0,0)}],['sidebar-search',{group:'sidebar',row:1,col:0,rect:rect(0,80)}],['sidebar-calendar',{group:'sidebar',row:2,col:0,rect:rect(0,160)}],
 ['header-source',{group:'content',row:0,col:20,rect:rect(1500,0)}],['content-0-0',{group:'content',row:0,col:0,rect:rect(200,100)}],['content-2-0',{group:'content',row:2,col:0,rect:rect(200,300)}],['content-2-1',{group:'content',row:2,col:1,rect:rect(400,300)}],['content-3-0',{group:'content',row:3,col:0,rect:rect(200,500)}]
]);
test('semantic sidebar IDs navigate up/down and wrap without depending on ID spelling',()=>{
 assert.equal(navigateTarget(registry,'sidebar-home','down'),'sidebar-search');
 assert.equal(navigateTarget(registry,'sidebar-search','down'),'sidebar-calendar');
 assert.equal(navigateTarget(registry,'sidebar-calendar','down'),'sidebar-home');
 assert.equal(navigateTarget(registry,'sidebar-home','up'),'sidebar-calendar');
 assert.equal(findGroupTarget(registry,'sidebar',1),'sidebar-search');
});
test('spatial grids cross gaps and stop at content boundaries',()=>{
 assert.equal(navigateTarget(registry,'content-0-0','down'),'content-2-0');
 assert.equal(navigateTarget(registry,'content-2-1','down'),'content-3-0');
 assert.equal(navigateTarget(registry,'content-3-0','down'),null);
 assert.equal(navigateTarget(registry,'content-0-0','up'),'header-source');
});
test('left/right seek only with hidden controls; visible controls and panels own their keys',()=>{
 assert.equal(seekDelta('ArrowLeft','',false),-10);
 assert.equal(seekDelta('ArrowRight','',false),10);
 assert.equal(seekDelta('ArrowLeft','',true),0);
 assert.equal(seekDelta('ArrowRight','',true),0);
 assert.equal(seekDelta('ArrowRight','episodes',true),0);
 assert.equal(seekDelta('ArrowLeft','danmaku',true),0);
 assert.equal(seekDelta('ArrowRight','episodes',false),0);
 assert.equal(seekDelta('Enter','',false),0);
 assert.equal(remoteKey({key:'Unidentified',keyCode:40}),'ArrowDown');
});

test('held seek keeps its meaning across media events until the matching key is released',()=>{
 for(const [key,delta] of [['ArrowRight',10],['ArrowLeft',-10]]){
  const session=createSeekSession();
  assert.equal(session.delta(key,'',false),delta);
  assert.equal(session.active(),true);
  for(let i=0;i<5;i++)assert.equal(session.delta(key,'',true),delta);
  session.release('Unidentified');
  assert.equal(session.delta(key,'',true),delta);
  session.release(remoteKey({key:'Unidentified',keyCode:key==='ArrowRight'?39:37}));
  assert.equal(session.active(),false);
  assert.equal(session.delta(key,'',true),0);
 }
});
test('explicit controls or panels retain navigation and interrupt an existing seek session',()=>{
 const session=createSeekSession();
 assert.equal(session.delta('ArrowRight','',true),0);
 assert.equal(session.active(),false);
 assert.equal(session.delta('ArrowRight','',false),10);
 assert.equal(session.delta('Enter','',false),0);
 assert.equal(session.active(),false);
 assert.equal(session.delta('ArrowRight','',true),0);
 assert.equal(session.delta('ArrowLeft','',false),-10);
 assert.equal(session.delta('ArrowLeft','episodes',true),0);
 assert.equal(session.active(),false);
});
test('lost window focus and direction changes cannot leave a stale seek session',()=>{
 const session=createSeekSession();
 assert.equal(session.delta('ArrowRight','',false),10);
 session.reset();
 assert.equal(session.active(),false);
 assert.equal(session.delta('ArrowRight','',true),0);
 assert.equal(session.delta('ArrowRight','',false),10);
 assert.equal(session.delta('ArrowLeft','',true),0);
 assert.equal(session.active(),false);
 assert.equal(session.delta('ArrowLeft','',false),-10);
 session.release('ArrowLeft');
 assert.equal(session.delta('ArrowLeft','',true),0);
});

test('old history covers and current API covers use the same bounded Bangumi thumbnail',()=>{
 const {coverThumbnail}=require('../src/images.cjs');
 const expected='https://lain.bgm.tv/r/400/pic/cover/l/13/c5/sample.jpg';
 for(const path of ['pic/cover/l/','pic/cover/m/','r/100x143/pic/cover/l/','r/400/pic/cover/l/']){
   assert.equal(coverThumbnail('http://lain.bgm.tv/'+path+'13/c5/sample.jpg'),expected);
 }
 assert.equal(coverThumbnail('https://source.example/cover.jpg'),'https://source.example/cover.jpg');
});
test('lost async focus recovers to a visible content action before the sidebar',()=>{
 const {recoverTarget}=require('../frontend/navigation.cjs');
 const nodes=new Map([['sidebar-home',{group:'sidebar',row:0,col:0}],['header-source',{group:'content',row:0,col:20,recoveryPriority:1}],['content-0-0',{group:'content',row:0,col:0}],['content-0-4',{group:'content',row:0,col:4,recoveryPriority:2}]]);
 assert.equal(recoverTarget(nodes,'content',{row:2,col:0}),'content-0-4');nodes.delete('content-0-4');assert.equal(recoverTarget(nodes,'content',null),'header-source');
});

test('weekday tabs move to the card physically below, independent of column metadata',()=>{
 const nodes=[{id:'wed',rect:rect(510,160,139)},{id:'card1',rect:rect(200,270,380,400)},{id:'card2',rect:rect(605,270,380,400)},{id:'card3',rect:rect(1010,270,380,400)}];
 assert.equal(spatialTarget(nodes,'wed','down'),'card1');
 nodes[0].rect=rect(620,160,139);assert.equal(spatialTarget(nodes,'wed','down'),'card2');
});
test('wrapped variable width episode buttons move vertically by rectangles, never next index',()=>{
 const nodes=[{id:'a',rect:rect(0,0,220)},{id:'b',rect:rect(240,0,410)},{id:'c',rect:rect(670,0,150)},{id:'d',rect:rect(0,90,330)},{id:'e',rect:rect(350,90,460)}];
 assert.equal(spatialTarget(nodes,'b','down'),'e');assert.equal(spatialTarget(nodes,'b','left'),'a');assert.equal(spatialTarget(nodes,'b','right'),'c');assert.equal(spatialTarget(nodes,'e','up'),'b');assert.equal(spatialTarget(nodes,'d','down'),null);
});
test('aligned targets beat nearer diagonal targets; disabled nodes and other scopes cannot win',()=>{
 const nodes=[{id:'from',group:'dialog',rect:rect(500,100)},{id:'diagonal',group:'dialog',rect:rect(610,100)},{id:'below',group:'dialog',rect:rect(500,190)},{id:'disabled',group:'dialog',disabled:true,rect:rect(500,165)},{id:'behind',group:'content',rect:rect(500,170)}];
 assert.equal(navigateTarget(new Map(nodes.map(n=>[n.id,n])),'from','down'),'below');
 assert.equal(spatialTarget(nodes.filter(n=>n.group==='dialog'),'from','up'),null);
});

test('scrubbing starts in 10 second steps and accelerates while the key is held',()=>{
 assert.deepEqual([1,5,6,12,13,40].map(scrubStep),[10,10,30,30,60,60]);
 let t=0;for(let n=1;n<=4;n++)t+=scrubStep(n);assert.equal(t,40);
});
