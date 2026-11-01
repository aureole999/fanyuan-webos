import React,{useState,useEffect,useRef} from 'react';
import {call} from './api';
import {FocusButton,Empty,Loading,TextInput} from './components';
function stamp(t){return t?new Date(t).toLocaleString('zh-CN',{hour12:false}):'尚未成功更新';}
export default function Subscriptions({onChanged,notify,chooseOption}){
  const [state,setState]=useState(null),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const input=useRef(null),live=useRef(true);
  async function load(){try{const r=await call('subscriptions');if(live.current)setState(r);}catch(e){if(live.current)setError(e.message);}}
  useEffect(()=>{live.current=true;load();return()=>{live.current=false;};},[]);
  async function run(method,params={}){
    if(busy)return;setBusy(true);setError('');
    try{const r=await call(method,params);if(!live.current)return;setState(r);await onChanged();
      const failed=r.subscriptions.find(s=>s.lastUpdated?.error);
      if(failed){setError('更新未完成，继续使用已缓存规则：'+failed.lastUpdated.error.message);}
      else notify(method==='subscriptionRemove'?'已移除订阅，已下载源仍保留':method==='subscriptionConfigure'?'订阅设置已保存':'订阅已更新');
      if(method==='subscriptionAdd')setUrl('');
    }catch(e){if(live.current)setError(e.message);}finally{if(live.current)setBusy(false);}
  }
  return <div className="subscriptions-page">
    <p className="subscription-intro">订阅会直接下载到这台电视。默认每小时检查更新，也可随时手动更新。</p>
    <form className="subscription-add" onSubmit={e=>e.preventDefault()}>
      <TextInput id="subscription-url" inputRef={input} className="subscription-input" value={url} onChange={e=>setUrl(e.target.value)} placeholder="输入 Animeko 订阅地址（HTTP / HTTPS）" onSubmit={()=>run('subscriptionAdd',{url:url.trim()})}/>
      <FocusButton id="content-0-1" row={0} col={1} className="primary" onSelect={()=>run('subscriptionAdd',{url:url.trim()})}>添加订阅</FocusButton>
      <FocusButton id="content-0-2" row={0} col={2} onSelect={()=>run('subscriptionsUpdate',{force:true})}>全部更新</FocusButton>
    </form>
    {busy&&<div className="subscription-working">正在更新订阅…浏览和播放可继续使用缓存。</div>}
    {(error||state?.storageError)&&<div className="error-banner">{error||state.storageError}</div>}
    {!state?<Loading/>:state.subscriptions.length===0?<Empty title="添加你的第一个订阅">已下载的源仍然可用。添加订阅后会自动获取新规则。</Empty>:state.subscriptions.map((s,i)=>{
      const row=i*2+1,period=s.updatePeriod/3600000;
      return <section key={s.id} className="subscription-card">
        <h2>{s.metadata?.name||'Animeko 视频源订阅'}<small>{s.sourceCount} 个源</small></h2>
        <div className="subscription-url">{s.url}</div>
        <p>最近成功：{stamp(s.lastSuccess)}　·　{s.origin==='bundled'?'使用内置备用规则':'使用电视本地缓存'}</p>
        {s.lastUpdated?.error&&<p className="error-text">{s.lastUpdated.error.message}{s.lastUpdated.error.requiresNewerApp?'，已保留此前可用规则。':''}</p>}
        {s.lastUpdated?.unsupportedMediaSourceCount>0&&<p>{s.lastUpdated.unsupportedMediaSourceCount} 条规则暂不兼容，已有配置会保留。</p>}
        {s.lastUpdated?.excludedMediaSourceCount>0&&<p>{s.lastUpdated.excludedMediaSourceCount} 条 BT 或其他类型源未导入。</p>}
        <div className="subscription-actions">
          <FocusButton id={`content-${row}-0`} row={row} col={0} className="primary" onSelect={()=>run('subscriptionUpdate',{id:s.id})}>立即更新</FocusButton>
          <FocusButton id={`content-${row}-1`} row={row} col={1} onSelect={()=>chooseOption?chooseOption('自动更新设置',!!s.enabled,[{value:true,label:'开启自动更新',description:'按设定的更新周期自动在后台同步最新视频源规则'},{value:false,label:'暂停自动更新',description:'仅保留当前已缓存规则，需手动点击更新'}],v=>run('subscriptionConfigure',{id:s.id,enabled:v})):run('subscriptionConfigure',{id:s.id,enabled:!s.enabled})}>{s.enabled?'自动更新：开启':'自动更新：暂停'}</FocusButton>
          <FocusButton id={`content-${row}-2`} row={row} col={2} onSelect={()=>chooseOption?chooseOption('选择更新周期',period,[{value:1,label:'每 1 小时',description:'高频检查规则更新（默认）'},{value:6,label:'每 6 小时',description:'每日检查数次'},{value:12,label:'每 12 小时',description:'每半天检查一次'},{value:24,label:'每 24 小时',description:'每日检查一次'}],h=>run('subscriptionConfigure',{id:s.id,updatePeriod:h*3600000})):run('subscriptionConfigure',{id:s.id,updatePeriod:period*3600000})}>更新周期：{period} 小时</FocusButton>
          <FocusButton id={`content-${row}-3`} row={row} col={3} className="quiet" onSelect={()=>run('subscriptionRemove',{id:s.id})}>移除订阅，保留源</FocusButton>
        </div>
      </section>;
    })}
    <p className="page-tip">应用运行时按周期检查；关闭期间错过的更新会在下次打开时检查。下载失败会保留缓存。不导入 BT。</p>
  </div>;
}
