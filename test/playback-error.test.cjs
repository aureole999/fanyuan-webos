const test=require('node:test'),assert=require('node:assert/strict');
const {playbackFailure}=require('../frontend/playback-error.cjs');
test('format error is not replaced by the rejected play promise or an autoplay prompt',()=>{
 for(const error of [{name:'NotAllowedError'},{name:'NotSupportedError'},{name:'AbortError'}]){const r=playbackFailure({code:4,message:'MEDIA_ELEMENT_ERROR: Format error'},error);assert.equal(r.failed,true);assert.match(r.message,/视频格式或返回内容无法播放.*错误码 4/);assert.ok(!r.message.includes('按 OK'));}
});
test('network, decoding and interruption failures get distinct useful messages',()=>{
 for(const [code,text]of [[1,'中断'],[2,'网络'],[3,'解码']]){const r=playbackFailure({code});assert.equal(r.failed,true);assert.ok(r.message.includes(text));assert.ok(r.message.includes('错误码 '+code));}
});
test('only a blocked play request without a media error asks for user activation',()=>{assert.deepEqual(playbackFailure(null,{name:'NotAllowedError'}),{failed:false,message:'请按 OK 开始播放'});});
test('load-induced play interruption stays silent; unsupported playback is a real error',()=>{assert.equal(playbackFailure(null,{name:'AbortError'}),null);assert.equal(playbackFailure(null,{name:'NotSupportedError'}).failed,true);});
test('unknown errors do not expose signed URLs or internal exception details',()=>{const r=playbackFailure(null,{name:'Error',message:'https://video.invalid/private?token=secret'});assert.equal(r.failed,true);assert.ok(!r.message.includes('secret'));assert.match(r.message,/重试或切换线路/);});
