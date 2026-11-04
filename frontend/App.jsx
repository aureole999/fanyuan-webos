import React,{useState,useEffect,useRef,useMemo,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import SidebarItem from './SidebarItem';
import {dailyPick,dayKey} from './discover.cjs';
import ThemeDecorator from '@enact/sandstone/ThemeDecorator';
import Popup from '@enact/sandstone/Popup';
import Spinner from '@enact/sandstone/Spinner';
import {createSourceProbeSession} from './source-probes.cjs';
import {sourcePlayback} from './detail-episodes.cjs';
import {initKeyboardNav,onFocusChange,setFocus,getCurrentFocusId,setContentContext,focusFirstContent,focusSidebar,setLastSidebarFocus,isPointerFocus,resetContentMemory} from './focus';
import {FocusButton,FocusSearchInput,PosterCard,TextCard,Icon,Empty,Loading,FocusContainer,PageFocusContainer,ContentScroller,ScrollGroup,SettingsRow,LiteButton} from './components';
import {call} from './api';
import {makeLibrary,cleanName,seriesKey,playbackTarget} from './library.cjs';
import Player from './Player';
// Injected from package.json by build.cjs.
const APP_VERSION=__APP_VERSION__;
import Subscriptions from './Subscriptions';
import DanmakuSettings from './DanmakuSettings';
import {coverThumbnail} from '../src/images.cjs';
import {DANMAKU_OPTIONS,DANMAKU_FIELDS,DANMAKU_GROUPS,DANMAKU_TYPES,danmakuTypePatch,danmakuFieldValue,matchOptionValue} from './danmaku.cjs';
// Pages reached from 设置; their menu item and back target is settings.
const SETTINGS_PAGES=['subscriptions','danmakuSettings','danmakuStyle'];

const library=makeLibrary(localStorage);
// The saved theme applies before the first render, so a non-default theme never flashes the default.
document.documentElement.dataset.theme=library.settings().themeColor||'sakura';
const MENU=[['home','首页','home'],['history','观看历史','history'],['calendar','新番时间表','tv'],['favorites','我的收藏','star'],['search','搜索','search'],['settings','设置','settings']];
const DAY=['周一','周二','周三','周四','周五','周六','周日'];
const today=(new Date().getDay()||7);
function shortTime(seconds){const m=Math.floor((seconds||0)/60);return m?`${m} 分钟`:'刚刚开始';}
function alternate(channel,episode){const sameType=e=>(e.type||'main').toLowerCase();return channel.episodes.find(e=>{if(e.unavailable)return false;const a=Number(e.sort),b=Number(episode.sort);return (Number.isFinite(a)&&Number.isFinite(b)?a===b:e.sort===episode.sort)&&sameType(e)===sameType(episode);});}
const SourceProbeBadge=React.memo(function SourceProbeBadge({session,id}){
  const value=useSyncExternalStore(fn=>session.subscribe(id,fn),()=>session.get(id));
  const text=value?.status==='done'?`匹配 ${value.matchCount||0} · 候选 ${value.candidateCount||0}`:value?.status==='error'?'查询失败':value?.status==='loading'?'搜索中…':'等待搜索…';
  return <span className="source-probe-count" data-probe-source={id} data-probe-status={value?.status}>{text}</span>;
});
function Dialog({value,onClose}){
  const last=useRef(value);if(value)last.current=value;
  const {title='',options=[]}=value||last.current||{};
  useEffect(()=>{const session=value?.probeSession;session?.start();return()=>session?.cancel();},[value?.probeSession]);
  const activeIndex=options.findIndex(o=>o.active);
  // Size the scroller to the options it holds (up to 640px), so a short list never scrolls on focus.
  // The popup mounts its body later than this component, so measure when the list element attaches.
  const [fit,setFit]=useState(null),measure=el=>{if(el&&el.offsetHeight&&el.offsetHeight!==fit)setFit(el.offsetHeight);};
  return <Popup open={!!value} position="center" spotlightId="dialog" className="selection-popup" css={{body:'popup-body'}} onClose={onClose} onHide={()=>setTimeout(()=>last.current?.onHide?.(),0)} onShow={()=>setTimeout(()=>setFocus(options.length?'dialog-'+Math.max(0,activeIndex):'dialog-close'),0)}><div className="dialog-heading"><h2>{title}</h2><FocusButton id="dialog-close" className="dialog-close" row={-1} group="dialog" onSelect={onClose} aria-label="关闭弹窗"><Icon name="close" size={24}/></FocusButton></div><ContentScroller className="dialog-options" verticalScrollbar="hidden" style={{height:Math.min(640,fit||Math.max(180,options.length*118))}}><div ref={measure} className="dialog-options-inner">{options.map((o,i)=><FocusButton key={i} id={'dialog-'+i} row={i} group="dialog" className={'dialog-option'+(o.active?' active':'')} label={o.description} slotAfter={o.probeSession||o.active?<span className="dialog-option-meta">{o.probeSession&&<SourceProbeBadge session={o.probeSession} id={o.sourceId}/>} {o.active&&<span className="dialog-option-check"><Icon name="check" size={18}/> 当前</span>}</span>:null} onSelect={o.action}>{o.swatch&&<span className="dialog-swatch" style={{background:o.swatch}} aria-hidden="true"/>}{o.label}</FocusButton>)}</div></ContentScroller></Popup>;
}
// Moving through the sidebar previews a page only after the remote rests on it; passing over an
// item must not render that page (a page switch costs 300–500 ms of main thread on the C1).
// 设置 → 界面 → 主题色. Colours are defined in style.css (:root[data-theme]); swatch is the accent.
const THEMES=[
  {value:'sakura',label:'樱粉',description:'默认',swatch:'rgb(230, 132, 168)'},
  {value:'coral',label:'珊瑚',description:'暖橘红',swatch:'rgb(228, 141, 124)'},
  {value:'amber',label:'琥珀',description:'暖金黄',swatch:'rgb(223, 173, 98)'},
  {value:'matcha',label:'抹茶',description:'柔和黄绿',swatch:'rgb(156, 195, 121)'},
  {value:'mint',label:'薄荷',description:'清爽青绿',swatch:'rgb(110, 196, 170)'},
  {value:'sky',label:'天蓝',description:'明亮蓝色',swatch:'rgb(119, 181, 223)'},
  {value:'lavender',label:'薰衣草',description:'淡紫色',swatch:'rgb(180, 156, 222)'},
  {value:'silver',label:'银灰',description:'低调中性',swatch:'rgb(179, 186, 198)'},
];
const PREVIEW_DELAY=300;
// Shell parts re-render only when their own props change. Before, every page switch rebuilt all
// Sandstone controls in the sidebar and header too. Handlers come from a stable `actions` object.
const Sidebar=React.memo(function Sidebar({active,disabled,expanded,actions}){
  const select=useMemo(()=>Object.fromEntries(MENU.map(m=>[m[0],()=>actions.go(m[0],true)])),[actions]);
  return <FocusContainer spotlightId="sidebar" spotlightDisabled={disabled} className="sidebar" data-expanded={expanded}><div className="sidebar-brand" onClick={select.home}><span className="brand-symbol"><Icon name="tv" size={35}/></span><span className="brand-word">番源<small>你的本地追番空间</small></span></div><nav>{MENU.map((m,i)=><SidebarItem key={m[0]} id={'sidebar-'+m[0]} row={i} label={m[1]} icon={m[2]} active={active===m[0]} onSelect={select[m[0]]}/>)}</nav></FocusContainer>;
});
const PageHeader=React.memo(function PageHeader({title,subtitle,page,sourceName,actions}){
  return <header className="page-header"><div><div className="page-eyebrow">FANYUAN / ANIME LIBRARY</div><h1>{title}</h1>{subtitle&&<p className="page-subtitle">{subtitle}</p>}</div><div className="header-source">{page!=='search'&&<FocusButton id="header-search" row={0} col={18} recoveryPriority={1} className="header-search primary" onSelect={actions.search} aria-label="搜索番剧"><Icon name="search" size={24}/></FocusButton>}{page==='history'&&<FocusButton id="header-clear-history" row={0} col={19} recoveryPriority={1} className="source-picker" onSelect={actions.clearHistory}>清空历史</FocusButton>}<FocusButton id="header-source" row={0} col={20} recoveryPriority={1} className="source-picker" onSelect={actions.chooseSource}><Icon name="remix" size={21}/>{sourceName||'选择视频源'}<span className="chevron-down"/></FocusButton></div></header>;
});
const PageFooter=React.memo(function PageFooter({page}){
  return <footer className="app-footer">{page==='detail'?<span><kbd>OK</kbd> 播放 / 续播　 <kbd>长按 OK</kbd> 标记已看</span>:<span><kbd>方向键</kbd> 移动　 <kbd>OK</kbd> 选择</span>}<span><kbd>返回</kbd> {page==='detail'?'回到上一页，保留浏览位置':SETTINGS_PAGES.includes(page)?'回到设置':'返回侧栏'}</span></footer>;
});
function App({className}){
  const [page,setPage]=useState('home'),[sources,setSources]=useState([]),[sourceId,setSourceId]=useState(localStorage.getItem('sourceId')||'');
  const [popular,setPopular]=useState([]),[classics,setClassics]=useState([]),[discoverShown,setDiscoverShown]=useState(false);
  // The discovery rows start below the fold: mount them after home has painted, so switching to home
  // (or previewing it from the sidebar) costs what it did before they existed.
  useEffect(()=>{if(page!=='home'){setDiscoverShown(false);return;}let t;const f=requestAnimationFrame(()=>{t=setTimeout(()=>setDiscoverShown(true),0);});return()=>{cancelAnimationFrame(f);clearTimeout(t);};},[page]);
  const [calendar,setCalendar]=useState([]),[day,setDay]=useState(today),[calendarError,setCalendarError]=useState(''),[calendarBusy,setCalendarBusy]=useState(true);
  const [keyword,setKeyword]=useState(''),[results,setResults]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[detail,setDetail]=useState(null),[meta,setMeta]=useState(null),[candidates,setCandidates]=useState([]),[channel,setChannel]=useState(0),[settings,setSettings]=useState(()=>library.settings()),[revision,setRevision]=useState(0),[dialog,setDialog]=useState(null),[player,setPlayer]=useState(null),[toast,setToast]=useState(''),[favFilter,setFavFilter]=useState('all');
  const [detailSourceId,setDetailSourceId]=useState(null),[playPending,setPlayPending]=useState(false),[showUnmatched,setShowUnmatched]=useState(false);
  useEffect(()=>setShowUnmatched(false),[detail,channel]);
  useEffect(()=>{document.documentElement.dataset.theme=settings.themeColor||'sakura';},[settings.themeColor]);
  const pendingPlay=useRef(null);
  const [related,setRelated]=useState([]),relatedId=page==='detail'?meta?.bgmId||0:0;
  useEffect(()=>{setRelated([]);if(!relatedId)return;let live=true;call('bangumiRelated',{id:relatedId}).then(r=>{if(live)setRelated(r.items||[]);}).catch(()=>{});return()=>{live=false;};},[relatedId]);
  const drawer=useRef(true),previewTimer=useRef(null);
  const token=useRef(0),toastTimer=useRef(null),inputRef=useRef(null),scroller=useRef(null),lastPage=useRef('home'),lastCard=useRef(null),current=useRef({});
  current.current={page,drawer:drawer.current,sources,sourceId,detailSourceId,calendar,results,detail,meta,channel,player,dialog,settings,error,busy};
  const currentSource=sources.find(s=>s.id===sourceId);
  function menuPage(){const p=current.current.page;return p==='detail'?lastPage.current:SETTINGS_PAGES.includes(p)?'settings':p;}
  function setDrawer(value){if(drawer.current===value)return;drawer.current=value;current.current.drawer=value;const el=document.querySelector('.sidebar');if(el)el.dataset.expanded=String(value);}
  function notify(text){setToast(text);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),3200);}
  function refresh(){setRevision(n=>n+1);}
  function updateSettings(patch){setSettings(library.setSettings(patch));}
  function go(next,enter=false){clearTimeout(previewTimer.current);if(next===current.current.page){setDrawer(!enter);if(enter)focusFirstContent();return;}cancelPlayRequest();token.current++;setContentContext(next);setPage(next);setDrawer(!enter);setDetail(null);setMeta(null);setCandidates([]);setError('');setBusy(false);if(scroller.current)scroller.current.scrollTop=0;if(enter)focusFirstContent();}
  async function refreshSources(){const r=await call('sources');setSources(r.sources);const selected=current.current.sourceId;if(r.sources.length&&!r.sources.some(s=>s.id===selected)){setSourceId(r.sources[0].id);localStorage.setItem('sourceId',r.sources[0].id);}return r;}
  // Home discovery rows; a failure just leaves a row out.
  function loadDiscover(){call('bangumiPopular').then(r=>setPopular(r.items||[])).catch(()=>{});call('bangumiClassics').then(r=>setClassics(r.items||[])).catch(()=>{});}
  async function loadCalendar(){setCalendarBusy(true);setCalendarError('');try{const r=await call('calendar');setCalendar(r.days);}catch(e){setCalendarError(e.message);}finally{setCalendarBusy(false);}}
  useEffect(()=>{
    initKeyboardNav();
    refreshSources().then(()=>call('subscriptionsUpdate',{force:false})).then(refreshSources).catch(e=>notify(e.message));loadCalendar();loadDiscover();
    const off=onFocusChange(id=>{
      clearTimeout(previewTimer.current);
      if(id?.startsWith('sidebar-')){
        setDrawer(true);setLastSidebarFocus(id);
        const item=MENU.find(m=>'sidebar-'+m[0]===id);
        if(item&&!isPointerFocus()&&menuPage()!==item[0]){
          previewTimer.current=setTimeout(()=>go(item[0]),PREVIEW_DELAY);
        }
      }else if(id?.startsWith('content-')||id?.startsWith('header-')){
        setDrawer(false);
      }
    });
    const enter=e=>{const item=MENU.find(m=>'sidebar-'+m[0]===e.detail);if(item){if(menuPage()!==item[0])go(item[0],true);else{setDrawer(false);focusFirstContent();}}};
    const sidebar=()=>{const s=current.current;if(s.player||s.dialog)return;clearTimeout(previewTimer.current);setDrawer(true);setFocus('sidebar-'+menuPage());};
    const back=()=>{const s=current.current;if(s.player)return;if(s.dialog){setDialog(null);return;}if(SETTINGS_PAGES.includes(s.page)){go('settings',true);return;}if(s.page==='detail'){cancelPlayRequest();token.current++;setDetail(null);setMeta(null);setCandidates([]);setPage(lastPage.current);setContentContext(lastPage.current);setError('');setBusy(false);setTimeout(()=>lastCard.current?setFocus(lastCard.current):focusFirstContent(),50);}else if(s.drawer){if(s.page==='home'){if(window.webOS?.platformBack)webOS.platformBack();}else go('home',true);}else{setDrawer(true);focusSidebar();}};
    window.addEventListener('tv-enter-content',enter);window.addEventListener('tv-enter-sidebar',sidebar);window.addEventListener('tv-back',back);
    setTimeout(()=>{setDrawer(true);setFocus('sidebar-home');},100);
    return()=>{clearTimeout(previewTimer.current);off();window.removeEventListener('tv-enter-content',enter);window.removeEventListener('tv-enter-sidebar',sidebar);window.removeEventListener('tv-back',back);};
  },[]);

  useEffect(()=>{const scale=()=>{const frame=document.getElementById('tv-frame');if(frame)frame.style.transform=`scale(${Math.min(innerWidth/1920,innerHeight/1080)})`;};scale();window.addEventListener('resize',scale);return()=>window.removeEventListener('resize',scale);},[]);
  function chooseOption(title,currentVal,items,onPick){setDialog({title,options:items.map(it=>({label:it.label,description:it.description,swatch:it.swatch,active:matchOptionValue(it.value,currentVal),action:()=>{onPick(it.value);setDialog(null);}}))});}
  function chooseDanmakuTypes(s=current.current.settings){
    const toggle=patch=>{const next=library.setSettings(patch);setSettings(next);chooseDanmakuTypes(next);};
    setDialog({title:'弹幕类型与色彩',options:DANMAKU_TYPES.map(t=>({label:t.label+'：'+(t.on(s)?'开启':'关闭'),description:t.description,active:t.on(s),action:()=>toggle(danmakuTypePatch(t,s))})).concat({label:'完成',description:'返回弹幕样式',action:()=>setDialog(null)})});
  }
  function chooseDanmakuField(field){const f=DANMAKU_FIELDS[field];if(field==='types')chooseDanmakuTypes();else chooseOption(f.label,current.current.settings[f.key],DANMAKU_OPTIONS[field],v=>updateSettings({[f.key]:v}));}
  async function chooseSource(){
    const origin=getCurrentFocusId(),context=current.current,subject=context.meta||context.detail?.subject,inDetail=context.page==='detail';let picked=false;let available;
    try{available=(await refreshSources()).sources;}catch(e){notify(e.message);return;}
    if(current.current.page!==context.page||current.current.meta!==context.meta)return;
    const probeSession=inDetail?createSourceProbeSession(available,id=>call('sourceProbe',{sourceId:id,subject}),2):null;
    setFocus('header-source');setDialog({probeSession,title:inDetail?'这部番的视频源（番剧条目数）':'默认视频源',onHide:()=>{if(picked&&current.current.page==='detail'){if(!setFocus('content-2-0'))setFocus('content-0-0');}else if(!setFocus(origin))setFocus('header-source');},options:available.map(s=>({probeSession,sourceId:s.id,label:s.name,description:undefined,active:s.id===(inDetail?context.detailSourceId:context.sourceId),action:()=>{
      if(inDetail&&s.id===context.detailSourceId){chooseSourcePage(subject,s.id,origin);return;}
      picked=true;setDialog(null);
      if(inDetail){library.setSourceFor(subject,s.id);library.setVideoMapping(subject,s.id,null);loadTitleSource(subject,s.id);}
      else{setSourceId(s.id);localStorage.setItem('sourceId',s.id);if(context.page==='search'&&keyword.trim())runSearch(keyword,s.id);}
    }}))});
  }
  async function chooseSourcePage(subject=current.current.meta||current.current.detail?.subject,id=current.current.detailSourceId,origin=getCurrentFocusId()){
    if(!subject||!id)return;cancelPlayRequest();
    const request={},context=current.current,restore=()=>{if(current.current.page==='detail'&&!current.current.dialog){if(!setFocus(origin))setFocus('header-source');}};
    setFocus('header-source');setDialog({manualRequest:request,title:'选择对应番剧 · 搜索中…',onHide:restore,options:[]});
    try{
      const r=await call('matchSource',{sourceId:id,subject,manual:true});
      if(current.current.page!==context.page||current.current.meta!==context.meta||current.current.dialog?.manualRequest!==request)return;
      const items=r.items||[];
      setDialog({manualRequest:request,title:items.length?'选择对应番剧':'这个源没有找到相关番剧',onHide:restore,options:items.map(s=>({label:s.name,description:s.matchKind==='own'?'匹配':'候选',active:s.url===current.current.detail?.subject?.url,action:()=>{setDialog(null);sourceDetail(s,id,subject,true);}}))});
    }catch(e){if(current.current.dialog?.manualRequest===request){setDialog(null);notify(e.message);}}
  }
  async function runSearch(q=keyword,id=sourceId){
    q=q.trim();if(!q)return;cancelPlayRequest();const seq=++token.current;library.addSearch(q);setKeyword(q);setBusy(true);setError('');setPage('search');setContentContext('search');setDrawer(false);setDetail(null);setMeta(null);setCandidates([]);setResults([]);
    try{
      const r=await call('search',{sourceId:id,keyword:q});if(seq!==token.current)return;setResults(r.items);setBusy(false);setTimeout(()=>setFocus('content-1-0'),50);
      call('bangumiSearch',{keyword:q}).then(data=>{if(seq!==token.current)return;setResults(items=>items.map(x=>{const matches=data.items.filter(m=>cleanName(m.name)===cleanName(x.name)||cleanName(m.originalName)===cleanName(x.name));return matches.length===1?{...x,...{bgmId:matches[0].bgmId,cover:matches[0].cover,score:matches[0].score,date:matches[0].date,originalName:matches[0].originalName}}:x;}));}).catch(()=>{});
    }catch(e){if(seq===token.current){setError(e.message);setBusy(false);}}
  }
  useEffect(()=>{if(error&&!busy&&!player&&!dialog){setFocus(page==='detail'?'content-2-0':'content-0-4');}},[page,error,busy,player,dialog]);
  function enterDetailBase(subject){cancelPlayRequest();token.current++;if(page!=='detail'){lastPage.current=page;lastCard.current=getCurrentFocusId();}setPage('detail');setContentContext('detail:'+seriesKey(subject));resetContentMemory();setDrawer(false);setError('');setDetail(null);setCandidates([]);setChannel(0);setMeta(subject);focusFirstContent();if(scroller.current)scroller.current.scrollTop=0;}
  async function sourceDetail(subject,id=sourceId,metadata=null,confirmedPage=false){
    const remembered=!confirmedPage&&library.videoMapping(metadata||subject,id);if(remembered){sourceDetail(remembered,id,metadata||subject,true);return;}
    const seq=++token.current;setDetailSourceId(id);setBusy(true);setError('');setDetail(null);setCandidates([]);
    const merged={...subject,...(metadata?{bgmId:metadata.bgmId,cover:metadata.cover,score:metadata.score,summary:metadata.summary,date:metadata.date,episodeCount:metadata.episodeCount,tags:metadata.tags}:{}),sourceId:id};
    try{const r=await call('detail',{sourceId:id,subject:merged,confirmedPage});if(seq!==token.current)return;if(!r.channels?.some(ch=>ch.episodes?.length))throw Error('这个源没有找到可播放的剧集，请换一个源');if(confirmedPage)library.setVideoMapping(metadata||subject,id,subject);setDetail({...r,subject:{...merged,...r.subject,sourceId:id}});setChannel(r.channels.findIndex(ch=>ch.episodes?.length));setBusy(false);}catch(e){if(seq===token.current){setError(e.message);setBusy(false);}}
  }
  function openSource(subject){
    const id=library.sourceFor(subject)||subject.sourceId||sourceId;enterDetailBase(subject);setBusy(true);const seq=token.current;
    const begin=metadata=>{if(seq!==token.current)return;setMeta(metadata);if(subject.sourceId&&id!==subject.sourceId)loadTitleSource(metadata,id);else sourceDetail(subject,id,metadata);};
    if(subject.bgmId){begin(subject);return;}
    call('bangumiSearch',{keyword:subject.name}).then(r=>{const exact=r.items.filter(x=>cleanName(x.name)===cleanName(subject.name)||cleanName(x.originalName)===cleanName(subject.name));if(exact.length===1)return call('bangumiDetail',{id:exact[0].bgmId}).then(r=>begin({...subject,...r.subject}));begin(subject);}).catch(()=>begin(subject));
  }
  async function loadTitleSource(subject,id=sourceId){
    if(!subject)return;const remembered=library.videoMapping(subject,id);if(remembered){sourceDetail(remembered,id,subject,true);return;}const seq=++token.current;setDetailSourceId(id);setBusy(true);setError('');setDetail(null);setCandidates([]);
    try{const r=await call(subject.bgmId?'matchSource':'search',subject.bgmId?{sourceId:id,subject}:{sourceId:id,keyword:subject.name});if(seq!==token.current)return;
      if(r.detail){setDetail(r.detail);setChannel(r.detail.channels.findIndex(ch=>ch.episodes.some(e=>!e.unavailable)));setCandidates([]);setBusy(false);return;}
      const items=r.items||[],exact=items.filter(x=>cleanName(x.name)===cleanName(subject.name)||cleanName(x.name)===cleanName(subject.originalName));if(!r.manualRequired&&exact.length===1)sourceDetail(exact[0],id,subject);else{setCandidates(items.map(x=>({...x,sourceId:id})));if(!items.length)setError('这个源没有找到这部番剧，请换一个源');setBusy(false);setTimeout(()=>{if(seq===token.current)setFocus('content-2-0');},50);}}catch(e){if(seq===token.current){setError(e.message);setBusy(false);}}
  }

  function openTitle(subject){enterDetailBase(subject);if(subject.bgmId){call('bangumiDetail',{id:subject.bgmId}).then(r=>{if(current.current.page==='detail'&&current.current.meta?.bgmId===subject.bgmId)setMeta(r.subject);}).catch(()=>{});}loadTitleSource(subject,library.sourceFor(subject)||sourceId);}
  function toggleFavorite(){const subject=meta||detail?.subject;if(subject){const saved=library.toggleFavorite(subject);refresh();notify(saved?'已加入本地收藏':'已取消收藏');}}
  function startPlay(ep,index=channel,startAt){
    cancelPlayRequest();if(!detail)return;if(ep.unavailable){notify('这条线路没有对应的剧集，请换源');return;}if(ep.unmatched){const item=sourcePlayback(detail,ep,index);setPlayer({...item,key:Date.now(),sourceId:detail.subject.sourceId||sourceId,startAt});return;}const source=detail.subject.sourceId||sourceId,subject={...detail.subject,...(meta?.bgmId?{bgmId:meta.bgmId,cover:meta.cover,score:meta.score}: {})};const ch=detail.channels[index],eps=ch.episodes.filter(e=>(e.type||'main')===(ep.type||'main'));const i=eps.findIndex(x=>x.id===ep.id);
    setPlayer({key:Date.now(),sourceId:source,subject,episode:ep,channels:detail.channels,channelIndex:index,hasNext:i>=0&&i<eps.length-1&&!eps[i+1].unavailable,startAt});
  }
  function closePlayer(){setPlayer(null);refresh();}
  function nextEpisode(){const p=current.current.player;if(!p)return;const eps=p.channels[p.channelIndex].episodes.filter(e=>(e.type||'main')===(p.episode.type||'main')),i=eps.findIndex(e=>e.id===p.episode.id);if(i>=0&&i+1<eps.length)startPlay(eps[i+1],p.channelIndex,0);else notify('已是此线路最后一集');}
  function switchPlayingChannel(i){const p=current.current.player;if(!p)return;const ep=alternate(p.channels[i],p.episode);if(!ep){notify('此线路没有匹配到当前集，请从选集中选择');return;}const old=library.progress(p.sourceId,p.subject,p.episode);setChannel(i);startPlay(ep,i,old?.position||0);}
  function cancelPlayRequest(){pendingPlay.current=null;setPlayPending(false);}
  function requestPlay(entry){
    if(current.current.player||pendingPlay.current)return;
    pendingPlay.current={entry:entry||null};setPlayPending(true);
    if(current.current.error){cancelPlayRequest();notify('请先选择可播放的视频源');}
  }
  useEffect(()=>{
    if(page!=='detail'||!playPending||busy||dialog||player)return;
    if(error){cancelPlayRequest();return;}
    if(!detail||!pendingPlay.current)return;
    const entry=pendingPlay.current.entry,target=playbackTarget(detail,entry);cancelPlayRequest();
    if(!target){notify(entry?'这个源未找到上次观看的集数，请核对季度并选择剧集':'这条线路没有第一集，请选择其他线路或视频源');setFocus('content-2-0');return;}
    setChannel(target.channelIndex);startPlay(entry?.episode.unmatched?{...target.episode,unmatched:true}:target.episode,target.channelIndex,target.startAt);
  },[page,playPending,busy,dialog,player,error,detail]);
  function resume(entry){
    const subject=entry.subject,id=library.sourceFor(subject)||entry.sourceId||sourceId;enterDetailBase(subject);
    if(!current.current.settings.resumeToEpisodes){pendingPlay.current={entry};setPlayPending(true);}
    if(id===entry.sourceId&&subject.url)sourceDetail(subject,id,subject);else loadTitleSource(subject,id);
  }
  function renderCards(items,startRow=1,historyItems=null,offset=0){return <div className={'poster-grid cols-'+settings.gridCols}>{items.map((s,i)=>{const h=historyItems?.[offset+i];return <PosterCard key={(s.bgmId||s.url||s.id)+'-'+(offset+i)} subject={s} row={startRow+Math.floor(i/settings.gridCols)} col={i%settings.gridCols} progress={h} actionLabel={h?h.episode.name+' · '+shortTime(h.position):undefined} onSelect={()=>h?resume(h):s.url?openSource(s):openTitle(s)}/>;})}</div>;}
  // A heading travels with its first row in one ScrollGroup, so focus scrolling reveals both and
  // never leaves the heading stranded above the viewport.
  function gridSection(heading,items,cols,startRow,grid){const lead=items.slice(0,cols),rest=items.slice(cols);return <section className="grid-section"><ScrollGroup className="section-lead">{heading}{grid(lead,startRow,0)}</ScrollGroup>{rest.length>0&&grid(rest,startRow+1,cols)}</section>;}
  function cardSection(heading,items,startRow=1,historyItems=null){return gridSection(heading,items,settings.gridCols,startRow,(list,row,offset)=>renderCards(list,row,historyItems,offset));}
  function textSection(heading,items,startRow,onPick){return gridSection(heading,items,3,startRow,(list,row,offset)=><div className="source-results">{list.map((x,i)=><TextCard key={(x.url||x.id)+'-'+(offset+i)} subject={x} row={row+Math.floor(i/3)} col={i%3} onSelect={()=>onPick(x)}/>)}</div>);}
  // Grouped settings rows. Each group is one ScrollGroup so its heading scrolls in with its rows.
  function settingsGroups(groups){let row=0;return <div className="settings-list">{groups.map(([heading,rows])=><ScrollGroup key={heading} className="settings-group"><h2 className="settings-group-title">{heading}</h2>{rows.map(x=>{row++;return <SettingsRow key={x[0]} id={`content-${row}-0`} row={row} label={x[0]} value={x[1]} onSelect={x[2]}/>;})}</ScrollGroup>)}</div>;}
  const resumeEntry=page==='detail'&&meta?library.latestProgress(meta):null,continueEntry=resumeEntry&&!resumeEntry.completed?resumeEntry:null;
  const progressFor=page==='detail'&&detail?library.progressLookup():null;
  const unmatched=detail?.channels[channel]?.unmatchedEpisodes||[],moreRow=detail?2+Math.ceil(detail.channels[channel].episodes.length/7):2;
  function episodeButtons(eps,startRow=2){return <div className="episode-grid tab-stage">{eps.map((ep,i)=>{const progress=progressFor(detail.subject.sourceId||sourceId,detail.subject,ep);return <FocusButton key={ep.id} id={`content-${startRow+Math.floor(i/7)}-${i%7}`} row={startRow+Math.floor(i/7)} col={i%7} className={'episode-button '+(progress?.completed?'watched':'')} disabled={!!ep.unavailable} onSelect={()=>startPlay(ep)} onLongPress={()=>{const subject=ep.unmatched?sourcePlayback(detail,ep,channel).subject:detail.subject;library.markComplete(detail.subject.sourceId||sourceId,subject,ep,!progress?.completed);refresh();notify(progress?.completed?'已取消已看标记':'已标记为看过');}}><span>{ep.name}</span>{ep.unavailable?<small>此线路暂无</small>:progress?.completed?<small>✓ 已看</small>:progress?.position>0?<small>{shortTime(progress.position)}</small>:ep.unmatched?<small>未匹配</small>:null}</FocusButton>;})}</div>;}
  // Related titles sit below whatever the detail page shows: episodes (rows 2+, 7 per row), candidate matches (3 per row) or nothing yet.
  const relatedRow=error?3:busy?2:candidates.length?2+Math.ceil(candidates.length/3):detail?moreRow+(unmatched.length?1+(showUnmatched?Math.ceil(unmatched.length/7):0):0):1;
  const relatedLabel=x=>(x.relation==='系列'?(x.date&&meta?.date&&x.date<meta.date?'前传':'续集'):x.relation)+(x.date?' · '+x.date.slice(0,4):x.platform?' · '+x.platform:'');
  const favorites=library.favorites(),history=library.history(),todayItems=calendar.find(d=>d.id===today)?.items||[],dayItems=calendar.find(d=>d.id===day)?.items||[];
  // Page-level notes sit in the fixed header, outside the scroller, so they never need focus to be seen.
  const subtitle={settings:'设置与追番数据仅保存在本机，不需要登录账号。',subscriptions:'订阅直接下载到这台电视，应用运行时每小时检查更新；下载失败会保留缓存，不导入 BT。',danmakuSettings:'默认服务无需配置；推荐自建 danmu_api。播放时可调整弹幕偏移或手动匹配。',danmakuStyle:'对所有番剧生效；播放时在弹幕面板里修改的也是同一套设置。'}[page];
  const todayHeading=<h2 className="section-title">今日放送 <span>{DAY[today-1]} · Bangumi</span></h2>,todayRow=history.length?2:1;
  // 本季热门 and 高分经典 follow 今日放送; 高分经典 is a daily pick from Bangumi's top 300 minus shows
  // already watched, saved or listed as popular.
  const cols=settings.gridCols,popularRow=todayRow+(calendarBusy||calendarError?1:Math.max(1,Math.ceil(Math.min(todayItems.length,20)/cols))),popularItems=popular.slice(0,cols*2),classicsRow=popularRow+(popularItems.length?Math.ceil(popularItems.length/cols):0);
  const classicItems=page==='home'&&discoverShown?dailyPick(classics,history.map(x=>x.subject.bgmId).concat(favorites.map(x=>x.bgmId),popularItems.map(x=>x.bgmId)),cols*2,dayKey(new Date())):[];
  const resultsHeading=<h2 className="section-title">搜索结果 <span>{results.length} 部 · {currentSource?.name}</span></h2>;
  const title={home:'继续喜欢的故事',search:'搜索番剧',calendar:'新番时间表',favorites:'我的收藏',history:'观看历史',settings:'设置',subscriptions:'数据源订阅',danmakuSettings:'弹幕服务',danmakuStyle:'弹幕样式',detail:meta?.name||detail?.subject?.name||'番剧详情'}[page];
  useEffect(()=>{window.__fanYuan={get state(){return current.current;},call,library,navigate:go,search:(q,id)=>runSearch(q,id),openTitle,openSource,diagnostics:()=>({version:APP_VERSION,page:current.current.page,sourceId:current.current.sourceId,playing:!!current.current.player,results:current.current.results.length})};return()=>delete window.__fanYuan;},[page,sourceId,keyword,detail,meta,channel]);
  const shell=useRef({});
  shell.current={go,chooseSource,clearHistory(){if(!history.length){notify('暂无观看历史');return;}setDialog({title:'清空观看历史？',options:[{label:'保留历史',action:()=>setDialog(null)},{label:'清空本地历史与进度',description:'收藏会保留。此操作不能撤销。',action:()=>{library.clearHistory();refresh();setDialog(null);}}]});}};
  const actions=useMemo(()=>({go:(p,enter)=>shell.current.go(p,enter),search:()=>shell.current.go('search',true),chooseSource:()=>shell.current.chooseSource(),clearHistory:()=>shell.current.clearHistory()}),[]);
  return <div id="tv-frame" className={className}>
    <div className="app-shell" aria-hidden={!!player}>
      <Sidebar active={menuPage()} disabled={!!player||!!dialog} expanded={drawer.current} actions={actions}/>
      <PageFocusContainer spotlightId="content" spotlightDisabled={!!player||!!dialog} className="main-content"><PageHeader title={title} subtitle={subtitle} page={page} sourceName={(page==='detail'?sources.find(s=>s.id===detailSourceId):currentSource)?.name} actions={actions}/>
        <ContentScroller apiRef={scroller}>
          <div key={page+(page==='detail'?':'+(meta?.bgmId||meta?.name||''):'')} className="page-stage">
          {error&&page!=='detail'&&<div className="error-banner"><span>{error}</span><FocusButton id="content-0-4" row={0} col={4} recoveryPriority={2} onSelect={chooseSource}>换一个源</FocusButton></div>}
          {page==='home'&&<>
            {history.length>0&&cardSection(<h2 className="section-title">继续观看 <span>已在这台电视上保存</span></h2>,history.slice(0,settings.gridCols).map(x=>x.subject),1,history.slice(0,settings.gridCols))}
            {calendarBusy||calendarError?<section className="grid-section"><ScrollGroup className="section-lead">{todayHeading}{calendarBusy?<Loading/>:<><Empty title="时间表暂未加载">{calendarError}</Empty><FocusButton id="content-calendar-retry" row={todayRow} onSelect={loadCalendar}>重新加载</FocusButton></>}</ScrollGroup></section>:cardSection(todayHeading,todayItems.slice(0,20),todayRow)}
            {discoverShown&&popularItems.length>0&&cardSection(<h2 className="section-title">本季热门 <span>Bangumi 热度</span></h2>,popularItems,popularRow)}
            {classicItems.length>0&&cardSection(<h2 className="section-title">高分经典 <span>每天换一批</span></h2>,classicItems,classicsRow)}
          </>}
          {page==='search'&&<>
            <form className="search-form" onSubmit={e=>e.preventDefault()}><FocusSearchInput id="content-0-0" inputRef={inputRef} value={keyword} onChange={e=>setKeyword(e.target.value)} onSubmit={()=>runSearch()}/><FocusButton id="content-0-1" row={0} col={1} className="primary search-submit" aria-label="搜索" onSelect={()=>runSearch()}><Icon name="search" size={30}/></FocusButton></form>
            {!results.length&&!busy&&!error&&<ScrollGroup className="section-lead"><h2 className="section-title">最近搜索</h2><div className="search-history">{(library.searchHistory().length?library.searchHistory():['葬送的芙莉莲','夏目友人帐','间谍过家家','孤独摇滚']).map((q,i)=><FocusButton key={q} id={`content-1-${i}`} row={1} col={i} onSelect={()=>runSearch(q)}>{q}</FocusButton>)}</div><Empty title="找到番剧，再选择播放线路">使用现有视频源规则，在电视端完成搜索和解析。</Empty></ScrollGroup>}
            {busy?<Loading text={'正在搜索 '+keyword+'…'}/>:results.length>0&&(results.some(x=>x.cover)?cardSection(resultsHeading,results,1):textSection(resultsHeading,results,1,openSource))}
          </>}
          {page==='calendar'&&<><div className="day-tabs">{DAY.map((d,i)=><LiteButton key={d} id={`content-0-${i}`} row={0} col={i} label={d} className={day===i+1?'active':''} onSelect={()=>{setDay(i+1);scroller.current.scrollTop=0;}}><span>{d}</span>{today===i+1&&<small>今天</small>}</LiteButton>)}</div><div key={day} className="tab-stage">{calendarBusy?<Loading/>:calendarError?<Empty title="时间表暂不可用">{calendarError}</Empty>:renderCards(dayItems)}</div></>}
          {page==='favorites'&&<><div className="filter-tabs">{[['all','全部'],['wish','想看'],['watching','在看'],['done','看过']].map((x,i)=><LiteButton key={x[0]} id={`content-0-${i}`} row={0} col={i} label={x[1]} className={favFilter===x[0]?'active':''} onSelect={()=>setFavFilter(x[0])}><span>{x[1]}</span></LiteButton>)}</div><div key={favFilter} className="tab-stage">{favorites.length?renderCards(favorites.filter(x=>favFilter==='all'||(x.status||'wish')===favFilter)):<Empty title="收藏喜欢的番剧">打开番剧详情，选择“加入收藏”。数据仅保存在这台电视。</Empty>}</div></>}
          {page==='history'&&(history.length?renderCards(history.map(x=>x.subject),1,history):<Empty title="从第一集开始">播放过的番剧和进度会自动出现在这里。</Empty>)}
          {page==='detail'&&<>
            <ScrollGroup className="subject-hero">{meta?.cover?<img src={coverThumbnail(meta.cover)} className="subject-cover" alt=""/>:<div className="subject-cover blank"><Icon name="tv" size={70}/></div>}<div className="subject-info"><div className="subject-meta">{meta?.score>0&&<strong>★ {Number(meta.score).toFixed(1)}</strong>}{meta?.date&&<span>{meta.date}</span>}{meta?.episodeCount>0&&<span>全 {meta.episodeCount} 集</span>}</div><h2>{meta?.originalName||title}</h2><p className="subject-summary">{meta?.summary||'选择播放源与剧集。收藏和观看进度会保存在本机。'}</p>{meta?.tags?.length>0&&<div className="subject-tags">{meta.tags.slice(0,6).map(t=><span key={t}>{t}</span>)}</div>}<div className="subject-actions"><FocusButton id="content-0-0" row={0} col={0} className="primary primary-play" onSelect={()=>requestPlay(continueEntry)}><span className="play-button-content"><span className="play-button-icon">{playPending?<Spinner size="small" transparent blockClickOn={null} className="loading-spinner play-button-spinner" aria-label="等待加载"/>:<Icon name="play" size={21}/>}</span><span className="play-button-label">{playPending?'加载后播放…':continueEntry?'继续观看':'从头播放'}</span></span></FocusButton><FocusButton id="content-0-1" row={0} col={1} className={library.isFavorite(meta||detail?.subject||{})?'active':'quiet'} onSelect={toggleFavorite}><Icon name="star" size={21}/>{library.isFavorite(meta||detail?.subject||{})?'已收藏':'加入收藏'}</FocusButton><FocusButton id="content-0-2" row={0} col={2} className="quiet" onSelect={()=>{const s=meta||detail?.subject;if(!s)return;chooseOption('设置追番状态',library.favoriteStatus?.(s)||'wish',[{value:'wish',label:'想看',description:'加入想看列表，方便日后查找'},{value:'watching',label:'在看',description:'正在追更或观看中的番剧'},{value:'done',label:'看过',description:'已经看完的番剧'}],nextStatus=>{if(!library.isFavorite(s))library.toggleFavorite(s);library.setFavoriteStatus?.(s,nextStatus);refresh();notify('已更新本地追番状态');});}}>状态：{({wish:'想看',watching:'在看',done:'看过'})[library.favoriteStatus?.(meta||detail?.subject||{})||'wish']}</FocusButton></div></div></ScrollGroup>
            {error?<div className="error-banner detail-source-error"><span>{error}</span><FocusButton id="content-2-0" row={2} col={0} recoveryPriority={2} onSelect={chooseSource}>换一个源</FocusButton></div>:busy?<Loading text="正在读取线路和剧集…"/>:candidates.length>0?textSection(<h2 className="section-title">选择对应番剧 <span>请核对季度和名称</span></h2>,candidates,2,s=>sourceDetail(s,s.sourceId,meta,true)):detail&&<><div className="channel-tabs">{detail.channels.map((ch,i)=><FocusButton key={i} id={`content-1-${i}`} row={1} col={i} className={channel===i?'active':''} onSelect={()=>{if(channel===i){chooseSourcePage();return;}setShowUnmatched(false);setChannel(i);}}>{ch.name}<small>{ch.episodes.length} 集</small></FocusButton>)}</div><div key={channel}>{episodeButtons(detail.channels[channel].episodes)}{unmatched.length>0&&<><FocusButton id={`content-${moreRow}-0`} row={moreRow} className="episode-more quiet" onSelect={()=>setShowUnmatched(v=>!v)}>{showUnmatched?'收起其它集数':'更多'}（{unmatched.length}）</FocusButton>{showUnmatched&&gridSection(<h2 className="section-title">其它源集数 <span>未匹配到当前番剧</span></h2>,unmatched,7,moreRow+1,(list,row)=>episodeButtons(list,row))}</>}</div></>}
            {related.length>0&&gridSection(<h2 className="section-title">关联作品 <span>同系列的其他季度、剧场版与番外</span></h2>,related,settings.gridCols,relatedRow,(list,row,offset)=><div className={'poster-grid cols-'+settings.gridCols}>{list.map((s,i)=><PosterCard key={s.bgmId} subject={s} row={row+Math.floor(i/settings.gridCols)} col={i%settings.gridCols} actionLabel={relatedLabel(s)} onSelect={()=>openTitle(s)}/>)}</div>)}
          </>}
          {page==='danmakuSettings'&&<DanmakuSettings notify={notify}/>}
          {page==='subscriptions'&&<Subscriptions onChanged={refreshSources} notify={notify} chooseOption={chooseOption}/>}
          {page==='settings'&&settingsGroups([
            ['播放',[['继续观看时先选集',settings.resumeToEpisodes?'开启':'关闭',()=>chooseOption('继续观看时先选集',!!settings.resumeToEpisodes,[{value:true,label:'开启',description:'从首页或历史记录继续观看时，先进入番剧选集页'},{value:false,label:'关闭',description:'从首页或历史记录继续观看时，直接续播上次的剧集'}],v=>updateSettings({resumeToEpisodes:v}))],['自动播放下一集',settings.autoplayNext?'开启':'关闭',()=>chooseOption('自动播放下一集',!!settings.autoplayNext,[{value:true,label:'开启',description:'本集播放结束后倒计时 5 秒自动连播下一集'},{value:false,label:'关闭',description:'本集播放结束后停留在当前剧集'}],v=>updateSettings({autoplayNext:v}))],
              ['跳过片头快捷键',settings.skipShortcut?'开启 · CH−/CH+ 跳 85 秒':'关闭',()=>chooseOption('跳过片头快捷键',!!settings.skipShortcut,[{value:true,label:'开启',description:'播放时按 CH−（频道下）向前、CH+（频道上）向后跳 85 秒；2 秒内连按改为每次微调 5 秒'},{value:false,label:'关闭',description:'播放时 CH− / CH+ 不做任何操作'}],v=>updateSettings({skipShortcut:v}))]]],
            ['弹幕',[['显示弹幕',settings.danmaku?'开启':'关闭',()=>chooseOption('显示弹幕',!!settings.danmaku,[{value:true,label:'开启',description:'播放时显示弹幕；与播放器控制栏的弹幕开关是同一个设置'},{value:false,label:'关闭',description:'播放时隐藏弹幕，可在播放控制栏随时打开'}],v=>updateSettings({danmaku:v}))],['弹幕样式','区域、字号、速度等',()=>go('danmakuStyle',true)],['弹幕服务','服务地址与匹配',()=>go('danmakuSettings',true)]]],
            ['界面',[['主题色',(THEMES.find(t=>t.value===settings.themeColor)||THEMES[0]).label,()=>chooseOption('主题色',settings.themeColor||'sakura',THEMES,v=>updateSettings({themeColor:v}))],['每行番剧数量',settings.gridCols+' 部',()=>chooseOption('每行番剧数量',settings.gridCols,[{value:3,label:'3 部 / 行',description:'大尺寸海报卡片，适合较远观看距离'},{value:4,label:'4 部 / 行',description:'标准海报卡片尺寸（默认）'},{value:5,label:'5 部 / 行',description:'紧凑网格布局，单屏展示更多番剧'}],v=>updateSettings({gridCols:v}))]]],
            ['视频源',[['默认视频源',currentSource?.name||'选择',chooseSource],['数据源订阅','在线更新与管理',()=>go('subscriptions',true)]]],
            ['关于',[['版本与来源','番源 '+APP_VERSION,()=>setDialog({title:'番源 '+APP_VERSION+' · 非官方',options:[{label:'LG Enact / Sandstone',description:'官方按钮、海报、输入框、弹窗、滚动和焦点管理；滚动弹幕渲染保留 BiliTV 的 MIT 许可与作者署名。',action:()=>{}},{label:'视频源订阅',description:'直接订阅原版在线视频源地址，每小时检查更新，保留原始 JSON。解析与播放代理均在电视上执行，不含 BT。',action:()=>{}},{label:'本地追番',description:'番剧资料来自 Bangumi，弹幕优先匹配弹弹play。没有账号同步。',action:()=>{}},{label:'关闭',action:()=>setDialog(null)}]})]]]
          ])}
          {page==='danmakuStyle'&&settingsGroups(DANMAKU_GROUPS.map(g=>[g.title,g.fields.map(f=>[DANMAKU_FIELDS[f].label,danmakuFieldValue(f,settings),()=>chooseDanmakuField(f)])]))}
          </div>
        </ContentScroller>
        <PageFooter page={page}/>
      </PageFocusContainer>
    </div>
    <Dialog value={dialog} onClose={()=>setDialog(null)}/>
    {player&&<Player key={player.key} item={player} library={library} settings={settings} onSettings={updateSettings} onClose={closePlayer} onNext={nextEpisode} onEpisode={ep=>startPlay(ep,player.channelIndex,0)} onSwitchChannel={switchPlayingChannel}/>}
    {toast&&<div className="toast">{toast}</div>}
  </div>;
}
const ThemedApp=ThemeDecorator({ri:false},App);
createRoot(document.getElementById('root')).render(<ThemedApp locale="zh-Hans-CN"/>);
