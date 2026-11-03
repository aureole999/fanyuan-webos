'use strict';
function cleanName(name){return String(name||'').toLowerCase().replace(/[\s·・:：!！?？()（）「」【】]/g,'');}
function seriesKey(subject){return subject.bgmId?'bgm:'+subject.bgmId:'name:'+cleanName(subject.name);}
function episodeKey(sourceId,subject,episode){return episode.bgmEpisodeId?'bgm:'+episode.bgmEpisodeId:sourceId+'|'+(subject.url||subject.id)+'|'+episode.id;}
function stableSubject(subject){const keep=['id','bgmId','name','originalName','cover','summary','score','date','episodeCount','tags','url','sourceId','sourceSubjectName'];const o={};keep.forEach(k=>{if(subject[k]!==undefined)o[k]=subject[k];});return o;}
function stableEpisode(episode){const o={};['id','name','sort','type','url','channelName','channelMatch','bgmEpisodeId','bgmSubjectId','bgmEp','sourceSort','unmatched'].forEach(k=>{if(episode[k]!==undefined)o[k]=episode[k];});return o;}
function makeLibrary(storage){
  const prefix='fanyuan_';
  function get(key,fallback){try{const raw=storage.getItem(prefix+key);return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}}
  function set(key,value){try{storage.setItem(prefix+key,JSON.stringify(value));return true;}catch(e){return false;}}
  const defaults={danmaku:true,danmakuScale:1,danmakuOpacity:0.85,danmakuArea:0.33,danmakuLineGap:10,danmakuSpeed:1,danmakuDensity:'medium',danmakuWeight:600,danmakuStroke:1,danmakuFloating:true,danmakuTop:true,danmakuBottom:false,danmakuColor:true,autoplayNext:true,resumeToEpisodes:false,skipShortcut:true,gridCols:4};
  const api={
    settings(){return Object.assign({},defaults,get('settings',{}));},
    setSettings(patch){const value=Object.assign({},api.settings(),patch);set('settings',value);return value;},
    favorites(){return get('favorites',[]);},
    isFavorite(subject){return api.favorites().some(x=>seriesKey(x)===seriesKey(subject));},
    favoriteStatus(subject){const item=api.favorites().find(x=>seriesKey(x)===seriesKey(subject));return item&&item.status||'wish';},
    setFavoriteStatus(subject,status){if(!['wish','watching','done'].includes(status))return false;return set('favorites',api.favorites().map(x=>seriesKey(x)===seriesKey(subject)?Object.assign({},x,{status}):x));},
    toggleFavorite(subject){const key=seriesKey(subject),list=api.favorites(),found=list.some(x=>seriesKey(x)===key);set('favorites',found?list.filter(x=>seriesKey(x)!==key):[Object.assign(stableSubject(subject),{savedAt:Date.now()})].concat(list).slice(0,200));return !found;},
    history(){return get('history',[]);},
    videoMapping(subject,sourceId){return get('videoMappings',{})[seriesKey(subject)+'|'+sourceId]||null;},
    setVideoMapping(subject,sourceId,value){const all=get('videoMappings',{}),key=seriesKey(subject)+'|'+sourceId;if(value)all[key]={id:value.id,url:value.url,name:value.sourceSubjectName||value.name,sourceId};else delete all[key];return set('videoMappings',all);},
    latestProgress(subject){return api.history().find(x=>seriesKey(x.subject)===seriesKey(subject)||(!(x.subject.bgmId&&subject.bgmId)&&cleanName(x.subject.name)===cleanName(subject.name)))||null;},
    sourceFor(subject){const all=get('seriesSources',{}),item=all[seriesKey(subject)]||all['name:'+cleanName(subject.name)];return item&&!(item.bgmId&&subject.bgmId&&item.bgmId!==subject.bgmId)?item.sourceId:null;},
    setSourceFor(subject,sourceId){if(!subject?.name||!sourceId)return false;const all=get('seriesSources',{}),item={sourceId,bgmId:subject.bgmId||null};all[seriesKey(subject)]=item;all['name:'+cleanName(subject.name)]=item;return set('seriesSources',all);},
    progressLookup(){const snapshot=get('progress',{});return (sourceId,subject,episode)=>snapshot[episodeKey(sourceId,subject,episode)]||snapshot[sourceId+'|'+(subject.url||subject.id)+'|'+episode.id]||null;},
    progress(sourceId,subject,episode){return api.progressLookup()(sourceId,subject,episode);},
    saveProgress(sourceId,subject,episode,position,duration,completed){
      if(!(duration>0)||!(position>=0)||!isFinite(duration)||!isFinite(position))return false;
      const key=episodeKey(sourceId,subject,episode),ts=Date.now(),entry={sourceId,subject:stableSubject(subject),episode:stableEpisode(episode),position:Math.floor(position),duration:Math.floor(duration),completed:completed===true,ts};
      const map=get('progress',{});map[key]=entry;
      const keys=Object.keys(map).sort((a,b)=>map[b].ts-map[a].ts);keys.slice(400).forEach(k=>delete map[k]);
      const ok=set('progress',map);set('history',[entry].concat(api.history().filter(x=>seriesKey(x.subject)!==seriesKey(subject))).slice(0,100));return ok;
    },
    markComplete(sourceId,subject,episode,value){const old=api.progress(sourceId,subject,episode);return api.saveProgress(sourceId,subject,episode,old?old.position:0,old?old.duration:1,value);},
    searchHistory(){return get('searches',[]);},
    addSearch(q){q=String(q||'').trim();if(q)set('searches',[q].concat(api.searchHistory().filter(x=>x!==q)).slice(0,12));},
    clearHistory(){set('history',[]);set('progress',{});},
    mapping(subject){return get('mappings',{})[seriesKey(subject)]||null;},
    setMapping(subject,bgmId){const m=get('mappings',{});m[seriesKey(subject)]=bgmId;set('mappings',m);},
    danmakuSources(){return get('danmakuSources',{});},
    setDanmakuSource(id,patch){const prefs=api.danmakuSources();prefs[id]=Object.assign({enabled:true,shift:0},prefs[id]||{},patch);set('danmakuSources',prefs);return prefs;},
    customDanmakuMapping(subject,episode){return get('customDanmakuMappings',{})[seriesKey(subject)+'|'+episode.sort+'|'+(episode.type||'main')]||null;},
    setCustomDanmakuMapping(subject,episode,value){const key=seriesKey(subject)+'|'+episode.sort+'|'+(episode.type||'main'),all=get('customDanmakuMappings',{});if(value)all[key]=value;else delete all[key];set('customDanmakuMappings',all);},
    offset(subject){return get('offsets',{})[seriesKey(subject)]||0;},
    setOffset(subject,value){const m=get('offsets',{});m[seriesKey(subject)]=value;set('offsets',m);},
  };return api;
}
function playbackTarget(detail,entry){
  const channels=detail.channels||[],preferred=entry?channels.findIndex(c=>(entry.episode.channelMatch&&c.match===entry.episode.channelMatch)||(entry.episode.channelName&&c.name===entry.episode.channelName)):-1;
  const order=channels.map((_,i)=>i);if(preferred>0)order.unshift(order.splice(preferred,1)[0]);
  for(const channelIndex of order){const eps=channels[channelIndex].episodes||[];let episode;
    if(!entry)episode=eps.find(e=>(e.type||'main').toLowerCase()==='main')||eps[0];
    else{const sameSource=detail.subject.sourceId===entry.sourceId;
      episode=entry.episode.bgmEpisodeId?eps.find(e=>e.bgmEpisodeId===entry.episode.bgmEpisodeId):sameSource&&eps.find(e=>e.id===entry.episode.id);
      if(!episode&&!entry.episode.bgmEpisodeId){const n=entry.episode.sort;const matches=eps.filter(e=>n!==undefined&&n!==null&&String(n).trim()!==''&&e.sort!==undefined&&e.sort!==null&&String(e.sort).trim()!==''&&Number.isFinite(Number(n))&&Number(e.sort)===Number(n)&&(e.type||'main').toLowerCase()===(entry.episode.type||'main').toLowerCase());if(matches.length===1)episode=matches[0];}
    }
    if(episode&&!episode.unavailable)return {episode,channelIndex,startAt:entry&&!entry.completed?entry.position:0};
  }return null;
}
module.exports={playbackTarget,makeLibrary,seriesKey,episodeKey,stableSubject,stableEpisode,cleanName};
