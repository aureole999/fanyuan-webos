'use strict';
const names=require('./danmaku-match.cjs');
function norm(s){return names.normalize(String(s||'').replace(/`/g,"'"));}
function episodeTitle(s){let value=String(s||'').replace(/^【[^】]*】\s*/,'');for(let i=0;i<2;i++)value=value.replace(/^(?:第\s*)?\d+(?:\.\d+)?\s*(?:[话話集]\s*)?/,'');// Fold Latin accents only: preserve kana voicing and the displayed title.
 return norm(value.replace(/^[SOC]\d+\s*/i,'').normalize('NFD').replace(/([A-Za-z])[\u0300-\u036f]+/g,'$1'));}
function finite(v){return v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v):null;}
function subjectNames(s){return Array.from(new Set([s.name,s.name_cn,s.originalName].concat(s.aliases||[]).filter(Boolean)));}
function mainEpisodes(s){return (s.episodes||[]).filter(e=>Number(e.type||0)===0).slice().sort((a,b)=>Number(a.sort)-Number(b.sort));}
function identity(a,b){return names.sameSubjectName(a,b);}
function coreNames(s){return [s.name_cn||s.name,s.originalName||s.name].filter(Boolean);}
function sameSeason(a,b){
 const aa=coreNames(a).reduce((r,n)=>r.concat(Array.from(names.seasonNumbers(n))),[]),bb=coreNames(b).reduce((r,n)=>r.concat(Array.from(names.seasonNumbers(n))),[]);
 const part=/第\s*[0-9一二三四五六七八九十]+\s*(?:部分|クール)|part\s*\d|后半|後半|上半|下半|下部|上部/i;
 if(aa.length&&bb.length)return aa.some(n=>bb.includes(n));
 return !aa.length&&!bb.length&&coreNames(a).concat(coreNames(b)).some(n=>part.test(n));
}
function seasonParts(context){
 const all=(context.series||[context.subject]).slice().sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')),at=all.findIndex(s=>String(s.id||s.bgmId)===String(context.subject.id||context.subject.bgmId));
 if(at<0)return [context.subject];let first=at,last=at;
 const contiguous=(a,b)=>{const x=mainEpisodes(a),y=mainEpisodes(b);return x.length&&y.length&&Number(x[x.length-1].sort)+1===Number(y[0].sort)&&sameSeason(a,b);};
 while(first>0&&contiguous(all[first-1],all[first]))first--;while(last+1<all.length&&contiguous(all[last],all[last+1]))last++;
 return all.slice(first,last+1);
}
function familyBases(context){
 const all=(context.series||[context.subject]).flatMap(subjectNames),own=subjectNames(context.subject),out=[];
 for(const n of all)if(own.some(o=>norm(o).includes(norm(n)))&&norm(n).length>=2)out.push(n);
 for(const n of own){const short=n.split(/[～~]/)[0].trim().replace(/\s*第\s*[0-9一二三四五六七八九十]+\s*(?:季|期|部分).*$/,'').trim();if(norm(short).length>=2)out.push(short);}
 for(const n of out.slice()){const tail=n.split(/[:：]/).slice(1).join('：').trim();if(norm(tail).length>=4)out.push(tail);}
 const native=n=>/[\u3040-\u9fff]/.test(n.replace(/第\s*[0-9一二三四五六七八九十]+\s*(?:季|期|部分).*$/,''));
 return Array.from(new Set(out)).sort((a,b)=>Number(native(b))-Number(native(a))||norm(a).length-norm(b).length);
}
function pageKind(context,name){
 const own=subjectNames(context.subject);if(own.some(n=>identity(n,name)))return 'own';
 const parts=seasonParts(context);if(parts.some(s=>subjectNames(s).some(n=>identity(n,name))))return 'season';
 if((context.series||[]).some(s=>subjectNames(s).some(n=>identity(n,name))))return 'series';
 const pageNumbers=names.seasonNumbers(name),ownNumbers=subjectNames(context.subject).flatMap(n=>Array.from(names.seasonNumbers(n)));
 const base=familyBases(context).some(n=>norm(name).includes(norm(n))||norm(n).includes(norm(name)));
 if(!base)return 'unrelated';
 if(pageNumbers.size&&ownNumbers.length&&!Array.from(pageNumbers).some(n=>ownNumbers.includes(n)))return 'otherSeason';
 const index=parts.findIndex(s=>String(s.id||s.bgmId)===String(context.subject.id||context.subject.bgmId)),part=/(?:part\s*([0-9]+)|第\s*([0-9]+)\s*(?:部分|クール))/i.exec(name);
 if(part&&index>=0&&Number(part[1]||part[2])===index+1)return 'own';
 // With no explicit season/part identity, a shared family name is only a combined-page candidate.
 return 'family';
}
function rowNumber(e){return finite(e.number===undefined?e.sort:e.number);}
function isMainRow(e){return !(/^(?:sp|ova|oad|op|ed|special)$/i.test(e.type||'')||/^(?:【[^】]*】\s*)?(?:[SOC]\d+\s|(?:OP|ED)\s*\d*\b|特别篇$|特別篇$)/i.test(e.displayName||e.name||''));}
function matchPage(context,page){
 let kind=page.confirmed?'own':pageKind(context,page.name);const own=mainEpisodes(context.subject),allRows=page.episodes||[],rows=allRows.filter(isMainRow),numbers=rows.map(rowNumber).filter(n=>n!==null),unique=new Set(numbers),first=numbers.length?Math.min.apply(null,numbers):null;
 const empty=reason=>({kind,reason,matches:[],available:0});
 if(kind==='unrelated'||kind==='otherSeason'||!own.length)return empty('subjectMismatch');
 const parts=seasonParts(context),seasonEpisodes=[].concat.apply([],parts.map(mainEpisodes)),seasonFirst=seasonEpisodes.length?Math.max(Number(seasonEpisodes[0].sort),1):1;
 const rowTitles=new Map(),canonicalTitles=new Map(),titleRows=new Map(),numberRows=new Map(),titleOwners=new Map();
 const titleOf=e=>{if(!rowTitles.has(e))rowTitles.set(e,episodeTitle(e.episodeName===undefined?e.name:e.episodeName));return rowTitles.get(e);},canonTitles=e=>{if(!canonicalTitles.has(e))canonicalTitles.set(e,[e.name_cn,e.name].map(episodeTitle).filter(t=>t.length>=3));return canonicalTitles.get(e);};
 for(const row of rows){const t=titleOf(row);if(!titleRows.has(t))titleRows.set(t,[]);titleRows.get(t).push(row);const n=rowNumber(row);if(!numberRows.has(n))numberRows.set(n,[]);numberRows.get(n).push(row);}
 for(const sub of context.series||[context.subject])for(const ep of mainEpisodes(sub))for(const t of canonTitles(ep)){if(!titleOwners.has(t))titleOwners.set(t,new Set());titleOwners.get(t).add(String(ep.id));}
 const rowsFor=ep=>Array.from(new Set([].concat.apply([],canonTitles(ep).map(t=>titleRows.get(t)||[]))));
 // Repeated named chapters can indicate duplicate or displaced source entries. Never infer an offset through them.
 // On a page the user confirmed, a repeat is a second copy of that chapter (e.g. a re-upload): the first is used.
 for(const ep of own){if(!page.danmaku&&!page.confirmed&&rowsFor(ep).length>1)return empty('duplicateEpisodeTitle');}
 const ownAnchorCount=own.filter(e=>rowsFor(e).length&&canonTitles(e).some(t=>titleOwners.has(t)&&titleOwners.get(t).size===1)).length;
 if(page.danmaku&&ownAnchorCount>=Math.min(2,own.length))kind='own';
 let mode;
 const exact=kind==='own';
 const series=(context.series||[]).slice().sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')),sequence=[];
 for(const sub of series){const eps=mainEpisodes(sub).filter(e=>Number(e.sort)>0);if(!eps.length)continue;if(sequence.length&&Number(eps[0].sort)!==Number(sequence[sequence.length-1].sort)+1)break;sequence.push(...eps);}
 const max=numbers.length?Math.max.apply(null,numbers):0,prefix=sequence.filter(e=>Number(e.sort)<=max),seriesRange=prefix.length===unique.size&&new Set(prefix.map(e=>Number(e.sort))).size===prefix.length&&prefix.every(e=>unique.has(Number(e.sort)))&&own.some(e=>prefix.some(x=>String(x.id)===String(e.id)));
 if(kind==='series'||(exact&&unique.size>own.length+2&&parts.length===1)){
  if(!seriesRange)return empty('unprovenSeriesMerge');mode='sort';
 }else if(first!==null&&first>1){
  const local=own.map(e=>Number(e.sort)-seasonFirst+1),global=own.map(e=>Number(e.sort));
  if(local.some(n=>unique.has(n)))mode='season';else if(global.some(n=>unique.has(n)))mode='sort';else return empty('episodeRangeMismatch');
 }else if(exact&&unique.size<=own.length+2){mode=first===0?'sort':'ep';}
 else{
  const prior=parts.filter(s=>String(s.id||s.bgmId)!==String(context.subject.id||context.subject.bgmId)&&Number(mainEpisodes(s)[0]&&mainEpisodes(s)[0].sort)<Number(own[0].sort));
  const priorCount=prior.reduce((n,s)=>n+mainEpisodes(s).filter(e=>Number(e.sort)>0).length+(s.inlineSpecialCount||0),0);
  if(parts.length<2||unique.size<=priorCount)return empty('unprovenCombinedPage');
  mode='season';
 }
 function expected(ep){return mode==='sort'?Number(ep.sort):mode==='season'?Number(ep.sort)-seasonFirst+1:ep.ep==null?null:Number(ep.ep);}
 const matches=[];
 for(const ep of own){
  const byTitle=rowsFor(ep);let row=byTitle.length===1||(page.confirmed&&byTitle.length)?byTitle[0]:page.danmaku&&byTitle.length?byTitle.find(e=>/dandan/.test(e.displayName||''))||byTitle[0]:null,method='title';
  if(!row){const candidates=numberRows.get(expected(ep))||[];if(candidates.length===1){row=candidates[0];method=mode;}}
  if(!row)continue;
  const got=titleOf(row),knownOther=titleOwners.has(got)&&!titleOwners.get(got).has(String(ep.id));
  if(method!=='title'&&knownOther)continue;
  // A meaningful but conflicting title is not a numbered placeholder. A numeric match cannot override it.
  const rawName=row.episodeName===undefined?row.name:row.episodeName;
  if(method!=='title'&&got.length>=3&&canonTitles(ep).length&&!(row.genericTitle||/^(?:第\s*)?[\d.]+\s*[话話集]?$/.test(String(rawName||'').trim())))continue;
  matches.push({episode:ep,row,method,confidence:method==='title'?'title':'structure'});
 }
 // One source resource must not serve two canonical chapters.
 const ids=matches.map(m=>String(m.row.id));if(new Set(ids).size!==ids.length)return empty('ambiguousEpisodeMapping');
 return {kind,mode,matches,available:matches.length,reason:matches.length?'matched':'episodeMismatch'};
}
module.exports={episodeTitle,subjectNames,mainEpisodes,seasonParts,familyBases,pageKind,matchPage,isMainRow};
