import React,{useLayoutEffect,useReducer,useRef} from 'react';
import Button from '@enact/sandstone/Button';
import Item from '@enact/sandstone/Item';
import ImageItem from '@enact/sandstone/ImageItem';
import SandstoneIcon from '@enact/sandstone/Icon';
import InputField from '@enact/sandstone/Input/InputField';
import Scroller from '@enact/sandstone/Scroller';
import ContentContainerDecorator from '@enact/sandstone/Scroller/ContentContainerDecorator';
import Spinner from '@enact/sandstone/Spinner';
import ProgressBar from '@enact/sandstone/ProgressBar';
import Slider from '@enact/sandstone/Slider';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {coverThumbnail} from '../src/images.cjs';
import {useFocusable,isTopContentRow,eligible} from './focus';
import {remoteKey} from './navigation.cjs';

export const FocusContainer=SpotlightContainerDecorator('div');
// Resolve a left exit to the page's menu item, independent of its screen position.
export const PageFocusContainer=SpotlightContainerDecorator({leaveFor:{left:'.sidebar-item[aria-current="page"]'}},'div');
const ICONS={settings:'gear',tv:'tvguidefvp',home:'home',history:'timer',book:'list',remix:'repeatall',refresh:'refresh',live:'play',chat:'subtitle',search:'search',star:'star',play:'play',pause:'pause',arrow:'arrowlargeright',close:'closex',check:'check'};
export function Icon({name,size=32,className=''}){return <SandstoneIcon className={('fy-icon '+className).trim()} style={{fontSize:size,width:size,height:size,lineHeight:size+'px'}}>{ICONS[name]||name}</SandstoneIcon>;}
export function TextInput({id,inputRef,value,onChange,onSubmit,placeholder,type='text',className='',ariaLabel}){
 const {props}=useFocusable({id});
 const submit=useRef(false);
 useLayoutEffect(()=>{if(inputRef)inputRef.current=document.querySelector('[data-focus-id="'+id+'"] input');return()=>{if(inputRef)inputRef.current=null;};},[id,inputRef]);
 return <InputField {...props} className={'fy-input '+className} css={{bg:'input-bg',input:'input-text'}} value={value} type={type} placeholder={placeholder} aria-label={ariaLabel||placeholder} dismissOnEnter onChange={e=>onChange({target:{value:e.value}})} onDeactivate={()=>{
  if(submit.current){submit.current=false;setTimeout(()=>onSubmit?.(),0);}
 }} onKeyDown={e=>{
  if(e.nativeEvent?.isComposing||e.keyCode===229)return;
  const key=remoteKey(e);
  submit.current=key==='Enter'&&e.target.tagName==='INPUT'&&!e.target.readOnly&&!!onSubmit;
 }}/>
}
export function FocusSearchInput(props){return <TextInput {...props} className="search-field" ariaLabel="搜索番名" placeholder="搜索你想看的番剧"/>;}
export function FocusButton({id,row=0,col=0,group='content',onSelect,onNavigate,onLongPress,recoveryPriority=0,className='',children,disabled=false,...rest}){
 const {props}=useFocusable({id,row,col,group,onSelect,onNavigate,onLongPress,recoveryPriority,disabled});
 const list=/\b(settings-row|dialog-option|source-result)\b/.test(className);
 const isSettingsRow=/\bsettings-row\b/.test(className);
 const Control=list?Item:Button;
 return <Control {...props} {...rest} css={{bg:'control-bg',client:'control-client',itemContent:'control-item-content',content:'control-content',label:'control-label',slotBefore:'control-before',slotAfter:'control-after'}} role="button" disabled={disabled} className={'fy-button '+(list?'fy-item ':'')+className} minWidth={list?undefined:false} selected={className.split(' ').includes('active')} labelPosition={list?(isSettingsRow?'after':'below'):undefined}>{children}</Control>;
}
const placeholder='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420"><rect width="300" height="420" fill="#252525"/><path d="M105 160L205 210L105 260Z" fill="#888"/></svg>');
export function PosterCard({subject,row,col,onSelect,progress,actionLabel}){
 const id=`content-${row}-${col}`,{props}=useFocusable({id,row,col,onSelect,onNavigate:dir=>dir==='up'&&isTopContentRow(id)?(eligible('header-search')?'header-search':'header-source'):null});
 const label=actionLabel||(subject.date?subject.date.slice(0,4)+' · ':'')+(subject.episodeCount?'全 '+subject.episodeCount+' 集':subject.originalName||'查看剧集');
 return <article className="poster-entry"><ImageItem {...props} className="poster-control" role="button" orientation="vertical" src={subject.cover?coverThumbnail(subject.cover):placeholder} placeholder={placeholder} aria-label={subject.name} css={{image:'poster-art'}}/>
  <div className="poster-hover"><span className="poster-play-badge"><Icon name="play" size={26}/></span></div>
  <div className="poster-body"><strong>{subject.name}</strong><small>{label}</small></div>{subject.score>0&&<span className="score-badge">★ {Number(subject.score).toFixed(1)}</span>}{progress?.position>0&&<ProgressBar className="card-progress" css={{fill:'progress-fill'}} progress={Math.min(1,progress.position/progress.duration)}/>}
 </article>;
}
export function TextCard({subject,row,col,onSelect}){return <FocusButton id={`content-${row}-${col}`} row={row} col={col} onSelect={onSelect} className="source-result" slotBefore={<span className="source-result-icon"><Icon name="tv" size={30}/></span>} slotAfter={<Icon name="arrow" size={24}/>} label="查看线路与剧集">{subject.name}</FocusButton>;}
// Layout rule for scrolled content: text that describes a control lives in the same ScrollGroup as
// the control (a heading with its rows, a card with its buttons); page-level notes live in the fixed
// header instead. A ScrollGroup is Sandstone's ContentContainer: whenever focus lands inside it, the
// scroller positions the whole group, so its heading is revealed even when the focused row was already
// visible (e.g. moving up into a group whose heading sits above the viewport). Groups taller than the
// viewport fall back to revealing the focused control.
export const ScrollGroup=ContentContainerDecorator('div');
// Enact measures scroll bounds only when the Scroller itself re-renders. Content that grows
// inside a child's own state (subscriptions, async lists) would otherwise never become reachable.
export function ContentScroller({apiRef,children,className='content-scroller',spotlightId,...rest}){
 const body=useRef(null),[,remeasure]=useReducer(n=>n+1,0);
 useLayoutEffect(()=>{const el=body.current;if(!el||typeof ResizeObserver!=='function')return;let height=el.offsetHeight;const observer=new ResizeObserver(()=>{if(el.offsetHeight!==height){height=el.offsetHeight;remeasure();}});observer.observe(el);return()=>observer.disconnect();},[]);
 return <Scroller {...rest} spotlightId={spotlightId} className={className} direction="vertical" horizontalScrollbar="hidden" cbScrollTo={fn=>{if(apiRef)apiRef.current={set scrollTop(y){fn({position:{y},animate:false});}};}}><div ref={body} className="scroller-body">{children}</div></Scroller>;
}
export function PlaybackSlider({id,value,max,onChange}){const {props}=useFocusable({id,group:'player'});return <Slider {...props} className="player-progress" css={{fill:'slider-fill',bar:'slider-bar',knob:'slider-knob'}} value={Math.min(value,max||0)} min={0} max={max||1} step={10} onChange={e=>onChange(e.value)} aria-label="播放进度"/>;}
export function Empty({title,children}){return <div className="empty-state"><Icon name="tv" size={64}/><h2>{title}</h2><p>{children}</p></div>;}
export function Loading({text='正在加载…'}){return <div className="loading-state"><Spinner className="loading-spinner">{text}</Spinner></div>;}
