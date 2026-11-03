import React,{useState,useEffect,useRef} from 'react';
import {call} from './api';
import {FocusButton,Loading,TextInput,ScrollGroup} from './components';
export default function DanmakuSettings({notify}){
 const [value,setValue]=useState(null),[error,setError]=useState(''),[customUrl,setCustomUrl]=useState(''),[customToken,setCustomToken]=useState(''),[testing,setTesting]=useState(false),[testResult,setTestResult]=useState('');
 const customUrlInput=useRef(null),customTokenInput=useRef(null),live=useRef(true);
 useEffect(()=>{live.current=true;call('danmakuSettings').then(v=>{if(live.current){setValue(v);setCustomUrl(v.customUrl||'');}},e=>setError(e.message));return()=>{live.current=false;};},[]);
 async function save(patch){setError('');try{const v=await call('danmakuConfigure',patch);if(live.current){setValue(v);setCustomUrl(v.customUrl||'');setCustomToken('');notify('弹幕设置已保存');}return v;}catch(e){if(live.current)setError(e.message);return null;}}
 async function testCustom(){if(testing)return;setTesting(true);setError('');setTestResult('');try{const saved=await save({customUrl,customToken});if(!saved)return;const r=await call('customDanmakuTest');if(live.current)setTestResult('连接成功：搜索到 '+r.count+' 条测试番剧结果');}catch(e){if(live.current)setError(e.message);}finally{if(live.current)setTesting(false);}}
 if(!value)return error?<div className="error-banner">{error}</div>:<Loading/>;
 return <div className="danmaku-settings-page">
  <ScrollGroup className="subscription-card"><h2>弹幕服务</h2><p className="connection-result">当前使用：{value.usingPublic?'公共弹幕镜像（弹弹play 数据，无需配置）':'自建服务'}</p><p>默认使用公开的弹弹play 数据镜像。也可以接入自建的 danmu_api 服务（支持更多平台），填写地址后开启「使用自建服务」。Token 单独填写，只保存在电视服务的数据目录中，保存后不会回读显示。</p>
   <div className="credential-row"><label>服务地址</label><TextInput id="danmaku-url" className="credential-input" inputRef={customUrlInput} value={customUrl} onChange={e=>setCustomUrl(e.target.value)} placeholder="https://你的弹幕服务地址"/></div>
   <div className="credential-row"><label>访问 Token</label><TextInput id="danmaku-token" className="credential-input" type="password" inputRef={customTokenInput} value={customToken} onChange={e=>setCustomToken(e.target.value)} placeholder={value.hasCustomToken?'已保存；留空保留':'填写服务的访问 Token'}/></div>
   <div className="subscription-actions"><FocusButton id="content-2-0" row={2} col={0} className="primary" onSelect={()=>save({customUrl,customToken})}>保存</FocusButton><FocusButton id="content-2-1" row={2} col={1} onSelect={()=>save({customEnabled:!value.customEnabled})}>{value.customEnabled?'使用自建服务：开启':'使用自建服务：关闭'}</FocusButton><FocusButton id="content-2-2" row={2} col={2} onSelect={testCustom}>{testing?'正在测试…':'测试连接'}</FocusButton><FocusButton id="content-2-3" row={2} col={3} className="quiet" onSelect={()=>save({clearCustomToken:true})}>清除 Token</FocusButton></div>
   {testResult&&<p className="connection-result">{testResult}</p>}
   {error&&<div className="error-banner">{error}</div>}
  </ScrollGroup>
 </div>;
}
