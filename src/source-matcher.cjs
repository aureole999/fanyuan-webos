'use strict';
const {matchPage,pageKind,familyBases,subjectNames,mainEpisodes,episodeTitle}=require('./episode-matching.cjs');
function sourceSubject(subject){return subject.sourceSubjectName?Object.assign({},subject,{name:subject.sourceSubjectName}):subject;}
function sourceEpisode(episode){return episode.sourceEpisodeName?Object.assign({},episode,{name:episode.sourceEpisodeName,sort:episode.sourceSort==null?episode.sort:episode.sourceSort}):episode;}
function canonicalDetail(detail,context,confirmedPage){
 const channels=[],rejected=[];
 for(const ch of detail.channels||[]){const result=matchPage(context,{name:detail.subject.name,episodes:ch.episodes,confirmed:!!confirmedPage}),byId=new Map(result.matches.map(m=>[String(m.episode.id),m]));
  if(!result.available){rejected.push({channel:ch.name,reason:result.reason});continue;}
  const episodes=mainEpisodes(context.subject).map(ep=>{const m=byId.get(String(ep.id)),canonical={bgmEpisodeId:Number(ep.id),bgmEp:ep.ep==null?null:Number(ep.ep),bgmSubjectId:context.subject.id,sort:String(ep.sort),type:'main',name:(Number(ep.sort)===0?'0':ep.ep)+' '+(ep.name_cn||ep.name||'第'+ep.ep+'集')};
   return m?Object.assign({},m.row,canonical,{sourceSort:m.row.sort,sourceEpisodeName:m.row.name,matchMethod:m.method}):Object.assign({id:'bgm:'+ep.id,unavailable:true},canonical);
  });
  const specials=(context.subject.episodes||[]).filter(e=>Number(e.type)===1),rawSpecials=(ch.episodes||[]).filter(e=>/^(?:sp|ova|oad|special)$/i.test(e.type||'')||/^(?:\d+\s*)?(?:OVA|OAD|SP|特别篇|特別篇)(?:\s|$)/i.test(e.name||''));
  for(const ep of specials){const names=[ep.name_cn,ep.name].map(episodeTitle).filter(Boolean),hits=rawSpecials.filter(e=>names.includes(episodeTitle(e.name))),raw=hits.length===1?hits[0]:specials.length===1&&rawSpecials.length===1?rawSpecials[0]:null;
   const canonical={bgmEpisodeId:Number(ep.id),bgmEp:ep.ep==null?null:Number(ep.ep),bgmSubjectId:context.subject.id,sort:String(ep.sort),type:'sp',name:'特别篇 '+(ep.name_cn||ep.name||ep.sort)};
   episodes.push(raw?Object.assign({},raw,canonical,{sourceSort:raw.sort,sourceEpisodeName:raw.name,matchMethod:hits.length===1?'title':'uniqueSpecial'}):Object.assign({id:'bgm:'+ep.id,unavailable:true},canonical));
  }
  channels.push(Object.assign({},ch,{episodes,matchedCount:result.available,matchKind:result.kind}));
 }
 if(!channels.length){const err=Error(rejected.some(r=>r.reason==='duplicateEpisodeTitle')?'这条线路的集名重复，无法可靠对应剧集，请换一个源':'这个页面没有可靠对应到本季的剧集，请选择其他页面或视频源');err.code='EPISODE_MAPPING_UNCERTAIN';err.rejected=rejected;throw err;}
 return Object.assign({},detail,{subject:Object.assign({},detail.subject,{sourceSubjectName:detail.subject.sourceSubjectName||detail.subject.name,name:context.subject.name,originalName:context.subject.originalName,bgmId:context.subject.id}),channels,canonical:true,mappingWarnings:rejected});
}
class SourceMatcher{
 constructor(engine,repository){this.engine=engine;this.repository=repository;}
 async detail(sourceId,pageSubject,subject,confirmedPage){const engine=this.engine(),raw=await engine.detail(sourceId,sourceSubject(pageSubject));if(!subject.bgmId)return raw;const ctx=await this.repository.context(subject.bgmId);return canonicalDetail(raw,ctx,confirmedPage);}
 async search(sourceId,subject){
  if(!subject.bgmId)return {items:await this.engine().search(sourceId,subject.name)};
  const ctx=await this.repository.context(subject.bgmId),seen=new Set(),items=[],base=familyBases(ctx),queries=Array.from(new Set([subject.name].concat(base))).slice(0,5);let best=null,lastError;
  const own=subjectNames(ctx.subject),rank=s=>own.some(n=>episodeTitle(n)===episodeTitle(s.name))?0:pageKind(ctx,s.name)==='own'?1:2;
  for(const q of queries){let rows;try{rows=await this.engine().search(sourceId,q);}catch(e){lastError=e;continue;}
   for(const s of rows.slice().sort((a,b)=>rank(a)-rank(b))){if(seen.has(s.url))continue;seen.add(s.url);if(['unrelated','otherSeason'].includes(pageKind(ctx,s.name)))continue;items.push(s);if(items.length>8)break;
    try{const detail=canonicalDetail(await this.engine().detail(sourceId,s),ctx),score=detail.channels.reduce((n,c)=>Math.max(n,c.matchedCount),0);if(!best||score>best.score)best={detail,score};if(score===mainEpisodes(ctx.subject).length)return {detail};}catch(e){lastError=e;}
   }if(items.length>8)break;
  }
  if(best)return {detail:best.detail};if(lastError&&lastError.code==='EPISODE_MAPPING_UNCERTAIN'&&items.length)return {items,manualRequired:true};
  if(!items.length&&lastError)throw lastError;return {items};
 }
}
module.exports={SourceMatcher,canonicalDetail,sourceSubject,sourceEpisode};
