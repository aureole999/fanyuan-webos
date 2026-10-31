const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const EventEmitter=require('node:events');
const PassThrough=require('node:stream').PassThrough;

for(const scheme of ['http','https']){
  test(scheme+' requests work with the Node 8 request(options, listener) API',async()=>{
    const calls=[];
    const oldHttp={Agent:function(){},request:function(options,listener){
      if(typeof listener!=='function')throw new TypeError('"listener" argument must be a function');
      assert.equal(arguments.length,2);
      calls.push(options);
      const req=new EventEmitter();req.setTimeout=function(){};
      req.write=function(b){req.body=b;};
      req.end=function(){process.nextTick(function(){const res=new PassThrough();res.statusCode=200;res.headers={};listener(res);res.end('ok');});};
      return req;
    }};
    const file=path.join(__dirname,'../src/transport.cjs');
    const mod={exports:{}};
    vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,exports:mod.exports,__dirname:path.dirname(file),Buffer,Promise,require:function(name){return name==='http'||name==='https'?oldHttp:require(name);}});
    const target=scheme+'://example.invalid:8088/a%20b?keyword=%E4%B8%AD%E6%96%87&token=abc';
    const res=await mod.exports.request(target,{method:'POST',body:'{"query":"test"}',headers:{'Content-Type':'application/json'}});
    assert.equal(res.text,'ok');
    assert.equal(calls[0].hostname,'example.invalid');
    assert.equal(calls[0].port,'8088');
    assert.equal(calls[0].path,'/a%20b?keyword=%E4%B8%AD%E6%96%87&token=abc');
    assert.equal(calls[0].method,'POST');
    assert.equal(calls[0].headers['Content-Length'],16);
  });
}
