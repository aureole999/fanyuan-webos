export function call(method,parameters={}){
  return new Promise((resolve,reject)=>{
    if(window.PalmServiceBridge&&window.webOS&&webOS.service){webOS.service.request('luna://io.github.fanyuantv.fanyuan.service',{method,parameters,onSuccess:r=>r.returnValue===false?reject(new Error(r.errorText||'请求失败')):resolve(r),onFailure:r=>reject(new Error(r.errorText||'电视服务暂未连接'))});}
    else if(location.hostname==='127.0.0.1'||location.hostname==='localhost'){fetch('http://127.0.0.1:18764/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(parameters)}).then(r=>r.json()).then(r=>r.returnValue===false?reject(new Error(r.errorText)):resolve(r),reject);}
    else reject(new Error('请在电视上打开此应用'));
  });
}
