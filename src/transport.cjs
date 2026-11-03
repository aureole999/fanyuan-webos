'use strict';
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const URL = require('url').URL;
const caFile = require('path').join(__dirname, 'cacert.pem');
const ca = fs.existsSync(caFile) ? fs.readFileSync(caFile) : undefined;
const agents = { 'http:': new http.Agent({ keepAlive: true, maxSockets: 6 }), 'https:': new https.Agent({ keepAlive: true, maxSockets: 6, ca: ca }) };
const UA = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36';
// Bangumi asks API clients to identify themselves with a name and a contact link.
const BANGUMI_UA = 'aureole999/fanyuan-webos/' + require('../package.json').version + ' (https://github.com/aureole999/fanyuan-webos)';
function open(url, options, redirects) {
  options = options || {}; redirects = redirects || 0;
  return new Promise(function (resolve, reject) {
    let target;
    try { target = new URL(url); } catch (e) { return reject(new Error('无效的 HTTP 地址')); }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return reject(new Error('仅支持 HTTP/HTTPS'));
    const headers = Object.assign({ 'User-Agent': /(^|\.)bgm\.tv$/.test(target.hostname) ? BANGUMI_UA : UA, 'Accept-Encoding': options.stream ? 'identity' : 'gzip, deflate', 'Accept': '*/*' }, options.headers || {});
    if (options.body != null) headers['Content-Length'] = Buffer.byteLength(options.body);
    const requestOptions = {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      path: target.pathname + target.search,
      method: options.method || 'GET',
      headers: headers,
      agent: agents[target.protocol],
      ca: ca
    };
    if (target.username || target.password) requestOptions.auth = decodeURIComponent(target.username) + ':' + decodeURIComponent(target.password);
    const req = (target.protocol === 'https:' ? https : http).request(requestOptions, function (res) {
      if ([301, 302, 303, 307, 308].indexOf(res.statusCode) !== -1 && res.headers.location) {
        res.resume();
        if (redirects >= 5) return reject(new Error('重定向次数过多'));
        const next = new URL(res.headers.location, target).href;
        if(options.sameOriginRedirects&&new URL(next).origin!==target.origin)return reject(new Error('自建服务发生跨域重定向')); 
        const opts = Object.assign({}, options, { headers: Object.assign({}, options.headers || {}) });
        if (new URL(next).origin !== target.origin) Object.keys(opts.headers).forEach(function (k) { if (/authorization|cookie|apikey/i.test(k)) delete opts.headers[k]; });
        if (res.statusCode === 303 || ((res.statusCode === 301 || res.statusCode === 302) && opts.method === 'POST')) { opts.method = 'GET'; delete opts.body; }
        return open(next, opts, redirects + 1).then(resolve, reject);
      }
      res.finalUrl = target.href;
      resolve(res);
    });
    req.setTimeout(options.timeout || 18000, function () { req.destroy(new Error('源站请求超时')); });
    req.on('error', reject);
    if (options.body != null) req.write(options.body);
    req.end();
  });
}
async function request(url, options) {
  options = options || {};
  const res = await open(url, options);
  let stream = res;
  const encoding = res.headers['content-encoding'] || '';
  if (encoding.indexOf('gzip') >= 0) stream = res.pipe(zlib.createGunzip());
  else if (encoding.indexOf('deflate') >= 0) stream = res.pipe(zlib.createInflate());
  else if (encoding.indexOf('br') >= 0) { res.destroy(); throw new Error('电视运行时不支持源站的 Brotli 压缩'); }
  const body = await new Promise(function (resolve, reject) {
    const chunks = []; let size = 0;
    res.on('error', reject);
    stream.on('error', reject);
    stream.on('data', function (b) { size += b.length; if (size > (options.maxBytes || 6 * 1024 * 1024)) { stream.destroy(); res.destroy(); reject(new Error('源站响应超过大小限制')); } else chunks.push(b); });
    stream.on('end', function () { resolve(Buffer.concat(chunks)); });
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {const error=new Error('源站返回 HTTP ' + res.statusCode);error.statusCode=res.statusCode;throw error;}
  return { url: res.finalUrl, status: res.statusCode, headers: res.headers, text: body.toString('utf8'), body: body };
}
module.exports = { open: open, request: request, UA: UA, BANGUMI_UA: BANGUMI_UA };
