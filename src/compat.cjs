'use strict';
if(!String.prototype.trimEnd)Object.defineProperty(String.prototype,'trimEnd',{value:function(){return this.replace(/\s+$/,'');},configurable:true,writable:true});
if(!String.prototype.trimStart)Object.defineProperty(String.prototype,'trimStart',{value:function(){return this.replace(/^\s+/,'');},configurable:true,writable:true});

if(!Array.prototype.flatMap)Object.defineProperty(Array.prototype,'flatMap',{value:function(fn,that){const result=[];for(let i=0;i<this.length;i++){if(!(i in this))continue;const item=fn.call(that,this[i],i,this);if(Array.isArray(item)){for(let j=0;j<item.length;j++)if(j in item)result.push(item[j]);}else result.push(item);}return result;},configurable:true,writable:true});
