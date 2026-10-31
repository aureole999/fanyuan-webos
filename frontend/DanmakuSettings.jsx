import React,{useState,useEffect,useRef} from 'react';
import {call} from './api';
import {FocusButton,Loading} from './components';
import {setFocus} from './vendor/bilitv/hooks/useFocus';
export default function DanmakuSettings({notify}){
 const [value,setValue]=useState(null),[error,setError]=useState(''),[customUrl,setCustomUrl]=useState(''),[customToken,setCustomToken]=useState(''),[testing,setTesting]=useState(false),[testResult,setTestResult]=useState('');
 const customUrlInput=useRef(null),customTokenInput=useRef(null),live=useRef(true);
 useEffect(()=>{live.current=true;call('danmakuSettings').then(v=>{if(live.current){setValue(v);setCustomUrl(v.customUrl||'');}},e=>setError(e.message));return()=>{live.current=false;};},[]);
 async function save(patch){setError('');try{const v=await call('danmakuConfigure',patch);if(live.current){setValue(v);setCustomUrl(v.customUrl||'');setCustomToken('');notify('弹幕设置已保存');}return v;}catch(e){if(live.current)setError(e.message);return null;}}
 async function testCustom(){if(testing)return;setTesting(true);setError('');setTestResult('');try{const saved=await save({customUrl,customToken});if(!saved)return;const r=await call('customDanmakuTest');if(live.current)setTestResult('连接成功：搜索到 '+r.count+' 条测试番剧结果');}catch(e){if(live.current)setError(e.message);}finally{if(live.current)setTesting(false);}}
 function leave(e,id){if(e.key==='ArrowDown'||e.key==='Enter'){e.preventDefault();e.stopPropagation();e.target.blur();setFocus(id);}}
 if(!value)return error?<div className="error-banner">{error}</div>:<Loading/>;
 return <div className="danmaku-settings-page">
  <p className="subscription-intro">自动匹配优先选择弹弹play，其他平台作为备用。</p>
  <section className="subscription-card"><h2>弹幕服务</h2><p>支持 danmu_api 的搜索、剧集与 JSON 弹幕接口。Token 单独填写，保存后不会回读显示。</p>
   <div className="credential-row"><label>服务地址</label><input ref={customUrlInput} value={customUrl} onChange={e=>setCustomUrl(e.target.value)} placeholder="https://你的服务.workers.dev" onKeyDown={e=>leave(e,'content-1-0')} autoComplete="off"/><FocusButton id="content-0-0" row={0} col={0} onSelect={()=>customUrlInput.current?.focus()}>输入地址</FocusButton></div>
   <div className="credential-row"><label>访问 Token</label><input type="password" ref={customTokenInput} value={customToken} onChange={e=>setCustomToken(e.target.value)} placeholder={value.hasCustomToken?'已保存；留空保留':'填写服务的访问 Token'} onKeyDown={e=>leave(e,'content-2-0')} autoComplete="new-password"/><FocusButton id="content-1-0" row={1} col={0} onSelect={()=>customTokenInput.current?.focus()}>输入 Token</FocusButton></div>
   <div className="subscription-actions"><FocusButton id="content-2-0" row={2} col={0} className="primary" onSelect={()=>save({customUrl,customToken})}>保存</FocusButton><FocusButton id="content-2-1" row={2} col={1} onSelect={()=>save({customEnabled:!value.customEnabled})}>{value.customEnabled?'弹幕服务：开启':'弹幕服务：关闭'}</FocusButton><FocusButton id="content-2-2" row={2} col={2} onSelect={testCustom}>{testing?'正在测试…':'测试连接'}</FocusButton><FocusButton id="content-2-3" row={2} col={3} className="quiet" onSelect={()=>save({clearCustomToken:true})}>清除 Token</FocusButton></div>
   {testResult&&<p className="connection-result">{testResult}</p>}
  </section>
  {error&&<div className="error-banner">{error}</div>}
  <p className="page-tip">Token 只保存在电视服务的数据目录中。播放时可查看来源条数、调整偏移，或手动选择平台与集数。</p>
 </div>;
}
