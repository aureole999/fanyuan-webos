'use strict';
// Unmatched source chapters have no confirmed Bangumi identity. Never borrow the current season's.
function sourcePlayback(detail,episode,index){
 const subject=Object.assign({},detail.subject,{name:detail.subject.sourceSubjectName||detail.subject.name,bgmId:undefined,originalName:undefined});
 const channels=detail.channels.map(ch=>Object.assign({},ch,{episodes:ch.episodes.filter(e=>!e.unavailable).concat(ch.unmatchedEpisodes||[]).sort((a,b)=>(a.sourceIndex||0)-(b.sourceIndex||0)).map(e=>Object.assign({},e,{unmatched:true,type:'unmatched',name:e.sourceEpisodeName||e.name,sort:e.sourceSort==null?e.sort:e.sourceSort,bgmEpisodeId:undefined,bgmSubjectId:undefined,bgmEp:undefined}))}));
 const episodes=channels[index].episodes,at=episodes.findIndex(e=>e.id===episode.id);
 return {subject,episode:episodes[at],channels,channelIndex:index,hasNext:at>=0&&at<episodes.length-1,unmatched:true};
}
module.exports={sourcePlayback};
