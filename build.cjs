const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto'),esbuild=require('esbuild');
const version=require('./package.json').version;
const out=path.join(__dirname,'dist');fs.mkdirSync(out,{recursive:true});
const app=path.join(out,'app'),service=path.join(out,'service');fs.rmSync(app,{recursive:true,force:true});fs.rmSync(service,{recursive:true,force:true});fs.mkdirSync(app,{recursive:true});fs.mkdirSync(service,{recursive:true});
function copyTree(a,b){fs.mkdirSync(b,{recursive:true});for(const n of fs.readdirSync(a)){const x=path.join(a,n),y=path.join(b,n);fs.statSync(x).isDirectory()?copyTree(x,y):fs.copyFileSync(x,y);}}
function sdfRoundRect(x,y,cx,cy,hw,hh,r){const dx=Math.abs(x-cx)-hw+r,dy=Math.abs(y-cy)-hh+r;return Math.min(Math.max(dx,dy),0)+Math.hypot(Math.max(dx,0),Math.max(dy,0))-r;}
function sdfSegment(px,py,ax,ay,bx,by){const pax=px-ax,pay=py-ay,bax=bx-ax,bay=by-ay,h=Math.max(0,Math.min(1,(pax*bax+pay*bay)/(bax*bax+bay*bay)));return Math.hypot(pax-bax*h,pay-bay*h);}
function sdfTriangle(px,py,ax,ay,bx,by,cx,cy){
  const e0x=bx-ax,e0y=by-ay,e1x=cx-bx,e1y=cy-by,e2x=ax-cx,e2y=ay-cy;
  const v0x=px-ax,v0y=py-ay,v1x=px-bx,v1y=py-by,v2x=px-cx,v2y=py-cy;
  const c0=Math.max(0,Math.min(1,(v0x*e0x+v0y*e0y)/(e0x*e0x+e0y*e0y))),c1=Math.max(0,Math.min(1,(v1x*e1x+v1y*e1y)/(e1x*e1x+e1y*e1y))),c2=Math.max(0,Math.min(1,(v2x*e2x+v2y*e2y)/(e2x*e2x+e2y*e2y)));
  const d=Math.min(Math.hypot(v0x-e0x*c0,v0y-e0y*c0),Math.hypot(v1x-e1x*c1,v1y-e1y*c1),Math.hypot(v2x-e2x*c2,v2y-e2y*c2));
  const s=Math.sign(e0x*e2y-e0y*e2x),inside=s*(v0x*e0y-v0y*e0x)>=0&&s*(v1x*e1y-v1y*e1x)>=0&&s*(v2x*e2y-v2y*e2x)>=0;
  return (inside?-1:1)*d;
}
function blend(bg,fg,a){return a<=0?bg:a>=1?fg:[bg[0]+(fg[0]-bg[0])*a,bg[1]+(fg[1]-bg[1])*a,bg[2]+(fg[2]-bg[2])*a];}
function cov(d,aa){return Math.max(0,Math.min(1,0.5-d/aa));}
function icon(size){
  const buf=Buffer.alloc((size*4+1)*size),aa=1.35/size;
  for(let y=0;y<size;y++){
    const row=y*(size*4+1),v=(y+0.5)/size;
    for(let x=0;x<size;x++){
      const u=(x+0.5)/size,glow=Math.max(0,1-Math.hypot(u-0.5,v-0.48)*1.25);
      let col=[24+glow*24,25+glow*14,28+glow*26];
      const pinkGrad=[247+(1-v)*8,112+(1-u)*42,162+(1-v)*30];
      const antL=sdfSegment(u,v,0.42,0.31,0.29,0.13)-0.028,antR=sdfSegment(u,v,0.58,0.31,0.71,0.13)-0.028;
      const tvOuter=sdfRoundRect(u,v,0.5,0.54,0.36,0.25,0.10);
      col=blend(col,pinkGrad,cov(Math.min(antL,antR,tvOuter),aa));
      const stand=sdfRoundRect(u,v,0.5,0.85,0.16,0.024,0.024);
      col=blend(col,[232,114,158],cov(stand,aa)*0.92);
      const tvScreen=sdfRoundRect(u,v,0.5,0.54,0.30,0.19,0.062);
      col=blend(col,[22+(1-v)*10,21+(1-v)*8,30+(1-u)*12],cov(tvScreen,aa));
      const dm1=sdfRoundRect(u,v,0.325,0.42,0.065,0.015,0.015),dm2=sdfRoundRect(u,v,0.675,0.45,0.055,0.015,0.015),dm3=sdfRoundRect(u,v,0.665,0.65,0.062,0.015,0.015);
      col=blend(col,[255,190,215],cov(Math.min(dm1,dm2,dm3),aa)*0.52);
      const tri=sdfTriangle(u,v,0.445,0.445,0.445,0.635,0.605,0.54)-0.022;
      col=blend(col,[255,242,247],cov(tri,aa));
      buf[row+1+x*4]=Math.round(col[0]);buf[row+1+x*4+1]=Math.round(col[1]);buf[row+1+x*4+2]=Math.round(col[2]);buf[row+1+x*4+3]=255;
    }
  }
  const table=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}function crc(b){let c=0xffffffff;for(const x of b)c=table[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0;}function chunk(t,b){const name=Buffer.from(t),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(b.length);sum.writeUInt32BE(crc(Buffer.concat([name,b])));return Buffer.concat([len,name,b,sum]);}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(buf)),chunk('IEND',Buffer.alloc(0))]);
}
async function main(){
  fs.copyFileSync(path.join(__dirname,'src/index.html'),path.join(app,'index.html'));
  fs.copyFileSync(path.join(__dirname,'frontend/style.css'),path.join(app,'style.css'));
  const browserSupport={name:'enact-browser',setup(build){
    // ilib's general entry probes non-browser runtimes. Use its browser loader on C1.
    build.onResolve({filter:/^ilib$/},()=>({path:require.resolve('ilib/lib/ilib-webpack.js')}));
    build.onLoad({filter:/node_modules[\\/]ilib[\\/]index\.js$/},args=>({contents:"module.exports=require('./lib/ilib-webpack.js');",loader:'js',resolveDir:path.dirname(args.path)}));
    build.onLoad({filter:/spotlight[\\/]styles[\\/]debug\.less$/},()=>({contents:'',loader:'css'}));
    // C1's built-in icon font predates these glyphs. Ship the matching official font.
    build.onLoad({filter:/ThemeDecorator[\\/]ThemeDecorator\.module\.css$/},args=>({contents:fs.readFileSync(args.path,'utf8').replace('local("Sandstone Icons"), local("SandstoneIcons"), ',''),loader:'local-css',resolveDir:path.dirname(args.path)}));
  }};
  const frontendBuild=await esbuild.build({metafile:true,plugins:[browserSupport],entryPoints:[path.join(__dirname,'frontend/App.jsx')],outfile:path.join(app,'app.js'),bundle:true,platform:'browser',format:'iife',target:'chrome79',loader:{'.css':'local-css','.woff':'file','.woff2':'file','.ttf':'file','.svg':'file','.png':'file'},assetNames:'assets/[name]-[hash]',define:{global:'window',__PERF__:'false',ILIB_BASE_PATH:'"./ilib"',ILIB_RESOURCES_PATH:'"./resources"','process.env.NODE_ENV':'"production"'},minify:true,legalComments:'eof'});
  const localeRoot=path.dirname(require.resolve('ilib/package.json'))+'/locale',localeOut=path.join(app,'ilib');fs.mkdirSync(localeOut,{recursive:true});
  for(const n of fs.readdirSync(localeRoot))if(n.endsWith('.json'))fs.copyFileSync(path.join(localeRoot,n),path.join(localeOut,n));
  for(const n of ['zh','CN','Hans','en/US'])if(fs.existsSync(path.join(localeRoot,n)))copyTree(path.join(localeRoot,n),path.join(localeOut,n));
  copyTree(path.join(__dirname,'node_modules/@enact/sandstone/resources'),path.join(app,'resources'));
  fs.writeFileSync(path.join(out,'frontend-metafile.json'),JSON.stringify(frontendBuild.metafile,null,2));
  copyTree(path.join(__dirname,'vendor/webOSTVjs-1.2.13'),path.join(app,'webOSTVjs-1.2.13'));
  function writeIcon(prefix,size){const png=icon(size),name=prefix+'-'+crypto.createHash('sha256').update(png).digest('hex').slice(0,12)+'.png';fs.writeFileSync(path.join(app,name),png);return name;}
  const smallIcon=writeIcon('icon',80),largeIcon=writeIcon('largeIcon',130);
  fs.writeFileSync(path.join(app,'appinfo.json'),JSON.stringify({id:'com.local.animesources',version:version,vendor:'Local experimental port',type:'web',main:'index.html',title:'番源',icon:smallIcon,largeIcon:largeIcon,iconColor:'#18191c',bgColor:'#111315',resolution:'1920x1080',disableBackHistoryAPI:true,requiredPermissions:['all'],requiredACG:[]},null,2));
  await esbuild.build({entryPoints:[path.join(__dirname,'src/service.cjs')],outfile:path.join(service,'service.js'),bundle:true,platform:'node',target:'node8',external:['webos-service'],legalComments:'eof',minify:false});
  fs.writeFileSync(path.join(service,'package.json'),JSON.stringify({name:'com.local.animesources.service',version:version,main:'service.js'},null,2));
  fs.writeFileSync(path.join(service,'services.json'),JSON.stringify({id:'com.local.animesources.service',description:'On-TV source rule engine',services:[{name:'com.local.animesources.service',description:'Search, source parsing, loopback playback and danmaku'}]},null,2));
  copyTree(path.join(__dirname,'rules'),path.join(service,'rules'));fs.copyFileSync(path.join(__dirname,'vendor/cacert.pem'),path.join(service,'cacert.pem'));
  if(fs.existsSync(path.join(__dirname,'LICENSE.txt')))for(const dest of [app,service])fs.copyFileSync(path.join(__dirname,'LICENSE.txt'),path.join(dest,'LICENSE.txt'));
  fs.copyFileSync(path.join(__dirname,'frontend/vendor/bilitv/LICENSE'),path.join(app,'BILITV-LICENSE.txt'));
  copyTree(path.join(__dirname,'THIRD_PARTY_NOTICES'),path.join(app,'THIRD_PARTY_NOTICES'));
  for(const dest of [app,service])fs.copyFileSync(path.join(__dirname,'THIRD_PARTY_NOTICES/enact-spotlight-LICENSE.txt'),path.join(dest,'SPOTLIGHT-LICENSE.txt'));
  fs.copyFileSync(path.join(__dirname,'THIRD_PARTY_NOTICES/enact-spotlight-NOTICE.txt'),path.join(app,'SPOTLIGHT-NOTICE.txt'));
  console.log('Built independent app and Node 8 service');
}
main().catch(e=>{console.error(e);process.exit(1);});
