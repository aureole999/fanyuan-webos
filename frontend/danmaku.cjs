'use strict';
function renderItems(raw,preferences){return raw.filter(d=>(preferences[d.serviceId]||{}).enabled!==false).map(d=>Object.assign({},d,{time:d.time+((preferences[d.serviceId]||{}).shift||0),mode:d.mode==='TOP'?5:d.mode==='BOTTOM'?4:1})).sort((a,b)=>a.time-b.time);}
function lowerBound(list,time){let lo=0,hi=list.length;while(lo<hi){const m=(lo+hi)>>>1;if(list[m].time<time)lo=m+1;else hi=m;}return lo;}
function fixedWindow(list,time){const found=[];for(let i=lowerBound(list,time-4);i<list.length&&list[i].time<=time;i++)if(list[i].time+4>time)found.push(list[i]);return found.slice(-4);}
module.exports={renderItems,fixedWindow};
