'use strict';
// Each badge subscribes to its own snapshot; results never re-render the whole detail page.
function createSourceProbeSession(sources,probe,concurrency){
 const states=new Map(sources.map(s=>[s.id,{status:'pending'}])),listeners=new Map();let cancelled=false,started=false,next=0;
 function publish(id,value){if(cancelled)return;states.set(id,value);for(const listener of listeners.get(id)||[])listener();}
 async function worker(){while(!cancelled&&next<sources.length){const source=sources[next++];publish(source.id,{status:'loading'});try{const result=await probe(source.id);publish(source.id,Object.assign({status:'done'},result));}catch(e){publish(source.id,{status:'error'});}}}
 return {get:id=>states.get(id),subscribe(id,listener){if(!listeners.has(id))listeners.set(id,new Set());listeners.get(id).add(listener);return()=>{const list=listeners.get(id);if(list)list.delete(listener);};},start(){if(started||cancelled)return;started=true;for(let i=0;i<Math.min(sources.length,concurrency||2);i++)worker();},cancel(){cancelled=true;listeners.clear();}};
}
module.exports={createSourceProbeSession};
