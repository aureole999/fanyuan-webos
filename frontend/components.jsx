import React,{useLayoutEffect,useReducer,useRef} from 'react';
import Button from '@enact/sandstone/Button';
import Item from '@enact/sandstone/Item';
import SandstoneIcon from '@enact/sandstone/Icon';
import InputField from '@enact/sandstone/Input/InputField';
import Scroller from '@enact/sandstone/Scroller';
import ContentContainerDecorator from '@enact/sandstone/Scroller/ContentContainerDecorator';
import Spinner from '@enact/sandstone/Spinner';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spottable from '@enact/spotlight/Spottable';
import {coverThumbnail} from '../src/images.cjs';
import {useFocusable,isTopContentRow,eligible} from './focus';
import {remoteKey} from './navigation.cjs';

export const FocusContainer=SpotlightContainerDecorator('div');
// Left/right stay in the row; the player moves focus between the row and the progress bar itself.
export const ControlRow=SpotlightContainerDecorator({restrict:'self-only'},'div');
// Resolve a left exit to the page's menu item, independent of its screen position.
export const PageFocusContainer=SpotlightContainerDecorator({leaveFor:{left:'.sidebar-item[aria-current="page"]'}},'div');
const ICONS={pause:'pause',next:'skip',episodes:'list',channel:'channel',speed:'playspeed',back:'arrowlargeleft',settings:'gear',tv:'tvguidefvp',home:'home',history:'timer',book:'list',remix:'repeatall',refresh:'refresh',live:'play',chat:'subtitle',search:'search',star:'star',play:'play',pause:'pause',arrow:'arrowlargeright',close:'closex',check:'check'};
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
// A settings row without Sandstone's Item stack (Skinnable, Marquee per text, layout cells, …).
// Mounting each Sandstone Item cost ~30 ms on the C1; this keeps only Spottable, which provides
// spotlight navigation, onSpotlight* handlers and OK-to-click, and reuses the fy-button classes so
// focus styling stays identical. Long text ellipsizes instead of marqueeing.
const SpottableDiv=Spottable('div');
// LG voice control ("select …") reads these attributes; Sandstone controls add them automatically.
function voice(...labels){return {'data-webos-voice-intent':'Select','data-webos-voice-labels':JSON.stringify(labels.filter(Boolean))};}
export const SettingsRow=React.memo(function SettingsRow({id,row,label,value,onSelect}){
 const {props}=useFocusable({id,row,col:0,onSelect});
 return <SpottableDiv {...props} {...voice(label)} role="button" aria-label={label+(value?'，'+value:'')} className="fy-button fy-item settings-row lite-row"><div className="control-bg"/><span className="lite-title">{label}</span>{value!=null&&value!==''&&<span className="control-label">{value}</span>}<span className="control-after"><Icon name="arrow"/></span></SpottableDiv>;
});
const placeholder='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420"><rect width="300" height="420" fill="#252525"/><path d="M105 160L205 210L105 260Z" fill="#888"/></svg>');
// Poster card without Sandstone's ImageItem stack (21 components: two ImageItem layers, Column,
// Cell, ResponsiveImageDecorator, Image, Marquee-less but still Skinnable/Touchable). Only
// Spottable remains. The art is a background so the cover covers the placeholder while it loads.
const cssUrl=u=>'url("'+String(u).replace(/["\\\n]/g,encodeURIComponent)+'")';
// A button without Sandstone's Button stack (23 components: Tooltip, Marquee, Touchable, …). Same
// fy-button classes, so focus and state styling are shared with every other control.
export function LiteButton({id,group='content',row=0,col=0,onSelect,className='',label,disabled=false,children,...rest}){
 const {props}=useFocusable({id,row,col,group,onSelect,disabled});
 return <SpottableDiv {...props} {...voice(label)} role="button" aria-label={rest['aria-label']||label} aria-disabled={disabled||undefined} spotlightDisabled={disabled} className={'fy-button lite-btn '+(disabled?'disabled ':'')+className}><div className="control-bg"/>{children}</SpottableDiv>;
}
export function PosterCard({subject,row,col,onSelect,progress,actionLabel}){
 const id=`content-${row}-${col}`,{props}=useFocusable({id,row,col,onSelect,onNavigate:dir=>dir==='up'&&isTopContentRow(id)?(eligible('header-search')?'header-search':'header-source'):null});
 const label=actionLabel||(subject.date?subject.date.slice(0,4)+' · ':'')+(subject.episodeCount?'全 '+subject.episodeCount+' 集':subject.originalName||'查看剧集');
 const art=(subject.cover?cssUrl(coverThumbnail(subject.cover))+',':'')+cssUrl(placeholder);
 return <article className="poster-entry"><SpottableDiv {...props} {...voice(subject.name)} className="poster-control" role="button" aria-label={subject.name}><div className="poster-art" style={{backgroundImage:art}}/></SpottableDiv>
  <div className="poster-hover"><span className="poster-play-badge"><Icon name="play" size={26}/></span></div>
  <div className="poster-body"><strong>{subject.name}</strong><small>{label}</small></div>{subject.score>0&&<span className="score-badge">★ {Number(subject.score).toFixed(1)}</span>}{progress?.position>0&&<div className="card-progress"><div className="card-progress-fill progress-fill" style={{width:Math.min(100,progress.position/progress.duration*100)+'%'}}/></div>}
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
// Progress bar for the player. Arrow keys are handled by the player (preview first, then seek),
// so this is a plain focusable track: played fill, preview marker, knob and a time bubble.
// A pointer click on the track seeks directly (Magic Remote).
export function ScrubBar({id,value,max,preview,bubble,onSeek,onFocusChange}){
 const {props}=useFocusable({id,group:'player'});
 const pct=v=>max>0?Math.min(100,Math.max(0,v/max*100)):0,at=pct(preview!=null?preview:value);
 const seekAt=e=>{const r=e.currentTarget.getBoundingClientRect();if(r.width>0&&max>0)onSeek?.(Math.min(1,Math.max(0,(e.clientX-r.left)/r.width))*max);};
 return <SpottableDiv {...props} onFocus={e=>{props.onFocus(e);onFocusChange?.(true);}} onBlur={()=>onFocusChange?.(false)} role="slider" aria-label="播放进度" aria-valuemin={0} aria-valuemax={Math.round(max||0)} aria-valuenow={Math.round(preview!=null?preview:value)} className={'scrub-bar'+(preview!=null?' previewing':'')}>
  <div className="scrub-track" onClick={seekAt}><div className="scrub-fill" style={{width:pct(value)+'%'}}/>{preview!=null&&<div className="scrub-range" style={{left:Math.min(pct(value),at)+'%',width:Math.abs(at-pct(value))+'%'}}/>}<div className="scrub-knob" style={{left:at+'%'}}>{bubble&&<span className="scrub-bubble">{bubble}</span>}</div></div>
 </SpottableDiv>;
}
export function Empty({title,children}){return <div className="empty-state"><Icon name="tv" size={64}/><h2>{title}</h2><p>{children}</p></div>;}
export function Loading({text='正在加载…'}){return <div className="loading-state"><Spinner className="loading-spinner">{text}</Spinner></div>;}
