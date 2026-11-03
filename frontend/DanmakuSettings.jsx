import React,{useState,useEffect,useRef} from 'react';
import {call} from './api';
import {FocusButton,Loading,TextInput,ScrollGroup} from './components';
export default function DanmakuSettings({notify}){
 const [value,setValue]=useState(null),[error,setError]=useState(''),[customUrl,setCustomUrl]=useState(''),[customToken,setCustomToken]=useState(''),[testing,setTesting]=useState(false),[testResult,setTestResult]=useState('');
 const customUrlInput=useRef(null),customTokenInput=useRef(null),live=useRef(true);
 useEffect(()=>{live.current=true;call('danmakuSettings').then(v=>{if(live.current){setValue(v);setCustomUrl(v.customUrl||'');}},e=>setError(e.message));return()=>{live.current=false;};},[]);
 async function save(patch){setError('');try{const v=await call('danmakuConfigure',patch);if(live.current){setValue(v);setCustomUrl(v.customUrl||'');setCustomToken('');notify('弹幕设置已保存');}return v;}catch(e){if(live.current)setError(e.message);return null;}}
 async function testCustom(){if(testing)return;if(value.customEnabled&&!customUrl.trim()){setError('请填写自建服务地址');return;}setTesting(true);setError('');setTestResult('');try{const saved=await save(value.customEnabled?{customUrl,customToken}:{});if(!saved)return;const r=await call('customDanmakuTest');if(live.current)setTestResult('连接成功：搜索到 '+r.count+' 条测试番剧结果');}catch(e){if(live.current)setError(e.message);}finally{if(live.current)setTesting(false);}}
 if(!value)return error?<div className="error-banner">{error}</div>:<Loading/>;
 return <div className="danmaku-settings-page">
  <ScrollGroup className="subscription-card"><h2>弹幕服务</h2><p className="connection-result">当前使用：{value.customEnabled?'自建 danmu_api':'默认服务'}</p><p>推荐自行部署 danmu_api，可自行选择弹幕来源和管理访问权限。默认服务提供弹弹play来源的弹幕，无需填写 Token。</p>
   <div className="subscription-actions"><FocusButton id="danmaku-default" row={1} col={0} className={!value.customEnabled?'active':''} onSelect={()=>save({customEnabled:false})}>默认服务</FocusButton><FocusButton id="danmaku-custom" row={1} col={1} className={value.customEnabled?'active':''} onSelect={()=>save({customEnabled:true})}>自建 danmu_api（推荐）</FocusButton></div>
   {!value.customEnabled?<p className="connection-result">{value.defaultUrl||'https://danmu-api.aureole999.workers.dev'}</p>:<><p>填写自建服务地址及访问 Token。Token 留空会保留已保存的值，仅保存在本机，保存后不回显。</p>
   <div className="credential-row"><label>服务地址</label><TextInput id="danmaku-url" className="credential-input" inputRef={customUrlInput} value={customUrl} onChange={e=>setCustomUrl(e.target.value)} placeholder="https://你的弹幕服务地址"/></div>
   <div className="credential-row"><label>访问 Token</label><TextInput id="danmaku-token" className="credential-input" type="password" inputRef={customTokenInput} value={customToken} onChange={e=>setCustomToken(e.target.value)} placeholder={value.hasCustomToken?'已保存；留空保留':'填写服务的访问 Token'}/></div>
   <div className="subscription-actions"><FocusButton id="content-2-0" row={2} col={0} className="primary" onSelect={()=>save({customUrl,customToken})}>保存</FocusButton><FocusButton id="content-2-2" row={2} col={2} onSelect={testCustom}>{testing?'正在测试…':'测试连接'}</FocusButton><FocusButton id="content-2-3" row={2} col={3} className="quiet" onSelect={()=>save({clearCustomToken:true})}>清除 Token</FocusButton></div></>}
   {!value.customEnabled&&<div className="subscription-actions"><FocusButton id="content-2-2" row={2} onSelect={testCustom}>{testing?'正在测试…':'测试连接'}</FocusButton></div>}
   {testResult&&<p className="connection-result">{testResult}</p>}
   {error&&<div className="error-banner">{error}</div>}
  </ScrollGroup>
 </div>;
}
