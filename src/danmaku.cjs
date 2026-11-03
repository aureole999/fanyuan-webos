'use strict';
require('./compat.cjs');
const {CustomDanmaku}=require('./custom-danmaku.cjs');
const transport=require('./transport.cjs');
function unique(items){return Array.from(new Set(items.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim())));}
function mergeResults(results){
 const seen=new Set(),items=[],providers=results.map(r=>({id:r.provider,status:r.status,message:r.message||'',count:r.items.length,episodeId:r.episodeId||null,match:r.match||null})),sources=[];
 for(const result of results){sources.push(...result.groups);for(const item of result.items){const key=item.id||item.provider+':'+item.time+':'+item.text;if(!seen.has(key)){seen.add(key);items.push(item);}}}
 items.sort((a,b)=>a.time-b.time);return {items,providers,sources};
}
class DanmakuService{
 constructor(options){options=options||{};this.request=options.request||transport.request;this.settings=options.settings||{status:()=>({customEnabled:false}),custom:()=>({})};this.custom=new CustomDanmaku({request:this.request,config:()=>this.settings.custom()});this.cache=new Map();this.recent=[];}
 async json(url){const old=this.cache.get(url);if(old&&old.until>Date.now())return old.value;const value=JSON.parse((await this.request(url,{timeout:10000})).text);this.cache.set(url,{value,until:Date.now()+300000});if(this.cache.size>100)this.cache.delete(this.cache.keys().next().value);return value;}
 async context(p){
  let ep,seasonEp,sequel=null,allEpisodes=[],total=0,mappingMethod='sort',subjectId=p.subjectId;
  if(p.episodeId){mappingMethod='episodeId';if(!/^\d+$/.test(String(p.episodeId)))throw Error('请输入数字 Bangumi 剧集 ID');ep=await this.json('https://api.bgm.tv/v0/episodes/'+p.episodeId);subjectId=ep.subject_id||subjectId;}
  else{
   if(!/^\d+$/.test(String(subjectId)))throw Error('Bangumi 条目 ID 无效');
   if(p.type&&/sp|ova|oad|ex/i.test(p.type))throw Error('特别篇需手动选择对应的 Bangumi 剧集');
   for(let offset=0;offset<5000;offset+=100){const page=await this.json('https://api.bgm.tv/v0/episodes?subject_id='+subjectId+'&type=0&limit=100&offset='+offset);allEpisodes.push(...(page.data||[]));total=page.total;ep=(page.data||[]).find(x=>Math.abs(Number(x.sort)-Number(p.sort))<0.001);if(!seasonEp)seasonEp=(page.data||[]).find(x=>x.ep!=null&&Math.abs(Number(x.ep)-Number(p.sort))<0.001);if(ep||(page.data||[]).length<100||offset+100>=page.total)break;}
   const source=Array.isArray(p.sourceEpisodeNumbers)?p.sourceEpisodeNumbers.filter(n=>Number.isFinite(Number(n))).map(Number):[];
   if(source.length&&allEpisodes.length>=total){
    const unique=a=>Array.from(new Set(a)).sort((a,b)=>a-b),numbers=unique(source),sorts=unique(allEpisodes.map(e=>Number(e.sort))),eps=unique(allEpisodes.filter(e=>e.ep!=null).map(e=>Number(e.ep)));
    const same=a=>a.length===numbers.length&&a.every((n,i)=>n===numbers[i]);
    if(same(eps)&&!same(sorts)&&seasonEp){ep=seasonEp;mappingMethod='sourcePageEpisode';}
   }
   if(!ep&&seasonEp){ep=seasonEp;mappingMethod='seasonEpisode';}
   if(!ep&&allEpisodes.length>=total){const hit=await this.sequelEpisode(subjectId,Number(p.sort),allEpisodes.length);if(hit){ep=hit.ep;subjectId=hit.subjectId;sequel=hit;mappingMethod='sequelSubject';}}
   if(!ep)throw Error('未匹配到此集号，请手动核对番剧和集号');
  }
  // A later season's names replace the source page's title, which names the first season.
  if(sequel)return {episodeType:Number(ep.type)||0,mappingMethod,subjectId:Number(subjectId),episodeId:Number(ep.id),episodeSort:Number(ep.sort),episodeEp:ep.ep==null?null:Number(ep.ep),episodeName:ep.name_cn||ep.name||'',episodeNames:unique([ep.name_cn,ep.name]),subjectPrimaryName:sequel.names[0]||'',subjectNames:sequel.names,subjectPublishDate:sequel.date||'',filename:p.filename||null,videoDuration:p.videoDuration||0};
  return {episodeType:Number(ep.type)||0,mappingMethod,subjectId:Number(subjectId),episodeId:Number(ep.id),episodeSort:Number(ep.sort),episodeEp:ep.ep==null?null:Number(ep.ep),episodeName:ep.name_cn||ep.name||'',episodeNames:unique([ep.name_cn,ep.name]),subjectPrimaryName:(p.subject||{}).name||'',subjectNames:unique([(p.subject||{}).name,(p.subject||{}).originalName]),subjectPublishDate:(p.subject||{}).date||'',filename:p.filename||null,videoDuration:p.videoDuration||0};
 }
 async episodes(subjectId){
  const all=[];for(let offset=0;offset<5000;offset+=100){const page=await this.json('https://api.bgm.tv/v0/episodes?subject_id='+subjectId+'&type=0&limit=100&offset='+offset);all.push(...(page.data||[]));if((page.data||[]).length<100||offset+100>=page.total)break;}return all;
 }
 // Video sites often list several seasons under the first season's title and number them on from
 // there, while Bangumi keeps one subject per season. Follow the 续集 chain: a later season may keep
 // counting (sort 13, 14…) or restart at 1, so try the series number, then the number within it.
 async sequelEpisode(subjectId,n,previousCount){
  if(!Number.isFinite(n)||n<=0)return null;let id=subjectId,count=previousCount;const seen=new Set([String(id)]);
  for(let hop=0;hop<4;hop++){
   let related;try{related=await this.json('https://api.bgm.tv/v0/subjects/'+id+'/subjects');}catch(e){return null;}
   const next=(Array.isArray(related)?related:[]).find(x=>x&&x.relation==='续集'&&Number(x.type)===2&&!seen.has(String(x.id)));if(!next)return null;
   id=next.id;seen.add(String(id));const eps=await this.episodes(id),local=n-count;
   const ep=eps.find(e=>Number(e.sort)===n)||(local>0?eps.find(e=>e.ep!=null&&Number(e.ep)===local)||eps.find(e=>Number(e.sort)===local):null);
   if(ep)return {ep,subjectId:id,names:unique([next.name_cn,next.name]),date:next.date||''};
   count+=eps.length;
  }
  return null;
 }
 async enrich(r){
  try{const sub=await this.json('https://api.bgm.tv/v0/subjects/'+r.subjectId),aliases=[];for(const box of sub.infobox||[]){if(/别名|alias/i.test(box.key)){if(typeof box.value==='string')aliases.push(box.value);else if(Array.isArray(box.value))for(const v of box.value)if(v&&typeof v.v==='string')aliases.push(v.v);}}
   r=Object.assign({},r,{subjectPrimaryName:sub.name_cn||sub.name||r.subjectPrimaryName,subjectNames:unique([sub.name_cn,sub.name,...aliases,...r.subjectNames]),subjectPublishDate:sub.date||r.subjectPublishDate});
  }catch(e){}
  if(r.episodeEp==null||r.episodeSort===r.episodeEp)return r;
  try{const relations=await this.json('https://api.animeko.org/v1/subject-relations/'+r.subjectId);r.splitSeason=relations.splitSeason||null;}catch(e){r.splitSeason=null;}
  return r;
 }
 async safe(provider,fn){let error;for(let i=0;i<2;i++)try{return await fn();}catch(e){error=e;if(e.noRetry)break;}
  return {provider,status:'error',message:error.message,groups:[{id:provider,name:'弹幕',provider,count:0,status:'error',message:error.message}],items:[]};
 }
 diagnostics(){return {recentMatches:this.recent.slice(),requests:this.custom.diagnostics()};}
 async load(p){
  const empty=(status,message)=>({provider:'custom',status,message,groups:[{id:'custom',name:'弹幕',provider:'custom',count:0,status,message}],items:[]});
  let r,result,metadataError;
  if(!this.custom.configured())result=empty('notConfigured','尚未配置弹幕服务地址');
  else {
   try{r=await this.context(p);}catch(e){metadataError=String(e.message||e).replace(/https?:\/\/\S+/g,'[URL]').slice(0,180);}
   const context=r||{episodeType:/sp|ova|oad|ex/i.test(p.type||'')?1:0,subjectId:p.subjectId||0,subjectPrimaryName:(p.subject||{}).name||'',subjectNames:unique([(p.subject||{}).name,(p.subject||{}).originalName]),subjectPublishDate:(p.subject||{}).date||'',episodeId:0,episodeSort:Number(p.sort),episodeEp:Number(p.sort),episodeName:'',episodeNames:[]};
   result=await this.safe('custom',async()=>this.custom.load(r?await this.enrich(r):context,p.customSelection));
  }
  const output=Object.assign({episodeId:r?r.episodeId:null,episodeName:r?r.episodeName:'',subjectId:r?r.subjectId:p.subjectId||null},mergeResults([result]));
  this.recent.push({time:Date.now(),subject:(p.subject||{}).name||'',inputSort:p.sort,episodeSort:r?r.episodeSort:null,episodeEp:r?r.episodeEp:null,mappingMethod:r?r.mappingMethod:'fallback',metadataError:metadataError||null,status:result.status,message:result.message||'',count:output.items.length,match:result.match||null});if(this.recent.length>20)this.recent.shift();return output;
 }
}
module.exports={DanmakuService,mergeResults};
