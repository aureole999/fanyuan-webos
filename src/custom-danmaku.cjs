'use strict';
require('./compat.cjs');
const URL=require('url').URL,crypto=require('crypto'),transport=require('./transport.cjs');
const {normalize,sameSubjectName,title:normalizeEpisode,splitMatcher,matchEpisodes}=require('./danmaku-match.cjs');
const {SubjectIdentity}=require('./danmaku-identity.cjs');
const LABEL='弹幕';
const PLATFORM_NAMES={dandan:'弹弹play',bahamut:'巴哈姆特',youku:'优酷',iqiyi:'爱奇艺',qiyi:'爱奇艺',renren:'人人视频',bilibili:'哔哩哔哩',bilibili1:'哔哩哔哩',douban:'豆瓣',hanjutv:'韩剧TV','360':'360'};
function error(message,status){const e=Error(message);if(status)e.statusCode=status;if([401,403,429].includes(status))e.noRetry=true;return e;}
function validateBase(value){
 let u;try{u=new URL(String(value||'').trim());}catch(e){throw error('请输入有效的服务地址');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw error('服务地址须为 HTTP/HTTPS，Token 请单独填写');
 u.pathname=u.pathname.replace(/\/+$/,'').replace(/\/api\/v2$/,'');return u.href.replace(/\/$/,'');
}
function canonicalName(value){return String(value||'').replace(/【[^】]*】/g,'').replace(/\((?:(?:19|20)\d{2}|未知)\)/g,'').replace(/\s*from\s+[\w&-]+\s*$/i,'').trim();}
function stripEpisode(value){return String(value||'').replace(/^【[^】]*】\s*/,'').replace(/^(?:SP?|O|C)\s*\d+(?:\.\d+)?\s+/i,'').replace(/^第\s*[\d.]+\s*[话話集]\s*/,'').replace(/^(?:番外編|番外篇|特别篇|特別篇)\s+/,'').trim();}
function normalizeNumber(raw){return /^\d+(?:\.\d+)?$/.test(String(raw))?String(Number(raw)):String(raw==null?'':raw);}
function episodeNumber(e){if(/^(?:SP?|O|C)\s*\d+(?:\.\d+)?\s+/i.test(String(e.episodeTitle||'').replace(/^【[^】]*】\s*/,'')))return null;const m=/^第\s*(\d+(?:\.\d+)?)\s*[话話集]/.exec(String(e.episodeTitle||'').replace(/^【[^】]*】\s*/,''));return normalizeNumber(m?m[1]:e.episodeNumber);}
function animeIdentity(a){return {subjectName:a.name,source:a.source||'',sourceKey:a.sourceKey||''};}
function sameAnime(a,selection){
 if(selection.source&&a.source!==selection.source)return false;
 if(selection.sourceKey&&a.sourceKey)return String(a.sourceKey)===String(selection.sourceKey);
 return a.name===selection.subjectName;
}
function rankAnimes(rows,r){
 const rawNames=(r.subjectNames||[]).concat(r.subjectPrimaryName||'').filter(Boolean),names=rawNames.map(normalize),split=splitMatcher(r),dub=/普通话|国语|中配|配音版/;
 const wantedDub=(r.subjectNames||[]).some(n=>dub.test(n));
 return rows.map((a,index)=>{const canonical=canonicalName(a.name),name=normalize(canonical),confirmed=!!r.subjectId&&String(a.confirmedSubjectId)===String(r.subjectId),exact=confirmed||rawNames.some(n=>sameSubjectName(n,canonical));let score=confirmed?200:exact?100:names.some(n=>name.includes(n)||n.includes(name))?70:0;
  if(!wantedDub&&dub.test(a.name))score-=100;const year=String(r.subjectPublishDate||'').slice(0,4);if(year&&a.date&&a.date.slice(0,4)!==year)score-=10;
  const kind=split?split.classify(canonicalName(a.name)):null,canonicalKind=r.matchingContext?require('./episode-matching.cjs').pageKind(r.matchingContext,canonical):null,compatible=canonicalKind&&!['unrelated','otherSeason'].includes(canonicalKind);if(compatible&&score<=0)score=35;
  return {anime:a,score,index,exact,dateMatch:!!(year&&a.date&&a.date.slice(0,4)===year),allowed:exact||compatible||(kind==='own'||kind==='season')};}).filter(x=>x.score>0&&x.allowed).sort((a,b)=>Number(b.anime.source==='dandan')-Number(a.anime.source==='dandan')||(r.matchingContext?Number(b.dateMatch)-Number(a.dateMatch):0)||Number(b.exact)-Number(a.exact)||b.score-a.score||a.index-b.index).map(x=>x.anime);
}
function parseComments(data,fallbackSource){
 if(!Array.isArray(data.comments))throw error('弹幕服务未返回 JSON comments 列表');
 const seen=new Set(),items=[];
 for(let index=0;index<data.comments.length;index++){
  const c=data.comments[index],parts=String(c.p||'').split(','),time=Number(parts[0]),mode=Number(parts[1]),color=Number(parts[2]);
  if(parts.length<4||!parts[0]||!parts[2]||!Number.isFinite(time)||!Number.isInteger(color)||![1,4,5].includes(mode)||typeof c.m!=='string'||!c.m)continue;
  const tag=/^\[([\w-]+)\]/.exec(parts[3]),source=tag?tag[1].toLowerCase():fallbackSource||'server',serviceId='custom:'+source;
  // dandanplay comment ids exceed 2^53 and lose precision in JSON.parse, so distinct comments can share
  // an id; the timing and text keep them apart while still dropping true duplicates.
  const identity=serviceId+':'+(c.cid==null?'index-'+index:String(c.cid)+':'+parts[0]+':'+c.m);if(seen.has(identity))continue;seen.add(identity);
  items.push({id:identity,provider:'custom',serviceId,time,text:c.m,color:'#'+('000000'+((color>>>0)&0xffffff).toString(16)).slice(-6),mode:mode===4?'BOTTOM':mode===5?'TOP':'NORMAL'});
 }
 return items.sort((a,b)=>a.time-b.time);
}
class CustomDanmaku{
 constructor(options){options=options||{};this.request=options.request||transport.request;this.config=options.config||(()=>({}));this.cache=new Map();this.pending=new Map();this.events=[];this.identity=new SubjectIdentity(this.request,(event,data)=>this.record(event,data));}
 record(event,data){this.events.push(Object.assign({time:Date.now(),event},data));if(this.events.length>80)this.events.shift();}
 diagnostics(){return this.events.slice();}
 configured(){return !!this.config().url;}
 async api(endpoint,query){
  const config=this.config();if(!this.configured()){const e=error('尚未配置弹幕服务');e.code='NOT_CONFIGURED';e.noRetry=true;throw e;}
  const url=new URL(validateBase(config.url)+(config.token?'/'+encodeURIComponent(config.token):'')+'/api/v2'+endpoint);for(const key of Object.keys(query||{}))if(query[key]!=null)url.searchParams.set(key,query[key]);
  let response;const began=Date.now();
  try{response=await this.request(url.href,{timeout:30000,maxBytes:12*1024*1024,sameOriginRedirects:true});}
  catch(e){const match=/HTTP\s+(\d+)/.exec(String(e.message||'')),status=e.statusCode||(match&&Number(match[1]));
   this.record('requestError',{endpoint,status:status||null,elapsedMs:Date.now()-began});
   if(status===401||status===403)throw error('弹幕服务拒绝访问，请检查 Token',status);
   if(status===429)throw error('弹幕服务请求过于频繁，请稍后重试',status);
   throw error(status===404?'弹幕缓存已失效，将重新搜索':status?'弹幕服务请求失败（HTTP '+status+'）':'弹幕服务连接失败或超时',status);
  }
  this.record('request',{endpoint,status:response.status||200,elapsedMs:Date.now()-began});
  let data;try{data=JSON.parse(response.text);}catch(e){throw error('弹幕服务返回格式无效，请检查地址与 JSON 输出');}
  if(data.success===false)throw error(data.errorCode===404?'弹幕缓存已失效，将重新搜索':'弹幕服务未能完成请求',Number(data.errorCode)||0);
  return data;
 }
 async search(keyword){
  keyword=String(keyword||'').trim();if(!keyword||keyword.length>200)throw error('请输入有效的番剧名称');
  const data=await this.api('/search/anime',{keyword});
  if(!Array.isArray(data.animes))throw error('弹幕服务未返回番剧列表');
  return data.animes.map(a=>({id:String(a.animeId),name:String(a.animeTitle||''),source:String(a.source||''),sourceKey:String(a.bangumiId||''),date:a.startDate||'',episodeCount:a.episodeCount||0,query:keyword})).filter(a=>/^\d+$/.test(a.id)&&a.name);
 }
 async freshAnime(selection){
  const list=await this.search(selection.query||canonicalName(selection.subjectName));const found=list.find(a=>sameAnime(a,selection));
  if(!found){const e=error('当前弹幕服务没有此前手动选择的番剧，请重新选择');e.code='MANUAL_SUBJECT_MISSING';e.noRetry=true;throw e;}return found;
 }
 async detail(anime){
  const data=await this.api('/bangumi/'+encodeURIComponent(anime.id)),b=data.bangumi;
  if(!b||String(b.animeTitle||'')!==anime.name||(b.bangumiId&&anime.sourceKey&&String(b.bangumiId)!==anime.sourceKey))throw error('弹幕缓存已失效，将重新搜索',404);
  return this.detailRows(anime,b);
 }
 detailRows(anime,b){
  if(!Array.isArray(b.episodes))throw error('弹幕服务未返回剧集列表');
  return b.episodes.map(e=>({id:String(e.episodeId),number:episodeNumber(e),episodeName:stripEpisode(e.episodeTitle),displayName:e.episodeTitle||String(e.episodeId),subjectName:canonicalName(anime.name),selection:Object.assign({query:anime.query},animeIdentity(anime),{episodeNumber:episodeNumber(e),episodeName:stripEpisode(e.episodeTitle)})})).filter(e=>/^\d+$/.test(e.id));
 }
 async episodeList(selection){for(let attempt=0;attempt<2;attempt++)try{return await this.detail(await this.freshAnime(selection));}catch(e){if(e.statusCode!==404||attempt)throw e;} }
 async comments(anime,episode,method){
  const data=await this.api('/comment/'+encodeURIComponent(episode.id),{format:'json',duration:true}),items=parseComments(data,anime.source),match={method,subjectName:anime.name,episodeName:episode.displayName||episode.episodeName};
  this.record('comments',{source:anime.source,subject:anime.name,episode:episode.displayName||episode.episodeName,method,count:items.length});
  const groups=new Map();for(const d of items){if(!groups.has(d.serviceId))groups.set(d.serviceId,0);groups.set(d.serviceId,groups.get(d.serviceId)+1);}
  if(!groups.size)groups.set('custom:'+(anime.source||'server'),0);
  return {provider:'custom',status:items.length?'ok':'empty',episodeId:episode.id,match,videoDuration:Number(data.videoDuration)||0,groups:Array.from(groups,([id,count])=>({id,name:PLATFORM_NAMES[id.slice(7)]||id.slice(7),provider:'custom',count,status:count?'ok':'empty',match})),items};
 }
 async manual(r,selection){
  for(let attempt=0;attempt<2;attempt++)try{
   const anime=await this.freshAnime(selection),rows=await this.detail(anime),expected=normalizeEpisode(selection.episodeName),exact=expected?rows.filter(e=>normalizeEpisode(e.episodeName)===expected):[];
   const numbered=selection.episodeNumber!=null?rows.find(e=>e.number!=null&&normalizeNumber(e.number)===normalizeNumber(selection.episodeNumber)):null;
   const episode=exact.length===1?exact[0]:numbered;
   if(!episode){const e=error('此前选择的弹幕剧集已变化，请重新选择');e.code='MANUAL_EPISODE_MISSING';e.noRetry=true;throw e;}
   return await this.comments(anime,episode,'manual');
  }catch(e){if(e.statusCode!==404||attempt)throw e;}
 }
 // A cross-database identity is verified before any title-only candidate can supply comments.
 async identified(r){
  const identity=await this.identity.resolve(r);if(!identity)return null;
  try{
   const b=(await this.api('/bangumi/'+encodeURIComponent(identity.sourceKey))).bangumi;
   const source=b&&String(b.source||(/from\s+([\w&-]+)\s*$/i.exec(b.animeTitle||'')||[])[1]||'').split('&');
   const correct=b&&String(b.bangumiId)===identity.sourceKey&&source.includes('dandan');
   if(correct){const anime={id:identity.sourceKey,name:b.animeTitle,source:'dandan',sourceKey:identity.sourceKey,query:identity.query,confirmedSubjectId:identity.subjectId};return {anime,rows:this.detailRows(anime,b)};}
   this.record('identityDetailMismatch',{sourceKey:identity.sourceKey});
  }catch(e){if(e.noRetry)throw e;this.record('identityDetailUnavailable',{sourceKey:identity.sourceKey,status:e.statusCode||null});}
  // danmu_api may need a search to populate its cache. Keep only the exact platform ID.
  const anime=(await this.search(identity.query)).find(a=>a.source==='dandan'&&a.sourceKey===identity.sourceKey);
  if(!anime)return null;anime.confirmedSubjectId=identity.subjectId;
  return {anime,rows:await this.detail(anime)};
 }
 async identifiedResult(r){
  for(let attempt=0;attempt<2;attempt++){
   const verified=await this.identified(r);if(!verified)return null;
   const found=matchEpisodes(r,verified.rows,true);
   if(!found||found.method==='fuzzyEpisode'){this.record('identityEpisodeMissing',{sourceKey:verified.anime.sourceKey,episodeSort:r.episodeSort,episodeEp:r.episodeEp});return null;}
   try{return await this.comments(verified.anime,found.episode,'auto:subjectId:'+found.method);}
   catch(e){if(e.noRetry||e.statusCode!==404||attempt)throw e;}
  }
  return null;
 }
 async automatic(r){
  let lastError,emptyResult;
  try{const result=await this.identifiedResult(r);if(result&&result.items.length)return result;if(result)emptyResult=result;}
  catch(e){if(e.noRetry)throw e;lastError=e;}
  const queries=[],seenQueries=new Set();for(const name of [r.subjectPrimaryName].concat(r.subjectNames||[])){if(typeof name!=='string'||!name.trim())continue;const key=normalize(name);if(!seenQueries.has(key)){seenQueries.add(key);queries.push(name.trim());}}
  if(!queries.length)return emptyResult||this.empty('noMatch','缺少番剧名，请手动匹配');
  const compact=[];for(const name of queries){const prefix=name.split(/[～~:：]/)[0].trim();if(prefix.length>=2&&prefix!==name&&!seenQueries.has(normalize(prefix))){seenQueries.add(normalize(prefix));compact.push(prefix);}}
  const plan=queries.slice(0,3).concat(compact.slice(0,4)),hasDandan=all=>rankAnimes(all,r).some(a=>a.source==='dandan');
  const baseQueries=r.matchingContext?require('./episode-matching.cjs').familyBases(r.matchingContext).filter(q=>!plan.includes(q)).slice(0,3):[];let fallbackPass=false;
  for(let recovery=0;recovery<2;recovery++){
   const all=[],identities=new Set(),attempted=[],add=rows=>{for(const a of rows){const key=a.source+'|'+(a.sourceKey||a.name);if(!identities.has(key)){identities.add(key);all.push(a);}}};
   if(!all.length)for(const query of plan){
    if(attempted.includes(query))continue;attempted.push(query);
    try{add(await this.search(query));}catch(e){if(e.noRetry)throw e;lastError=e;}
    if(hasDandan(all))break;
   }
   const candidates=rankAnimes(all,r).slice(0,4);this.record('candidates',{queries:attempted,episodeSort:r.episodeSort,episodeEp:r.episodeEp,total:all.length,candidates:candidates.map(a=>({source:a.source,name:a.name}))});
   if(!candidates.length){if(lastError)throw lastError;return this.empty('noMatch','未找到同名番剧和季度，请手动匹配');}
   let stale=false,commentRequests=0;
   for(const anime of candidates)try{
    const rows=await this.detail(anime),found=matchEpisodes(r,rows,!!anime.confirmedSubjectId);
    if(!found||found.method==='fuzzyEpisode'){this.record('episodeMissing',{source:anime.source,subject:anime.name,episodeSort:r.episodeSort,episodeEp:r.episodeEp,available:rows.length});continue;}
    if(++commentRequests>2)break;
    const result=await this.comments(anime,found.episode,'auto:'+(anime.confirmedSubjectId?'subjectId:':'')+found.method);if(result.items.length)return result;emptyResult=result;
   }catch(e){if(e.noRetry)throw e;if(e.statusCode===404){stale=true;break;}lastError=e;}
   if(!stale&&r.matchingContext&&!fallbackPass&&baseQueries.length){plan.splice(0,plan.length,...baseQueries);fallbackPass=true;continue;}
   if(!stale)break;
  }
  if(emptyResult)return emptyResult;if(lastError)throw lastError;
  return this.empty('noMatch','自动匹配未取得弹幕，可手动选择番剧和集数');
 }
 // Keep populated manual choices. A missing/empty selection can recover only through verified IDs.
 async manualWithRecovery(r,selection){
  let result,missing;
  try{result=await this.manual(r,selection);if(result.items.length)return result;}
  catch(e){if(!['MANUAL_SUBJECT_MISSING','MANUAL_EPISODE_MISSING'].includes(e.code))throw e;missing=e;}
  try{const recovered=await this.identifiedResult(r);if(recovered&&recovered.items.length)return recovered;}
  catch(e){if(e.noRetry)throw e;}
  if(missing)throw missing;
  return result;
 }
 empty(status,message){return {provider:'custom',status,message,groups:[{id:'custom',name:LABEL,provider:'custom',count:0,status,message}],items:[]};}
 load(r,selection){
  const cfg=this.config(),key=crypto.createHash('sha256').update(JSON.stringify([cfg.url,cfg.token,r.subjectId,r.subjectPrimaryName,r.episodeId,r.episodeSort,r.episodeEp,selection||null])).digest('hex'),old=this.cache.get(key);
  if(old&&old.until>Date.now())return Promise.resolve(old.value);if(this.pending.has(key))return this.pending.get(key);
  const task=(selection?this.manualWithRecovery(r,selection):this.automatic(r)).then(value=>{if(value.items.length){this.cache.set(key,{value,until:Date.now()+600000});if(this.cache.size>20)this.cache.delete(this.cache.keys().next().value);}this.pending.delete(key);return value;},e=>{this.pending.delete(key);throw e;});
  this.pending.set(key,task);return task;
 }
}
module.exports={CustomDanmaku,validateBase,rankAnimes,parseComments,canonicalName,stripEpisode};
