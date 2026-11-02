'use strict';
const spotlightNavigate=require('@enact/spotlight/src/navigate').default;
const spotlightConfig={obliqueMultiplier:5,straightMultiplier:1,straightOnly:false,straightOverlapThreshold:0.5};
function spotlightRect(rect,id){const x=(rect.left+rect.right)/2,y=(rect.top+rect.bottom)/2;return Object.assign({},rect,{width:rect.right-rect.left,height:rect.bottom-rect.top,element:id,center:{x,y,left:x,right:x,top:y,bottom:y}});}
function spatialTarget(nodes,fromId,direction){
 const from=nodes.find(n=>n.id===fromId);if(!from||!from.rect)return null;
 const candidates=nodes.filter(n=>n.id!==fromId&&!n.disabled&&n.rect).map(n=>spotlightRect(n.rect,n.id));
 return spotlightNavigate(spotlightRect(from.rect,fromId),direction,candidates,spotlightConfig)||null;
}
function navigateTarget(registry,fromId,direction,nodes){
 const from=registry.get(fromId);if(!from||from.disabled)return null;
 nodes=(nodes||Array.from(registry,([id,d])=>Object.assign({id},d))).filter(n=>n.group===from.group&&!n.disabled&&n.rect);
 const override=from.onNavigate&&from.onNavigate(direction);
 if(override&&nodes.some(n=>n.id===override))return override;
 const next=spatialTarget(nodes,fromId,direction);if(next)return next;
 if(from.group==='sidebar'&&(direction==='up'||direction==='down')){
  const sorted=nodes.slice().sort((a,b)=>a.rect.top-b.rect.top);
  const edge=direction==='down'?sorted[0]:sorted[sorted.length-1];return edge&&edge.id!==fromId?edge.id:null;
 }
 return null;
}
function findGroupTarget(registry,group,row){
 let best=null,score=Infinity;for(const [id,d] of registry){if(d.group!==group||d.disabled)continue;const s=Math.abs(d.row-row)*1000+d.col;if(s<score){score=s;best=id;}}return best;
}
function remoteKey(event){return ({37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown',13:'Enter',461:'GoBack'})[event.keyCode]||event.key;}
function seekDelta(key,panel,controlsVisible){return panel||controlsVisible?0:key==='ArrowLeft'?-10:key==='ArrowRight'?10:0;}
// Scrub step for the n-th consecutive press or repeat (1-based): fine first, faster when held.
function scrubStep(count){return count<=5?10:count<=12?30:60;}
// Skip-opening shortcut: CH− (PageDown on webOS) or fast-forward jumps ahead 85 s.
const SKIP_SECONDS=85;
function skipKey(event){return event.keyCode===34||event.keyCode===417?SKIP_SECONDS:0;}
function createSeekSession(){
 let heldKey=null;
 return {
  delta(key,panel,controlsVisible){
   if(panel||key!==heldKey)heldKey=null;
   const delta=seekDelta(key,panel,controlsVisible&&heldKey!==key);
   if(delta)heldKey=key;
   return delta;
  },
  release(key){if(key===heldKey)heldKey=null;},
  reset(){heldKey=null;},
  active(){return heldKey!==null;}
 };
}
function recoverTarget(registry,group,anchor){
 let best=null,score=-Infinity;
 for(const [id,d] of registry){if(d.group!==group||d.disabled)continue;const distance=anchor?Math.abs(d.row-anchor.row)*100+Math.abs(d.col-anchor.col):d.row*100+d.col;const value=(d.recoveryPriority||0)*100000-distance;if(value>score){best=id;score=value;}}
 return best;
}
module.exports={spatialTarget,navigateTarget,findGroupTarget,remoteKey,seekDelta,scrubStep,skipKey,SKIP_SECONDS,createSeekSession,recoverTarget};
