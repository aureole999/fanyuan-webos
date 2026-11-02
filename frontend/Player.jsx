import React,{useState,useEffect,useRef,useCallback,useMemo,useLayoutEffect} from 'react';
import {call} from './api';
import {Icon,FocusButton,FocusContainer,ContentScroller,PlaybackSlider,ScrollGroup} from './components';
import DanmakuLayer from './vendor/bilitv/player/DanmakuLayer';
import {setCustomKeyHandler,claimRemoteFocus,setFocus,activateFocusScope,getCurrentFocusId} from './focus';
import {remoteKey,createSeekSession} from './navigation.cjs';
import {renderItems,fixedWindow,DANMAKU_OPTIONS,DANMAKU_FIELDS,DANMAKU_GROUPS,DANMAKU_COMMON,DANMAKU_TYPES,danmakuTypePatch,danmakuFieldValue,matchOptionValue,computeDanmakuLayout} from './danmaku.cjs';
const PANEL_TITLES={episodes:'选择剧集',channels:'切换线路',speed:'选择播放倍速',danmaku:'弹幕',danmakuMore:'更多弹幕样式',types:'弹幕类型与色彩',sources:'平台与条数',customMatch:'匹配弹幕'};
// Option panels are named opt-<field> and titled after the field.
function panelTitle(p){return p.startsWith('opt-')?DANMAKU_FIELDS[p.slice(4)]?.label:PANEL_TITLES[p];}
// Server titles carry type and source tags ("名(2026)【TV动画】from dandan"); show the plain name.
function cleanTitle(s){return String(s||'').replace(/【[^】]*】/g,'').replace(/\((?:\d{4}|未知)\)/g,'').replace(/\s*from\s+[\w&-]+\s*$/i,'').trim();}

function time(t){if(!Number.isFinite(t))return '00:00';const m=Math.floor(t/60),s=Math.floor(t%60);return `${m<10?'0':''}${m}:${s<10?'0':''}${s}`;}
export default function Player({item,library,settings,onSettings,onClose,onNext,onEpisode,onSwitchChannel}){
  const {sourceId,subject,episode,channels,channelIndex}=item;
  const videoRef=useRef(null),mounted=useRef(true),resumeApplied=useRef(false),lastSaved=useRef(0),generation=useRef(0),controlsRef=useRef(true),panelRef=useRef(''),panelHistory=useRef([]),panelTarget=useRef(null),timer=useRef(null),nextTimer=useRef(null),seekTimer=useRef(null),dmGeneration=useRef(0),customGeneration=useRef(0);
  const lastControlFocus=useRef('player-controls-0');
  // Controls stay mounted for the fade-out, then unmount so clock updates stop re-rendering them.
  const [controlsMounted,setControlsMounted]=useState(true);
  const seekSession=useRef(null);if(!seekSession.current)seekSession.current=createSeekSession();
  const [message,setMessage]=useState('正在解析播放地址…'),[current,setCurrent]=useState(0),[duration,setDuration]=useState(0),[paused,setPaused]=useState(true),[controls,setControls]=useState(true),[panel,setPanel]=useState(''),[rawDanmakus,setRawDanmakus]=useState([]),[dmInfo,setDmInfo]=useState('弹幕待匹配'),[offset,setOffset]=useState(()=>library.offset(subject)),[speed,setSpeed]=useState(1),[countdown,setCountdown]=useState(null);
  const [seekHint,setSeekHint]=useState(''),[dmError,setDmError]=useState('');
  const [dmProviders,setDmProviders]=useState([]),[dmSources,setDmSources]=useState([]),[sourcePrefs,setSourcePrefs]=useState(()=>library.danmakuSources()),[customSubjects,setCustomSubjects]=useState([]),[customEpisodes,setCustomEpisodes]=useState([]),[customSubject,setCustomSubject]=useState(null),[customBusy,setCustomBusy]=useState(false);
  const danmakus=useMemo(()=>renderItems(rawDanmakus,sourcePrefs),[rawDanmakus,sourcePrefs]),fixedItems=useMemo(()=>danmakus.filter(d=>d.mode===4||d.mode===5),[danmakus]);
  const settingsRef=useRef(settings);settingsRef.current=settings;
  controlsRef.current=controls;panelRef.current=panel;
  function hideControls(){const id=getCurrentFocusId();if(id?.startsWith('player-'))lastControlFocus.current=id;controlsRef.current=false;setControls(false);}
  function show(){if(seekSession.current.active())return;if(!controlsRef.current){const v=videoRef.current;if(v){setCurrent(v.currentTime||0);if(Number.isFinite(v.duration))setDuration(v.duration);}}controlsRef.current=true;setControls(true);clearTimeout(timer.current);timer.current=setTimeout(()=>{if(videoRef.current&&!videoRef.current.paused&&!panelRef.current){hideControls();}},5000);}
  function save(completed=false){const v=videoRef.current;if(v&&v.duration>0)library.saveProgress(sourceId,subject,episode,v.currentTime,v.duration,completed||v.ended);}
  function close(){save();onClose();}
  function toggle(){const v=videoRef.current;if(!v)return;if(v.paused){const p=v.play();p&&p.catch(()=>setMessage('按播放键重试'));}else v.pause();show();}
  function seek(n){const v=videoRef.current;if(v&&Number.isFinite(v.duration)){v.currentTime=Math.min(v.duration,Math.max(0,v.currentTime+n));setCurrent(v.currentTime);setSeekHint((n>0?'快进':'快退')+' '+Math.abs(n)+' 秒 · '+time(v.currentTime));clearTimeout(seekTimer.current);seekTimer.current=setTimeout(()=>setSeekHint(''),2000);}}
  const controlId=(p,index)=>'player-'+(p||'controls')+'-'+index;
  useLayoutEffect(()=>activateFocusScope('player',controlId('',0)),[]);
  useLayoutEffect(()=>{if(controls&&!panel&&!setFocus(lastControlFocus.current))setFocus(controlId('',0));},[controls]);
  useLayoutEffect(()=>{const target=panelTarget.current;panelTarget.current=null;if(target){setFocus(target);return;}const activeEl=panel?document.querySelector('.player-panel .player-button.active[data-focus-id]'):null;setFocus(activeEl?.dataset?.focusId||controlId(panel,panel?1:0));},[panel]);
  function openPanel(p){seekSession.current.reset();panelHistory.current.push({panel:panelRef.current,focus:getCurrentFocusId()});panelRef.current=p;setPanel(p);controlsRef.current=true;setControls(true);clearTimeout(timer.current);if(p==='customMatch')findCustom();}
  function hidePanel(){if(panelRef.current==='customMatch')customGeneration.current++;const previous=panelHistory.current.pop()||{panel:'',focus:controlId('',0)};panelRef.current=previous.panel;panelTarget.current=previous.focus;setPanel(previous.panel);show();}
  function applyDanmaku(r){
    setRawDanmakus(r.items);setDmProviders(r.providers);setDmSources(r.sources);
    const status=r.providers[0]?.status,manual=r.providers[0]?.match?.method==='manual';
    const text=r.items.length?r.items.length+' 条弹幕':({notConfigured:'弹幕服务待配置',error:'弹幕加载失败',disabled:'弹幕已关闭',noMatch:'弹幕未匹配',empty:'暂无弹幕'}[status]||'暂无弹幕');
    setDmInfo(text+(manual?' · 手动匹配':''));setDmError(r.providers.find(p=>p.status==='error')?.message||'');
  }
  async function loadDanmaku(bgmId,episodeId){
    setDmInfo('正在加载弹幕…');setDmError('');const token=++dmGeneration.current;
    try{const r=await call('danmaku',{subjectId:bgmId,episodeId,sort:episode.sort,type:episode.type,sourceEpisodeNumbers:(channels[channelIndex]?.episodes||[]).filter(e=>!e.type||e.type==='main').map(e=>Number(e.sort)).filter(Number.isFinite).slice(0,3000),subject,videoDuration:videoRef.current?.duration||0,customSelection:library.customDanmakuMapping(subject,episode)});if(!mounted.current||token!==dmGeneration.current)return;if(bgmId)library.setMapping(subject,bgmId);applyDanmaku(r);}
    catch(e){if(mounted.current&&token===dmGeneration.current){setDmInfo('弹幕未匹配');setDmError(e.message);}}
  }
  async function findCustom(){
    const token=++customGeneration.current;setDmError('');setCustomSubjects([]);setCustomEpisodes([]);setCustomSubject(null);setCustomBusy(true);
    const valid=()=>mounted.current&&token===customGeneration.current&&panelRef.current==='customMatch';
    try{const r=await call('customDanmakuSearch',{name:subject.name});if(valid()){setCustomSubjects(r.items);setTimeout(()=>{if(valid())setFocus(controlId('customMatch',1));},0);}}
    catch(e){if(valid())setDmError(e.message);}finally{if(valid())setCustomBusy(false);}
  }
  async function selectCustom(s){
    const token=++customGeneration.current;setDmError('');setCustomBusy(true);
    const valid=()=>mounted.current&&token===customGeneration.current&&panelRef.current==='customMatch';
    try{const r=await call('customDanmakuEpisodes',{selection:{query:s.query,subjectName:s.name,source:s.source,sourceKey:s.sourceKey}});if(valid()){setCustomSubject(s);setCustomEpisodes(r.items);setTimeout(()=>{if(valid())setFocus(controlId('customMatch',2));},0);}}
    catch(e){if(valid())setDmError(e.message);}finally{if(valid())setCustomBusy(false);}
  }
  async function chooseCustom(ep){const token=++customGeneration.current;library.setCustomDanmakuMapping(subject,episode,ep.selection);await loadDanmaku(subject.bgmId||library.mapping(subject));if(mounted.current&&token===customGeneration.current&&panelRef.current==='customMatch')hidePanel();}
  function sourceSetting(id,patch){setSourcePrefs(library.setDanmakuSource(id,patch));}
  async function autoDanmaku(){
    const mapped=subject.bgmId||library.mapping(subject)||Number(localStorage.getItem('bgm:'+subject.name));
    return loadDanmaku(mapped||null);
  }
  const start=useCallback(async()=>{
    const token=++generation.current;setMessage('正在解析播放地址…');
    try{const r=await call('resolve',{sourceId,subject,episode});if(!mounted.current||token!==generation.current)return;const v=videoRef.current;v.src=r.url;v.load();const p=v.play();if(p&&p.catch)p.catch(()=>setMessage('按 OK 开始播放'));autoDanmaku();}
    catch(e){if(mounted.current&&token===generation.current)setMessage(e.message+'，可切换线路重试');}
  },[]);
  useEffect(()=>{
    mounted.current=true;start();
    const heartbeat=setInterval(()=>call('ping').catch(()=>{}),20000);
    return()=>{save();mounted.current=false;generation.current++;dmGeneration.current++;clearInterval(heartbeat);clearTimeout(timer.current);clearTimeout(seekTimer.current);clearInterval(nextTimer.current);const v=videoRef.current;if(v){v.pause();v.removeAttribute('src');v.load();}};
  },[]);
  useEffect(()=>{const timer=setInterval(()=>{const v=videoRef.current;if(!v)return;setCurrent(v.currentTime||0);if(Number.isFinite(v.duration))setDuration(v.duration);if(!v.paused&&Date.now()-lastSaved.current>10000){save();lastSaved.current=Date.now();}},250);return()=>clearInterval(timer);},[]);
  useEffect(()=>{
    const release=e=>seekSession.current.release(remoteKey(e));
    const reset=()=>seekSession.current.reset();
    const visibility=()=>{if(document.hidden)reset();};
    window.addEventListener('keyup',release);window.addEventListener('blur',reset);document.addEventListener('visibilitychange',visibility);
    return()=>{reset();window.removeEventListener('keyup',release);window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  useEffect(()=>{
    const handler=e=>{
      const key=remoteKey(e),code=e.keyCode;
      if(e.target&&e.target.tagName==='INPUT'){if(code===461||key==='Escape'){e.preventDefault();e.target.blur();}return true;}
      const delta=seekSession.current.delta(key,panelRef.current,controlsRef.current);
      if(code===461||key==='Escape'||key==='GoBack'||key==='Backspace'){e.preventDefault();if(e.repeat)return true;if(panelRef.current)hidePanel();else if(controlsRef.current){hideControls();}else close();return true;}
      if(code===415||key==='MediaPlayPause'||code===19){e.preventDefault();if(key==='MediaPlayPause')toggle();else if(code===19)videoRef.current?.pause();else if(videoRef.current?.paused)toggle();return true;}
      if(code===413){e.preventDefault();close();return true;}
      if(!['Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key))return false;
      claimRemoteFocus();
      if(delta){e.preventDefault();seek(delta);return true;}
      if(!controlsRef.current){e.preventDefault();show();return true;}
      show();return false;
    };
    setCustomKeyHandler(handler);return()=>setCustomKeyHandler(null);
  },[episode,offset,speed,settings,panel]);
  useEffect(()=>{window.__fanYuanPlayer={diagnostics:()=>{const v=videoRef.current;return {playing:!!v&&!v.paused,time:v?.currentTime,readyState:v?.readyState,videoWidth:v?.videoWidth,danmaku:danmakus.length,providers:dmProviders,sources:dmSources,error:v?.error?.code};}};return()=>delete window.__fanYuanPlayer;},[danmakus,dmProviders,dmSources]);
  function ready(){const v=videoRef.current;setDuration(v.duration);if(!resumeApplied.current){resumeApplied.current=true;const saved=library.progress(sourceId,subject,episode);const position=item.startAt!=null?item.startAt:saved&&!saved.completed?saved.position:0;if(position>3&&position<v.duration-12){v.currentTime=position;setMessage('已续播到 '+time(position));setTimeout(()=>mounted.current&&setMessage(''),1800);}}}
  function ended(){save(true);setControls(true);if(settingsRef.current.autoplayNext&&item.hasNext){setCountdown(5);let left=5;clearInterval(nextTimer.current);nextTimer.current=setInterval(()=>{left--;setCountdown(left);if(left<=0){clearInterval(nextTimer.current);onNext();}},1000);}else setMessage('本集播放结束');}
  function adjustOffset(n){const value=offset+n;setOffset(value);library.setOffset(subject,value);}
  function applySpeed(next){try{videoRef.current.playbackRate=next;setSpeed(videoRef.current.playbackRate);hidePanel();}catch(e){setMessage('此格式暂不支持倍速');}}
  const dmLayout=computeDanmakuLayout(settings);
  const fixedLimit=Math.min(4,dmLayout.trackCount);
  const topFixed=dmLayout.enableTop?fixedWindow(fixedItems,current-offset,5,fixedLimit):[];
  const bottomFixed=dmLayout.enableBottom?fixedWindow(fixedItems,current-offset,4,fixedLimit):[];
  const fixedStrokeStyle={fontWeight:dmLayout.fontWeight,WebkitTextStroke:dmLayout.strokeWidthPx>0?`${dmLayout.strokeWidthPx}px rgba(0, 0, 0, 0.92)`:'0px transparent',textShadow:dmLayout.textShadow};
  useEffect(()=>{if(controls){setControlsMounted(true);return;}const t=setTimeout(()=>setControlsMounted(false),220);return()=>clearTimeout(t);},[controls]);
  const showUi=controls||controlsMounted;
  // Hidden controls are unmounted; visible menus do not rebuild on clock updates.
  const controlsMenu=useMemo(()=>{
    if(!showUi)return null;
    let index=0;
    // Notes and errors sit beside the panel title (the first focus row), never below the last control.
    const note={danmakuMore:'与「设置 → 弹幕样式」是同一套设置，对所有番剧生效。',types:'点击即可切换开关；关闭彩色弹幕后所有弹幕统一显示为白色。',sources:'每个平台可单独开关和调整时间；整部番剧的偏移在弹幕面板的「本集弹幕」里。',customMatch:customBusy?'正在查询…':customSubject?'当前番剧：'+customSubject.name:'选择对应番剧和剧集；自动匹配不准时可在这里调整。'}[panel];
    const panelError=(panel==='danmaku'||panel==='customMatch')&&dmError;
    function button(label,action,icon,extra=''){const i=index++;return <FocusButton key={i} id={controlId(panel,i)} group="player" row={i} className={`player-button ${extra}`} onSelect={action}>{icon&&<Icon name={icon} size={23}/>}<span>{label}</span></FocusButton>;}
    function styleButton(f){return button(DANMAKU_FIELDS[f].label+'：'+danmakuFieldValue(f,settings),()=>openPanel(f==='types'?'types':'opt-'+f));}
    const matched=dmSources.find(s=>s.match?.episodeName),dmSummary=[dmInfo,matched&&cleanTitle(matched.match.subjectName)+' · '+matched.match.episodeName].filter(Boolean).join(' · ');
    return <div className="player-control-zone">
          {!panel?<div className="player-control-row">
            {button(paused?'播放':'暂停',toggle,'live')}{button('下一集',()=>{save();onNext();},'remix')}{button('选集',()=>openPanel('episodes'),'book')}{button('切换线路',()=>openPanel('channels'),'remix')}{button('重试',start,'refresh')}{button(settings.danmaku?'弹幕开':'弹幕关',()=>onSettings({danmaku:!settings.danmaku}),'chat')}{button('弹幕设置',()=>openPanel('danmaku'),'settings')}{button(speed+'×',()=>openPanel('speed'))}{button('退出播放',close)}
          </div>:<ContentScroller className="player-panel" spotlightId={'panel-'+panel}><div className="panel-title"><div className="panel-heading"><h2>{panelTitle(panel)}</h2>{note&&<p className="panel-description">{note}</p>}{panelError&&<p className="error-text">{dmError}</p>}</div>{button(panelHistory.current.length>1?'返回上一级':'返回控制栏',hidePanel)}</div>
            {panel==='episodes'&&<div className="player-episode-grid">{(channels[channelIndex]?.episodes||[]).map(ep=>button(ep.name,()=>{save();onEpisode(ep);},null,ep.id===episode.id?'active':''))}</div>}
            {panel==='channels'&&<div className="player-channel-grid">{channels.map((ch,i)=>button(ch.name,()=>{save();onSwitchChannel(i);},null,i===channelIndex?'active':''))}</div>}
            {panel==='speed'&&<div className="player-settings-grid">{[[0.75,'0.75×'],[1,'1.0× · 正常'],[1.25,'1.25×'],[1.5,'1.5×'],[2,'2.0×']].map(([v,label])=>button(label,()=>applySpeed(v),null,speed===v?'active':''))}</div>}
            {panel==='danmaku'&&<>
              <ScrollGroup className="panel-section"><h3 className="panel-section-title">本集弹幕</h3><p className="panel-status">{dmSummary}</p>
                <div className="player-settings-grid">{button('匹配弹幕…',()=>openPanel('customMatch'))}{button('提前 1 秒',()=>adjustOffset(-1))}<span className="offset-value">偏移 {offset} 秒</span>{button('延后 1 秒',()=>adjustOffset(1))}{button('平台与条数…',()=>openPanel('sources'))}</div></ScrollGroup>
              <ScrollGroup className="panel-section"><h3 className="panel-section-title">常用样式<small>对所有番剧生效，与设置同步</small></h3>
                <div className="player-settings-grid">{DANMAKU_COMMON.map(styleButton)}{button('更多样式…',()=>openPanel('danmakuMore'))}</div></ScrollGroup>
            </>}
            {panel==='danmakuMore'&&DANMAKU_GROUPS.map(g=>{const rest=g.fields.filter(f=>!DANMAKU_COMMON.includes(f));return rest.length>0&&<ScrollGroup key={g.title} className="panel-section"><h3 className="panel-section-title">{g.title}</h3><div className="player-settings-grid">{rest.map(styleButton)}</div></ScrollGroup>;})}
            {panel.startsWith('opt-')&&(()=>{const field=panel.slice(4),f=DANMAKU_FIELDS[field];return <div className="player-settings-grid">{DANMAKU_OPTIONS[field].map(o=>button(o.label,()=>{onSettings({[f.key]:o.value});hidePanel();},null,matchOptionValue(settings[f.key],o.value)?'active':''))}</div>;})()}
            {panel==='types'&&<div className="player-settings-grid">{DANMAKU_TYPES.map(t=>button(t.label+'：'+(t.on(settings)?'开启':'关闭'),()=>onSettings(danmakuTypePatch(t,settings)),null,t.on(settings)?'active':''))}</div>}
            {panel==='sources'&&<div className="player-source-list">{dmSources.map(s=>{const pref=sourcePrefs[s.id]||{enabled:true,shift:0},on=pref.enabled!==false;const status={notConfigured:'待配置服务',disabled:'已关闭',error:'加载失败',noMatch:'未匹配',empty:'暂无弹幕',ok:'已加载'}[s.status];return <ScrollGroup key={s.id} className="player-source"><h3>{s.name} · {s.count} 条 · {status}</h3>{s.match?.episodeName&&<p>{cleanTitle(s.match.subjectName)} · {s.match.episodeName}</p>}<div className="player-settings-grid">{button(on?'显示：开启':'显示：关闭',()=>sourceSetting(s.id,{enabled:!on}),null,on?'active':'')}{button('提前 1 秒',()=>sourceSetting(s.id,{shift:(pref.shift||0)-1}))}<span className="offset-value">偏移 {pref.shift||0} 秒</span>{button('延后 1 秒',()=>sourceSetting(s.id,{shift:(pref.shift||0)+1}))}</div></ScrollGroup>;})}</div>}
            {panel==='customMatch'&&<><FocusButton id="player-custom-auto" group="player" row={-1} className="player-button" onSelect={()=>{library.setCustomDanmakuMapping(subject,episode,null);loadDanmaku(subject.bgmId||library.mapping(subject));hidePanel();}}>恢复自动匹配</FocusButton><div className="player-match-list">{!customSubject?customSubjects.map(s=>button(s.name,()=>selectCustom(s))):<>{button('重新搜索番剧',findCustom)}{customEpisodes.map(ep=>button(ep.displayName||ep.episodeName||String(ep.number),()=>chooseCustom(ep)))}</>}</div></>}

          </ContentScroller>}
        </div>;
  },[showUi,panel,paused,speed,settings,offset,dmInfo,dmError,customBusy,customSubject,customSubjects,customEpisodes,dmSources,sourcePrefs,channels,channelIndex,episode,subject,sourceId,library,start,onSettings,onNext,onEpisode,onSwitchChannel,onClose]);
  return <FocusContainer spotlightId="player" spotlightRestrict="self-only" className="player-page" onMouseMove={show}>
    <video ref={videoRef} className="player-video" playsInline onLoadedMetadata={ready} onPlaying={()=>{setPaused(false);setMessage('');if(controlsRef.current)show();}} onPause={()=>{setPaused(true);save();show();}} onWaiting={()=>setMessage('正在缓冲…')} onTimeUpdate={()=>{}} onEnded={ended} onError={()=>{if(videoRef.current?.getAttribute('src')){setMessage(`此线路播放失败（${videoRef.current.error?.code||'未知'}），可切换线路重试`);setControls(true);}}}/>
    <div className="danmaku-wrap" style={{opacity:settings.danmakuOpacity}}><DanmakuLayer danmakus={danmakus} currentTime={current-offset} paused={paused} enabled={settings.danmaku} fontScale={settings.danmakuScale} settings={settings}/>{settings.danmaku&&topFixed.map((d,i)=><div key={'top-'+d.time+'-'+i} className="fixed-danmaku top" style={{...fixedStrokeStyle,color:dmLayout.enableColor?(d.color||'#fff'):'#fff',fontSize:Math.round((d.size||28)*dmLayout.fontScale),transform:`translateY(${i*dmLayout.trackHeight}px)`}}>{d.text}</div>)}{settings.danmaku&&bottomFixed.map((d,i)=><div key={'bot-'+d.time+'-'+i} className="fixed-danmaku bottom" style={{...fixedStrokeStyle,color:dmLayout.enableColor?(d.color||'#fff'):'#fff',fontSize:Math.round((d.size||28)*dmLayout.fontScale),transform:`translateY(${-i*dmLayout.trackHeight}px)`}}>{d.text}</div>)}</div>
    {seekHint&&<div className="seek-hint">{seekHint}</div>}
    {!controls&&seekHint&&<div className="seek-progress" role="status" aria-label="跳转进度"><span>{time(current)}</span><div className="seek-progress-track"><i style={{width:`${duration?Math.min(100,Math.max(0,current/duration*100)):0}%`}}/></div><span>{time(duration)}</span></div>}
    {message&&!panel&&<div className="player-message">{message}</div>}
    {showUi&&<div className={'player-ui'+(controls?' visible':'')}>
      <header className="player-heading"><FocusButton id="player-back" group="player" row={-1} className="player-back" onSelect={close} aria-label="退出播放">‹</FocusButton><div><h1>{subject.name}</h1><p>{episode.channelName} · {episode.name}</p></div><div className="player-dm-status">{dmInfo}</div></header>
      <div className="player-bottom">
        {countdown!==null&&<div className="next-countdown">{countdown} 秒后播放下一集 <FocusButton id="player-cancel-next" group="player" row={-1} onSelect={()=>{clearInterval(nextTimer.current);setCountdown(null);}}>取消</FocusButton></div>}
        <div className="player-time"><span>{time(current)}</span><PlaybackSlider id="player-progress" value={current} max={duration} onChange={value=>{videoRef.current.currentTime=value;setCurrent(value);}}/><span>{time(duration)}</span></div>
        {controlsMenu}<p className="player-help">控制栏隐藏时左右快进 / 快退 10 秒　·　OK 唤出控制栏，方向键选择按钮　·　返回收起，再按返回退出</p>
      </div>
    </div>}
  </FocusContainer>;
}
