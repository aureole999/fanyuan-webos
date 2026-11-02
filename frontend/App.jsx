import React,{useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import SidebarItem from './SidebarItem';
import ThemeDecorator from '@enact/sandstone/ThemeDecorator';
import Popup from '@enact/sandstone/Popup';
import {initKeyboardNav,onFocusChange,setFocus,getCurrentFocusId,setContentContext,focusFirstContent,focusSidebar,setLastSidebarFocus,isPointerFocus} from './focus';
import {FocusButton,FocusSearchInput,PosterCard,TextCard,Icon,Empty,Loading,FocusContainer,PageFocusContainer,ContentScroller,ScrollGroup} from './components';
import {call} from './api';
import {makeLibrary,cleanName,seriesKey} from './library.cjs';
import Player from './Player';
// Injected from package.json by build.cjs.
const APP_VERSION=__APP_VERSION__;
import Subscriptions from './Subscriptions';
import DanmakuSettings from './DanmakuSettings';
import {coverThumbnail} from '../src/images.cjs';
import {DANMAKU_OPTIONS,matchOptionValue,danmakuOptionLabel,danmakuTypesSummary} from './danmaku.cjs';

const library=makeLibrary(localStorage);
const MENU=[['home','首页','home'],['search','搜索','search'],['calendar','新番时间表','tv'],['favorites','我的收藏','star'],['history','观看历史','history'],['settings','设置','settings']];
const DAY=['周一','周二','周三','周四','周五','周六','周日'];
const today=(new Date().getDay()||7);
function shortTime(seconds){const m=Math.floor((seconds||0)/60);return m?`${m} 分钟`:'刚刚开始';}
function alternate(channel,episode){const sameType=e=>(e.type||'main').toLowerCase();return channel.episodes.find(e=>{const a=Number(e.sort),b=Number(episode.sort);return (Number.isFinite(a)&&Number.isFinite(b)?a===b:e.sort===episode.sort)&&sameType(e)===sameType(episode);});}
function Dialog({value,onClose}){
  const last=useRef(value);if(value)last.current=value;
  const {title='',options=[]}=value||last.current||{};
  const activeIndex=options.findIndex(o=>o.active);
  return <Popup open={!!value} position="center" spotlightId="dialog" className="selection-popup" css={{body:'popup-body'}} onClose={onClose} onShow={()=>setTimeout(()=>setFocus(options.length?'dialog-'+Math.max(0,activeIndex):'dialog-close'),0)}><div className="dialog-heading"><h2>{title}</h2><FocusButton id="dialog-close" className="dialog-close" row={-1} group="dialog" onSelect={onClose} aria-label="关闭弹窗"><Icon name="close" size={24}/></FocusButton></div><ContentScroller className="dialog-options" verticalScrollbar="hidden" style={{height:Math.min(640,Math.max(180,options.length*118))}}><div className="dialog-options-inner">{options.map((o,i)=><FocusButton key={i} id={'dialog-'+i} row={i} group="dialog" className={'dialog-option'+(o.active?' active':'')} label={o.description} slotAfter={o.active?<span className="dialog-option-check"><Icon name="check" size={18}/> 当前</span>:null} onSelect={o.action}>{o.label}</FocusButton>)}</div></ContentScroller></Popup>;
}
function App({className}){
  const [page,setPage]=useState('home'),[sources,setSources]=useState([]),[sourceId,setSourceId]=useState(localStorage.getItem('sourceId')||'source-c');
  const [calendar,setCalendar]=useState([]),[day,setDay]=useState(today),[calendarError,setCalendarError]=useState(''),[calendarBusy,setCalendarBusy]=useState(true);
  const [keyword,setKeyword]=useState(''),[results,setResults]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[detail,setDetail]=useState(null),[meta,setMeta]=useState(null),[candidates,setCandidates]=useState([]),[channel,setChannel]=useState(0),[settings,setSettings]=useState(()=>library.settings()),[revision,setRevision]=useState(0),[dialog,setDialog]=useState(null),[player,setPlayer]=useState(null),[toast,setToast]=useState(''),[favFilter,setFavFilter]=useState('all');
  const drawer=useRef(true),previewTimer=useRef(null);
  const token=useRef(0),toastTimer=useRef(null),inputRef=useRef(null),scroller=useRef(null),lastPage=useRef('home'),lastCard=useRef(null),current=useRef({});
  current.current={page,drawer:drawer.current,sources,sourceId,calendar,results,detail,meta,channel,player,dialog,settings};
  const currentSource=sources.find(s=>s.id===sourceId);
  function menuPage(){const p=current.current.page;return p==='detail'?lastPage.current:(p==='subscriptions'||p==='danmakuSettings')?'settings':p;}
  function setDrawer(value){if(drawer.current===value)return;drawer.current=value;current.current.drawer=value;const el=document.querySelector('.sidebar');if(el)el.dataset.expanded=String(value);}
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
        if(item&&!isPointerFocus()&&menuPage()!==item[0]){
          previewTimer.current=setTimeout(()=>go(item[0]),100);
        }
      }else if(id?.startsWith('content-')||id?.startsWith('header-')){
        setDrawer(false);
      }
    });
    const enter=e=>{const item=MENU.find(m=>'sidebar-'+m[0]===e.detail);if(item){if(menuPage()!==item[0])go(item[0],true);else{setDrawer(false);focusFirstContent();}}};
    const sidebar=()=>{const s=current.current;if(s.player||s.dialog)return;clearTimeout(previewTimer.current);setDrawer(true);setFocus('sidebar-'+menuPage());};
    const back=()=>{const s=current.current;if(s.player)return;if(s.dialog){setDialog(null);return;}if(s.page==='subscriptions'||s.page==='danmakuSettings'){go('settings',true);return;}if(s.page==='detail'){token.current++;setDetail(null);setMeta(null);setCandidates([]);setPage(lastPage.current);setContentContext(lastPage.current);setError('');setBusy(false);setTimeout(()=>lastCard.current?setFocus(lastCard.current):focusFirstContent(),50);}else if(s.drawer){if(s.page==='home'){if(window.webOS?.platformBack)webOS.platformBack();}else go('home',true);}else{setDrawer(true);focusSidebar();}};
    window.addEventListener('tv-enter-content',enter);window.addEventListener('tv-enter-sidebar',sidebar);window.addEventListener('tv-back',back);
    setTimeout(()=>{setDrawer(true);setFocus('sidebar-home');},100);
    return()=>{clearTimeout(previewTimer.current);off();window.removeEventListener('tv-enter-content',enter);window.removeEventListener('tv-enter-sidebar',sidebar);window.removeEventListener('tv-back',back);};
  },[]);

  useEffect(()=>{const scale=()=>{const frame=document.getElementById('tv-frame');if(frame)frame.style.transform=`scale(${Math.min(innerWidth/1920,innerHeight/1080)})`;};scale();window.addEventListener('resize',scale);return()=>window.removeEventListener('resize',scale);},[]);
  function chooseOption(title,currentVal,items,onPick){setDialog({title,options:items.map(it=>({label:it.label,description:it.description,active:matchOptionValue(it.value,currentVal),action:()=>{onPick(it.value);setDialog(null);}}))});}
  function chooseDanmakuTypes(s=current.current.settings){
    const toggle=patch=>{const next=library.setSettings(patch);setSettings(next);chooseDanmakuTypes(next);};
    setDialog({title:'弹幕类型与色彩',options:[
      {label:'滚动弹幕：'+(s.danmakuFloating!==false?'开启':'关闭'),description:'从右向左横跨画面的普通流动弹幕',active:s.danmakuFloating!==false,action:()=>toggle({danmakuFloating:s.danmakuFloating===false})},
      {label:'顶部弹幕：'+(s.danmakuTop!==false?'开启':'关闭'),description:'固定在画面顶部居中的弹幕',active:s.danmakuTop!==false,action:()=>toggle({danmakuTop:s.danmakuTop===false})},
      {label:'底部弹幕：'+(s.danmakuBottom===true?'开启':'关闭'),description:'固定在画面底部居中的弹幕（默认关闭以免遮挡字幕）',active:s.danmakuBottom===true,action:()=>toggle({danmakuBottom:!s.danmakuBottom})},
      {label:'彩色弹幕：'+(s.danmakuColor!==false?'开启':'关闭'),description:'关闭后所有彩色弹幕将统一显示为白色',active:s.danmakuColor!==false,action:()=>toggle({danmakuColor:s.danmakuColor===false})},
      {label:'完成',description:'返回设置列表',action:()=>setDialog(null)}
    ]});
  }
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
  function renderCards(items,startRow=1,historyItems=null,offset=0){return <div className={'poster-grid cols-'+settings.gridCols}>{items.map((s,i)=>{const h=historyItems?.[offset+i];return <PosterCard key={(s.bgmId||s.url||s.id)+'-'+(offset+i)} subject={s} row={startRow+Math.floor(i/settings.gridCols)} col={i%settings.gridCols} progress={h} actionLabel={h?h.episode.name+' · '+shortTime(h.position):undefined} onSelect={()=>h?resume(h):s.url?openSource(s):openTitle(s)}/>;})}</div>;}
  // A heading travels with its first row in one ScrollGroup, so focus scrolling reveals both and
  // never leaves the heading stranded above the viewport.
  function gridSection(heading,items,cols,startRow,grid){const lead=items.slice(0,cols),rest=items.slice(cols);return <section className="grid-section"><ScrollGroup className="section-lead">{heading}{grid(lead,startRow,0)}</ScrollGroup>{rest.length>0&&grid(rest,startRow+1,cols)}</section>;}
  function cardSection(heading,items,startRow=1,historyItems=null){return gridSection(heading,items,settings.gridCols,startRow,(list,row,offset)=>renderCards(list,row,historyItems,offset));}
  function textSection(heading,items,startRow,onPick){return gridSection(heading,items,3,startRow,(list,row,offset)=><div className="source-results">{list.map((x,i)=><TextCard key={(x.url||x.id)+'-'+(offset+i)} subject={x} row={row+Math.floor(i/3)} col={i%3} onSelect={()=>onPick(x)}/>)}</div>);}
  const progressFor=page==='detail'&&detail?library.progressLookup():null;
  const favorites=library.favorites(),history=library.history(),todayItems=calendar.find(d=>d.id===today)?.items||[],dayItems=calendar.find(d=>d.id===day)?.items||[];
  // Page-level notes sit in the fixed header, outside the scroller, so they never need focus to be seen.
  const subtitle={settings:'设置与追番数据仅保存在本机，不需要登录账号。',subscriptions:'订阅直接下载到这台电视，应用运行时每小时检查更新；下载失败会保留缓存，不导入 BT。',danmakuSettings:'自动匹配优先选择弹弹play，其他平台作为备用；播放时可在弹幕设置里调整偏移或手动匹配。'}[page];
  const todayHeading=<h2 className="section-title">今日放送 <span>{DAY[today-1]} · Bangumi</span></h2>,todayRow=history.length?2:1;
  const resultsHeading=<h2 className="section-title">搜索结果 <span>{results.length} 部 · {currentSource?.name}</span></h2>;
  const title={home:'继续喜欢的故事',search:'搜索番剧',calendar:'新番时间表',favorites:'我的收藏',history:'观看历史',settings:'设置',subscriptions:'数据源订阅',danmakuSettings:'弹幕服务',detail:meta?.name||detail?.subject?.name||'番剧详情'}[page];
  useEffect(()=>{window.__fanYuan={get state(){return current.current;},call,library,navigate:go,search:(q,id)=>runSearch(q,id),openTitle,openSource,diagnostics:()=>({version:APP_VERSION,page:current.current.page,sourceId:current.current.sourceId,playing:!!current.current.player,results:current.current.results.length})};return()=>delete window.__fanYuan;},[page,sourceId,keyword,detail,meta,channel]);
  return <div id="tv-frame" className={className}>
    <div className="app-shell" aria-hidden={!!player}>
      <FocusContainer spotlightId="sidebar" spotlightDisabled={!!player||!!dialog} className="sidebar" data-expanded={drawer.current}><div className="sidebar-brand" onClick={()=>go('home',true)}><span className="brand-symbol"><Icon name="tv" size={35}/></span><span className="brand-word">番源<small>你的本地追番空间</small></span></div><nav>{MENU.map((m,i)=><SidebarItem key={m[0]} id={'sidebar-'+m[0]} row={i} label={m[1]} icon={m[2]} active={menuPage()===m[0]} onSelect={()=>go(m[0],true)}/>)}</nav></FocusContainer>
      <PageFocusContainer spotlightId="content" spotlightDisabled={!!player||!!dialog} className="main-content"><header className="page-header"><div><div className="page-eyebrow">FANYUAN / ANIME LIBRARY</div><h1>{title}</h1>{subtitle&&<p className="page-subtitle">{subtitle}</p>}</div><div className="header-source">{page!=='search'&&<FocusButton id="header-search" row={0} col={18} recoveryPriority={1} className="header-search primary" onSelect={()=>go('search',true)} aria-label="搜索番剧"><Icon name="search" size={24}/></FocusButton>}{page==='history'&&<FocusButton id="header-clear-history" row={0} col={19} recoveryPriority={1} className="source-picker" onSelect={()=>{if(!history.length){notify('暂无观看历史');return;}setDialog({title:'清空观看历史？',options:[{label:'保留历史',action:()=>setDialog(null)},{label:'清空本地历史与进度',description:'收藏会保留。此操作不能撤销。',action:()=>{library.clearHistory();refresh();setDialog(null);}}]});}}>清空历史</FocusButton>}<FocusButton id="header-source" row={0} col={20} recoveryPriority={1} className="source-picker" onSelect={chooseSource}><Icon name="remix" size={21}/>{currentSource?.name||'选择视频源'}<span className="chevron-down"/></FocusButton></div></header>
        <ContentScroller apiRef={scroller}>
          <div key={page+(page==='detail'?':'+(meta?.bgmId||meta?.name||''):'')} className="page-stage">
          {error&&<div className="error-banner"><span>{error}</span><FocusButton id="content-0-4" row={0} col={4} recoveryPriority={2} onSelect={chooseSource}>换一个源</FocusButton></div>}
          {page==='home'&&<>
            {history.length>0&&cardSection(<h2 className="section-title">继续观看 <span>已在这台电视上保存</span></h2>,history.slice(0,settings.gridCols).map(x=>x.subject),1,history.slice(0,settings.gridCols))}
            {calendarBusy||calendarError?<section className="grid-section"><ScrollGroup className="section-lead">{todayHeading}{calendarBusy?<Loading/>:<><Empty title="时间表暂未加载">{calendarError}</Empty><FocusButton id="content-calendar-retry" row={todayRow} onSelect={loadCalendar}>重新加载</FocusButton></>}</ScrollGroup></section>:cardSection(todayHeading,todayItems.slice(0,20),todayRow)}
          </>}
          {page==='search'&&<>
            <form className="search-form" onSubmit={e=>e.preventDefault()}><FocusSearchInput id="content-0-0" inputRef={inputRef} value={keyword} onChange={e=>setKeyword(e.target.value)} onSubmit={()=>runSearch()}/><FocusButton id="content-0-1" row={0} col={1} className="primary" onSelect={()=>runSearch()}>搜索</FocusButton></form>
            {!results.length&&!busy&&!error&&<ScrollGroup className="section-lead"><h2 className="section-title">最近搜索</h2><div className="search-history">{(library.searchHistory().length?library.searchHistory():['葬送的芙莉莲','夏目友人帐','间谍过家家','孤独摇滚']).map((q,i)=><FocusButton key={q} id={`content-1-${i}`} row={1} col={i} onSelect={()=>runSearch(q)}>{q}</FocusButton>)}</div><Empty title="找到番剧，再选择播放线路">使用现有视频源规则，在电视端完成搜索和解析。</Empty></ScrollGroup>}
            {busy?<Loading text={'正在搜索 '+keyword+'…'}/>:results.length>0&&(results.some(x=>x.cover)?cardSection(resultsHeading,results,1):textSection(resultsHeading,results,1,openSource))}
          </>}
          {page==='calendar'&&<><div className="day-tabs">{DAY.map((d,i)=><FocusButton key={d} id={`content-0-${i}`} row={0} col={i} className={day===i+1?'active':''} onSelect={()=>{setDay(i+1);scroller.current.scrollTop=0;}}>{d}{today===i+1&&<small>今天</small>}</FocusButton>)}</div><div key={day} className="tab-stage">{calendarBusy?<Loading/>:calendarError?<Empty title="时间表暂不可用">{calendarError}</Empty>:renderCards(dayItems)}</div></>}
          {page==='favorites'&&<><div className="filter-tabs">{[['all','全部'],['wish','想看'],['watching','在看'],['done','看过']].map((x,i)=><FocusButton key={x[0]} id={`content-0-${i}`} row={0} col={i} className={favFilter===x[0]?'active':''} onSelect={()=>setFavFilter(x[0])}>{x[1]}</FocusButton>)}</div><div key={favFilter} className="tab-stage">{favorites.length?renderCards(favorites.filter(x=>favFilter==='all'||(x.status||'wish')===favFilter)):<Empty title="收藏喜欢的番剧">打开番剧详情，选择“加入收藏”。数据仅保存在这台电视。</Empty>}</div></>}
          {page==='history'&&(history.length?renderCards(history.map(x=>x.subject),1,history):<Empty title="从第一集开始">播放过的番剧和进度会自动出现在这里。</Empty>)}
          {page==='detail'&&<>
            <ScrollGroup className="subject-hero">{meta?.cover?<img src={coverThumbnail(meta.cover)} className="subject-cover" alt=""/>:<div className="subject-cover blank"><Icon name="tv" size={70}/></div>}<div className="subject-info"><div className="subject-meta">{meta?.score>0&&<strong>★ {Number(meta.score).toFixed(1)}</strong>}{meta?.date&&<span>{meta.date}</span>}{meta?.episodeCount>0&&<span>全 {meta.episodeCount} 集</span>}</div><h2>{meta?.originalName||title}</h2><p className="subject-summary">{meta?.summary||'选择播放源与剧集。收藏和观看进度会保存在本机。'}</p>{meta?.tags?.length>0&&<div className="subject-tags">{meta.tags.slice(0,6).map(t=><span key={t}>{t}</span>)}</div>}<div className="subject-actions"><FocusButton id="content-0-0" row={0} col={0} className={library.isFavorite(meta||detail?.subject||{})?'active':'primary'} onSelect={toggleFavorite}><Icon name="star" size={21}/>{library.isFavorite(meta||detail?.subject||{})?'已收藏':'加入收藏'}</FocusButton><FocusButton id="content-0-1" row={0} col={1} className="quiet" onSelect={()=>{const s=meta||detail?.subject;if(!s)return;chooseOption('设置追番状态',library.favoriteStatus?.(s)||'wish',[{value:'wish',label:'想看',description:'加入想看列表，方便日后查找'},{value:'watching',label:'在看',description:'正在追更或观看中的番剧'},{value:'done',label:'看过',description:'已经看完的番剧'}],nextStatus=>{if(!library.isFavorite(s))library.toggleFavorite(s);library.setFavoriteStatus?.(s,nextStatus);refresh();notify('已更新本地追番状态');});}}>状态：{({wish:'想看',watching:'在看',done:'看过'})[library.favoriteStatus?.(meta||detail?.subject||{})||'wish']}</FocusButton></div></div></ScrollGroup>
            {busy?<Loading text="正在读取线路和剧集…"/>:candidates.length>0?textSection(<h2 className="section-title">选择对应番剧 <span>请核对季度和名称</span></h2>,candidates,2,s=>sourceDetail(s,s.sourceId,meta)):detail&&<><div className="channel-tabs">{detail.channels.map((ch,i)=><FocusButton key={i} id={`content-1-${i}`} row={1} col={i} className={channel===i?'active':''} onSelect={()=>setChannel(i)}>{ch.name}<small>{ch.episodes.length} 集</small></FocusButton>)}</div><div key={channel} className="episode-grid tab-stage">{detail.channels[channel].episodes.map((ep,i)=>{const progress=progressFor(detail.subject.sourceId||sourceId,detail.subject,ep);return <FocusButton key={ep.id} id={`content-${2+Math.floor(i/7)}-${i%7}`} row={2+Math.floor(i/7)} col={i%7} className={'episode-button '+(progress?.completed?'watched':'')} onSelect={()=>startPlay(ep)} onLongPress={()=>{library.markComplete(detail.subject.sourceId||sourceId,detail.subject,ep,!progress?.completed);refresh();notify(progress?.completed?'已取消已看标记':'已标记为看过');}}><span>{ep.name}</span>{progress?.completed?<small>✓ 已看</small>:progress?.position>0?<small>{shortTime(progress.position)}</small>:null}</FocusButton>;})}</div></>}
          </>}
          {page==='danmakuSettings'&&<DanmakuSettings notify={notify}/>}
          {page==='subscriptions'&&<Subscriptions onChanged={refreshSources} notify={notify} chooseOption={chooseOption}/>}
          {page==='settings'&&<><div className="settings-list">{[
            ['默认显示弹幕',settings.danmaku?'开启':'关闭',()=>chooseOption('默认显示弹幕',!!settings.danmaku,[{value:true,label:'开启',description:'进入播放时默认开启弹幕显示'},{value:false,label:'关闭',description:'进入播放时默认隐藏弹幕，可在播放控制栏随时开启'}],v=>updateSettings({danmaku:v}))],
            ['弹幕显示区域',danmakuOptionLabel('area',settings.danmakuArea,'上方 1/3'),()=>chooseOption('弹幕显示区域',settings.danmakuArea,DANMAKU_OPTIONS.area,v=>updateSettings({danmakuArea:v}))],
            ['弹幕行间距',danmakuOptionLabel('lineGap',settings.danmakuLineGap,'标准 10px'),()=>chooseOption('弹幕行间距',settings.danmakuLineGap,DANMAKU_OPTIONS.lineGap,v=>updateSettings({danmakuLineGap:v}))],
            ['弹幕同屏密度',danmakuOptionLabel('density',settings.danmakuDensity,'适中'),()=>chooseOption('弹幕同屏密度',settings.danmakuDensity,DANMAKU_OPTIONS.density,v=>updateSettings({danmakuDensity:v}))],
            ['弹幕滚动速度',danmakuOptionLabel('speed',settings.danmakuSpeed,'100% 标准'),()=>chooseOption('弹幕滚动速度',settings.danmakuSpeed,DANMAKU_OPTIONS.speed,v=>updateSettings({danmakuSpeed:v}))],
            ['弹幕字号',Math.round(settings.danmakuScale*100)+'%',()=>chooseOption('弹幕字号',settings.danmakuScale,DANMAKU_OPTIONS.scale,v=>updateSettings({danmakuScale:v}))],
            ['弹幕不透明度',Math.round(settings.danmakuOpacity*100)+'%',()=>chooseOption('弹幕不透明度',settings.danmakuOpacity,DANMAKU_OPTIONS.opacity,v=>updateSettings({danmakuOpacity:v}))],
            ['弹幕字体粗细',danmakuOptionLabel('weight',settings.danmakuWeight,'半粗 600'),()=>chooseOption('弹幕字体粗细',settings.danmakuWeight,DANMAKU_OPTIONS.weight,v=>updateSettings({danmakuWeight:v}))],
            ['弹幕描边粗细',danmakuOptionLabel('stroke',settings.danmakuStroke,'标准 100%'),()=>chooseOption('弹幕描边粗细',settings.danmakuStroke,DANMAKU_OPTIONS.stroke,v=>updateSettings({danmakuStroke:v}))],
            ['弹幕类型与色彩',danmakuTypesSummary(settings),()=>chooseDanmakuTypes(settings)],
            ['自动播放下一集',settings.autoplayNext?'开启':'关闭',()=>chooseOption('自动播放下一集',!!settings.autoplayNext,[{value:true,label:'开启',description:'本集播放结束后倒计时 5 秒自动连播下一集'},{value:false,label:'关闭',description:'本集播放结束后停留在当前剧集'}],v=>updateSettings({autoplayNext:v}))],
            ['每行番剧数量',settings.gridCols+' 部',()=>chooseOption('每行番剧数量',settings.gridCols,[{value:3,label:'3 部 / 行',description:'大尺寸海报卡片，适合较远观看距离'},{value:4,label:'4 部 / 行',description:'标准海报卡片尺寸（默认）'},{value:5,label:'5 部 / 行',description:'紧凑网格布局，单屏展示更多番剧'}],v=>updateSettings({gridCols:v}))],
            ['默认视频源',currentSource?.name||'选择',chooseSource],['数据源订阅','在线更新与管理',()=>go('subscriptions',true)],['弹幕服务','服务与匹配',()=>go('danmakuSettings',true)],['版本与来源','番源 '+APP_VERSION,()=>setDialog({title:'番源 '+APP_VERSION+' · 非官方',options:[{label:'LG Enact / Sandstone',description:'官方按钮、海报、输入框、弹窗、滚动和焦点管理；滚动弹幕渲染保留 BiliTV 的 MIT 许可与作者署名。',action:()=>{}},{label:'Animeko 原始源规则',description:'直接订阅原版在线视频源地址，每小时检查更新，保留原始 JSON。解析与播放代理均在电视上执行，不含 BT。',action:()=>{}},{label:'本地追番',description:'番剧资料来自 Bangumi，弹幕优先匹配弹弹play。没有账号同步。',action:()=>{}},{label:'关闭',action:()=>setDialog(null)}]})]
          ].map((x,i)=><FocusButton key={x[0]} id={`content-${i+1}-0`} row={i+1} col={0} className="settings-row" label={x[1]} slotAfter={<Icon name="arrow"/>} onSelect={x[2]}>{x[0]}</FocusButton>)}</div></>}
          </div>
        </ContentScroller>
        <footer className="app-footer">{page==='detail'?<span><kbd>OK</kbd> 播放 / 续播　 <kbd>长按 OK</kbd> 标记已看</span>:<span><kbd>方向键</kbd> 移动　 <kbd>OK</kbd> 选择</span>}<span><kbd>返回</kbd> {page==='detail'?'回到上一页，保留浏览位置':page==='subscriptions'||page==='danmakuSettings'?'回到设置':'返回侧栏'}</span></footer>
      </PageFocusContainer>
    </div>
    <Dialog value={dialog} onClose={()=>setDialog(null)}/>
    {player&&<Player key={player.key} item={player} library={library} settings={settings} onSettings={updateSettings} onClose={closePlayer} onNext={nextEpisode} onEpisode={ep=>startPlay(ep,player.channelIndex,0)} onSwitchChannel={switchPlayingChannel}/>}
    {toast&&<div className="toast">{toast}</div>}
  </div>;
}
const ThemedApp=ThemeDecorator({ri:false},App);
createRoot(document.getElementById('root')).render(<ThemedApp locale="zh-Hans-CN"/>);
