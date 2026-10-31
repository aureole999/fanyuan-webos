'use strict';
const DENSITY_PRESETS={
  dense:{maxVisible:48,separationPx:18},
  medium:{maxVisible:30,separationPx:44},
  sparse:{maxVisible:16,separationPx:96}
};
const DANMAKU_OPTIONS={
  area:[
    {value:0.125,short:'上方 1/8',label:'1/8 屏幕 · 极窄',description:'仅在画面顶部边缘显示 1–2 行弹幕'},
    {value:0.25,short:'上方 1/4',label:'1/4 屏幕 · 顶部四分之一',description:'Animeko 默认区域，不遮挡人物主体与字幕'},
    {value:0.33,short:'上方 1/3',label:'1/3 屏幕 · 上方三分之一',description:'仅在画面上方 1/3 区域显示弹幕（推荐）'},
    {value:0.5,short:'半屏 1/2',label:'1/2 屏幕 · 上半屏',description:'画面上半部分显示弹幕'},
    {value:0.75,short:'3/4 屏幕',label:'3/4 屏幕 · 大半屏',description:'画面上方 3/4 区域显示弹幕，避开底部字幕'},
    {value:1,short:'全屏',label:'全屏 · 100%',description:'整个画面高度均可显示弹幕'}
  ],
  lineGap:[
    {value:4,short:'紧凑 4px',label:'紧凑 · 4px',description:'较小行间距，同一显示区域可容纳更多行'},
    {value:10,short:'标准 10px',label:'标准 · 10px',description:'默认行间距，兼顾行数与阅读舒适度'},
    {value:18,short:'宽松 18px',label:'宽松 · 18px',description:'增大上下行间距，画面更通透'},
    {value:28,short:'超宽 28px',label:'超宽 · 28px',description:'大幅拉开行距，彻底避免上下行拥挤'}
  ],
  density:[
    {value:'dense',short:'密集',label:'密集 · 窄间距',description:'同轨道最小水平间距 18px，同屏最多 48 条'},
    {value:'medium',short:'适中',label:'适中 · 标准间距',description:'同轨道安全水平间距 44px，同屏最多 30 条'},
    {value:'sparse',short:'稀疏',label:'稀疏 · 宽间距',description:'同轨道宽裕水平间距 96px，同屏最多 16 条'}
  ],
  speed:[
    {value:0.6,short:'60% 极慢',label:'60% · 极慢',description:'单条滚动耗时约 13.3 秒，适合仔细阅读长句'},
    {value:0.8,short:'80% 较慢',label:'80% · 较慢',description:'单条滚动耗时约 10 秒'},
    {value:1,short:'100% 标准',label:'100% · 标准',description:'默认滚动速度，单条耗时约 8 秒'},
    {value:1.25,short:'125% 较快',label:'125% · 较快',description:'单条滚动耗时约 6.4 秒'},
    {value:1.5,short:'150% 快速',label:'150% · 快速',description:'单条滚动耗时约 5.3 秒，快速掠过'}
  ],
  scale:[
    {value:0.7,short:'70%',label:'70% · 特小',description:'迷你弹幕字号，最小化画面遮挡'},
    {value:0.85,short:'85%',label:'85% · 小号',description:'紧凑弹幕字号'},
    {value:1,short:'100%',label:'100% · 标准',description:'默认标准弹幕字号'},
    {value:1.2,short:'120%',label:'120% · 较大',description:'适合客厅远距离观看'},
    {value:1.4,short:'140%',label:'140% · 特大',description:'大号醒目弹幕'},
    {value:1.6,short:'160%',label:'160% · 超大',description:'最大弹幕字号'}
  ],
  opacity:[
    {value:0.4,short:'40%',label:'40% · 极淡',description:'轻度点缀，几乎不遮挡画面'},
    {value:0.55,short:'55%',label:'55% · 半透明',description:'兼顾弹幕氛围与画面细节'},
    {value:0.7,short:'70%',label:'70% · 柔和',description:'柔和清晰，视觉舒适'},
    {value:0.85,short:'85%',label:'85% · 标准',description:'默认弹幕不透明度'},
    {value:1,short:'100%',label:'100% · 不透明',description:'文字完全不透明，对比度最高'}
  ],
  weight:[
    {value:400,short:'常规 400',label:'常规 · 400',description:'标准细体字重'},
    {value:600,short:'半粗 600',label:'半粗 · 600',description:'Animeko 默认字重，兼顾清晰度与字形'},
    {value:700,short:'粗体 700',label:'粗体 · 700',description:'加粗文字，远距离更醒目'},
    {value:800,short:'特粗 800',label:'特粗 · 800',description:'最粗字重'}
  ],
  stroke:[
    {value:0,short:'无描边',label:'无描边 · 0%',description:'仅保留轻微阴影，无黑框描边'},
    {value:0.6,short:'细描边 60%',label:'细描边 · 60%',description:'柔和细黑边，文字更轻盈'},
    {value:1,short:'标准 100%',label:'标准描边 · 100%',description:'Animeko 默认黑框描边，亮暗背景皆清晰'},
    {value:1.5,short:'浓重 150%',label:'浓重描边 · 150%',description:'加粗描边，强光背景下文字依然分明'}
  ]
};
function matchOptionValue(a,b){
  if(typeof a==='number'&&typeof b==='number')return Math.abs(a-b)<0.015;
  return a===b;
}
function danmakuOptionLabel(group,value,fallback=''){
  const list=DANMAKU_OPTIONS[group]||[];
  const found=list.find(x=>matchOptionValue(x.value,value));
  return found?found.short:fallback;
}
function danmakuTypesSummary(settings={}){
  const parts=[];
  if(settings.danmakuFloating!==false)parts.push('滚动');
  if(settings.danmakuTop!==false)parts.push('顶部');
  if(settings.danmakuBottom===true)parts.push('底部');
  parts.push(settings.danmakuColor!==false?'彩色':'纯白');
  return parts.join(' · ');
}
function computeDanmakuLayout(settings={},hostHeight=1000){
  const fontScale=Math.min(2,Math.max(0.5,Number(settings.danmakuScale)||1));
  const baseFontSize=Math.round(28*fontScale);
  const rawGap=Number(settings.danmakuLineGap);
  const lineGap=Number.isFinite(rawGap)?Math.max(0,rawGap):10;
  const trackHeight=Math.max(24,baseFontSize+lineGap);
  const rawArea=Number(settings.danmakuArea);
  const areaRatio=Number.isFinite(rawArea)&&rawArea>0?Math.min(1,Math.max(0.1,rawArea)):0.33;
  const trackCount=Math.max(1,Math.floor((hostHeight*areaRatio)/trackHeight));
  const speedScale=Math.min(2,Math.max(0.4,Number(settings.danmakuSpeed)||1));
  const durationSec=+(8/speedScale).toFixed(2);
  const densityKey=DENSITY_PRESETS[settings.danmakuDensity]?settings.danmakuDensity:'medium';
  const {maxVisible,separationPx}=DENSITY_PRESETS[densityKey];
  const fontWeight=[400,600,700,800].includes(Number(settings.danmakuWeight))?Number(settings.danmakuWeight):600;
  const rawStroke=Number(settings.danmakuStroke);
  const strokeScale=Number.isFinite(rawStroke)?Math.max(0,rawStroke):1;
  const strokeWidthPx=+(1.2*strokeScale).toFixed(2);
  const textShadow=strokeScale>0?`0 0 ${Math.max(2,Math.round(3*strokeScale))}px rgba(0, 0, 0, 0.94), 1px 1px 2px rgba(0, 0, 0, 0.9)`:'1px 1px 2px rgba(0, 0, 0, 0.78)';
  return {
    fontScale,baseFontSize,lineGap,trackHeight,areaRatio,trackCount,
    speedScale,durationSec,densityKey,maxVisible,separationPx,
    fontWeight,strokeScale,strokeWidthPx,textShadow,
    enableFloating:settings.danmakuFloating!==false,
    enableTop:settings.danmakuTop!==false,
    enableBottom:settings.danmakuBottom===true,
    enableColor:settings.danmakuColor!==false
  };
}
function renderItems(raw,preferences){return raw.filter(d=>(preferences[d.serviceId]||{}).enabled!==false).map(d=>Object.assign({},d,{time:d.time+((preferences[d.serviceId]||{}).shift||0),mode:d.mode==='TOP'?5:d.mode==='BOTTOM'?4:1})).sort((a,b)=>a.time-b.time);}
function lowerBound(list,time){let lo=0,hi=list.length;while(lo<hi){const m=(lo+hi)>>>1;if(list[m].time<time)lo=m+1;else hi=m;}return lo;}
function fixedWindow(list,time,mode,limit=4){
  const found=[];
  for(let i=lowerBound(list,time-4);i<list.length&&list[i].time<=time;i++){
    const d=list[i];
    if(d.time+4>time&&(mode==null||d.mode===mode))found.push(d);
  }
  return limit>0?found.slice(-limit):[];
}
module.exports={renderItems,fixedWindow,DANMAKU_OPTIONS,matchOptionValue,danmakuOptionLabel,danmakuTypesSummary,computeDanmakuLayout};
