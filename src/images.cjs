'use strict';
function coverThumbnail(value){
  const url=String(value||'').replace(/^http:/,'https:');
  const match=/^https:\/\/lain\.bgm\.tv\/(?:r\/[^/]+\/)?pic\/cover\/[a-z]\/([^?#]+)(?:[?#].*)?$/.exec(url);
  return match?'https://lain.bgm.tv/r/400/pic/cover/l/'+match[1]:url;
}
module.exports={coverThumbnail};
