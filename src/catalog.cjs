'use strict';
const transport=require('./transport.cjs');
const {coverThumbnail}=require('./images.cjs');
const cache={};
function httpsImage(url){return coverThumbnail(url);}
function normalize(x){return {bgmId:Number(x.id),id:'bgm:'+x.id,name:x.name_cn||x.name||'',originalName:x.name||'',cover:httpsImage((x.images||{}).large||(x.images||{}).common||(x.images||{}).medium),summary:x.summary||'',date:x.date||x.air_date||'',score:(x.rating||{}).score||0,rank:(x.rating||{}).rank||0,episodeCount:x.eps||x.total_episodes||0,tags:(x.tags||[]).slice(0,7).map(function(t){return t.name||t;}),platform:x.platform||'',weekday:x.air_weekday||0};}
async function get(url,ttl){const old=cache[url];if(old&&old.until>Date.now())return old.value;const r=await transport.request(url,{headers:{'User-Agent':'FanYuan-webOS/0.2.1'}});const j=JSON.parse(r.text);cache[url]={value:j,until:Date.now()+ttl};return j;}
async function calendar(){const data=await get('https://api.bgm.tv/calendar',1800000);return {days:data.map(function(d){return {id:d.weekday.id,label:d.weekday.cn,items:(d.items||[]).map(normalize)};})};}
async function search(keyword){const data=await get('https://api.bgm.tv/search/subject/'+encodeURIComponent(keyword)+'?type=2&responseGroup=large&max_results=20',300000);return {items:(data.list||[]).map(normalize)};}
async function detail(id){if(!/^\d+$/.test(String(id)))throw new Error('番剧 ID 无效');return {subject:normalize(await get('https://api.bgm.tv/v0/subjects/'+id,3600000))};}
module.exports={calendar:calendar,search:search,detail:detail,normalize:normalize};
