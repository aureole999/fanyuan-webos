'use strict';
// Daily selection from a fixed pool (e.g. Bangumi's top 300): the same picks all day, a new set the
// next day, never anything the viewer has already watched or saved.
function seeded(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return function(){h=Math.imul(h^(h>>>15),2246822507);h=Math.imul(h^(h>>>13),3266489909);h^=h>>>16;return (h>>>0)/4294967296;};}
function dailyPick(items,exclude,count,dayKey){
 const skip=new Set(exclude),pool=items.filter(x=>x&&x.bgmId&&!skip.has(x.bgmId)),random=seeded(String(dayKey));
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));const t=pool[i];pool[i]=pool[j];pool[j]=t;}
 return pool.slice(0,count);
}
function dayKey(d){return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();}
module.exports={dailyPick,dayKey};
