let epoch=0;
const cache=new WeakMap(),observed=new Map();
const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>invalidateGeometry()):null;
export function invalidateGeometry(){epoch++;}
if(typeof window!=='undefined')window.addEventListener('resize',invalidateGeometry);
export function observeGeometry(el){
 const ancestors=[];for(let p=el;p&&p!==document.body;p=p.parentElement){ancestors.push(p);const n=observed.get(p)||0;if(!n&&observer)observer.observe(p);observed.set(p,n+1);}
 invalidateGeometry();return()=>{for(const p of ancestors){const n=observed.get(p)-1;if(n)observed.set(p,n);else{observed.delete(p);if(observer)observer.unobserve(p);}}invalidateGeometry();};
}
export function elementGeometry(el){
 if(!el||!el.isConnected||el.disabled)return null;
 let c=cache.get(el);
 if(!c||c.epoch!==epoch){
  const r=el.getBoundingClientRect();
  if(!r.width||!r.height||el.closest('[hidden],[aria-hidden="true"],[inert]')||getComputedStyle(el).visibility==='hidden')return null;
  const scrolls=[];
  for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){
   if(p.matches('.content-scroller,.dialog-box,.player-panel')){
    const box=p.getBoundingClientRect();scrolls.push({el:p,x:p.scrollLeft,y:p.scrollTop,scale:p.offsetHeight?box.height/p.offsetHeight:1});
   }
  }
  c={epoch,rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},scrolls};cache.set(el,c);
 }
 let dx=0,dy=0;for(const s of c.scrolls){dx+=(s.el.scrollLeft-s.x)*s.scale;dy+=(s.el.scrollTop-s.y)*s.scale;}
 return {rect:{left:c.rect.left-dx,right:c.rect.right-dx,top:c.rect.top-dy,bottom:c.rect.bottom-dy},scrollRoot:c.scrolls.length?c.scrolls[0].el:null};
}
export function geometryNodes(registry,group){
 const nodes=[];for(const [id,d] of registry){if(d.group!==group||d.disabled)continue;const g=elementGeometry(d.ref?.current);if(g)nodes.push({id,group,rect:g.rect,scrollRoot:g.scrollRoot});}return nodes;
}
export function revealElement(el){
 if(!el)return;const viewport=el.closest('.content-scroller,.dialog-box,.player-panel');if(!viewport)return;
 const r=el.getBoundingClientRect(),box=viewport.getBoundingClientRect(),scale=viewport.offsetHeight?box.height/viewport.offsetHeight:1;
 if(r.top<box.top+8*scale)viewport.scrollTop+=(r.top-box.top)/scale-8;
 else if(r.bottom>box.bottom-8*scale)viewport.scrollTop+=(r.bottom-box.bottom)/scale+8;
}
