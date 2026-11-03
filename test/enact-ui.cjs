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
async function key(k){const keyCode={Enter:13,Escape:27,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,PageDown:34,PageUp:33}[k];for(const type of ['keyDown','keyUp'])await cdp('Input.dispatchKeyEvent',{type,key:k,code:k,windowsVirtualKeyCode:keyCode,...(k==='Enter'&&type==='keyDown'?{text:'\r'}:{})});}
async function capture(name){if(!process.env.FANYUAN_UI_SCREENSHOTS)return;const fs=require('node:fs'),path=require('node:path'),dir=process.env.FANYUAN_UI_SCREENSHOTS;fs.mkdirSync(dir,{recursive:true});if(name==='more-episodes')await new Promise(r=>setTimeout(r,450));const r=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(r.data,'base64'));}
async function page(name){await evaluate(`window.__fanYuan.navigate(${JSON.stringify(name)},true)`);await wait(`window.__fanYuan.state.page===${JSON.stringify(name)}`);await wait('!!document.querySelector("[data-focus-group=content]")');}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  await browser('open',process.env.FANYUAN_UI_URL||'http://127.0.0.1:'+server.address().port);
  await browser('set','viewport','1920','1080');await connect();
  // `set viewport` occasionally does not apply; pin the metrics the layout assertions depend on.
  await cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await wait('!!window.__fanYuan');
  await wait('document.activeElement.dataset.focusId==="sidebar-home"');
  await wait('document.querySelectorAll(".section-title").length>=3');
  // Discovery rows follow 今日放送: two rows each of 本季热门 and the daily 高分经典 pick.
  assert.deepEqual(JSON.parse(await evaluate('JSON.stringify([...document.querySelectorAll(".section-title")].map(e=>e.firstChild.textContent.trim()))')).slice(-2),['本季热门','高分经典']);
  assert.equal(await evaluate('[...document.querySelectorAll(".poster-body strong")].filter(e=>/^(热门番|经典番)/.test(e.textContent)).length'),16);
  assert.equal(await evaluate('document.querySelector(".poster-art").getBoundingClientRect().height'),244);
  for(let i=0;i<4;i++)await key('ArrowDown');assert.equal(await evaluate('document.activeElement.dataset.focusId'),'sidebar-search');await key('ArrowRight');await wait('document.activeElement.dataset.focusId==="content-0-0"');
  console.log("UI: settings and popup");await page('danmakuStyle');await wait('window.__focusState().current==="content-1-0"');
  await key('ArrowDown');await key('Enter');await wait('!!window.__fanYuan.state.dialog');
  await wait('window.__focusState().current==="dialog-2"');await key('ArrowDown');assert.equal(await evaluate('window.__focusState().current'),'dialog-3');
  await key('Escape');await wait('!document.querySelector(".selection-popup")');assert.equal(await evaluate('window.__focusState().current'),'content-2-0');
  // A two-option dialog fits its scroller: moving down must not scroll the options.
  await page('settings');await evaluate('[...document.querySelectorAll(".settings-row")].find(e=>e.textContent.includes("跳过片头快捷键")).click(),1');await wait('window.__focusState().current==="dialog-0"');
  const optionTops=()=>evaluate('JSON.stringify([...document.querySelectorAll(".dialog-option")].map(e=>Math.round(e.getBoundingClientRect().top)))');
  const before=await optionTops();await key('ArrowDown');assert.equal(await evaluate('window.__focusState().current'),'dialog-1');await new Promise(r=>setTimeout(r,500));assert.equal(await optionTops(),before,'options must not scroll');
  await key('Escape');await wait('!document.querySelector(".selection-popup")');
  // 主题色: picking a theme switches the accent everywhere; the setting survives as the page root's data-theme.
  const themeRow='[...document.querySelectorAll(".settings-row")].find(e=>e.textContent.includes("主题色"))';
  await evaluate(themeRow+'.click(),1');await wait('!!document.querySelector(".dialog-swatch")');
  assert.equal(await evaluate('document.querySelectorAll(".dialog-swatch").length'),8);
  await evaluate('[...document.querySelectorAll(".dialog-option")].find(e=>e.textContent.includes("天蓝")).click(),1');await wait('!document.querySelector(".selection-popup")');
  assert.equal(await evaluate('document.documentElement.dataset.theme'),'sky');assert.equal(await evaluate('getComputedStyle(document.documentElement).getPropertyValue("--focus-bg").trim()'),'rgb(119, 181, 223)');
  assert.match(await evaluate(themeRow+'.textContent'),/天蓝/);
  await evaluate(themeRow+'.click(),1');await wait('!!document.querySelector(".dialog-swatch")');
  await evaluate('[...document.querySelectorAll(".dialog-option")].find(e=>e.textContent.includes("樱粉")).click(),1');await wait('!document.querySelector(".selection-popup")');assert.equal(await evaluate('document.documentElement.dataset.theme'),'sakura');
  console.log('UI: direct search');await page('search');await wait('window.__focusState().current==="content-0-0"');await key('Enter');await cdp('Input.insertText',{text:'测试番'});await key('Enter');await wait('window.__fanYuan.state.results.length===1');assert.equal(await evaluate('window.__focusState().paused'),false);assert.equal(await evaluate('window.__fixture.calls.search'),1);assert.equal(await evaluate('window.__fixture.calls.bangumiSearch'),1);
  await key('ArrowUp');assert.equal(await evaluate('window.__focusState().current'),'content-0-0');
  console.log('UI: calendar');await page('calendar');await wait('window.__focusState().current==="content-0-0"');await key('ArrowRight');await key('ArrowRight');await key('ArrowDown');assert.match(await evaluate('window.__focusState().current'),/^content-[1-9]/);
  // Ending typing hands remote focus back to the field, so the arrows navigate again.
  const typing='document.activeElement.tagName==="INPUT"',onField='document.activeElement.dataset.focusId==="content-0-0"';
  await page('search');await evaluate('document.querySelector("[data-focus-id=content-0-0]").focus()');await key('Enter');await wait(typing);await cdp('Input.insertText',{text:'x'});
  await key('Escape');await wait(onField);assert.equal(await evaluate('window.__fanYuan.state.page'),'search');await key('ArrowRight');assert.equal(await evaluate('window.__focusState().current'),'content-0-1');
  await key('ArrowLeft');await key('Enter');await wait(typing);await evaluate('document.dispatchEvent(new CustomEvent("keyboardStateChange",{detail:{visibility:false}})),1');await wait(onField);
  await key('Enter');await wait(typing);await key('ArrowDown');await wait('document.activeElement.tagName!=="INPUT"&&window.__focusState().current!=="content-0-0"');
  console.log('UI: subscriptions');await page('subscriptions');await wait('!!document.querySelector("[data-focus-id=subscription-url]")');
  await evaluate('document.querySelector("[data-focus-id=subscription-url]").focus()');await key('Enter');await cdp('Input.insertText',{text:'https://example.invalid/extra.json'});await key('Enter');await wait('window.__fixture.calls.subscriptionAdd===1');await wait('!window.__focusState().paused');assert.equal(await evaluate('window.__fixture.calls.subscriptionAdd'),1);
  console.log('UI: service settings');await page('danmakuSettings');await wait('!!document.querySelector("[data-focus-id=danmaku-url]")');
  await evaluate('document.querySelector("[data-focus-id=danmaku-default]").focus()');await key('Enter');await wait('!document.querySelector("[data-focus-id=danmaku-url]")');assert.match(await evaluate('document.querySelector(".danmaku-settings-page").textContent'),/默认服务.*推荐自行部署 danmu_api/s);assert.doesNotMatch(await evaluate('document.querySelector(".danmaku-settings-page").textContent'),/公共弹幕镜像/);
  await evaluate('document.querySelector("[data-focus-id=content-2-2]").focus()');await key('Enter');await wait('document.querySelector(".danmaku-settings-page").textContent.includes("连接成功")');assert.equal(await evaluate('Object.keys(window.__fixture.last.danmakuConfigure).length'),0);
  // 自建 without a saved address only opens the form; saving still needs an address.
  await evaluate('window.__fixture.settings.customUrl="";window.__fixture.calls.danmakuConfigure=0');await page('settings');await page('danmakuSettings');await wait('!!document.querySelector("[data-focus-id=danmaku-custom]")');
  await evaluate('document.querySelector("[data-focus-id=danmaku-custom]").focus()');await key('Enter');await wait('!!document.querySelector("[data-focus-id=danmaku-url]")');assert.equal(await evaluate('window.__fixture.calls.danmakuConfigure||0'),0);assert.match(await evaluate('document.querySelector(".connection-result").textContent'),/默认服务/);
  await evaluate('document.querySelector("[data-focus-id=content-2-0]").focus()');await key('Enter');await wait('document.querySelector(".danmaku-settings-page .error-banner")?.textContent.includes("自建服务地址")');assert.equal(await evaluate('window.__fixture.calls.danmakuConfigure||0'),0);
  await evaluate('window.__fixture.settings.customUrl="https://example.invalid"');await page('settings');await page('danmakuSettings');await wait('!!document.querySelector("[data-focus-id=danmaku-custom]")');
await evaluate('document.querySelector("[data-focus-id=danmaku-custom]").focus()');await key('Enter');await wait('!!document.querySelector("[data-focus-id=danmaku-url]")');assert.equal(await evaluate('document.querySelector("[data-focus-id=danmaku-url] input").value'),'https://example.invalid');
  await evaluate('window.__fixture.failDetail=true;window.__fanYuan.openSource({id:"fixture",name:"测试番剧",url:"https://example.invalid/fixture",sourceId:"fixture"})');
  await wait('window.__fanYuan.state.page==="detail"&&!window.__fanYuan.state.player&&!!document.querySelector(".error-banner")');await wait('window.__focusState().current==="content-2-0"');
  await key('Enter');await wait('!!window.__fanYuan.state.dialog');await key('Escape');await wait('!document.querySelector(".selection-popup")');
  assert.equal(await evaluate('!!document.querySelector(".subject-hero + .detail-source-error")'),true);
  await evaluate(`window.__sidebarFlashes=[];window.__sidebarWatch=new MutationObserver(rs=>rs.forEach(r=>{if(r.oldValue==='true')window.__sidebarFlashes.push(r.oldValue);}));window.__sidebarWatch.observe(document.querySelector('.sidebar'),{attributes:true,attributeFilter:['data-expanded'],attributeOldValue:true});window.__fixture.failDetail=false;window.__fixture.delayDetail=500;true`);
  await key('Enter');await wait('window.__focusState().current==="dialog-0"');await key('ArrowDown');await key('Enter');await wait('!!document.querySelector(".episode-button")');await wait('!document.querySelector(".selection-popup")');await new Promise(r=>setTimeout(r,250));
  assert.deepEqual(await evaluate('window.__sidebarWatch.disconnect();window.__sidebarFlashes'),[]);assert.equal(await evaluate('document.querySelector(".sidebar").dataset.expanded'),'false');assert.equal(await evaluate('document.activeElement.dataset.focusId'),'content-0-0');
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.episode-button')).every(b=>{const c=b.querySelector('.control-client'),r=c.getBoundingClientRect(),box=b.getBoundingClientRect();return r.left>=box.left&&r.right<=box.right;})`),true,'long episode titles stay within their buttons');
  await evaluate('window.__fixture.emptySearch=true;document.querySelector("[data-focus-id=header-source]").focus()');await key('Enter');await wait('window.__focusState().current==="dialog-1"');await key('Enter');await wait('window.__fanYuan.state.dialog?.title==="这个源没有找到相关番剧"');await key('Escape');await wait('!document.querySelector(".selection-popup")');assert.equal(await evaluate('document.querySelector(".sidebar").dataset.expanded'),'false');await evaluate('window.__fixture.emptySearch=false;window.__fixture.delayDetail=0');
  console.log('UI: per-series sources and queued primary playback');
  assert.equal(await evaluate('window.__fanYuan.state.sourceId'), 'fixture');
  assert.equal(await evaluate('localStorage.getItem("sourceId")'), 'fixture');
  assert.equal(await evaluate('window.__fanYuan.library.sourceFor({name:"测试番剧"})'), 'fixture2');
  await evaluate('window.__fixture.delayDetail=500;window.__fanYuan.openSource({id:"fixture",name:"测试番剧",url:"https://example.invalid/fixture",sourceId:"fixture"})');
  await wait('window.__fanYuan.state.busy&&window.__focusState().current==="content-0-0"');
  assert.match(await evaluate('document.querySelector("[data-focus-id=content-0-0]").textContent'), /从头播放/);
  await key('Enter');await wait('!!document.querySelector(".play-button-spinner")');await capture('waiting-play');assert.equal(await evaluate('window.__focusState().paused'),false);await wait('!!window.__fanYuan.state.player');
  assert.equal(await evaluate('window.__fanYuan.state.player.sourceId'),'fixture2');assert.equal(await evaluate('window.__fanYuan.state.player.episode.sort'),1);
  await wait('window.__focusState().current==="player-retry"');await evaluate('window.dispatchEvent(new KeyboardEvent("keydown",{keyCode:413,bubbles:true}));true');await wait('!window.__fanYuan.state.player');
  await evaluate('window.__fanYuan.openTitle({name:"测试番剧"})');await wait('window.__fanYuan.state.busy&&window.__focusState().current==="content-0-0"');await key('Enter');await page('calendar');await new Promise(r=>setTimeout(r,650));assert.equal(await evaluate('!!window.__fanYuan.state.player'),false);
  await evaluate('window.__fanYuan.library.saveProgress("fixture",{id:"fixture",name:"测试番剧",url:"https://example.invalid/fixture",sourceId:"fixture"},{id:"ep3",name:"第3集",sort:3,type:"main"},123,600);window.__fanYuan.openTitle({name:"测试番剧"})');
  await wait('window.__focusState().current==="content-0-0"');assert.match(await evaluate('document.querySelector("[data-focus-id=content-0-0]").textContent'),/继续观看/);await key('Enter');await wait('!!window.__fanYuan.state.player');
  assert.deepEqual(await evaluate('({source:window.__fanYuan.state.player.sourceId,sort:window.__fanYuan.state.player.episode.sort,start:window.__fanYuan.state.player.startAt,global:window.__fanYuan.state.sourceId})'),{source:'fixture2',sort:3,start:123,global:'fixture'});
  await wait('window.__focusState().current==="player-retry"');await evaluate('window.dispatchEvent(new KeyboardEvent("keydown",{keyCode:413,bubbles:true}));true');await wait('!window.__fanYuan.state.player');
  await page('history');await wait('!!document.querySelector("[data-focus-id=content-1-0]")');await evaluate('document.querySelector("[data-focus-id=content-1-0]").focus()');await key('Enter');await wait('!!window.__fanYuan.state.player');assert.equal(await evaluate('window.__fanYuan.state.player.sourceId'),'fixture2');assert.equal(await evaluate('localStorage.getItem("sourceId")'),'fixture');await wait('window.__focusState().current==="player-retry"');await evaluate('window.dispatchEvent(new KeyboardEvent("keydown",{keyCode:413,bubbles:true}));true');await wait('!window.__fanYuan.state.player');
  await evaluate('window.__fixture.delayDetail=0;window.__fanYuan.library.clearHistory();true');
  console.log('UI: current channel and current source allow manual page selection');
  await evaluate('document.querySelector("[data-focus-id=content-1-0]").focus()');await key('Enter');await wait('window.__fanYuan.state.dialog?.title==="选择对应番剧"');assert.equal(await evaluate('window.__fixture.last.matchSource.manual'),true);assert.match(await evaluate('document.querySelector(".selection-popup").textContent'),/匹配的页面.*候选的页面/s);await key('Escape');await wait('!document.querySelector(".selection-popup")');assert.equal(await evaluate('document.querySelector(".sidebar").dataset.expanded'),'false');
  await evaluate('document.querySelector("[data-focus-id=header-source]").focus()');await key('Enter');await wait('window.__focusState().current==="dialog-1"');assert.doesNotMatch(await evaluate('document.querySelector(".selection-popup").textContent'),/原始订阅规则/);await key('Enter');await wait('window.__fanYuan.state.dialog?.title==="选择对应番剧"');await evaluate('document.querySelector("[data-focus-id=dialog-1]").focus()');await key('Enter');await wait('!window.__fanYuan.state.busy&&!window.__fanYuan.state.dialog');assert.equal(await evaluate('window.__fixture.last.detail.confirmedPage'),true);assert.equal(await evaluate('window.__fanYuan.library.videoMapping({name:"测试番剧"},"fixture2").url'),'https://example.invalid/candidate');
  console.log('UI: continue watching can open episode selection');
  await page('settings');await evaluate(`Array.from(document.querySelectorAll('.settings-row')).find(e=>e.textContent.includes('继续观看时先选集')).focus()`);await key('Enter');await wait('window.__focusState().current==="dialog-1"');await key('ArrowUp');await wait('window.__focusState().current==="dialog-0"');await key('Enter');await wait('window.__fanYuan.state.settings.resumeToEpisodes===true');
  await evaluate('window.__fanYuan.library.saveProgress("fixture2",{id:"fixture",name:"测试番剧",url:"https://example.invalid/fixture",sourceId:"fixture2"},{id:"ep3",name:"第3集",sort:3,type:"main"},123,600);true');
  await page('history');await wait('!!document.querySelector("[data-focus-id=content-1-0]")');await evaluate('document.querySelector("[data-focus-id=content-1-0]").focus()');await key('Enter');await wait('window.__fanYuan.state.page==="detail"&&!window.__fanYuan.state.busy');assert.equal(await evaluate('!!window.__fanYuan.state.player'),false);assert.match(await evaluate('document.querySelector(".primary-play").textContent'),/继续观看/);
  assert.ok(await evaluate(`(()=>{const a=document.querySelector('.play-button-icon').getBoundingClientRect(),b=document.querySelector('.play-button-label').getBoundingClientRect();return Math.abs(a.top+a.height/2-b.top-b.height/2)<=2;})()`),'play icon and label centers align');
  await key('Enter');await wait('!!window.__fanYuan.state.player');assert.equal(await evaluate('window.__fanYuan.state.player.startAt'),123);await wait('window.__focusState().current==="player-retry"');await evaluate('window.dispatchEvent(new KeyboardEvent("keydown",{keyCode:413,bubbles:true}));true');await wait('!window.__fanYuan.state.player');
  await evaluate('window.__fanYuan.library.setSettings({resumeToEpisodes:false});window.__fanYuan.library.clearHistory();true');
  console.log('UI: canonical episode identity reaches the player and danmaku service');
  await evaluate('window.__fixture.canonical=true;window.__fanYuan.openTitle({bgmId:7000,name:"测试番剧"})');await wait('!!window.__fanYuan.state.detail?.canonical&&window.__focusState().current==="content-0-0"');await key('Enter');await wait('!!window.__fanYuan.state.player');await wait('window.__fixture.last.danmaku?.episodeId===10001');assert.equal(await evaluate('window.__fanYuan.state.player.episode.sort'),'13');assert.equal(await evaluate('window.__fanYuan.state.player.episode.sourceSort'),'1');await wait('window.__focusState().current==="player-retry"');await evaluate('window.dispatchEvent(new KeyboardEvent("keydown",{keyCode:413,bubbles:true}));true');await wait('!window.__fanYuan.state.player');await evaluate('window.__fixture.missingFirst=true;window.__fanYuan.openTitle({bgmId:7000,name:"测试番剧"})');await wait('!!window.__fanYuan.state.detail?.canonical&&window.__focusState().current==="content-0-0"');await key('Enter');await wait('document.querySelector(".toast")?.textContent.includes("没有第一集")');assert.equal(await evaluate('!!window.__fanYuan.state.player'),false);await evaluate('window.__fixture.missingFirst=false;window.__fixture.canonical=false;true');
  console.log('UI: explicit manual video page confirmation and saved selection');
  await evaluate('window.__fixture.manualPage=true;window.__fanYuan.openTitle({bgmId:7000,name:"测试番剧"})');await wait('!!document.querySelector(".source-result")&&window.__focusState().current==="content-2-0"');await key('Enter');await wait('!!window.__fanYuan.state.detail');assert.equal(await evaluate('window.__fixture.last.detail.confirmedPage'),true);assert.equal(await evaluate('window.__fanYuan.library.videoMapping({bgmId:7000},window.__fanYuan.state.detailSourceId).name'),'用户确认的页面');
  await evaluate('window.__manualSearchCount=window.__fixture.calls.matchSource;window.__fixture.manualPage=false;window.__fanYuan.openTitle({bgmId:7000,name:"测试番剧"})');await wait('!window.__fanYuan.state.busy&&!!window.__fanYuan.state.detail');assert.equal(await evaluate('window.__fixture.calls.matchSource===window.__manualSearchCount'),true);await evaluate('window.__fanYuan.library.setVideoMapping({bgmId:7000},window.__fanYuan.state.detailSourceId,null);true');


  console.log('UI: progressive source counts preserve popup focus');
  await evaluate('window.__fixture.probeDelay=300;document.querySelector("[data-focus-id=header-source]").focus()');await key('Enter');await wait('window.__focusState().current==="dialog-1"');await key('ArrowUp');await wait('window.__focusState().current==="dialog-0"');await wait('document.querySelectorAll("[data-probe-status=done]").length===2');assert.equal(await evaluate('window.__focusState().current'),'dialog-0');assert.match(await evaluate('document.querySelector("[data-probe-source=fixture]").textContent'),/匹配 1 · 候选 2/);await capture('source-counts');await key('Escape');await wait('!document.querySelector(".selection-popup")');await evaluate('window.__fixture.probeDelay=0;true');
  console.log('UI: more source episodes expand, play without a borrowed identity, and collapse');
  await evaluate('window.__fixture.extraEpisodes=true;window.__fanYuan.openTitle({bgmId:7000,name:"测试番剧"})');await wait('!!document.querySelector(".episode-more")');assert.equal(await evaluate('document.querySelectorAll(".episode-button").length'),12);await evaluate('document.querySelector(".episode-more").focus()');await key('Enter');await wait('document.querySelectorAll(".episode-button").length===29');assert.equal(await evaluate('window.__focusState().current'),'content-4-0');await key('ArrowDown');await wait('window.__focusState().current==="content-5-0"');await capture('more-episodes');
  await evaluate('window.__rawDanmuCalls=window.__fixture.calls.danmaku||0;true');await key('Enter');await wait('window.__fanYuan.state.player?.unmatched');assert.equal(await evaluate('window.__fanYuan.state.player.subject.bgmId===undefined'),true);await wait('window.__focusState().current==="player-retry"');assert.equal(await evaluate('(window.__fixture.calls.danmaku||0)===window.__rawDanmuCalls'),true);await evaluate('window.dispatchEvent(new KeyboardEvent("keydown",{keyCode:413,bubbles:true}));true');await wait('!window.__fanYuan.state.player');await evaluate('document.querySelector(".episode-more").focus()');await key('Enter');await wait('document.querySelectorAll(".episode-button").length===12');assert.equal(await evaluate('window.__focusState().current'),'content-4-0');assert.equal(await evaluate('document.querySelector(".sidebar").dataset.expanded'),'false');await evaluate('window.__fixture.extraEpisodes=false;true');
  await evaluate('window.__fixture.failDetail=false;window.__fanYuan.openSource({id:"fixture",name:"测试番剧",url:"https://example.invalid/fixture",sourceId:"fixture"})');await wait('!!document.querySelector(".episode-button")');
  await wait('window.__focusState().current==="content-0-0"');await key('Enter');await wait('!!window.__fanYuan.state.player');
  // The fixture stream cannot decode: the error box offers 重试 and 切换线路 and takes focus; the bar has 7 controls.
  await wait('window.__focusState().current==="player-retry"');assert.equal(await evaluate('!!document.querySelector("[data-focus-id=player-retry-channel]")'),true);assert.equal(await evaluate('document.querySelectorAll(".player-control-row .player-button").length'),8);
  console.log('UI: actual media errors survive play rejection and buffering events');
  await new Promise(r=>setTimeout(r,150));assert.match(await evaluate('document.querySelector(".player-message").textContent'),/视频格式或返回内容无法播放.*错误码 4/);
  await evaluate('document.querySelector("video").dispatchEvent(new Event("waiting"));true');await new Promise(r=>setTimeout(r,80));assert.match(await evaluate('document.querySelector(".player-message").textContent'),/错误码 4/);assert.doesNotMatch(await evaluate('document.querySelector(".player-message").textContent'),/按 OK|正在缓冲/);
  // Play/pause sits at the horizontal center of the screen.
  assert.ok(Math.abs(await evaluate('(()=>{const r=document.querySelector(".player-primary").getBoundingClientRect();return r.left+r.width/2})()')-960)<=2);
  const playback=await evaluate(`(async()=>{
   const v=document.querySelector('video');v.removeAttribute('src');v.load();let pos=30;
   Object.defineProperties(v,{duration:{configurable:true,get:()=>600},currentTime:{configurable:true,get:()=>pos,set:n=>pos=n},paused:{configurable:true,get:()=>false}});
   const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))),key=(type,name,repeat=false)=>window.dispatchEvent(new KeyboardEvent(type,{key:name,repeat,bubbles:true}));
   await frame();v.dispatchEvent(new Event('playing'));await frame();key('keydown','Escape');key('keyup','Escape');await frame();
   key('keydown','ArrowRight');await frame();for(let i=0;i<3;i++){v.dispatchEvent(new Event('waiting'));await frame();v.dispatchEvent(new Event('playing'));await frame();key('keydown','ArrowRight',true);await frame();}
   key('keyup','ArrowRight');const preview=pos,shown=document.querySelector('.seek-progress span').textContent;await new Promise(r=>setTimeout(r,800));
   return {preview,shown,pos,controls:!!document.querySelector('.player-ui.visible'),progress:!!document.querySelector('.seek-progress')};
  })()`);
  // Held right previews 30 → 1:10 and seeks once, after the key rests.
  assert.deepEqual(playback,{preview:30,shown:'01:10',pos:70,controls:false,progress:true});assert.equal(await evaluate('!!document.querySelector("[data-focus-id=player-retry]")'),false);
  await key('Enter');await wait('document.activeElement.dataset.focusId==="player-controls-0"');await key('ArrowRight');assert.equal(await evaluate('window.__focusState().current'),'player-controls-1');
  await evaluate('window.__reviewVideo=document.querySelector("video");true');await key('Escape');await wait('!document.querySelector(".player-ui")');
  assert.equal(await evaluate('document.querySelectorAll("[data-focus-group=player]").length'),0);
  await new Promise(r=>setTimeout(r,600));assert.equal(await evaluate('document.querySelector("video")===window.__reviewVideo'),true);
  await evaluate('document.querySelector("video").currentTime=125');await key('Enter');await wait('document.activeElement.dataset.focusId==="player-controls-1"');assert.equal(await evaluate('document.querySelector(".player-time span").textContent'),'02:05');
  // 下一集 → 弹幕 (toggle) → 弹幕设置 (panel)
  await key('ArrowRight');await key('ArrowRight');assert.equal(await evaluate('window.__focusState().current'),'player-controls-6');await key('Enter');await wait('!!document.querySelector(".player-panel")');await key('Escape');await wait('!document.querySelector(".player-panel")');
  console.log('UI: progress bar scrubbing');
  const pos=()=>evaluate('Math.round(document.querySelector("video").currentTime)');
  // Left/right walk the button row only, wherever the knob sits; Up/Down switch to the bar and back.
  const focusNow=()=>evaluate('window.__focusState().current');
  await key('Escape');await wait('!document.querySelector(".player-ui.visible")');
  for(const at of [0.3,0.5,0.62]){
   await evaluate(`(()=>{const v=document.querySelector("video");v.currentTime=v.duration*${at};return 1})()`);
   await key('Enter');await wait('/^player-controls-/.test(window.__focusState().current||"")');
   for(const k of ['ArrowRight','ArrowRight','ArrowRight','ArrowRight','ArrowLeft','ArrowLeft','ArrowLeft','ArrowLeft','ArrowLeft','ArrowLeft']){await key(k);assert.notEqual(await focusNow(),'player-progress','left/right must not reach the progress bar');}
   const from=await focusNow();await key('ArrowUp');assert.equal(await focusNow(),'player-progress');await key('ArrowDown');assert.equal(await focusNow(),from,'down returns to the same button');
   await key('Escape');await wait('!document.querySelector(".player-ui.visible")');
  }
  await key('ArrowUp');assert.equal(await evaluate('window.__focusState().current'),'player-progress');const p0=await pos();
  for(let i=0;i<3;i++)await key('ArrowRight');
  assert.equal(await pos(),p0,'preview must not seek');assert.match(await evaluate('document.querySelector(".scrub-bubble").textContent'),/\+30 秒/);
  await key('Escape');assert.equal(await evaluate('!!document.querySelector(".scrub-bar.previewing")'),false);assert.equal(await evaluate('!!document.querySelector(".player-ui.visible")'),true);assert.equal(await pos(),p0);
  await key('ArrowRight');await key('ArrowRight');await key('Enter');await wait(`Math.round(document.querySelector("video").currentTime)===${p0+20}`);
  await key('Escape');await wait('!document.querySelector(".player-ui.visible")');await key('ArrowUp');await wait('document.activeElement.dataset.focusId==="player-progress"');assert.equal(await evaluate('!!document.querySelector(".player-ui.visible")'),true);
  // CH− (PageDown) jumps 85 s; the following presses nudge 5 s either way, and it seeks once.
  await key('Escape');await wait('!document.querySelector(".player-ui.visible")');const p1=await pos(),end=await evaluate('Math.floor(document.querySelector("video").duration)');
  await key('PageDown');await key('PageDown');await key('PageDown');await key('PageUp');assert.equal(await pos(),p1,'skip previews first');assert.equal(await evaluate('!!document.querySelector(".seek-progress")'),true);
  await key('Enter');await wait(`Math.round(document.querySelector("video").currentTime)>=${Math.min(end,p1+90)}-1`);assert.ok(await pos()<=p1+91,'nudges are 5 s');
  await key('Escape');await wait('!window.__fanYuan.state.player');
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
  console.log('UI: related titles');
  await page('calendar');await evaluate('window.__fanYuan.openTitle({id:"bgm:7000",bgmId:7000,name:"测试番剧",episodeCount:12})');await wait('!!document.querySelector(".episode-button")&&!!document.querySelector("[data-focus-id=content-4-0]")');
  assert.match(await evaluate('document.querySelector("[data-focus-id=content-4-0]").closest(".poster-entry").textContent'),/测试番 第二季.*续集 · 2025/);
  await evaluate('document.querySelector("[data-focus-id=content-3-4]").focus()');await key('ArrowDown');await wait('document.activeElement.dataset.focusId==="content-4-0"');
  await key('Enter');await wait('window.__fixture.last.bangumiDetail?.id===8001&&window.__fanYuan.state.page==="detail"');await key('Escape');await wait('window.__fanYuan.state.page==="calendar"');
  assert.deepEqual(await evaluate('window.__fixture.errors'),[]);
  console.log('PASS: official settings/popups, focus restoration, direct search input, calendar geometry, subscriptions, service settings, empty episodes, player focus, held seeking and panel navigation, current-page sidebar exits and internal horizontal navigation');
 }catch(e){console.error('UI STATE',JSON.stringify(await evaluate('({page:window.__fanYuan?.state.page,focus:window.__focusState?.(),errors:window.__fixture?.errors,rects:Array.from(document.querySelectorAll("[data-focus-group=player]")).map(e=>({id:e.dataset.focusId,rect:e.getBoundingClientRect().toJSON()}))})').catch(()=>null),null,2));throw e;}finally{socket?.close();await browser('close').catch(()=>{});server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
