'use strict';
const http=require('http'),crypto=require('crypto'),URL=require('url').URL;
const transport=require('./transport.cjs');
function rewritePlaylist(source, base, map) {
  return source.split(/\r?\n/).map(function(line){
    if(!line.trim())return line;
    if(line[0]==='#')return line.replace(/URI="([^"]+)"/g,function(_,u){return 'URI="'+map(new URL(u,base).href)+'"';});
    return map(new URL(line.trim(),base).href);
  }).join('\n');
}
function createProxy(){
  const sessions={};let port=0;const events=[];
  function log(status,kind){events.push({time:Date.now(),status:status,kind:kind});if(events.length>25)events.shift();}
  function mapped(token,url){return 'http://127.0.0.1:'+port+'/media/'+token+'?u='+encodeURIComponent(url);}
  const server=http.createServer(async function(req,res){
    res.setHeader('Access-Control-Allow-Origin','*');
    if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Headers':'Range','Access-Control-Allow-Methods':'GET,HEAD,OPTIONS'});res.end();return;}
    let upstream;
    try{
      const u=new URL(req.url,'http://127.0.0.1'),token=u.pathname.split('/')[2],session=sessions[token];
      if(!session||!/^\/media\//.test(u.pathname)){res.writeHead(404);res.end();return;}
      session.used=Date.now();
      const target=u.searchParams.get('u')||session.url;const targetUrl=new URL(target);
      if(!/^https?:$/.test(targetUrl.protocol))throw new Error('Unsupported media URL');
      const h=Object.assign({},session.headers);
      if(req.headers.range)h.Range=req.headers.range;
      if(req.headers['if-range'])h['If-Range']=req.headers['if-range'];
      upstream=await transport.open(target,{headers:h,method:req.method==='HEAD'?'HEAD':'GET',stream:true,timeout:25000});
      log(upstream.statusCode,'upstream');
      if(upstream.statusCode>=400){upstream.resume();res.writeHead(upstream.statusCode);res.end('Media upstream '+upstream.statusCode);return;}
      const contentType=upstream.headers['content-type']||'application/octet-stream';
      const responseHeaders={'Content-Type':contentType,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Range,Accept-Ranges,Content-Length'};
      ['content-length','content-range','accept-ranges'].forEach(function(k){if(upstream.headers[k])responseHeaders[k]=upstream.headers[k];});
      if(req.method==='HEAD'){res.writeHead(upstream.statusCode,responseHeaders);res.end();upstream.resume();return;}
      let sawData=false;
      upstream.once('data',function(first){
        sawData=true;
        upstream.pause();
        const isPlaylist=/mpegurl/i.test(contentType)||/^#EXTM3U/.test(first.toString('utf8',0,Math.min(first.length,32)));
        if(isPlaylist){
          const chunks=[first];let size=first.length;
          upstream.on('data',function(b){size+=b.length;if(size>3*1024*1024){upstream.destroy();res.destroy();}else chunks.push(b);});
          upstream.on('end',function(){
            if(res.destroyed)return;
            try{const body=rewritePlaylist(Buffer.concat(chunks).toString('utf8'),upstream.finalUrl,function(url){return mapped(token,url);});res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});res.end(body);log(200,'playlist');}catch(e){res.writeHead(502);res.end('Playlist rewrite failed');}
          });
          upstream.resume();
        }else{res.writeHead(upstream.statusCode,responseHeaders);res.write(first);upstream.pipe(res);}
      });
      upstream.on('end',function(){if(!sawData&&!res.headersSent){res.writeHead(upstream.statusCode,responseHeaders);res.end();}});
      upstream.on('error',function(){res.destroy();});
      res.on('close',function(){if(upstream)upstream.destroy();});
    }catch(e){log(502,'error');if(!res.headersSent)res.writeHead(502);res.end('媒体请求失败');if(upstream)upstream.destroy();}
  });
  const ready=new Promise(function(resolve,reject){server.once('error',reject);server.listen(0,'127.0.0.1',function(){port=server.address().port;resolve(port);});});
  return {server:server,ready:ready,events:events,add:async function(media){await ready;Object.keys(sessions).forEach(function(k){if(Date.now()-sessions[k].used>2*3600000)delete sessions[k];});const token=crypto.randomBytes(18).toString('hex');sessions[token]={url:media.url,headers:media.headers||{},used:Date.now()};return mapped(token,media.url);}};
}
module.exports={createProxy:createProxy,rewritePlaylist:rewritePlaylist};
