import React,{useState,useEffect,useRef,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import SidebarItem from './vendor/bilitv/components/SidebarItem';
import {initKeyboardNav,onFocusChange,setFocus,getCurrentFocusId,setContentContext,focusFirstContent,focusSidebar,setLastSidebarFocus,setCustomKeyHandler,isPointerFocus,activateFocusScope} from './vendor/bilitv/hooks/useFocus';
import {FocusButton,FocusSearchInput,PosterCard,TextCard,Icon,Empty,Loading} from './components';
import {call} from './api';
import {makeLibrary,cleanName,seriesKey} from './library.cjs';
import Player from './Player';
import Subscriptions from './Subscriptions';
import DanmakuSettings from './DanmakuSettings';
import {coverThumbnail} from '../src/images.cjs';
import {remoteKey} from './navigation.cjs';

const library=makeLibrary(localStorage);
const MENU=[['home','首页','home'],['search','搜索','search'],['calendar','新番时间表','tv'],['favorites','我的收藏','star'],['history','观看历史','history'],['settings','设置','settings']];
const DAY=['周一','周二','周三','周四','周五','周六','周日'];
const today=(new Date().getDay()||7);
function shortTime(seconds){const m=Math.floor((seconds||0)/60);return m?`${m} 分钟`:'刚刚开始';}
function alternate(channel,episode){const sameType=e=>(e.type||'main').toLowerCase();return channel.episodes.find(e=>{const a=Number(e.sort),b=Number(episode.sort);return (Number.isFinite(a)&&Number.isFinite(b)?a===b:e.sort===episode.sort)&&sameType(e)===sameType(episode);});}
function Dialog({title,options,onClose}){
  useLayoutEffect(()=>activateFocusScope('dialog',options.length?'dialog-0':'dialog-close'),[]);
  useEffect(()=>{
    setCustomKeyHandler(e=>{
      const key=remoteKey(e);
      if(['Escape','GoBack','Backspace'].includes(key)){e.preventDefault();if(!e.repeat)onClose();return true;}
      return false;
    });
    return()=>setCustomKeyHandler(null);
  },[onClose]);
  return <div className="dialog-backdrop"><section className="dialog-box"><div className="dialog-heading"><h2>{title}</h2><FocusButton id="dialog-close" row={-1} group="dialog" className="dialog-close" onSelect={onClose} aria-label="关闭弹窗">×</FocusButton></div>{options.map((o,i)=><FocusButton key={i} id={'dialog-'+i} row={i} col={0} group="dialog" className={'dialog-option '+(o.active?'active':'')} onSelect={o.action}><strong>{o.label}</strong>{o.description&&<small>{o.description}</small>}</FocusButton>)}</section></div>;
}
function App(){
  const [page,setPage]=useState('home'),[sources,setSources]=useState([]),[sourceId,setSourceId]=useState(localStorage.getItem('sourceId')||'source-c');
  const [calendar,setCalendar]=useState([]),[day,setDay]=useState(today),[calendarError,setCalendarError]=useState(''),[calendarBusy,setCalendarBusy]=useState(true);
  const [keyword,setKeyword]=useState(''),[results,setResults]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[detail,setDetail]=useState(null),[meta,setMeta]=useState(null),[candidates,setCandidates]=useState([]),[channel,setChannel]=useState(0),[settings,setSettings]=useState(()=>library.settings()),[revision,setRevision]=useState(0),[dialog,setDialog]=useState(null),[player,setPlayer]=useState(null),[toast,setToast]=useState(''),[favFilter,setFavFilter]=useState('all');
  const drawer=useRef(false),sidebarRef=useRef(null),previewTimer=useRef(null);
  const token=useRef(0),toastTimer=useRef(null),inputRef=useRef(null),scroller=useRef(null),lastPage=useRef('home'),lastCard=useRef(null),current=useRef({});
  current.current={page,drawer:drawer.current,sources,sourceId,calendar,results,detail,meta,channel,player,dialog,settings};
  const currentSource=sources.find(s=>s.id===sourceId);
  function setDrawer(value){drawer.current=value;current.current.drawer=value;if(sidebarRef.current)sidebarRef.current.dataset.expanded=String(value);}
  function notify(text){setToast(text);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),3200);}
  function refresh(){setRevision(n=>n+1);}
  function updateSettings(patch){setSettings(library.setSettings(patch));}
  function go(next,enter=false){clearTimeout(previewTimer.current);if(next===current.current.page){setDrawer(!enter);if(enter)focusFirstContent();return;}token.current++;setContentContext(next);setPage(next);setDrawer(!enter);setDetail(null);setMeta(null);setCandidates([]);setError('');setBusy(false);if(scroller.current)scroller.current.scrollTop=0;if(enter)focusFirstContent();}
  async function refreshSources(){const r=await call('sources');setSources(r.sources);const selected=current.current.sourceId;if(r.sources.length&&!r.sources.some(s=>s.id===selected)){setSourceId(r.sources[0].id);localStorage.setItem('sourceId',r.sources[0].id);}return r;}
  async function loadCalendar(){setCalendarBusy(true);setCalendarError('');try{const r=await call('calendar');setCalendar(r.days);}catch(e){setCalendarError(e.message);}finally{setCalendarBusy(false);}}
  useEffect(()=>{
    initKeyboardNav();
    refreshSources().then(()=>call('subscriptionsUpdate',{force:false})).then(refreshSources).catch(e=>notify(e.message));loadCalendar();
    const off=onFocusChange(id=>{
      clearTimeout(previewTimer.current);
      if(id?.startsWith('sidebar-')){
        setDrawer(true);setLastSidebarFocus(id);
        const item=MENU.find(m=>'sidebar-'+m[0]===id);
        if(item&&!isPointerFocus()&&current.current.page!==item[0]){
          previewTimer.current=setTimeout(()=>go(item[0]),100);
        }
      }else if(id?.startsWith('content-')||id==='header-source')setDrawer(false);
    });
    const enter=e=>{const item=MENU.find(m=>'sidebar-'+m[0]===e.detail);if(item){if(current.current.page!==item[0])go(item[0],true);else{setDrawer(false);focusFirstContent();}}};
    const back=()=>{const s=current.current;if(s.player)return;if(s.dialog){setDialog(null);return;}if(s.page==='subscriptions'||s.page==='danmakuSettings'){go('settings',true);return;}if(s.page==='detail'){token.current++;setDetail(null);setMeta(null);setCandidates([]);setPage(lastPage.current);setContentContext(lastPage.current);setError('');setBusy(false);setTimeout(()=>lastCard.current?setFocus(lastCard.current):focusFirstContent(),50);}else if(s.drawer){if(s.page==='home'){if(window.webOS?.platformBack)webOS.platformBack();}else go('home',true);}else{setDrawer(true);focusSidebar();}};
    window.addEventListener('tv-enter-content',enter);window.addEventListener('tv-back',back);
    setTimeout(()=>setFocus('sidebar-home'),100);
    return()=>{clearTimeout(previewTimer.current);off();window.removeEventListener('tv-enter-content',enter);window.removeEventListener('tv-back',back);};
  },[]);

  useEffect(()=>{const scale=()=>{const frame=document.getElementById('tv-frame');if(frame)frame.style.transform=`scale(${Math.min(innerWidth/1920,innerHeight/1080)})`;};scale();window.addEventListener('resize',scale);return()=>window.removeEventListener('resize',scale);},[]);
  async function chooseSource(){let available;try{available=(await refreshSources()).sources;}catch(e){notify(e.message);return;}setDialog({title:'选择视频源',options:available.map(s=>({label:s.name,description:s.factoryId==='json-api'?'接口源 · 原始订阅规则':'网页源 · 原始订阅规则',active:s.id===sourceId,action:()=>{setSourceId(s.id);localStorage.setItem('sourceId',s.id);setDialog(null);if(page==='detail')loadTitleSource(meta||detail?.subject,s.id);else if(page==='search'&&keyword.trim())runSearch(keyword,s.id);}}))});}
  async function runSearch(q=keyword,id=sourceId){
    q=q.trim();if(!q)return;const seq=++token.current;library.addSearch(q);setKeyword(q);setBusy(true);setError('');setPage('search');setContentContext('search');setDrawer(false);setDetail(null);setMeta(null);setCandidates([]);setResults([]);
    try{
      const r=await call('search',{sourceId:id,keyword:q});if(seq!==token.current)return;setResults(r.items);setBusy(false);setTimeout(()=>setFocus('content-1-0'),50);
      call('bangumiSearch',{keyword:q}).then(data=>{if(seq!==token.current)return;setResults(items=>items.map(x=>{const matches=data.items.filter(m=>cleanName(m.name)===cleanName(x.name)||cleanName(m.originalName)===cleanName(x.name));return matches.length===1?{...x,...{bgmId:matches[0].bgmId,cover:matches[0].cover,score:matches[0].score,date:matches[0].date,originalName:matches[0].originalName}}:x;}));}).catch(()=>{});
    }catch(e){if(seq===token.current){setError(e.message);setBusy(false);}}
  }
  useEffect(()=>{if(error&&!busy&&!player&&!dialog){setFocus('content-0-4');}},[error,busy,player,dialog]);
  function enterDetailBase(subject){lastPage.current=page==='detail'?lastPage.current:page;lastCard.current=getCurrentFocusId();setPage('detail');setContentContext('detail:'+seriesKey(subject));setDrawer(false);setError('');setDetail(null);setCandidates([]);setChannel(0);setMeta(subject);focusFirstContent();if(scroller.current)scroller.current.scrollTop=0;}
  async function sourceDetail(subject,id=sourceId,metadata=null){
    const seq=++token.current;setBusy(true);setError('');setCandidates([]);
    const merged={...subject,...(metadata?{bgmId:metadata.bgmId,cover:metadata.cover,score:metadata.score,summary:metadata.summary,date:metadata.date,episodeCount:metadata.episodeCount,tags:metadata.tags}:{}),sourceId:id};
    try{const r=await call('detail',{sourceId:id,subject:merged});if(seq!==token.current)return;setDetail(r);setChannel(0);setBusy(false);setTimeout(()=>setFocus('content-2-0'),60);}catch(e){if(seq===token.current){setError(e.message);setBusy(false);}}
  }
  function openSource(subject){
    const id=subject.sourceId||sourceId;setSourceId(id);localStorage.setItem('sourceId',id);enterDetailBase(subject);sourceDetail(subject,id,subject.bgmId?subject:null);
    const apply=r=>{if(current.current.page==='detail'&&cleanName(current.current.meta?.name)===cleanName(subject.name))setMeta({...r.subject,sourceId:id});};
    if(subject.bgmId)call('bangumiDetail',{id:subject.bgmId}).then(apply).catch(()=>{});
    else call('bangumiSearch',{keyword:subject.name}).then(r=>{const exact=r.items.filter(x=>cleanName(x.name)===cleanName(subject.name)||cleanName(x.originalName)===cleanName(subject.name));if(exact.length===1)return call('bangumiDetail',{id:exact[0].bgmId}).then(apply);}).catch(()=>{});
  }
  async function loadTitleSource(subject,id=sourceId){
    if(!subject)return;const seq=++token.current;setBusy(true);setError('');setDetail(null);setCandidates([]);
    try{const r=await call('search',{sourceId:id,keyword:subject.name});if(seq!==token.current)return;const exact=r.items.filter(x=>cleanName(x.name)===cleanName(subject.name)||cleanName(x.name)===cleanName(subject.originalName));if(exact.length===1)sourceDetail(exact[0],id,subject);else{setCandidates(r.items.map(x=>({...x,sourceId:id})));setBusy(false);setTimeout(()=>setFocus('content-2-0'),50);}}catch(e){if(seq===token.current){setError(e.message);setBusy(false);}}
  }
  function openTitle(subject){enterDetailBase(subject);if(subject.bgmId){call('bangumiDetail',{id:subject.bgmId}).then(r=>{if(current.current.page==='detail'&&current.current.meta?.bgmId===subject.bgmId)setMeta(r.subject);}).catch(()=>{});}loadTitleSource(subject);}
  function toggleFavorite(){const subject=meta||detail?.subject;if(subject){const saved=library.toggleFavorite(subject);refresh();notify(saved?'已加入本地收藏':'已取消收藏');}}
  function startPlay(ep,index=channel,startAt){
    if(!detail)return;const source=detail.subject.sourceId||sourceId,subject={...detail.subject,...(meta?.bgmId?{bgmId:meta.bgmId,cover:meta.cover,score:meta.score}: {})};const ch=detail.channels[index];const i=ch.episodes.findIndex(x=>x.id===ep.id);
    setPlayer({key:Date.now(),sourceId:source,subject,episode:ep,channels:detail.channels,channelIndex:index,hasNext:i>=0&&i<ch.episodes.length-1,startAt});
  }
  function closePlayer(){setPlayer(null);refresh();}
  function nextEpisode(){const p=current.current.player;if(!p)return;const eps=p.channels[p.channelIndex].episodes,i=eps.findIndex(e=>e.id===p.episode.id);if(i>=0&&i+1<eps.length)startPlay(eps[i+1],p.channelIndex,0);else notify('已是此线路最后一集');}
  function switchPlayingChannel(i){const p=current.current.player;if(!p)return;const ep=alternate(p.channels[i],p.episode);if(!ep){notify('此线路没有匹配到当前集，请从选集中选择');return;}const old=library.progress(p.sourceId,p.subject,p.episode);setChannel(i);startPlay(ep,i,old?.position||0);}
  async function resume(entry){
    const subject=entry.subject,id=entry.sourceId;setSourceId(id);localStorage.setItem('sourceId',id);enterDetailBase(subject);const seq=++token.current;setBusy(true);
    try{const r=await call('detail',{sourceId:id,subject});if(seq!==token.current)return;setDetail(r);setBusy(false);const ci=r.channels.findIndex(c=>c.match===entry.episode.channelMatch||c.name===entry.episode.channelName);const ch=r.channels[Math.max(0,ci)],ep=ch.episodes.find(e=>e.id===entry.episode.id)||alternate(ch,entry.episode);if(!ep){notify('上次的剧集已变化，请重新选择');return;}const ix=ch.episodes.indexOf(ep);setChannel(Math.max(0,ci));setPlayer({key:Date.now(),sourceId:id,subject,episode:ep,channels:r.channels,channelIndex:Math.max(0,ci),hasNext:ix<ch.episodes.length-1,startAt:entry.completed?0:entry.position});}catch(e){if(seq===token.current){setError(e.message);setBusy(false);}}
  }
  function renderCards(items,startRow=1,historyItems=null){return <div className={'poster-grid cols-'+settings.gridCols}>{items.map((s,i)=><PosterCard key={(s.bgmId||s.url||s.id)+'-'+i} subject={s} row={startRow+Math.floor(i/settings.gridCols)} col={i%settings.gridCols} progress={historyItems?.[i]} actionLabel={historyItems?historyItems[i].episode.name+' · '+shortTime(historyItems[i].position):undefined} onSelect={()=>historyItems?resume(historyItems[i]):s.url?openSource(s):openTitle(s)}/>)}</div>;}
  const favorites=library.favorites(),history=library.history(),todayItems=calendar.find(d=>d.id===today)?.items||[],dayItems=calendar.find(d=>d.id===day)?.items||[];
  const title={home:'继续喜欢的故事',search:'搜索番剧',calendar:'新番时间表',favorites:'我的收藏',history:'观看历史',settings:'设置',subscriptions:'数据源订阅',danmakuSettings:'弹幕服务',detail:meta?.name||detail?.subject?.name||'番剧详情'}[page];
  useEffect(()=>{window.__fanYuan={get state(){return current.current;},call,library,navigate:go,search:(q,id)=>runSearch(q,id),openTitle,openSource,diagnostics:()=>({version:'0.6.5',page:current.current.page,sourceId:current.current.sourceId,playing:!!current.current.player,results:current.current.results.length})};return()=>delete window.__fanYuan;},[page,sourceId,keyword,detail,meta,channel]);
  return <div id="tv-frame">
    <div className="app-shell" aria-hidden={!!player}>
      <aside className="sidebar" ref={sidebarRef} data-expanded={drawer.current}><div className="sidebar-brand" onClick={()=>go('home',true)}><span className="brand-symbol"><Icon name="tv" size={35}/></span><span className="brand-word">番源<small>你的本地追番空间</small></span></div><nav>{MENU.map((m,i)=><SidebarItem key={m[0]} id={'sidebar-'+m[0]} row={i} label={m[1]} icon={m[2]} active={page===m[0]||(page==='detail'&&lastPage.current===m[0])||((page==='subscriptions'||page==='danmakuSettings')&&m[0]==='settings')} onSelect={()=>go(m[0],true)}/>)}</nav><div className="sidebar-foot"><span className="local-dot"/><span className="sidebar-foot-label">本地收藏 · 无需服务器</span></div></aside>
      <main className="main-content"><header className="page-header"><div><div className="page-eyebrow">FANYUAN / ANIME LIBRARY</div><h1>{title}</h1></div><div className="header-source"><FocusButton id="header-source" row={0} col={20} recoveryPriority={1} className="source-picker" onSelect={chooseSource}><Icon name="remix" size={21}/>{currentSource?.name||'选择视频源'}<span className="chevron-down"/></FocusButton></div></header>
        <div className="content-scroller" ref={scroller}>
          {error&&<div className="error-banner">{error}<FocusButton id="content-0-4" row={0} col={4} recoveryPriority={2} onSelect={chooseSource}>换一个源</FocusButton></div>}
          {page==='home'&&<>
            <div className="home-intro"><p>从上次停下的地方，接着看。</p><FocusButton id="content-0-0" row={0} col={0} className="primary" onSelect={()=>{go('search',true);}}><Icon name="search" size={21}/>搜索番名</FocusButton></div>
            {history.length>0&&<section><h2 className="section-title">继续观看 <span>已在这台电视上保存</span></h2>{renderCards(history.slice(0,settings.gridCols).map(x=>x.subject),1,history.slice(0,settings.gridCols))}</section>}
            <section><h2 className="section-title">今日放送 <span>{DAY[today-1]} · Bangumi</span></h2>{calendarBusy?<Loading/>:calendarError?<div><Empty title="时间表暂未加载">{calendarError}</Empty><FocusButton id="content-calendar-retry" row={history.length?2:1} onSelect={loadCalendar}>重新加载</FocusButton></div>:renderCards(todayItems.slice(0,20),history.length?2:1)}</section>
          </>}
          {page==='search'&&<>
            <form className="search-form" onSubmit={e=>{e.preventDefault();runSearch();}}><FocusSearchInput id="content-0-0" inputRef={inputRef} value={keyword} onChange={e=>setKeyword(e.target.value)} onSubmit={()=>runSearch()}/><FocusButton id="content-0-1" row={0} col={1} className="primary" onSelect={()=>runSearch()}>搜索</FocusButton></form>
            {!results.length&&!busy&&!error&&<><h2 className="section-title">最近搜索</h2><div className="search-history">{(library.searchHistory().length?library.searchHistory():['葬送的芙莉莲','夏目友人帐','间谍过家家','孤独摇滚']).map((q,i)=><FocusButton key={q} id={`content-1-${i}`} row={1} col={i} onSelect={()=>runSearch(q)}>{q}</FocusButton>)}</div><Empty title="找到番剧，再选择播放线路">使用现有视频源规则，在电视端完成搜索和解析。</Empty></>}
            {busy?<Loading text={'正在搜索 '+keyword+'…'}/>:results.length>0&&<><h2 className="section-title">搜索结果 <span>{results.length} 部 · {currentSource?.name}</span></h2>{results.some(x=>x.cover)?renderCards(results):<div className="source-results">{results.map((x,i)=><TextCard key={x.url||x.id} subject={x} row={1+Math.floor(i/3)} col={i%3} onSelect={()=>openSource(x)}/>)}</div>}</>}
          </>}
          {page==='calendar'&&<><div className="day-tabs">{DAY.map((d,i)=><FocusButton key={d} id={`content-0-${i}`} row={0} col={i} className={day===i+1?'active':''} onSelect={()=>{setDay(i+1);scroller.current.scrollTop=0;}}>{d}{today===i+1&&<small>今天</small>}</FocusButton>)}</div>{calendarBusy?<Loading/>:calendarError?<Empty title="时间表暂不可用">{calendarError}</Empty>:renderCards(dayItems)}</>}
          {page==='favorites'&&<><div className="filter-tabs">{[['all','全部'],['wish','想看'],['watching','在看'],['done','看过']].map((x,i)=><FocusButton key={x[0]} id={`content-0-${i}`} row={0} col={i} className={favFilter===x[0]?'active':''} onSelect={()=>setFavFilter(x[0])}>{x[1]}</FocusButton>)}</div>{favorites.length?renderCards(favorites.filter(x=>favFilter==='all'||(x.status||'wish')===favFilter)):<Empty title="收藏喜欢的番剧">打开番剧详情，选择“加入收藏”。数据仅保存在这台电视。</Empty>}</>}
          {page==='history'&&<><div className="section-toolbar"><p>自动保存播放进度，可一键续播。</p>{history.length>0&&<FocusButton id="content-0-0" row={0} col={0} className="quiet" onSelect={()=>setDialog({title:'清空观看历史？',options:[{label:'保留历史',action:()=>setDialog(null)},{label:'清空本地历史与进度',description:'收藏会保留。此操作不能撤销。',action:()=>{library.clearHistory();refresh();setDialog(null);}}]})}>清空历史</FocusButton>}</div>{history.length?renderCards(history.map(x=>x.subject),1,history):<Empty title="从第一集开始">播放过的番剧和进度会自动出现在这里。</Empty>}</>}
          {page==='detail'&&<>
            <section className="subject-hero">{meta?.cover?<img src={coverThumbnail(meta.cover)} className="subject-cover" alt=""/>:<div className="subject-cover blank"><Icon name="tv" size={70}/></div>}<div className="subject-info"><div className="subject-meta">{meta?.score>0&&<strong>★ {Number(meta.score).toFixed(1)}</strong>}<span>{meta?.date}</span>{meta?.episodeCount>0&&<span>全 {meta.episodeCount} 集</span>}</div><h2>{meta?.originalName||title}</h2><p className="subject-summary">{meta?.summary||'选择播放源与剧集。收藏和观看进度会保存在本机。'}</p><div className="subject-tags">{meta?.tags?.slice(0,6).map(t=><span key={t}>{t}</span>)}</div><div className="subject-actions"><FocusButton id="content-0-0" row={0} col={0} className={library.isFavorite(meta||detail?.subject||{})?'active':'primary'} onSelect={toggleFavorite}><Icon name="star" size={21}/>{library.isFavorite(meta||detail?.subject||{})?'已收藏':'加入收藏'}</FocusButton><FocusButton id="content-0-1" row={0} col={1} className="quiet" onSelect={()=>{const s=meta||detail?.subject;if(!s)return;if(!library.isFavorite(s)){library.toggleFavorite(s);}const currentStatus=library.favoriteStatus?.(s)||'wish';library.setFavoriteStatus?.(s,currentStatus==='wish'?'watching':currentStatus==='watching'?'done':'wish');refresh();notify('已更新本地追番状态');}}>{({wish:'想看',watching:'在看',done:'看过'})[library.favoriteStatus?.(meta||detail?.subject||{})||'wish']} · 切换</FocusButton></div></div></section>
            {busy?<Loading text="正在读取线路和剧集…"/>:candidates.length>0?<><h2 className="section-title">选择对应番剧 <span>请核对季度和名称</span></h2><div className="source-results">{candidates.map((s,i)=><TextCard key={s.id} subject={s} row={2+Math.floor(i/3)} col={i%3} onSelect={()=>sourceDetail(s,s.sourceId,meta)}/>)}</div></>:detail&&<><div className="channel-tabs">{detail.channels.map((ch,i)=><FocusButton key={i} id={`content-1-${i}`} row={1} col={i} className={channel===i?'active':''} onSelect={()=>setChannel(i)}>{ch.name}<small>{ch.episodes.length} 集</small></FocusButton>)}</div><div className="episode-grid">{detail.channels[channel].episodes.map((ep,i)=>{const progress=library.progress(detail.subject.sourceId||sourceId,detail.subject,ep);return <FocusButton key={ep.id} id={`content-${2+Math.floor(i/7)}-${i%7}`} row={2+Math.floor(i/7)} col={i%7} className={'episode-button '+(progress?.completed?'watched':'')} onSelect={()=>startPlay(ep)} onLongPress={()=>{library.markComplete(detail.subject.sourceId||sourceId,detail.subject,ep,!progress?.completed);refresh();notify(progress?.completed?'已取消已看标记':'已标记为看过');}}><span>{ep.name}</span>{progress?.completed?<small>✓ 已看</small>:progress?.position>0?<small>{shortTime(progress.position)}</small>:null}</FocusButton>;})}</div><p className="page-tip">OK 播放 / 续播 · 长按 OK 标记已看 · 返回保留浏览位置</p></>}
          </>}
          {page==='danmakuSettings'&&<DanmakuSettings notify={notify}/>}
          {page==='subscriptions'&&<Subscriptions onChanged={refreshSources} notify={notify}/>}
          {page==='settings'&&<><div className="settings-intro"><h2>按你的习惯，舒服地看。</h2><p>设置与追番数据仅保存在本机，不需要登录账号。</p></div><div className="settings-list">{[
            ['默认显示弹幕',settings.danmaku?'开启':'关闭',()=>updateSettings({danmaku:!settings.danmaku})],['自动播放下一集',settings.autoplayNext?'开启':'关闭',()=>updateSettings({autoplayNext:!settings.autoplayNext})],['每行番剧数量',settings.gridCols+' 部',()=>updateSettings({gridCols:settings.gridCols===5?3:settings.gridCols+1})],['弹幕字号',Math.round(settings.danmakuScale*100)+'%',()=>updateSettings({danmakuScale:settings.danmakuScale>=1.4?0.8:Math.round((settings.danmakuScale+0.2)*10)/10})],['弹幕透明度',Math.round(settings.danmakuOpacity*100)+'%',()=>updateSettings({danmakuOpacity:settings.danmakuOpacity>=1?0.55:Math.round((settings.danmakuOpacity+0.15)*100)/100})],['默认视频源',currentSource?.name||'选择',chooseSource],['数据源订阅','在线更新与管理',()=>go('subscriptions',true)],['弹幕服务','服务与匹配',()=>go('danmakuSettings',true)],['版本与来源','番源 0.6.5',()=>setDialog({title:'番源 0.6.5 · 非官方',options:[{label:'BiliTV 界面组件',description:'复用 BiliTV v2.5.1 弹幕、图标和焦点系统，保留 MIT 许可与作者署名。',action:()=>{}},{label:'Animeko 原始源规则',description:'直接订阅原版在线视频源地址，每小时检查更新，保留原始 JSON。解析与播放代理均在电视上执行，不含 BT。',action:()=>{}},{label:'本地追番',description:'番剧资料来自 Bangumi，弹幕优先匹配弹弹play。没有账号同步。',action:()=>{}},{label:'关闭',action:()=>setDialog(null)}]})]
          ].map((x,i)=><FocusButton key={x[0]} id={`content-${i+1}-0`} row={i+1} col={0} className="settings-row" onSelect={x[2]}><span>{x[0]}</span><strong>{x[1]}</strong><span>›</span></FocusButton>)}</div></>}
        </div>
        <footer className="app-footer"><span><kbd>方向键</kbd> 移动　 <kbd>OK</kbd> 选择</span><span><kbd>返回</kbd> 返回侧栏</span></footer>
      </main>
    </div>
    {dialog&&<Dialog title={dialog.title} options={dialog.options} onClose={()=>setDialog(null)}/>}
    {player&&<Player key={player.key} item={player} library={library} settings={settings} onSettings={updateSettings} onClose={closePlayer} onNext={nextEpisode} onEpisode={ep=>startPlay(ep,player.channelIndex,0)} onSwitchChannel={switchPlayingChannel}/>}
    {toast&&<div className="toast">{toast}</div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
