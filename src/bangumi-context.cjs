'use strict';
const matching=require('./episode-matching.cjs');
function aliases(sub){const result=[];for(const b of sub.infobox||[])if(/别名|alias/i.test(b.key)){if(typeof b.value==='string')result.push(b.value);else if(Array.isArray(b.value))for(const x of b.value)if(x&&typeof x.v==='string')result.push(x.v);}return result;}
class BangumiContext{
 constructor(json){this.json=json;this.nodes=new Map();this.pending=new Map();this.contexts=new Map();}
 async node(id){
  id=String(id);if(!/^[1-9]\d*$/.test(id))throw Error('番剧 ID 无效');const old=this.nodes.get(id);if(old&&old.until>Date.now())return old.value;if(this.pending.has(id))return this.pending.get(id);
  const task=(async()=>{const [s,relations]=await Promise.all([this.json('https://api.bgm.tv/v0/subjects/'+id),this.json('https://api.bgm.tv/v0/subjects/'+id+'/subjects').catch(()=>[])]);
   if(!s||Number(s.id)!==Number(id)||!s.name)throw Error('番剧资料不可用');const episodes=[];
   for(let offset=0;offset<5000;offset+=100){const p=await this.json('https://api.bgm.tv/v0/episodes?subject_id='+id+'&limit=100&offset='+offset);episodes.push(...p.data||[]);if((p.data||[]).length<100||offset+100>=p.total)break;}
   const main=episodes.filter(e=>Number(e.type)===0),lo=main.length?Number(main[0].sort):0,hi=main.length?Number(main[main.length-1].sort):0;
   const value={id:Number(id),bgmId:Number(id),name:s.name_cn||s.name,name_cn:s.name_cn||'',originalName:s.name,date:s.date||'',aliases:aliases(s),episodes,inlineSpecialCount:episodes.filter(e=>Number(e.type)!==0&&Number(e.sort)>lo&&Number(e.sort)<Math.floor(hi)+1&&!Number.isInteger(Number(e.sort))).length,relations:Array.isArray(relations)?relations:[]};
   this.nodes.set(id,{value,until:Date.now()+3600000});if(this.nodes.size>40)this.nodes.delete(this.nodes.keys().next().value);return value;
  })();this.pending.set(id,task);try{return await task;}finally{this.pending.delete(id);}
 }
 async context(id){
  id=String(id);const old=this.contexts.get(id);if(old&&old.until>Date.now())return old.value;const subject=await this.node(id),series=[subject],seen=new Set([id]),queue=subject.relations.slice();
  while(queue.length&&series.length<8){const batch=[];while(queue.length&&batch.length<3&&series.length+batch.length<8){const r=queue.shift(),key=String(r.id);if(Number(r.type)!==2||!['前传','续集'].includes(r.relation)||seen.has(key))continue;seen.add(key);batch.push(key);}
   if(!batch.length)continue;const nodes=await Promise.all(batch.map(k=>this.node(k).catch(()=>null)));for(const node of nodes)if(node){series.push(node);queue.push(...node.relations);}}
  const value={subject,series:series.sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'))};this.contexts.set(id,{value,until:Date.now()+300000});if(this.contexts.size>20)this.contexts.delete(this.contexts.keys().next().value);return value;
 }
}
module.exports={BangumiContext,aliases};
