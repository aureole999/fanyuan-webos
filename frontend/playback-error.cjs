'use strict';
const FORMAT='此线路的视频格式或返回内容无法播放，请切换线路';
function playbackFailure(mediaError,playError){
 const code=mediaError&&Number(mediaError.code);
 const messages={1:'视频加载已中断，请重试',2:'视频加载失败，请检查网络或切换线路',3:'视频解码失败，请切换线路',4:FORMAT};
 if(messages[code])return {failed:true,message:messages[code]+'（错误码 '+code+'）'};
 if(playError&&playError.name==='AbortError')return null;
 if(playError&&playError.name==='NotAllowedError')return {failed:false,message:'请按 OK 开始播放'};
 if(playError&&playError.name==='NotSupportedError')return {failed:true,message:FORMAT};
 return {failed:true,message:'视频播放失败，请重试或切换线路'};
}
module.exports={playbackFailure};
