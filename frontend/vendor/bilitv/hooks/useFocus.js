import { useLayoutEffect, useCallback, useRef } from 'react';
import { markAfterPaint } from '../utils/perf';
import {navigateTarget,findGroupTarget,remoteKey,recoverTarget} from '../../../navigation.cjs';
import {geometryNodes,elementGeometry,observeGeometry,invalidateGeometry,revealElement} from '../../../spatial-dom';

const focusRegistry = new Map();
let currentFocusId = null;
let contentContext = 'recommend';
const contentMemory = new Map();
let pendingContentFocus = null;
let contentFocusTimer = null;
let recoveryTimer = null, focusOwner = 'sidebar';
const scopes=[];
function activeScope(){return scopes.length?scopes[scopes.length-1].group:null;}
function allowed(id){const d=focusRegistry.get(id);return !!d&&!d.disabled&&(!activeScope()||d.group===activeScope())&&!!elementGeometry(d.ref?.current);}
export function activateFocusScope(group,initialId){
 const scope={group,previous:currentFocusId};scopes.push(scope);cancelContentFocus();clearHold();
 elementOf(currentFocusId)?.classList.remove('focused');currentFocusId=null;focusOwner=group;
 const timer=setTimeout(()=>{if(scopes[scopes.length-1]===scope){if(allowed(initialId))setFocus(initialId);else recoverFocus();}},0);
 return()=>{clearTimeout(timer);const i=scopes.indexOf(scope),top=i===scopes.length-1;if(i>=0)scopes.splice(i,1);
  if(top){elementOf(currentFocusId)?.classList.remove('focused');currentFocusId=null;const previous=scope.previous;setTimeout(()=>{if(allowed(previous))setFocus(previous);else{focusOwner=activeScope()||'content';recoverFocus();}},0);}
 };
}

if (typeof window !== 'undefined') window.__focusState = () => ({
  current: currentFocusId, registered: focusRegistry.has(currentFocusId),
  pending: pendingContentFocus?.context || null, custom: !!customKeyHandler, scope:activeScope(),
  targets:geometryNodes(focusRegistry,activeScope()||focusRegistry.get(currentFocusId)?.group||'content').map(n=>({id:n.id,rect:n.rect})),
});

export function cancelContentFocus() {
  pendingContentFocus = null;
  clearTimeout(contentFocusTimer);
}

export function setContentContext(key) {
  if (contentContext === key) return;
  cancelContentFocus();
  contentContext = key;
  lastAnchor = null;
}

export function resetContentMemory() { contentMemory.delete(contentContext); }

function rememberedContent() {
  const id = contentMemory.get(contentContext);
  if (id && id!=='header-source' && allowed(id)) return id;
  if (allowed('content-0-0')) return 'content-0-0';
  for (const [key, data] of focusRegistry) {
    if (key!=='header-source' && data.group === 'content' && data.row >= 0 && allowed(key)) return key;
  }
  if(document.querySelector('.content-scroller .loading-state'))return null;
  return allowed('header-source')?'header-source':null;
}

function resolveContentFocus() {
  const request = pendingContentFocus;
  if (!request || request.context !== contentContext || Date.now() > request.until) return;
  const id = rememberedContent();
  if (id) { cancelContentFocus(); setFocus(id); }
}

let lastFocusFromPointer = false;
export function isPointerFocus() { return lastFocusFromPointer; }

let pointerEnabled = true;
let hoverDriven = false;
export function isHoverDriven() { return hoverDriven; }

export function claimRemoteFocus() {
  pointerEnabled = false;
  lastFocusFromPointer = false;
}

let lastSidebarFocus = 'sidebar-0-0';
let lastAnchor = null;

function elementOf(id) { return focusRegistry.get(id)?.ref?.current || null; }

let followerEl = null;
let followerTimer = null;
function glideFocusFollower(prevEl, newEl, sameGroup) {
  if (typeof document === 'undefined' || !sameGroup || !prevEl || !newEl || prevEl === newEl) return;
  if (!prevEl.isConnected || !newEl.isConnected) return;
  const frame = document.getElementById('tv-frame');
  if (!frame) return;
  const fr = frame.getBoundingClientRect();
  const scale = fr.width / 1920 || 1;
  const r1 = prevEl.getBoundingClientRect();
  const r2 = newEl.getBoundingClientRect();
  if (!r1.width || !r1.height || !r2.width || !r2.height) return;
  if (!followerEl || !followerEl.isConnected) {
    followerEl = document.createElement('div');
    followerEl.id = 'focus-follower';
    followerEl.setAttribute('aria-hidden', 'true');
    frame.appendChild(followerEl);
  }
  clearTimeout(followerTimer);
  const br1 = getComputedStyle(prevEl).borderRadius || '14px';
  const br2 = getComputedStyle(newEl).borderRadius || '14px';
  const x1 = Math.round((r1.left - fr.left) / scale);
  const y1 = Math.round((r1.top - fr.top) / scale);
  const w1 = Math.round(r1.width / scale);
  const h1 = Math.round(r1.height / scale);
  const x2 = Math.round((r2.left - fr.left) / scale);
  const y2 = Math.round((r2.top - fr.top) / scale);
  const w2 = Math.round(r2.width / scale);
  const h2 = Math.round(r2.height / scale);
  followerEl.style.transition = 'none';
  followerEl.style.opacity = '0.9';
  followerEl.style.borderRadius = br1;
  followerEl.style.width = w1 + 'px';
  followerEl.style.height = h1 + 'px';
  followerEl.style.transform = `translate3d(${x1}px, ${y1}px, 0)`;
  void followerEl.offsetWidth;
  followerEl.style.transition = 'transform 175ms cubic-bezier(0.22, 1, 0.36, 1), width 175ms cubic-bezier(0.22, 1, 0.36, 1), height 175ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 175ms ease, opacity 175ms ease';
  followerEl.style.borderRadius = br2;
  followerEl.style.width = w2 + 'px';
  followerEl.style.height = h2 + 'px';
  followerEl.style.transform = `translate3d(${x2}px, ${y2}px, 0)`;
  followerEl.style.opacity = '0';
  followerTimer = setTimeout(() => { if (followerEl) followerEl.style.opacity = '0'; }, 190);
}

function applyFocus(newId) {
  const prevId = currentFocusId, meta = focusRegistry.get(newId), prevMeta = focusRegistry.get(prevId);
  const newEl = elementOf(newId), prevEl = elementOf(prevId);
  if(newEl&&!hoverDriven)revealElement(newEl);
  if(!hoverDriven)glideFocusFollower(prevEl, newEl, prevMeta && meta && prevMeta.group === meta.group);
  currentFocusId = newId;
  if(meta)focusOwner=meta.group;
  if (meta?.group === 'content') contentMemory.set(contentContext, newId);
  if (meta?.group === 'sidebar') lastSidebarFocus = newId;
  if (meta && !hoverDriven) lastAnchor = {id:newId,group:meta.group,row:meta.row,col:meta.col};
  if (prevEl) prevEl.classList.remove('focused');
  if (newEl) newEl.classList.add('focused');
  const active = document.activeElement;
  if (active && active !== newEl && /^(INPUT|TEXTAREA)$/.test(active.tagName)) active.blur();
  globalListeners.forEach(fn => fn(newId));
}

export function registerFocusable(id, data) {
  focusRegistry.get(id)?.stopObserving?.();
  data.stopObserving=data.ref?.current?observeGeometry(data.ref.current):()=>{};
  focusRegistry.set(id, data);
  const element = data.ref?.current;
  if (element) {
    if (currentFocusId === id) element.classList.add('focused');
    else element.classList.remove('focused');
  }
  if (pendingContentFocus && data.group === 'content') {
    clearTimeout(contentFocusTimer);
    contentFocusTimer = setTimeout(resolveContentFocus, 0);
  }
}

export function unregisterFocusable(id) {
  const previous=focusRegistry.get(id);
  previous?.stopObserving?.();focusRegistry.delete(id);invalidateGeometry();
  if(currentFocusId===id){
    currentFocusId=null;
    clearTimeout(recoveryTimer);
    const context=contentContext;
    recoveryTimer=setTimeout(()=>{if(!currentFocusId&&!pendingContentFocus&&context===contentContext)recoverFocus(previous);},0);
  }
}

export function setFocus(id) {
  const entry = focusRegistry.get(id);
  if (!entry||!allowed(id)) return;
  if (id === currentFocusId && (hoverDriven || (lastAnchor?.group === entry.group && lastAnchor.row === entry.row && lastAnchor.col === entry.col))) return;
  cancelContentFocus();
  applyFocus(id);
}

function recoverFocus(anchor){
  const eligible=new Map(Array.from(focusRegistry).filter(([id])=>allowed(id)));
  let id=recoverTarget(eligible,activeScope()||focusOwner,anchor||lastAnchor);
  if(!id&&!activeScope()&&focusOwner!=='sidebar')id=recoverTarget(eligible,'content',null);
  if(id)setFocus(id);
}

export function getCurrentFocusId() { return currentFocusId; }

export function focusFirstContent(maxMs = 15000) {
  cancelContentFocus();
  pendingContentFocus = { context: contentContext, until: Date.now() + maxMs };
  contentFocusTimer = setTimeout(resolveContentFocus, 0);
}

export function focusSidebar() {
  let id = lastSidebarFocus;
  if (!id || !focusRegistry.has(id)) id = findInGroup('sidebar', 0);
  if (id) setFocus(id);
}

export function setLastSidebarFocus(id) {
  if (id) lastSidebarFocus = id;
}

const globalListeners = new Set();
export function onFocusChange(fn) {
  globalListeners.add(fn);
  return () => globalListeners.delete(fn);
}

function navigateGrid(fromId,direction){
 const group=focusRegistry.get(fromId)?.group;if(!group)return null;
 const nodes=geometryNodes(focusRegistry,group),from=nodes.find(n=>n.id===fromId);if(!from)return null;
 if(from.scrollRoot){
  const within=nodes.filter(n=>n.scrollRoot===from.scrollRoot);
  const next=navigateTarget(focusRegistry,fromId,direction,within);if(next)return next;
  if(direction==='left'||direction==='right')return null;
 }
 const horizontal=direction==='left'||direction==='right';
 const boxes=new Map();const visible=nodes.filter(n=>{if(horizontal&&n.scrollRoot!==from.scrollRoot)return false;if(n.id===fromId||!n.scrollRoot)return true;let b=boxes.get(n.scrollRoot);if(!b){b=n.scrollRoot.getBoundingClientRect();boxes.set(n.scrollRoot,b);}return n.rect.bottom>b.top&&n.rect.top<b.bottom;});
 return navigateTarget(focusRegistry,fromId,direction,visible);
}
export function moveFocus(direction){
 const from=focusRegistry.get(currentFocusId);if(!from){recoverFocus();return;}
 if(from.group==='sidebar'&&direction==='right'&&!activeScope()){window.dispatchEvent(new CustomEvent('tv-enter-content',{detail:currentFocusId}));return;}
 if(from.group==='sidebar'&&direction==='left')return;
 let next=navigateGrid(currentFocusId,direction);
 if(!next&&direction==='left'&&from.group==='content'&&!activeScope()){next=allowed(lastSidebarFocus)?lastSidebarFocus:findInGroup('sidebar',0);}
 if(next)setFocus(next);
}
function findInGroup(group, preferRow) { return findGroupTarget(focusRegistry, group, preferRow); }

let keyHandler = null;
let customKeyHandler = null;
export function setCustomKeyHandler(handler) { customKeyHandler = handler; }

const HOLD_MS = 800;
let hold = { id: null, timer: null, fired: false };
const elOf = elementOf;

function clearHold() {
  if (hold.timer) clearTimeout(hold.timer);
  if (hold.id) elOf(hold.id)?.classList.remove('holding');
  hold = { id: null, timer: null, fired: false };
}

function startHold(id) {
  if (hold.id) return;
  elOf(id)?.classList.add('holding');
  hold = {
    id, fired: false,
    timer: setTimeout(() => {
      hold.fired = true;
      elOf(id)?.classList.remove('holding');
      focusRegistry.get(id)?.onLongPress?.();
    }, HOLD_MS),
  };
}

function endHold() {
  if (!hold.id) return;
  const { id, fired } = hold;
  clearHold();
  if (!fired) focusRegistry.get(id)?.onSelect?.();
}

export function initKeyboardNav() {
  if (keyHandler) return;
  window.addEventListener('keyup', (e) => {
    if (remoteKey(e) === 'Enter') endHold();
  });
  window.addEventListener('blur', clearHold);
  onFocusChange(() => { if (hold.id && hold.id !== currentFocusId) clearHold(); });
  keyHandler = (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace', 'Escape', 'GoBack'].includes(e.key) || e.keyCode === 461) pointerEnabled = false;
    if (customKeyHandler && customKeyHandler(e)) return;
    const key = remoteKey(e);
    const editable = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
    if (editable) {
      if (e.keyCode === 461 || key === 'GoBack' || key === 'Escape') {
        e.preventDefault(); e.target.blur();
      }
      return;
    }

    if (e.keyCode === 461 || key === 'Backspace' || key === 'GoBack' || key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      cancelContentFocus(); clearHold();
      if (e.repeat) return;
      window.dispatchEvent(new CustomEvent('tv-back'));
      return;
    }

    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(key)) return;
    e.preventDefault();
    cancelContentFocus();
    lastFocusFromPointer = false;
    const keyT0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    if(!currentFocusId){recoverFocus();return;}
    if (key === 'Enter') {
      if (!currentFocusId) return;
      const entry = focusRegistry.get(currentFocusId);
      if (!entry) return;
      if (!entry.onLongPress) { if (!e.repeat) entry.onSelect?.(); return; }
      if (!e.repeat) startHold(currentFocusId);
      return;
    }

    const dir={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}[key];
    moveFocus(dir);markAfterPaint('focus-move',keyT0);
  };
  window.addEventListener('keydown', keyHandler);

  let pointerX = 960, pointerY = 540;
  window.addEventListener('mousemove', (e) => {
    const moved = pointerX !== e.clientX || pointerY !== e.clientY;
    pointerX = e.clientX; pointerY = e.clientY;
    if (moved && !pointerEnabled) {
      pointerEnabled = true;
      const item = e.target.closest?.('[data-focus-id]');
      if (item && (!customKeyHandler||activeScope())) {
        lastFocusFromPointer = true; hoverDriven = true;
        setFocus(item.dataset.focusId);
        hoverDriven = false;
      }
    }
  }, { passive: true });

  const NOTCH_MIN = 100;
  const STREAM_STEP = 200;
  let wheelAcc = 0;
  let lastWheelTs = 0;
  let lastStepTs = 0;
  const wheelDiag = (window.__wheelDiag = []);
  const diag = (dy, why, extra) => {
    wheelDiag.push({ t: Date.now() % 1000000, dy, why, ...(extra || {}) });
    if (wheelDiag.length > 200) wheelDiag.shift();
  };
  window.addEventListener('wheel', (e) => {
    pointerEnabled = true;
    if (customKeyHandler) { diag(e.deltaY, 'custom-handler-owns-input'); return; }
    const now = Date.now();
    if (now - lastWheelTs > 600) wheelAcc = 0;
    lastWheelTs = now;
    let dir;
    if (Math.abs(e.deltaY) >= NOTCH_MIN) {
      wheelAcc = 0;
      if (now - lastStepTs < 120) { diag(e.deltaY, 'rate-capped'); return; }
      dir = e.deltaY > 0 ? 'down' : 'up';
    } else {
      if ((wheelAcc > 0 && e.deltaY < 0) || (wheelAcc < 0 && e.deltaY > 0)) wheelAcc = 0;
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) < STREAM_STEP) { diag(e.deltaY, 'below-threshold', { acc: wheelAcc }); return; }
      if (now - lastStepTs < 200) { diag(e.deltaY, 'rate-capped', { acc: wheelAcc }); return; }
      dir = wheelAcc > 0 ? 'down' : 'up';
      wheelAcc -= dir === 'down' ? STREAM_STEP : -STREAM_STEP;
    }
    lastStepTs = now;
    const baseId=lastAnchor?.group==='content'&&allowed(lastAnchor.id)?lastAnchor.id:currentFocusId;
    if(focusRegistry.get(baseId)?.group!=='content')return;
    const next=navigateGrid(baseId,dir),base=focusRegistry.get(baseId);
    if (!next) { diag(e.deltaY, 'no-target-row', { baseRow: base.row, dir }); return; }
    diag(e.deltaY, 'stepped', { to: next });
    lastFocusFromPointer = true;
    setFocus(next);
  }, { passive: true });
}

export function useFocusable({ id, row = 0, col = 0, group = 'content', onSelect, onLongPress, onNavigate, recoveryPriority=0,disabled=false }) {
  const elementRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const hasLongPress = !!onLongPress;

  useLayoutEffect(() => {
    registerFocusable(id, {
      row, col, group, ref:elementRef,recoveryPriority,disabled,
      onSelect: () => onSelectRef.current?.(),
      onLongPress: hasLongPress ? () => onLongPressRef.current?.() : undefined,
      onNavigate: direction => onNavigateRef.current?.(direction),
    });
    return () => unregisterFocusable(id);
  }, [id, row, col, group, hasLongPress,recoveryPriority,disabled]);

  const handleClick = useCallback((e) => {
    e.preventDefault();
    pointerEnabled = true;
    cancelContentFocus();
    lastFocusFromPointer = true;
    setFocus(id);
    onSelectRef.current?.();
  }, [id]);

  const handleMouseEnter = useCallback(() => {
    if (!pointerEnabled || (customKeyHandler&&!activeScope())) return;
    cancelContentFocus();
    lastFocusFromPointer = true;
    hoverDriven = true;
    setFocus(id);
    hoverDriven = false;
  }, [id]);

  return {
    isFocused: currentFocusId === id,
    props: {
      ref: elementRef,
      'data-focus-id': id,
      onClick: handleClick,
      onMouseEnter: handleMouseEnter,
      style: { cursor: 'pointer' },
    }
  };
}
