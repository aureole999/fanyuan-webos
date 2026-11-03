'use strict';
const test=require('node:test'),assert=require('node:assert');
const transport=require('../src/transport.cjs');
test('related walks the season chain and keeps side stories of every season',async()=>{
 const rel={2:[{id:1,type:2,relation:'前传'},{id:3,type:2,relation:'续集'},{id:9,type:1,relation:'书籍'}],1:[{id:2,type:2,relation:'续集'},{id:4,type:2,relation:'剧场版'},{id:5,type:2,relation:'衍生'}],3:[{id:2,type:2,relation:'前传'}]};
 const sub={1:['TV','2020-01-01'],3:['TV','2024-01-01'],4:['剧场版','2022-01-01'],5:['其他','2020-02-01']};
 const old=transport.request;transport.request=async url=>{const m=/subjects\/(\d+)(\/subjects)?$/.exec(url);const id=m[1];return {text:JSON.stringify(m[2]?rel[id]||[]:{id:Number(id),name:'S'+id,platform:sub[id][0],date:sub[id][1]})};};
 try{const {items}=await require('../src/catalog.cjs').related(2);
  assert.deepEqual(items.map(x=>[x.bgmId,x.relation]),[[1,'前传'],[4,'剧场版'],[3,'续集']]);}finally{transport.request=old;}
});
