import React,{useState,useLayoutEffect} from 'react';
import {coverThumbnail} from '../src/images.cjs';
import Icon from './vendor/bilitv/components/Icon';
import {useFocusable,getCurrentFocusId,moveFocus} from './vendor/bilitv/hooks/useFocus';
import {remoteKey} from './navigation.cjs';
export {Icon};
export function FocusSearchInput({id,inputRef,value,onChange,onSubmit}){
 const [editing,setEditing]=useState(false);
 const {props}=useFocusable({id,row:0,col:0,group:'content',onSelect:()=>setEditing(true)});
 useLayoutEffect(()=>{if(editing)inputRef.current?.focus();},[editing]);
 function keyDown(e){
  if(e.nativeEvent.isComposing||e.keyCode===229)return;const key=remoteKey(e);
  if(key==='Enter'){e.preventDefault();e.stopPropagation();e.target.blur();onSubmit();}
  else if(key==='ArrowDown'){e.preventDefault();e.stopPropagation();e.target.blur();moveFocus('down');}
 }
 return <div {...props} role="button" aria-label="搜索番名" className={`search-input-wrap search-field ${getCurrentFocusId()===id?'focused':''}`} onClick={e=>{if(!editing)props.onClick(e);}}>
  <Icon name="search" size={28}/><input ref={inputRef} aria-label="番名" value={value} onChange={onChange} placeholder="搜索你想看的番剧" readOnly={!editing} tabIndex={-1} onBlur={()=>setEditing(false)} onKeyDown={keyDown}/>
 </div>;
}
export function FocusButton({id,row=0,col=0,group='content',onSelect,onNavigate,onLongPress,recoveryPriority=0,className='',children,disabled=false,...rest}){
  const {props}=useFocusable({id,row,col,group,onSelect:disabled?undefined:onSelect,onNavigate,onLongPress,recoveryPriority,disabled});
  return <button type="button" {...props} {...rest} disabled={disabled} className={`${className} ${getCurrentFocusId()===id?'focused':''}`}>{children}</button>;
}
export function PosterCard({subject,row,col,onSelect,progress,actionLabel}){
  return <FocusButton id={`content-${row}-${col}`} row={row} col={col} className="poster-card" onSelect={onSelect} aria-label={subject.name}>
    <div className="poster-art">{subject.cover?<img src={coverThumbnail(subject.cover)} alt="" loading="lazy" decoding="async" onError={e=>{e.currentTarget.style.display='none';}}/>:<div className="poster-placeholder"><Icon name="tv" size={58}/></div>}
      {subject.score>0&&<span className="score-badge">{Number(subject.score).toFixed(1)}</span>}
      {progress&&progress.position>0&&<div className="card-progress"><i style={{width:`${Math.min(100,progress.position/progress.duration*100)}%`}}/></div>}
      <div className="poster-hover"><Icon name="live" size={42}/></div>
    </div><strong>{subject.name}</strong><small>{actionLabel||(subject.date?subject.date.slice(0,4)+' · ':'')+(subject.episodeCount?'全 '+subject.episodeCount+' 集':subject.originalName||'查看剧集')}</small>
  </FocusButton>;
}
export function TextCard({subject,row,col,onSelect}){return <FocusButton id={`content-${row}-${col}`} row={row} col={col} onSelect={onSelect} className="source-result"><span className="source-result-icon"><Icon name="tv" size={35}/></span><span><strong>{subject.name}</strong><small>查看线路与剧集</small></span><span className="arrow">›</span></FocusButton>;}
export function Empty({title,children}){return <div className="empty-state"><Icon name="tv" size={54}/><h2>{title}</h2><p>{children}</p></div>;}
export function Loading({text='正在加载…'}){return <div className="loading-state"><i className="loading-spinner"/>{text}</div>;}
