'use strict';
function half(s){return String(s||'').replace(/[！-～]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0));}
function title(s){return half(String(s||'').trim().replace(/^第\s*\d+\s*[话話集]/,'')).replace(/\s/g,'').toLowerCase();}
const words={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7,'VIII':8,'IX':9,'X':10};
function normalize(s){return half(s).normalize('NFKC').replace(/第([一二三四五六七八九十])/g,(_,n)=>'第'+words[n]).replace(/\b(VIII|VII|III|II|IV|VI|IX|V|X)\b/g,n=>words[n]).replace(/[\s。、，·・\[\]～“”~—\-!@#$%^&*()_+{}|\\;':",.<>/?【】：「」！（）]/g,'').toLowerCase();}
function distance(a,b){a=String(a||'').slice(0,250);b=String(b||'').slice(0,250);let row=Array.from({length:a.length+1},(_,i)=>i);for(let i=1;i<=b.length;i++){const next=[i];for(let j=1;j<=a.length;j++)next[j]=Math.min(row[j]+1,next[j-1]+1,row[j-1]+(a[j-1]===b[i-1]?0:1));row=next;}return row[a.length];}
function mostRelevant(rows,r){const expected='第'+String(r.episodeEp==null?r.episodeSort:r.episodeEp).replace(/^0/,'')+'话 '+r.episodeName;let best=null,score=Infinity;for(const e of rows){const d=distance(e.subjectName,r.subjectPrimaryName)+distance(e.episodeName,expected);if(d<score){best=e;score=d;}}return best;}
function number(e){const raw=e.number==null?/^第\s*(\d+)\s*[话話集]/.exec(String(e.episodeName).trim()):null;const v=e.number==null?(raw?Number(raw[1]):NaN):Number(e.number);return Number.isInteger(v)?v:null;}
function seasonNumbers(s){s=half(s);const out=new Set();const patterns=[/第\s*([0-9一二三四五六七八九十]+)\s*[季期]/g,/(?:season|シーズン)\s*([0-9]+)/gi,/([0-9]+)(?:st|nd|rd|th)\s*season/gi,/(?:^|[^a-z0-9])s([0-9]+)(?![a-z0-9])/gi,/([ⅡⅢⅣⅤⅥⅦⅧⅨⅩ])/g,/(?:^|[^A-Za-z])(VIII|VII|III|II|IV|VI|IX|V|X)(?![A-Za-z])/g];for(const p of patterns){let m;while((m=p.exec(s))){const v=Number(words[m[1]]||words[m[1].normalize('NFKC')]||m[1]);if(v>0)out.add(v);}}return out;}
function sameSubjectName(a,b){
 if(normalize(a)===normalize(b))return true;
 const aa=seasonNumbers(a),bb=seasonNumbers(b);if(!aa.size&&!bb.size)return false;
 if(!aa.size)aa.add(1);if(!bb.size)bb.add(1);if(aa.size!==bb.size||Array.from(aa).some(n=>!bb.has(n)))return false;
 const strip=s=>half(s).normalize('NFKC').replace(/第\s*[0-9一二三四五六七八九十]+\s*[季期]/g,'').replace(/(?:season|シーズン)\s*[0-9]+/gi,'').replace(/[0-9]+(?:st|nd|rd|th)\s*season/gi,'').replace(/\b(?:VIII|VII|III|II|IV|VI|IX|V|X)\b/g,'');
 return normalize(strip(a))===normalize(strip(b));
}
function generic(i){return i===0?['第1部分','Part 1','第1クール','前半','上半','上部','前篇','前編']:i===1?['第2部分','Part 2','第2クール','后半','後半','下半','下部','后篇','後編']:['第'+(i+1)+'部分','Part '+(i+1),'第'+(i+1)+'クール'];}
function splitMatcher(r){
 const s=r.splitSeason;if(!s||!Array.isArray(s.parts)||s.parts.length<2||!(s.selfIndex>0&&s.selfIndex<s.parts.length)||!Number.isInteger(r.episodeSort)||!Number.isInteger(r.episodeEp)||!r.subjectNames.length)return null;
 const own=s.parts[s.selfIndex],siblings=s.parts.filter((_,i)=>i!==s.selfIndex),ownNumbers=new Set((own.names||[]).flatMap(n=>Array.from(seasonNumbers(n)))),siblingNumbers=new Set(siblings.flatMap(p=>(p.names||[]).flatMap(n=>Array.from(seasonNumbers(n))))),group=new Set([...ownNumbers,...siblingNumbers]);
 if(!(s.parts[0].names||[]).some(n=>seasonNumbers(n).size))group.add(1);
 const ownMarkers=(own.markers||[]).concat(generic(s.selfIndex)),siblingMarkers=s.parts.flatMap((p,i)=>i===s.selfIndex?[]:(p.markers||[]).concat(generic(i))).filter(m=>!ownMarkers.some(o=>normalize(o)===normalize(m)));
 const specific=s.parts.flatMap(p=>p.markers||[]).filter(m=>!s.parts.flatMap((_,i)=>generic(i)).some(g=>normalize(m).includes(normalize(g))));
 const seasonNames=siblings.flatMap(p=>p.names||[]).concat(s.baseNames||[]),contains=(name,m)=>normalize(m).length<2?name.toLowerCase().includes(m.toLowerCase()):normalize(name).includes(normalize(m));
 function classify(name){if(r.subjectNames.some(n=>sameSubjectName(n,name)))return 'own';if(seasonNames.some(n=>sameSubjectName(n,name)))return 'season';const nums=seasonNumbers(name),inside=Array.from(nums).some(n=>group.has(n));if(!inside&&Array.from(nums).some(n=>(s.otherSeasonNumbers||[]).includes(n)||n===1))return 'otherSeason';if(!nums.size&&!group.has(1)&&(s.otherSeasonNumbers||[]).includes(1)&&!specific.some(m=>contains(name,m)))return 'otherSeason';if(siblingMarkers.some(m=>contains(name,m)))return 'season';if(ownMarkers.some(m=>contains(name,m)))return 'own';if(inside)return Array.from(nums).every(n=>ownNumbers.has(n)&&!siblingNumbers.has(n))?'own':'season';return 'other';}
 const previous=s.parts.slice(0,s.selfIndex),previousCount=previous.reduce((n,p)=>n+p.episodeCount,0),extra=previous.reduce((n,p)=>n+(p.inlineSpecialCount||0)+(p.firstSort===0?1:0),0),seasonNumber=r.episodeSort-Math.max(s.parts[0].firstSort,1)+1;
 return {previousIds:previous.map(p=>p.subjectId),classify,match(name,rows,mappedToSelf){let kind=classify(name);if(kind==='otherSeason')return null;if(mappedToSelf&&kind==='other')kind='own';const nums=new Set(rows.map(number).filter(n=>n!=null));if(!nums.size)return null;let expected;if(Math.min(...nums)>1)return rows.find(e=>number(e)===seasonNumber||number(e)===r.episodeSort)||null;if(kind==='own'&&nums.size<=own.episodeCount+2)expected=r.episodeEp;else if(nums.size<=previousCount+extra)return null;else expected=seasonNumber;return rows.find(e=>number(e)===expected)||null;}};
}
function matchEpisodes(r,rows,mappedToSelf){
 if(!rows||!rows.length)return null;const split=splitMatcher(r),names=new Set((r.episodeNames||[]).concat(r.episodeName||'').map(title).filter(Boolean));
 const candidates=(split?rows.filter(e=>split.classify(e.subjectName)!=='otherSeason'):rows).filter(e=>names.has(title(e.episodeName)));
 let exact=candidates.length===1?candidates[0]:null;
 if(r.episodeType)return exact?{episode:exact,method:'exactTitle'}:null;
 if(split){if(exact)return {episode:exact,method:'exactTitle'};const groups=new Map();for(const e of rows){if(!groups.has(e.subjectName))groups.set(e.subjectName,[]);groups.get(e.subjectName).push(e);}for(const [name,list] of groups){const e=split.match(name,list,mappedToSelf);if(e)return {episode:e,method:'splitSeasonNumber'};}return null;}
 exact=exact||candidates.find(e=>e.number!=null&&Number(e.number)===r.episodeSort)||candidates.find(e=>e.number!=null&&Number(e.number)===r.episodeEp);
 if(exact)return {episode:exact,method:'exactTitle'};
 for(const [n,method] of [[r.episodeSort,'exactSort'],[r.episodeEp,'exactEp']]){if(n==null)continue;const e=rows.find(e=>e.number!=null&&String(e.number)===String(n));if(e)return {episode:e,method};}
 return {episode:mostRelevant(rows,r),method:'fuzzyEpisode'};
}
module.exports={title,normalize,sameSubjectName,distance,mostRelevant,number,seasonNumbers,splitMatcher,matchEpisodes};
