#!/usr/bin/env node
// Writes the Homebrew Channel manifest for a packaged IPK, and site/apps.json: a repository with only this app.
// Usage: node .github/homebrew-manifest.cjs <ipk> <out-dir> <owner/repo> <tag>
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const [ipk,out,repo,tag]=process.argv.slice(2);
if(!ipk||!out||!repo||!tag)throw Error('usage: homebrew-manifest.cjs <ipk> <out-dir> <owner/repo> <tag>');
const appinfo=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/app/appinfo.json'),'utf8'));
const data=fs.readFileSync(ipk),download=name=>`https://github.com/${repo}/releases/download/${tag}/${name}`;
fs.copyFileSync(path.join(__dirname,'../dist/app',appinfo.largeIcon||appinfo.icon),path.join(out,'icon.png'));
const manifest={
 id:appinfo.id,version:appinfo.version,type:appinfo.type,title:appinfo.title,
 appDescription:'番剧资料、追番、视频源订阅与弹幕播放',
 iconUri:download('icon.png'),sourceUrl:`https://github.com/${repo}`,rootRequired:false,
 ipkUrl:download(path.basename(ipk)),ipkHash:{sha256:crypto.createHash('sha256').update(data).digest('hex')},ipkSize:data.length,
};
fs.writeFileSync(path.join(out,appinfo.id+'.manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const site=path.join(__dirname,'../site'),entry={id:manifest.id,title:manifest.title,iconUri:manifest.iconUri,manifestUrl:download(appinfo.id+'.manifest.json'),manifest,pool:'main',requirements:{webosRelease:'>=5.0'},shortDescription:manifest.appDescription};
fs.mkdirSync(site,{recursive:true});
fs.writeFileSync(path.join(site,'apps.json'),JSON.stringify({paging:{page:1,count:1,maxPage:1,itemsTotal:1,prevUrl:null,nextUrl:null},packages:[entry]}));
fs.writeFileSync(path.join(site,'index.html'),`<!doctype html><meta charset="utf-8"><title>番源 Homebrew 软件源</title><p>Homebrew Channel 软件源：<code>https://${repo.split('/')[0].toLowerCase()}.github.io/${repo.split('/')[1]}/apps.json</code></p><p><a href="https://github.com/${repo}">${repo}</a></p>`);
console.log(JSON.stringify(manifest,null,2));
