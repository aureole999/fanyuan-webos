'use strict';
require('./compat.cjs');
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const VERSION=require('../package.json').version;
const Engine=require('./engine.cjs').Engine;
const proxy=require('./proxy.cjs').createProxy();
const DanmakuService=require('./danmaku.cjs').DanmakuService;
const DanmakuSettings=require('./danmaku-settings.cjs').DanmakuSettings;
const catalogApi=require('./catalog.cjs');
const root=path.join(__dirname,'rules'),catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
const rules=catalog.rules.map(function(x){const b=fs.readFileSync(path.join(root,x.file));if(crypto.createHash('sha256').update(b).digest('hex')!==x.sha256)throw new Error('Rule integrity check failed');return JSON.parse(b.toString('utf8'));});
let engine=new Engine(rules);const recent=[];
const SubscriptionManager=require('./subscription.cjs').SubscriptionManager;
const subscriptions=new SubscriptionManager({
  dir:process.env.ANIMEKO_DATA_DIR||(process.env.ANIMEKO_LOCAL_DEV==='1'?path.join(process.cwd(),'.local-data'):'/media/internal/com.local.animesources.service'),
  bundled:rules,proxyBase:'https://api.animeko.org',onChange:active=>{engine=new Engine(active);}
});
const danmakuSettings=new DanmakuSettings(subscriptions.dir),danmaku=new DanmakuService({settings:danmakuSettings});
const ready=subscriptions.init().then(()=>danmakuSettings.init()).catch(error=>{subscriptions.storageError='订阅缓存目录不可用：'+String(error.message).slice(0,150);});
const subscriptionTimer=setInterval(()=>ready.then(()=>subscriptions.updateAll(false)).catch(()=>{}),60000);
if(subscriptionTimer.unref)subscriptionTimer.unref();
function cleanError(e){return String(e.message||e).replace(/https?:\/\/[^\s]+/g,'[源站地址]').slice(0,300);}
function errorDetails(e){return {error:cleanError(e),stack:String(e.stack||'').replace(/https?:\/\/[^\s]+/g,'[源站地址]').slice(0,2000),code:e.code||''};}
function diagnostics(){return {version:VERSION,node:process.version,ruleCommit:catalog.commit,location:'TV',rules:catalog.rules.map(function(x){return {id:x.id,sha256:x.sha256};}),subscriptionState:subscriptions.status(),dataDirectory:subscriptions.dir,activeRuleCount:subscriptions.rules().length,danmakuSettings:danmakuSettings.status(),danmaku:danmaku.diagnostics(),proxy:proxy.events,recent:recent};}
async function action(name,p){
  p=p||{};await ready;
  if(name==='sources')return {sources:subscriptions.sources(),subscriptionState:subscriptions.status(),commit:catalog.commit,location:'TV'};
  if(name==='subscriptions')return subscriptions.status();
  if(name==='subscriptionsUpdate')return subscriptions.updateAll(!!p.force);
  if(name==='subscriptionUpdate')return subscriptions.update(p.id,true);
  if(name==='subscriptionAdd')return subscriptions.add(p.url);
  if(name==='subscriptionConfigure')return subscriptions.configure(p.id,p);
  if(name==='subscriptionRemove')return subscriptions.remove(p.id);
  if(name==='search')return {items:await engine.search(p.sourceId,p.keyword)};
  if(name==='detail')return engine.detail(p.sourceId,p.subject);
  if(name==='resolve'){const m=await engine.resolve(p.sourceId,p.subject,p.episode);return {url:await proxy.add(m),type:m.type,trace:m.trace,location:'TV'};}
  if(name==='danmakuSettings')return danmakuSettings.status();
  if(name==='danmakuConfigure')return danmakuSettings.configure(p);
  if(name==='customDanmakuSearch')return {items:await danmaku.custom.search(p.name)};
  if(name==='customDanmakuEpisodes')return {items:await danmaku.custom.episodeList(p.selection)};
  if(name==='customDanmakuTest'){const items=await danmaku.custom.search(p.name||'葬送的芙莉莲');return {count:items.length,names:items.slice(0,3).map(a=>a.name)};}
  if(name==='calendar')return catalogApi.calendar();
  if(name==='bangumiSearch')return catalogApi.search(p.keyword);
  if(name==='bangumiPopular')return catalogApi.popular();
  if(name==='bangumiClassics')return catalogApi.classics();
  if(name==='bangumiDetail')return catalogApi.detail(p.id);
  if(name==='danmaku')return danmaku.load(p);
  if(name==='diagnostics'||name==='ping')return diagnostics();
  throw new Error('Unknown method');
}
if(process.env.ANIMEKO_LOCAL_DEV==='1'){
  const http=require('http');
  http.createServer(function(req,res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');if(req.method==='OPTIONS'){res.end();return;}let body='';req.on('data',function(b){body+=b;if(body.length>100000)req.destroy();});req.on('end',function(){let p;try{p=JSON.parse(body||'{}');}catch(e){res.writeHead(400);res.end();return;}action(req.url.slice(1),p).then(function(v){res.end(JSON.stringify(Object.assign({returnValue:true},v)));},function(e){res.end(JSON.stringify({returnValue:false,errorText:cleanError(e)}));});});}).listen(18764,'127.0.0.1');
}else{
  const Service=require('webos-service'),service=new Service('com.local.animesources.service');
  ['sources','search','detail','resolve','danmaku','calendar','bangumiSearch','bangumiPopular','bangumiClassics','bangumiDetail','diagnostics','ping','subscriptions','subscriptionsUpdate','subscriptionUpdate','subscriptionAdd','subscriptionConfigure','subscriptionRemove','danmakuSettings','danmakuConfigure','customDanmakuSearch','customDanmakuEpisodes','customDanmakuTest'].forEach(function(name){service.register(name,function(message){action(name,message.payload).then(function(v){message.respond(Object.assign({returnValue:true},v));},function(e){const entry=Object.assign({method:name,sourceId:message.payload&&message.payload.sourceId||'',time:Date.now()},errorDetails(e));recent.push(entry);console.error('[FanYuan]',JSON.stringify(entry));if(recent.length>20)recent.shift();message.respond({returnValue:false,errorCode:e.code||'SOURCE_ERROR',errorText:cleanError(e)});});});});
  let keepAlive;service.activityManager.create('keepAlive',function(activity){keepAlive=activity;});
}
module.exports={action:action};
