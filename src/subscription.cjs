'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),URL=require('url').URL;
const transport=require('./transport.cjs');
const DEFAULT_URL='https://sub.creamycake.org/v1/css1.json',HOUR=3600000;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
function io(name,args){return new Promise((resolve,reject)=>fs[name].apply(fs,args.concat((error,value)=>error?reject(error):resolve(value))));}
async function mkdir(dir){try{await io('mkdir',[dir,448]);}catch(e){if(e.code!=='EEXIST')throw e;}}
function validateUrl(value){let u;try{u=new URL(value);}catch(e){throw Error('请输入有效的订阅地址');}if(!/^https?:$/.test(u.protocol)||u.username||u.password||u.hash)throw Error('订阅地址须为不含账号信息的 HTTP/HTTPS 链接');return u.href;}
function readSubscription(raw){
  const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('订阅文件格式无效');
  const version=data.schemaVersion==null?1:data.schemaVersion;
  if(!Number.isInteger(version)||version<1||version>2){const e=Error('订阅格式需要更新的客户端（schema '+version+'）');e.requiresNewerApp=true;throw e;}
  const rules=data.mediaSources!=null?data.mediaSources:data.exportedMediaSourceDataList&&data.exportedMediaSourceDataList.mediaSources;
  if(!Array.isArray(rules)||rules.length>500)throw Error('订阅缺少有效的 mediaSources 列表');
  const ids=new Set();for(const r of rules){if(!r||typeof r!=='object'||typeof r.factoryId!=='string'||!r.arguments||typeof r.arguments!=='object')throw Error('订阅中存在无效源条目');if(r.id!=null){if(typeof r.id!=='string'||!r.id||ids.has(r.id))throw Error('订阅源 ID 为空或重复');ids.add(r.id);}}
  const metadata={};for(const k of ['name','description','websiteUrl','iconUrl'])if(typeof data[k]==='string')metadata[k]=data[k].slice(0,2000);
  return {rules,metadata,schemaVersion:version};
}
function supported(rule){
  const a=rule.arguments,c=a&&a.searchConfig;if(!c||typeof a.name!=='string')return false;
  if(rule.factoryId==='json-api')return rule.version===1&&c.search&&c.search.request&&typeof c.search.request.url==='string'&&c.subject&&c.subject.episodes&&['grouped','declared','none',undefined].includes(c.subject.channelFormatId);
  if(rule.factoryId!=='web-selector'||![1,2].includes(rule.version))return false;
  return typeof c.searchUrl==='string'&&['a','indexed','json-path-indexed',undefined].includes(c.subjectFormatId)&&['index-grouped','no-channel',undefined].includes(c.channelFormatId);
}
function reconcile(sub,rules){
  const old=sub.entries||[],remaining=old.slice(),matches=new Array(rules.length);
  for(const byId of [true,false])rules.forEach((r,i)=>{if(matches[i])return;const index=remaining.findIndex(e=>e.rule.factoryId===r.factoryId&&(byId?r.id!=null&&r.id===e.rule.id:(r.id==null||e.rule.id==null)&&r.arguments.name===e.rule.arguments.name));if(index>=0)matches[i]=remaining.splice(index,1)[0];});
  let unsupportedCount=0,excludedCount=0;
  const entries=[];
  rules.forEach((rule,i)=>{
    if(!['web-selector','json-api'].includes(rule.factoryId)){excludedCount++;return;}
    const previous=matches[i];
    if(!supported(rule)){unsupportedCount++;if(previous)entries.push(previous);return;}
    const remoteId=rule.id||'legacy-'+hash(rule.factoryId+'\n'+rule.arguments.name).slice(0,16);
    entries.push({instanceId:previous?previous.instanceId:(sub.id==='default'?remoteId:sub.id+':'+remoteId),enabled:previous?previous.enabled!==false:true,rule});
  });
  return {entries,unsupportedCount,excludedCount};
}
class SubscriptionManager{
  constructor(options){
    this.dir=options.dir;this.request=options.request||transport.request;this.now=options.now||Date.now;this.onChange=options.onChange||function(){};this.proxyBase=options.proxyBase||null;this.pending=new Map();this.serial=Promise.resolve();
    const entries=options.bundled.map(rule=>({instanceId:rule.id,enabled:true,rule}));
    this.state={format:1,detached:[],subscriptions:[{id:'default',url:DEFAULT_URL,enabled:true,updatePeriod:HOUR,lastUpdated:null,lastSuccess:null,metadata:null,entries,origin:'bundled'}]};this.storageError='';
  }
  async init(){
    await mkdir(this.dir);
    for(const file of ['subscriptions.json','subscriptions.json.bak']){try{const state=JSON.parse(await io('readFile',[path.join(this.dir,file),'utf8']));this.validateState(state);this.state=state;break;}catch(e){if(e.code!=='ENOENT')this.storageError='已忽略损坏的订阅缓存';}}
    this.onChange(this.rules());return this.status();
  }
  validateState(state){if(!state||state.format!==1||!Array.isArray(state.subscriptions))throw Error('无效缓存');const ids=new Set(),instanceIds=new Set();if(!Array.isArray(state.detached||[]))throw Error('无效缓存');for(const e of state.detached||[]){if(typeof e.instanceId!=='string'||!supported(e.rule)||instanceIds.has(e.instanceId))throw Error('无效缓存规则');instanceIds.add(e.instanceId);}for(const s of state.subscriptions){validateUrl(s.url);if(typeof s.id!=='string'||ids.has(s.id)||!Array.isArray(s.entries)||!Number.isFinite(s.updatePeriod)||s.updatePeriod<60000)throw Error('无效缓存');ids.add(s.id);for(const e of s.entries){if(typeof e.instanceId!=='string'||!supported(e.rule)||instanceIds.has(e.instanceId))throw Error('无效缓存规则');instanceIds.add(e.instanceId);}}}
  transaction(fn){const job=this.serial.then(async()=>{
    const next=clone(this.state),value=await fn(next);
    const file=path.join(this.dir,'subscriptions.json'),tmp=file+'.tmp';
    await io('writeFile',[tmp,JSON.stringify(next),'utf8']);
    await io('writeFile',[file+'.bak',JSON.stringify(this.state),'utf8']);
    await io('rename',[tmp,file]);const before=JSON.stringify(this.rules());this.state=next;this.storageError='';const active=this.rules();if(JSON.stringify(active)!==before)this.onChange(active);return value;
  });this.serial=job.catch(()=>{});return job;}
  rules(){const result=(this.state.detached||[]).filter(e=>e.enabled).map(e=>Object.assign({},e.rule,{id:e.instanceId}));for(const s of this.state.subscriptions)for(const e of s.entries)if(e.enabled)result.push(Object.assign({},e.rule,{id:e.instanceId}));return result;}
  status(){return {subscriptions:this.state.subscriptions.map(s=>({id:s.id,url:s.url,enabled:s.enabled,updatePeriod:s.updatePeriod,lastUpdated:s.lastUpdated,lastSuccess:s.lastSuccess,metadata:s.metadata,origin:s.origin,sourceCount:s.entries.length,enabledSourceCount:s.entries.filter(e=>e.enabled).length,updating:this.pending.has(s.id),nextUpdate:s.lastUpdated?s.lastUpdated.timeMillis+s.updatePeriod:null})),storageError:this.storageError};}
  sources(){return this.state.subscriptions.reduce((all,s)=>all.concat(s.entries.filter(e=>e.enabled).map(e=>({id:e.instanceId,name:e.rule.arguments.name,factoryId:e.rule.factoryId,subscriptionId:s.id,tier:e.rule.arguments.tier}))), (this.state.detached||[]).filter(e=>e.enabled).map(e=>({id:e.instanceId,name:e.rule.arguments.name,factoryId:e.rule.factoryId,subscriptionId:null,tier:e.rule.arguments.tier}))); }
  async fetch(url){
    try{const res=await this.request(url,{maxBytes:2*1024*1024,timeout:12000});return {raw:res.text,data:readSubscription(res.text),via:'direct'};}
    catch(error){if(error.requiresNewerApp||!this.proxyBase)throw error;const res=await this.request(this.proxyBase+'/v1/subs/proxy?url='+encodeURIComponent(url),{maxBytes:2*1024*1024,timeout:12000});return {raw:res.text,data:readSubscription(res.text),via:'proxy'};}
  }
  update(id,force){
    if(this.pending.has(id))return this.pending.get(id);
    const sub=this.state.subscriptions.find(s=>s.id===id);if(!sub)return Promise.reject(Error('订阅不存在'));
    if(!sub.enabled||(!force&&sub.lastUpdated&&this.now()-sub.lastUpdated.timeMillis<=sub.updatePeriod))return Promise.resolve(this.status());
    const job=(async()=>{
      let download,failure;try{download=await this.fetch(sub.url);}catch(e){failure={message:String(e.message||e).slice(0,250),requiresNewerApp:!!e.requiresNewerApp};}
      await this.transaction(next=>{
        const target=next.subscriptions.find(s=>s.id===id);if(!target||!target.enabled||target.url!==sub.url)return;
        if(failure){target.lastUpdated={timeMillis:this.now(),mediaSourceCount:null,error:failure,unsupportedMediaSourceCount:0};return;}
        const merged=reconcile(target,download.data.rules);target.entries=merged.entries;target.metadata=download.data.metadata;target.raw=download.raw;target.sha256=hash(download.raw);target.origin='online';target.lastSuccess=this.now();target.lastUpdated={timeMillis:this.now(),mediaSourceCount:download.data.rules.length,error:null,unsupportedMediaSourceCount:merged.unsupportedCount,excludedMediaSourceCount:merged.excludedCount,via:download.via};
      });
      return this.status();
    })().then(()=>{this.pending.delete(id);return this.status();},error=>{this.pending.delete(id);throw error;});
    this.pending.set(id,job);return job;
  }
  async updateAll(force){for(const s of this.state.subscriptions.slice())await this.update(s.id,!!force);return this.status();}
  async add(url){url=validateUrl(url);if(this.state.subscriptions.some(s=>s.url===url))throw Error('此订阅已存在');const id='sub-'+crypto.randomBytes(8).toString('hex');await this.transaction(next=>{if(next.subscriptions.some(s=>s.url===url))throw Error('此订阅已存在');next.subscriptions.push({id,url,enabled:true,updatePeriod:HOUR,lastUpdated:null,lastSuccess:null,metadata:null,entries:[],origin:'online'});});await this.update(id,true);return this.status();}
  async configure(id,patch){await this.transaction(next=>{const sub=next.subscriptions.find(s=>s.id===id);if(!sub)throw Error('订阅不存在');if(typeof patch.enabled==='boolean')sub.enabled=patch.enabled;if(patch.updatePeriod!=null){if(![HOUR,6*HOUR,12*HOUR,24*HOUR].includes(patch.updatePeriod))throw Error('无效更新周期');sub.updatePeriod=patch.updatePeriod;}});return this.status();}
  async remove(id){await this.transaction(next=>{const old=next.subscriptions.find(s=>s.id===id);if(old)next.detached=(next.detached||[]).concat(old.entries);next.subscriptions=next.subscriptions.filter(s=>s.id!==id);});return this.status();}
}
module.exports={SubscriptionManager,readSubscription,reconcile,supported,DEFAULT_URL,HOUR};
