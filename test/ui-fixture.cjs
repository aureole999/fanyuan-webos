const http=require('http'),fs=require('fs'),path=require('path');
function fixture(){
 const subject={id:'fixture',name:'测试番剧',url:'https://example.invalid/fixture',sourceId:'fixture',episodeCount:12};
 const episodes=Array.from({length:12},(_,i)=>({id:'ep'+(i+1),name:i===0?'1 The Unstoppable Chambermaid — a very long episode title':'第'+(i+1)+'集',sort:i+1,type:'main',url:'https://example.invalid/ep'+i}));
 const settings={customEnabled:true,customUrl:'https://example.invalid',hasCustomToken:true};
 const subscription={id:'fixture-sub',url:'https://example.invalid/sub.json',enabled:true,updatePeriod:3600000,metadata:{name:'测试订阅'},sourceCount:2};
 window.__fixture={failDetail:false,errors:[],calls:{},last:{}};
 window.addEventListener('error',e=>window.__fixture.errors.push(e.message));
 window.addEventListener('unhandledrejection',e=>window.__fixture.errors.push(String(e.reason)));
 window.fetch=async(url,options)=>{
  const method=String(url).split('/').pop(),p=JSON.parse(options?.body||'{}');window.__fixture.calls[method]=(window.__fixture.calls[method]||0)+1;window.__fixture.last[method]=p;let data={};
  if(method==='sources')data={sources:[{id:'fixture',name:'测试视频源',factoryId:'web-selector'},{id:'fixture2',name:'备用视频源',factoryId:'web-selector'}]};
  if(method==='calendar')data={days:Array.from({length:7},(_,i)=>({id:i+1,items:Array.from({length:18},(_,n)=>({...subject,id:'card'+n,name:'测试番剧 '+(n+1)}))}))};
  if(method==='search')data={items:window.__fixture.emptySearch?[]:[{...subject,sourceId:p.sourceId}]};
  if((method==='detail'||method==='matchSource')&&window.__fixture.delayDetail)await new Promise(r=>setTimeout(r,window.__fixture.delayDetail));
  if(method==='detail')data=window.__fixture.failDetail?{returnValue:false,errorText:'没有可用剧集，请更换视频源'}:{subject:{...subject,...p.subject,sourceId:p.sourceId},channels:[{name:'线路1',episodes},{name:'线路2',episodes:episodes.map(e=>({...e,id:e.id+'b'}))}]};
  if(method==='matchSource')data=window.__fixture.failDetail?{returnValue:false,errorText:'无法可靠对应剧集'}:window.__fixture.emptySearch?{items:[]}:{detail:{subject:{...subject,...p.subject,sourceId:p.sourceId},canonical:true,channels:[{name:'线路1',episodes:episodes.map((e,i)=>({...e,...(window.__fixture.canonical?{unavailable:!!window.__fixture.missingFirst&&i===0,bgmEpisodeId:10001+i,bgmSubjectId:p.subject.bgmId,sort:String(13+i),sourceSort:String(i+1)}:{})}))}]}};
  if(method==='matchSource'&&window.__fixture.manualPage)data={items:[{...subject,name:'用户确认的页面',sourceId:p.sourceId}],manualRequired:true};
  if(method==='bangumiDetail')data={subject:{...subject,bgmId:p.id,name:p.id===8001?'测试番 第二季':subject.name}};
  if(method==='bangumiSearch')data={items:[]};
  if(method==='bangumiRelated')data={items:[{...subject,id:'rel1',bgmId:8001,name:'测试番 第二季',relation:'续集',date:'2025-04-01'}]};
  if(method==='bangumiPopular')data={items:Array.from({length:10},(_,n)=>({...subject,id:'hot'+n,bgmId:9000+n,name:'热门番 '+(n+1)}))};
  if(method==='bangumiClassics')data={items:Array.from({length:40},(_,n)=>({...subject,id:'classic'+n,bgmId:8000+n,name:'经典番 '+(n+1)}))};
  if(method==='subscriptions'||method.startsWith('subscription'))data={subscriptions:[subscription]};
  if(method==='danmakuSettings')data=settings;
  if(method==='danmakuConfigure'){Object.assign(settings,p);data=settings;}
  if(method==='customDanmakuTest')data={count:2};
  if(method==='resolve')data={url:'data:video/mp4;base64,'};
  if(method==='danmaku')data={items:[],providers:[{id:'custom',status:'empty'}],sources:[]};
  return {json:async()=>({returnValue:true,...data})};
 };
}
function serve(){
 const root=path.resolve(__dirname,'../dist/app');
 return http.createServer((req,res)=>{
  let name=req.url.split('?')[0];if(name==='/')name='/index.html';const file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{
   let data=fs.readFileSync(file);
   if(name==='/index.html')data=String(data).replace('<script src="app.js">','<script>('+fixture.toString()+')();</script><script src="app.js">');
   const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff2':'font/woff2','.png':'image/png'})[ext]||'application/octet-stream');res.end(data);
  }catch(e){res.writeHead(404);res.end();}
 });
}
module.exports=serve;
if(require.main===module)serve().listen(18767,'127.0.0.1',()=>console.log('UI fixture: http://127.0.0.1:18767'));
