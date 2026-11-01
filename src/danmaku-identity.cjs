'use strict';
const URL=require('url').URL;
const MIRROR='https://api.danmaku.weeblify.app/ddp/v1';
function positiveId(value){return /^[1-9]\d*$/.test(String(value||''))?String(value):null;}
function bangumiIds(detail){
 const ids=new Set(),urls=[detail.bangumiUrl].concat((detail.onlineDatabases||[]).map(d=>d&&d.url));
 for(const raw of urls){try{const u=new URL(raw),m=/^\/subject\/([1-9]\d*)\/?$/.exec(u.pathname);if(['bangumi.tv','bgm.tv','chii.in'].includes(u.hostname)&&m)ids.add(m[1]);}catch(e){}}
 return ids;
}
// Metadata only: every comment request still goes through the configured server.
class SubjectIdentity{
 constructor(request,record){this.request=request;this.record=record||(()=>{});this.cache=new Map();this.pending=new Map();}
 async api(path,deadline){
  const url=new URL(MIRROR);url.searchParams.set('path',path);
  const timeout=Math.max(1,Math.min(7000,deadline-Date.now()));
  const response=await new Promise((ok,fail)=>{const timer=setTimeout(()=>fail(Error('Metadata deadline exceeded')),timeout);Promise.resolve(this.request(url.href,{timeout,maxBytes:2*1024*1024,sameOriginRedirects:true})).then(v=>{clearTimeout(timer);ok(v);},e=>{clearTimeout(timer);fail(e);});});
  const data=JSON.parse(response.text);
  return data;
 }
 async discover(r){
  const wanted=positiveId(r.subjectId);if(!wanted)return null;const deadline=Date.now()+12000;
  const names=Array.from(new Set([r.subjectPrimaryName].concat(r.subjectNames||[]).filter(n=>typeof n==='string'&&n.trim()).map(n=>n.trim())));
  // Original Japanese titles tend to survive changes in translated season names.
  const japanese=names.filter(n=>/[\u3040-\u30ff]/.test(n)),plan=Array.from(new Set(japanese.concat(names))).slice(0,4),seen=new Set();let reached=false;
  for(const query of plan){
   if(Date.now()>=deadline)break;
   let result;try{result=await this.api('/v2/search/anime?keyword='+encodeURIComponent(query),deadline);reached=true;}catch(e){continue;}
   const candidates=[];for(const a of Array.isArray(result.animes)?result.animes:[]){const id=positiveId(a.animeId);if(!id||seen.has(id))continue;if(seen.size>=8||candidates.length>=4)break;seen.add(id);candidates.push(a);}
   const details=await Promise.all(candidates.map(async a=>{try{const b=(await this.api('/v2/bangumi/'+positiveId(a.animeId),deadline)).bangumi;if(!b||positiveId(b.animeId)!==positiveId(a.animeId)||!bangumiIds(b).has(wanted))return null;
    const title=String(b.animeTitle||a.animeTitle||'').trim();if(!title||title.length>200)return null;return {source:'dandan',sourceKey:positiveId(a.animeId),subjectId:wanted,query:title,subjectName:title};
   }catch(e){return null;}}));
   const matches=details.filter(Boolean);if(matches.length===1){this.record('subjectIdentity',{subjectId:wanted,source:'dandan',sourceKey:matches[0].sourceKey,name:matches[0].subjectName});return matches[0];}
   if(matches.length>1){this.record('subjectIdentityAmbiguous',{subjectId:wanted});return null;}
  }
  this.record('subjectIdentityMissing',{subjectId:wanted,reached});
  // Unreachable mirror: retry soon. Mirror answered without a match: remember that like a hit.
  if(!reached)throw Error('Metadata mirror unreachable');return null;
 }
 cached(r){const old=this.cache.get(positiveId(r.subjectId));return old&&old.until>Date.now()?old.value:null;}
 resolve(r){
  const id=positiveId(r.subjectId);if(!id)return Promise.resolve(null);const old=this.cache.get(id);if(old&&old.until>Date.now())return Promise.resolve(old.value);if(this.pending.has(id))return this.pending.get(id);
  const remember=(value,ttl)=>{this.cache.set(id,{value,until:Date.now()+ttl});if(this.cache.size>30)this.cache.delete(this.cache.keys().next().value);this.pending.delete(id);return value;};
  const task=this.discover(r).then(value=>remember(value,1800000),()=>remember(null,60000));this.pending.set(id,task);return task;
 }
}
module.exports={SubjectIdentity,bangumiIds};
