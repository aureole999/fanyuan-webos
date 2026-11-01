import {useLayoutEffect,useRef} from 'react';
import Spotlight from '@enact/spotlight';
import {remoteKey,recoverTarget} from './navigation.cjs';

const registry=new Map(),listeners=new Set(),memories=new Map(),scopes=[];
let currentId=null,context='home',pending=null,pendingTimer=null,recoveryTimer=null;
let customHandler=null,initialized=false,pointerFocus=false,lastSidebar='sidebar-home';
let hold=null;
const element=id=>document.querySelector('[data-focus-id="'+CSS.escape(String(id))+'"]');
const scope=()=>scopes.length?scopes[scopes.length-1].group:null;
const isHeader=id=>typeof id==='string'&&id.startsWith('header-');
export function eligible(id){
 const meta=registry.get(id),el=element(id);
 return !!meta&&!meta.disabled&&(meta.group!=='content'||isHeader(id)||meta.context===context)&&(!scope()||scope()===meta.group)&&!!el&&!!el.getClientRects().length&&!el.closest('[aria-hidden="true"],[hidden]');
}
export function isTopContentRow(id){
 if(isHeader(id))return true;
 const meta=registry.get(id);if(!meta||meta.group!=='content')return false;
 for(const [k,m] of registry)if(m.group==='content'&&m.context===context&&!isHeader(k)&&m.row<meta.row&&eligible(k))return false;
 return true;
}
function noteFocus(id){
 if(!id||id===currentId)return;
 currentId=id;const meta=registry.get(id);if(!meta)return;
 pointerFocus=Spotlight.getPointerMode();
 if(meta.group==='content')memories.set(context,id);
 if(meta.group==='sidebar')lastSidebar=id;
 if(hold&&hold.id!==id)clearHold();
 listeners.forEach(fn=>fn(id));
}
export function getCurrentFocusId(){return Spotlight.getCurrent()?.closest('[data-focus-id]')?.dataset.focusId||currentId;}
export function setFocus(id){if(!eligible(id))return false;claimRemoteFocus();const el=element(id);const ok=Spotlight.focus(el);if(ok)noteFocus(id);return ok;}
export function claimRemoteFocus(){Spotlight.setPointerMode(false);pointerFocus=false;}
export function isPointerFocus(){return pointerFocus;}
export function setLastSidebarFocus(id){lastSidebar=id;}
export function onFocusChange(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export function cancelContentFocus(){pending=null;clearTimeout(pendingTimer);}
export function setContentContext(next){if(context!==next){cancelContentFocus();context=next;}}
export function resetContentMemory(){memories.delete(context);}
function resolveContent(){
 if(!pending||pending.context!==context||Date.now()>pending.until)return;
 const remembered=memories.get(context);
 const id=!isHeader(remembered)&&eligible(remembered)?remembered:eligible('content-0-0')?'content-0-0':Array.from(registry).find(([key,m])=>!isHeader(key)&&m.group==='content'&&eligible(key))?.[0]||(context==='history'&&(eligible('header-clear-history')?'header-clear-history':eligible('header-search')?'header-search':'header-source'));
 if(id&&eligible(id)){cancelContentFocus();setFocus(id);}
}
export function focusFirstContent(maxMs=15000){cancelContentFocus();pending={context,until:Date.now()+maxMs};pendingTimer=setTimeout(resolveContent,0);}
export function focusSidebar(){setFocus(eligible(lastSidebar)?lastSidebar:'sidebar-home');}
export function moveFocus(direction){claimRemoteFocus();return Spotlight.move(direction);}
export function activateFocusScope(group,initialId){
 const entry={group,previous:getCurrentFocusId()};scopes.push(entry);cancelContentFocus();clearHold();
 const timer=setTimeout(()=>{if(scope()===group)setFocus(initialId);},0);
 return()=>{clearTimeout(timer);const i=scopes.indexOf(entry),top=i===scopes.length-1;if(i>=0)scopes.splice(i,1);if(top)setTimeout(()=>{if(!setFocus(entry.previous))focusFirstContent();},0);};
}
export function setCustomKeyHandler(fn){customHandler=fn;}
function recover(anchor){
 if(Spotlight.getCurrent()?.matches('.spottable'))return;
 const entries=new Map(Array.from(registry).filter(([id])=>eligible(id)));
 const id=recoverTarget(entries,scope()||anchor?.group||'content',anchor);
 if(id)setFocus(id);
}
function leftmostHeader(){
 let best=null,left=Infinity;
 for(const k of registry.keys()){if(!isHeader(k)||!eligible(k))continue;const x=element(k).getBoundingClientRect().left;if(x<left){left=x;best=k;}}
 return best;
}
function clearHold(){if(hold)clearTimeout(hold.timer);hold=null;}
export function initKeyboardNav(){
 if(initialized)return;initialized=true;
 window.addEventListener('focusin',e=>noteFocus(e.target.closest?.('[data-focus-id]')?.dataset.focusId));
 window.addEventListener('blur',clearHold);
 window.addEventListener('keydown',e=>{
  const key=remoteKey(e),editable=e.target?.matches?.('input:not([readonly]),textarea,[contenteditable="true"]');
  if(editable)return;
  if(customHandler&&customHandler(e)){e.stopImmediatePropagation();return;}
  if(['Escape','GoBack','Backspace'].includes(key)){
   e.preventDefault();e.stopImmediatePropagation();cancelContentFocus();clearHold();
   if(!e.repeat)window.dispatchEvent(new CustomEvent('tv-back'));return;
  }
  if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(key))return;
  claimRemoteFocus();cancelContentFocus();
  const id=getCurrentFocusId(),meta=registry.get(id);
  // Left-edge navigation is an application action, not a geometric search: column 0, or the
  // leftmost header control, returns to the sidebar. Other controls without a grid column are
  // covered by PageFocusContainer's leaveFor.
  if(key==='ArrowLeft'&&meta?.group==='content'&&!scope()&&(isHeader(id)?leftmostHeader()===id:meta.col===0)){
   e.preventDefault();e.stopImmediatePropagation();window.dispatchEvent(new CustomEvent('tv-enter-sidebar'));return;
  }
  if(key==='ArrowRight'&&meta?.group==='sidebar'&&!scope()){
   e.preventDefault();e.stopImmediatePropagation();window.dispatchEvent(new CustomEvent('tv-enter-content',{detail:id}));return;
  }
  if(key==='Enter'&&meta?.onLongPress){
   e.preventDefault();e.stopImmediatePropagation();
   if(!hold&&!e.repeat){hold={id,fired:false,timer:setTimeout(()=>{if(hold){hold.fired=true;registry.get(id)?.onLongPress?.();}},800)};}
  }
 },true);
 window.addEventListener('keyup',e=>{
  if(remoteKey(e)!=='Enter'||!hold)return;
  e.preventDefault();e.stopImmediatePropagation();const {id,fired}=hold;clearHold();if(!fired)registry.get(id)?.onSelect?.();
 },true);
 window.__focusState=()=>({current:getCurrentFocusId(),registered:registry.has(getCurrentFocusId()),scope:scope(),custom:!!customHandler,paused:Spotlight.isPaused(),container:Spotlight.getActiveContainer(),pointer:Spotlight.getPointerMode(),targets:Array.from(registry,([id,m])=>({id,group:m.group})).filter(x=>eligible(x.id))});
}
export function useFocusable({id,row=0,col=0,group='content',onSelect,onLongPress,onNavigate,recoveryPriority=0,disabled=false}){
 const actions=useRef({});actions.current={onSelect,onLongPress,onNavigate};
 useLayoutEffect(()=>{
  const meta={row,col,group,context,recoveryPriority,disabled,onSelect:()=>actions.current.onSelect?.(),onLongPress:onLongPress?()=>actions.current.onLongPress?.():null};
  registry.set(id,meta);if(pending&&group==='content'){clearTimeout(pendingTimer);pendingTimer=setTimeout(resolveContent,0);}
  return()=>{registry.delete(id);if(currentId===id){currentId=null;clearTimeout(recoveryTimer);recoveryTimer=setTimeout(()=>recover(meta),0);}};
 },[id,row,col,group,recoveryPriority,disabled,!!onLongPress]);
 const navigate=direction=>e=>{const next=actions.current.onNavigate?.(direction);if(next){e.preventDefault();setFocus(next);}};
 return {props:{'data-focus-id':id,'data-focus-group':group,spotlightId:id,onFocus:()=>noteFocus(id),onClick:e=>{cancelContentFocus();noteFocus(id);actions.current.onSelect?.(e);},onSpotlightUp:navigate('up'),onSpotlightDown:navigate('down'),onSpotlightLeft:navigate('left'),onSpotlightRight:navigate('right')},isFocused:getCurrentFocusId()===id};
}
