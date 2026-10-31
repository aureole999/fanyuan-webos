'use strict';
const fs=require('fs'),path=require('path');
const validateBase=require('./custom-danmaku.cjs').validateBase;
function io(name,args){return new Promise((ok,fail)=>fs[name].apply(fs,args.concat((e,value)=>e?fail(e):ok(value))));}
class DanmakuSettings{
 constructor(dir){this.file=path.join(dir,'danmaku-settings.json');this.value={customEnabled:false,customUrl:'',customToken:''};this.serial=Promise.resolve();}
 async init(){try{const v=JSON.parse(await io('readFile',[this.file,'utf8']));for(const key of ['customEnabled','customUrl','customToken'])if(typeof v[key]===typeof this.value[key])this.value[key]=v[key];}catch(e){if(e.code!=='ENOENT')this.warning='弹幕设置缓存不可用';}return this.status();}
 custom(){return {url:this.value.customUrl,token:this.value.customToken};}
 status(){return {customEnabled:this.value.customEnabled===true,customUrl:this.value.customUrl||'',hasCustomToken:!!this.value.customToken,customConfigured:!!this.value.customUrl,preferredSource:'dandan',warning:this.warning||''};}
 configure(patch){const job=this.serial.then(async()=>{
  const next=Object.assign({},this.value);if(typeof patch.customEnabled==='boolean')next.customEnabled=patch.customEnabled;
  if(patch.customUrl!=null)next.customUrl=patch.customUrl?validateBase(patch.customUrl):'';
  if(patch.clearCustomToken)next.customToken='';else if(patch.customToken){if(typeof patch.customToken!=='string'||patch.customToken.length>512||/[\r\n]/.test(patch.customToken))throw Error('服务 Token 无效');next.customToken=patch.customToken.trim();}
  await io('writeFile',[this.file+'.tmp',JSON.stringify(next),{encoding:'utf8',mode:384}]);await io('rename',[this.file+'.tmp',this.file]);this.value=next;this.warning='';return this.status();
 });this.serial=job.catch(()=>{});return job;}
}
module.exports={DanmakuSettings};
