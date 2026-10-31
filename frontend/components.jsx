import React,{useLayoutEffect,useRef} from 'react';
import Button from '@enact/sandstone/Button';
import Item from '@enact/sandstone/Item';
import ImageItem from '@enact/sandstone/ImageItem';
import SandstoneIcon from '@enact/sandstone/Icon';
import InputField from '@enact/sandstone/Input/InputField';
import Scroller,{ContentContainerDecorator} from '@enact/sandstone/Scroller';
import Spinner from '@enact/sandstone/Spinner';
import ProgressBar from '@enact/sandstone/ProgressBar';
import Slider from '@enact/sandstone/Slider';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {coverThumbnail} from '../src/images.cjs';
import {useFocusable} from './focus';
import {remoteKey} from './navigation.cjs';

export const FocusContainer=SpotlightContainerDecorator('div');
export const ScrollTarget=ContentContainerDecorator('div');
const PosterArticle=ContentContainerDecorator('article');
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
 const {props}=useFocusable({id:`content-${row}-${col}`,row,col,onSelect});
 const label=actionLabel||(subject.date?subject.date.slice(0,4)+' · ':'')+(subject.episodeCount?'全 '+subject.episodeCount+' 集':subject.originalName||'查看剧集');
 return <PosterArticle className="poster-entry"><ImageItem {...props} className="poster-control" role="button" orientation="vertical" src={subject.cover?coverThumbnail(subject.cover):placeholder} placeholder={placeholder} aria-label={subject.name} css={{image:'poster-art'}}/>
  <div className="poster-hover"><span className="poster-play-badge"><Icon name="play" size={26}/></span></div>
  <div className="poster-body"><strong>{subject.name}</strong><small>{label}</small></div>{subject.score>0&&<span className="score-badge">★ {Number(subject.score).toFixed(1)}</span>}{progress?.position>0&&<ProgressBar className="card-progress" css={{fill:'progress-fill'}} progress={Math.min(1,progress.position/progress.duration)}/>}
 </PosterArticle>;
}
export function TextCard({subject,row,col,onSelect}){return <FocusButton id={`content-${row}-${col}`} row={row} col={col} onSelect={onSelect} className="source-result" slotBefore={<span className="source-result-icon"><Icon name="tv" size={30}/></span>} slotAfter={<Icon name="arrow" size={24}/>} label="查看线路与剧集">{subject.name}</FocusButton>;}
export function ContentScroller({apiRef,children,className='content-scroller',spotlightId,...rest}){
 return <Scroller {...rest} spotlightId={spotlightId} className={className} direction="vertical" horizontalScrollbar="hidden" focusableScrollbar={false} scrollToContentContainerOnFocus cbScrollTo={fn=>{if(apiRef)apiRef.current={set scrollTop(y){fn({y,animate:false});}};}}>{children}</Scroller>;
}
export function PlaybackSlider({id,value,max,onChange}){const {props}=useFocusable({id,group:'player'});return <Slider {...props} className="player-progress" css={{fill:'slider-fill',bar:'slider-bar',knob:'slider-knob'}} value={Math.min(value,max||0)} min={0} max={max||1} step={10} onChange={e=>onChange(e.value)} aria-label="播放进度"/>;}
export function Empty({title,children}){return <div className="empty-state"><Icon name="tv" size={64}/><h2>{title}</h2><p>{children}</p></div>;}
export function Loading({text='正在加载…'}){return <div className="loading-state"><Spinner>{text}</Spinner></div>;}
