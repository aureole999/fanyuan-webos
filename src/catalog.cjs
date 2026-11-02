'use strict';
const transport=require('./transport.cjs');
const {coverThumbnail}=require('./images.cjs');
const cache={};
function httpsImage(url){return coverThumbnail(url);}
function normalize(x){return {bgmId:Number(x.id),id:'bgm:'+x.id,name:x.name_cn||x.name||'',originalName:x.name||'',cover:httpsImage((x.images||{}).large||(x.images||{}).common||(x.images||{}).medium),summary:x.summary||'',date:x.date||x.air_date||'',score:(x.rating||{}).score||0,rank:(x.rating||{}).rank||0,episodeCount:x.eps||x.total_episodes||0,tags:(x.tags||[]).slice(0,7).map(function(t){return t.name||t;}),platform:x.platform||'',weekday:x.air_weekday||0};}
async function get(url,ttl){const old=cache[url];if(old&&old.until>Date.now())return old.value;const r=await transport.request(url,{headers:{'User-Agent':'FanYuan-webOS/0.2.1'}});const j=JSON.parse(r.text);cache[url]={value:j,until:Date.now()+ttl};return j;}
async function calendar(){const data=await get('https://api.bgm.tv/calendar',1800000);return {days:data.map(function(d){return {id:d.weekday.id,label:d.weekday.cn,items:(d.items||[]).map(normalize)};})};}
async function search(keyword){const data=await get('https://api.bgm.tv/search/subject/'+encodeURIComponent(keyword)+'?type=2&responseGroup=large&max_results=20',300000);return {items:(data.list||[]).map(normalize)};}
async function post(url,body,ttl){const key=url+'|'+JSON.stringify(body),old=cache[key];if(old&&old.until>Date.now())return old.value;const r=await transport.request(url,{method:'POST',body:JSON.stringify(body),headers:{'User-Agent':'FanYuan-webOS/0.2.1','Content-Type':'application/json'}});const j=JSON.parse(r.text);cache[key]={value:j,until:Date.now()+ttl};return j;}
function day(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
// This season's anime by Bangumi collection heat. A season starts in Jan/Apr/Jul/Oct; shows that
// premiere in its last two weeks before that count toward it.
async function popular(now){now=now||new Date();const start=new Date(now.getFullYear(),now.getMonth()-now.getMonth()%3,1),end=new Date(start.getFullYear(),start.getMonth()+3,1),from=new Date(start.getTime()-14*86400000);
 const data=await post('https://api.bgm.tv/v0/search/subjects?limit=20',{keyword:'',sort:'heat',filter:{type:[2],air_date:['>='+day(from),'<'+day(end)],nsfw:false}},21600000);return {items:(data.data||[]).map(normalize)};}
// The top 300 by Bangumi rank; the app picks a daily selection from it.
async function classics(){const pages=await Promise.all([0,50,100,150,200,250].map(function(offset){return get('https://api.bgm.tv/v0/subjects?type=2&sort=rank&limit=50&offset='+offset,604800000);}));return {items:[].concat.apply([],pages.map(function(p){return p.data||[];})).map(normalize)};}
async function detail(id){if(!/^\d+$/.test(String(id)))throw new Error('番剧 ID 无效');return {subject:normalize(await get('https://api.bgm.tv/v0/subjects/'+id,3600000))};}
module.exports={calendar:calendar,search:search,detail:detail,popular:popular,classics:classics,normalize:normalize};
