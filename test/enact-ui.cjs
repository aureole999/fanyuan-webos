const assert=require('node:assert/strict'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile),server=require('./ui-fixture.cjs')();
const session='fanyuan-ui-'+process.pid;
let cdp,socket;
async function browser(...args){const {stdout}=await exec('agent-browser',['--session',session,'--json',...args],{timeout:30000,maxBuffer:2e6,env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:"5000"}});const r=JSON.parse(stdout);assert.equal(r.success,true,r.error);return r.data;}
async function connect(){
 const endpoint=(await exec('agent-browser',['--session',session,'get','cdp-url'])).stdout.trim();
 socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 let id=0;const pending=new Map();socket.onmessage=e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(p){pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);}};
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout: '+method));},8000);pending.set(key,{resolve,reject,timer});socket.send(JSON.stringify({id:key,method,params,sessionId}));});
 const targets=await call('Target.getTargets'),target=targets.targetInfos.find(t=>t.type==='page'&&t.url.startsWith('http://127.0.0.1:'));
 const {sessionId}=await call('Target.attachToTarget',{targetId:target.targetId,flatten:true});cdp=(method,params)=>call(method,params,sessionId);
}
async function evaluate(code){const r=await cdp('Runtime.evaluate',{expression:code,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+': '+r.exceptionDetails.exception?.description);return r.result.value;}
async function wait(code){const until=Date.now()+8000;do{if(await evaluate('Boolean('+code+')'))return;await new Promise(r=>setTimeout(r,80));}while(Date.now()<until);throw Error('UI wait timed out: '+code);}
async function key(k){const keyCode={Enter:13,Escape:27,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40}[k];for(const type of ['keyDown','keyUp'])await cdp('Input.dispatchKeyEvent',{type,key:k,code:k,windowsVirtualKeyCode:keyCode,...(k==='Enter'&&type==='keyDown'?{text:'\r'}:{})});}
async function page(name){await evaluate(`window.__fanYuan.navigate(${JSON.stringify(name)},true)`);await wait(`window.__fanYuan.state.page===${JSON.stringify(name)}`);await wait('!!document.querySelector("[data-focus-group=content]")');}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  await browser('open',process.env.FANYUAN_UI_URL||'http://127.0.0.1:'+server.address().port);
  await browser('set','viewport','1920','1080');await connect();
  // `set viewport` occasionally does not apply; pin the metrics the layout assertions depend on.
  await cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await wait('!!window.__fanYuan');
  await wait('document.activeElement.dataset.focusId==="sidebar-home"');
  assert.equal(await evaluate('document.querySelector(".poster-art").getBoundingClientRect().height'),244);
  await key('ArrowDown');assert.equal(await evaluate('document.activeElement.dataset.focusId'),'sidebar-search');await key('ArrowRight');await wait('document.activeElement.dataset.focusId==="content-0-0"');
  console.log("UI: settings and popup");await page('danmakuStyle');await wait('window.__focusState().current==="content-1-0"');
  await key('ArrowDown');await key('Enter');await wait('!!window.__fanYuan.state.dialog');
  await wait('window.__focusState().current==="dialog-2"');await key('ArrowDown');assert.equal(await evaluate('window.__focusState().current'),'dialog-3');
  await key('Escape');await wait('!document.querySelector(".selection-popup")');assert.equal(await evaluate('window.__focusState().current'),'content-2-0');
  console.log('UI: direct search');await page('search');await wait('window.__focusState().current==="content-0-0"');await key('Enter');await cdp('Input.insertText',{text:'测试番'});await key('Enter');await wait('window.__fanYuan.state.results.length===1');assert.equal(await evaluate('window.__focusState().paused'),false);assert.equal(await evaluate('window.__fixture.calls.search'),1);assert.equal(await evaluate('window.__fixture.calls.bangumiSearch'),1);
  await key('ArrowUp');assert.equal(await evaluate('window.__focusState().current'),'content-0-0');
  console.log('UI: calendar');await page('calendar');await wait('window.__focusState().current==="content-0-0"');await key('ArrowRight');await key('ArrowRight');await key('ArrowDown');assert.match(await evaluate('window.__focusState().current'),/^content-[1-9]/);
  console.log('UI: subscriptions');await page('subscriptions');await wait('!!document.querySelector("[data-focus-id=subscription-url]")');
  await evaluate('document.querySelector("[data-focus-id=subscription-url]").focus()');await key('Enter');await cdp('Input.insertText',{text:'https://example.invalid/extra.json'});await key('Enter');await wait('window.__fixture.calls.subscriptionAdd===1');await wait('!window.__focusState().paused');assert.equal(await evaluate('window.__fixture.calls.subscriptionAdd'),1);
  console.log('UI: service settings');await page('danmakuSettings');await wait('!!document.querySelector("[data-focus-id=danmaku-url]")');
  await evaluate('window.__fixture.failDetail=true;window.__fanYuan.openSource({id:"fixture",name:"测试番剧",url:"https://example.invalid/fixture",sourceId:"fixture"})');
  await wait('window.__fanYuan.state.page==="detail"&&!window.__fanYuan.state.player&&!!document.querySelector(".error-banner")');await wait('window.__focusState().current==="content-0-4"');
  await key('Enter');await wait('!!window.__fanYuan.state.dialog');await key('Escape');await wait('!document.querySelector(".selection-popup")');
  await evaluate('window.__fixture.failDetail=false;window.__fanYuan.openSource({id:"fixture",name:"测试番剧",url:"https://example.invalid/fixture",sourceId:"fixture"})');await wait('!!document.querySelector(".episode-button")');
  await wait('window.__focusState().current==="content-2-0"');await key('Enter');await wait('!!window.__fanYuan.state.player');await wait('window.__focusState().current==="player-controls-0"');
  // The fixture stream cannot decode: the error box offers 重试 and 切换线路 and takes focus; the bar has 7 controls.
  await wait('window.__focusState().current==="player-retry"');assert.equal(await evaluate('!!document.querySelector("[data-focus-id=player-retry-channel]")'),true);assert.equal(await evaluate('document.querySelectorAll(".player-control-row .player-button").length'),7);
  const playback=await evaluate(`(async()=>{
   const v=document.querySelector('video');v.removeAttribute('src');v.load();let pos=30;
   Object.defineProperties(v,{duration:{configurable:true,get:()=>600},currentTime:{configurable:true,get:()=>pos,set:n=>pos=n},paused:{configurable:true,get:()=>false}});
   const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))),key=(type,name,repeat=false)=>window.dispatchEvent(new KeyboardEvent(type,{key:name,repeat,bubbles:true}));
   await frame();v.dispatchEvent(new Event('playing'));await frame();key('keydown','Escape');key('keyup','Escape');await frame();
   key('keydown','ArrowRight');await frame();for(let i=0;i<3;i++){v.dispatchEvent(new Event('waiting'));await frame();v.dispatchEvent(new Event('playing'));await frame();key('keydown','ArrowRight',true);await frame();}
   key('keyup','ArrowRight');return {pos,controls:!!document.querySelector('.player-ui.visible'),progress:!!document.querySelector('.seek-progress')};
  })()`);
  assert.deepEqual(playback,{pos:70,controls:false,progress:true});assert.equal(await evaluate('!!document.querySelector("[data-focus-id=player-retry]")'),false);
  await key('Enter');await wait('document.activeElement.dataset.focusId==="player-controls-0"');await key('ArrowRight');assert.equal(await evaluate('window.__focusState().current'),'player-controls-1');
  await evaluate('window.__reviewVideo=document.querySelector("video");true');await key('Escape');await wait('!document.querySelector(".player-ui")');
  assert.equal(await evaluate('document.querySelectorAll("[data-focus-group=player]").length'),0);
  await new Promise(r=>setTimeout(r,600));assert.equal(await evaluate('document.querySelector("video")===window.__reviewVideo'),true);
  await evaluate('document.querySelector("video").currentTime=125');await key('Enter');await wait('document.activeElement.dataset.focusId==="player-controls-1"');assert.equal(await evaluate('document.querySelector(".player-time span").textContent'),'02:05');
  await key('ArrowRight');await key('Enter');await wait('!!document.querySelector(".player-panel")');await key('Escape');await wait('!document.querySelector(".player-panel")');
  await key('Escape');await key('Escape');await wait('!window.__fanYuan.state.player');
  console.log('UI: remote-only scrolling');
  // Arrow keys alone must reach both ends of a page; every move scrolls in one direction only
  // (no bounce from competing scrolls) and keeps the focused control's ScrollGroup in view.
  const scrollerOf=sel=>`[...document.querySelectorAll('${sel} *')].find(e=>e.scrollHeight>e.clientHeight+1&&getComputedStyle(e).overflowY==='auto')`;
  async function walk(direction,sel){
   const sign=direction==='ArrowDown'?1:-1;let at=null;
   for(let i=0;i<60;i++){
    const before=await evaluate('window.__focusState().current');
    await evaluate(`(()=>{const s=${scrollerOf(sel)};window.__trace=new Promise(r=>{const out=[],t0=performance.now();(function f(){out.push(s?s.scrollTop:0);performance.now()-t0<700?requestAnimationFrame(f):r(out);})();});return true;})()`);
    await key(direction);const trace=await evaluate('window.__trace'),after=await evaluate('window.__focusState().current');
    for(let k=1;k<trace.length;k++)assert.ok((trace[k]-trace[k-1])*sign>=-1,`${before}→${after} scrolled back: ${trace.join(',')}`);
    const view=await evaluate(`(()=>{const s=${scrollerOf(sel)},el=document.activeElement;if(!s||!s.contains(el))return {inside:false};const g=el.closest('[data-spotlight-container]'),t=g&&s.contains(g)?g:el,r=t.getBoundingClientRect(),v=s.getBoundingClientRect();return {inside:true,top:Math.round(s.scrollTop),max:s.scrollHeight-s.clientHeight,visible:r.height>v.height||(r.top>=v.top-2&&r.bottom<=v.bottom+2)};})()`);
    if(!view.inside)break;
    assert.ok(view.visible,`${after}: its group is not fully visible`);at=view;
    if(after===before)break;
   }
   return at;
  }
  await evaluate('window.__fanYuan.library.saveProgress("fixture",{id:"fixture",name:"测试番剧",url:"https://example.invalid/fixture",sourceId:"fixture"},{id:"ep1",name:"第1集",sort:1},30,600);true');
  for(const name of ['home','settings','calendar']){
   await page(name);await new Promise(r=>setTimeout(r,400));
   const bottom=await walk('ArrowDown','.content-scroller');assert.ok(bottom&&bottom.max>0,name+' should scroll');assert.ok(Math.abs(bottom.top-bottom.max)<=1,`${name}: last row did not reach the end (${bottom.top}/${bottom.max})`);
   const top=await walk('ArrowUp','.content-scroller');assert.equal(top.top,0,name+': first row did not reach the top');
  }
  console.log('UI: current-page sidebar exits');
  for(const [name,id,menu] of [['home','content-4-0','home'],['calendar','content-3-0','calendar'],['settings','content-4-0','settings'],['danmakuStyle','content-2-0','settings'],['favorites','content-0-0','favorites'],['history','content-1-0','history'],['history','header-search','history'],['subscriptions','subscription-url','settings'],['danmakuSettings','danmaku-url','settings']]){
   await page(name);await wait(`!!document.querySelector('[data-focus-id="${id}"]')`);
   await evaluate(`document.querySelector('[data-focus-id="${id}"]').focus()`);await new Promise(r=>setTimeout(r,100));await key('ArrowLeft');
   await wait(`document.activeElement.dataset.focusId==="sidebar-${menu}"`);assert.equal(await evaluate('document.querySelector(".sidebar").dataset.expanded'),'true');await new Promise(r=>setTimeout(r,150));assert.equal(await evaluate('window.__fanYuan.state.page'),name);await key('ArrowRight');await wait('document.activeElement.dataset.focusGroup==="content"');assert.equal(await evaluate('window.__fanYuan.state.page'),name);
  }
  await page('calendar');await wait('!!document.querySelector("[data-focus-id=content-1-1]")');await evaluate('document.querySelector("[data-focus-id=content-1-1]").focus()');await key('ArrowLeft');assert.equal(await evaluate('document.activeElement.dataset.focusId'),'content-1-0');
  await page('calendar');await evaluate('window.__fanYuan.openSource({id:"fixture",name:"测试番剧",url:"https://example.invalid/fixture",sourceId:"fixture"})');await wait('!!document.querySelector(".episode-button")');await evaluate('document.querySelector("[data-focus-id=content-0-0]").focus()');await key('ArrowLeft');await wait('document.activeElement.dataset.focusId==="sidebar-calendar"');await new Promise(r=>setTimeout(r,150));assert.equal(await evaluate('window.__fanYuan.state.page'),'detail');
  assert.deepEqual(await evaluate('window.__fixture.errors'),[]);
  console.log('PASS: official settings/popups, focus restoration, direct search input, calendar geometry, subscriptions, service settings, empty episodes, player focus, held seeking and panel navigation, current-page sidebar exits and internal horizontal navigation');
 }catch(e){console.error('UI STATE',JSON.stringify(await evaluate('({page:window.__fanYuan?.state.page,focus:window.__focusState?.(),errors:window.__fixture?.errors,rects:Array.from(document.querySelectorAll("[data-focus-group=player]")).map(e=>({id:e.dataset.focusId,rect:e.getBoundingClientRect().toJSON()}))})').catch(()=>null),null,2));throw e;}finally{socket?.close();await browser('close').catch(()=>{});server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
