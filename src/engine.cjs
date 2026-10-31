'use strict';
const cheerio = require('cheerio');
const URL = require('url').URL;
const crypto = require('crypto');
const transport = require('./transport.cjs');
function text(v) { return v == null ? '' : String(v).trim(); }
function absolute(url, base) { const u = new URL(text(url), base); if (!/^https?:$/.test(u.protocol)) throw new Error('规则产生非 HTTP 地址'); return u.href; }
function jsonPath(data, expression) {
  if (!expression) return [];
  let p = expression.trim();
  if (p[0] !== '$') throw new Error('JSONPath 必须以 $ 开头: ' + p);
  p = p.slice(1); let items = [data];
  while (p) {
    let keys, m;
    if ((m = /^\.([\w-]+)/.exec(p))) { keys = [m[1]]; p = p.slice(m[0].length); }
    else if (p.indexOf('.*') === 0) { keys = ['*']; p = p.slice(2); }
    else if ((m = /^\[([^\]]+)\]/.exec(p))) {
      const inner = m[1].trim();
      if (inner === '*') keys = ['*'];
      else if (/^-?\d+$/.test(inner)) keys = [Number(inner)];
      else {
        const parts = inner.match(/'[^']*'|"[^"]*"/g);
        if (!parts || parts.join('').replace(/\s/g, '') !== inner.replace(/[,\s]/g, '')) throw new Error('不支持此 JSONPath 表达式: ' + expression);
        keys = parts.map(function (s) { return s.slice(1, -1); });
      }
      p = p.slice(m[0].length);
    } else throw new Error('不支持此 JSONPath 表达式: ' + expression);
    const next = [];
    items.forEach(function (item) {
      if (item == null || typeof item !== 'object') return;
      keys.forEach(function (key) {
        if (key === '*') Object.keys(item).forEach(function (k) { next.push(item[k]); });
        else if (Object.prototype.hasOwnProperty.call(item, key)) next.push(item[key]);
      });
    });
    items = next;
  }
  return items;
}
function first(obj, p) { return jsonPath(obj, p)[0]; }
function list(obj, p) { const r = jsonPath(obj, p); return r.length === 1 && Array.isArray(r[0]) ? r[0] : r; }
function template(s, vars, mode) {
  return String(s || '').replace(/\{(\w+)\}/g, function (_, k) {
    if (!Object.prototype.hasOwnProperty.call(vars, k)) throw new Error('规则模板变量缺失: ' + k);
    const v = String(vars[k] == null ? '' : vars[k]);
    if (mode === 'url') return encodeURIComponent(v);
    if (mode === 'json') return JSON.stringify(v).slice(1, -1);
    return v;
  });
}
function headers(s) {
  const out = {};
  String(s || '').split(/\r?\n/).forEach(function (line) { const i = line.indexOf(':'); if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim(); });
  return out;
}
function compileRegex(pattern) {
  let flags = '';
  pattern = pattern.replace(/^\(\?([ims]+)\)/, function (_, f) { flags = f.replace(/s/g, ''); return ''; });
  let out = '', escaped = false, inClass = false, groups = 0; const names = {};
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (escaped) { out += c; escaped = false; continue; }
    if (c === '\\') { out += c; escaped = true; continue; }
    if (c === '[') inClass = true;
    if (c === ']') inClass = false;
    if (c === '(' && !inClass) {
      const named = /^\(\?<([A-Za-z]\w*)>/.exec(pattern.slice(i));
      if (named) { names[named[1]] = ++groups; out += '('; i += named[0].length - 1; continue; }
      if (pattern[i + 1] !== '?') groups++;
    }
    out += c;
  }
  const regex = new RegExp(out, flags);
  return { exec: function (s) { const m = regex.exec(s); if (m) { m.named = {}; Object.keys(names).forEach(function (k) { m.named[k] = m[names[k]]; }); } return m; }, test: function (s) { return regex.test(s); } };
}
function groupOrText(pattern, value, name) { if (!pattern) return value; const m = compileRegex(pattern).exec(value); return m ? (m.named[name] == null ? m[0] : m.named[name]) : ''; }
function mediaType(url) { return /\.m3u8(?:$|[?#])/i.test(url) ? 'hls' : /\.mpd(?:$|[?#])/i.test(url) ? 'dash' : 'video'; }
class Engine {
  constructor(rules, request) { this.rules = rules; this.request = request || transport.request; this.last = {}; this.cache = {}; this.queue = {}; }
  rule(id) { const r = this.rules.find(function (x) { return x.id === id; }); if (!r) throw new Error('找不到此源规则'); return r; }
  async fetch(rule, url, options) {
    const id = rule.id; const c = rule.arguments.searchConfig;
    const previous = this.queue[id] || Promise.resolve();
    const task = previous.catch(function () {}).then(async () => {
      const gap = c.requestInterval == null ? 1000 : Number(c.requestInterval);
      const wait = Math.max(0, (this.last[id] || 0) + gap - Date.now());
      if (wait) await new Promise(function (r) { setTimeout(r, wait); });
      this.last[id] = Date.now();
      return this.request(url, options || {});
    });
    this.queue[id] = task; return task;
  }
  async api(rule, stage, vars) {
    const c = rule.arguments.searchConfig; const r = stage.request;
    if (!r || !r.url) throw new Error('规则缺少请求地址');
    const h = Object.assign({}, headers(c.headers), headers(template(r.headers, vars)));
    if (c.userAgent) h['user-agent'] = c.userAgent;
    const method = r.method || 'GET'; let body;
    if (method !== 'GET' && r.body) { body = template(r.body, vars, 'json'); JSON.parse(body); if (!h['content-type']) h['content-type'] = 'application/json'; }
    const res = await this.fetch(rule, absolute(template(r.url, vars, 'url'), c.baseUrl), { method: method, headers: h, body: body });
    try { return JSON.parse(res.text); } catch (e) { throw new Error('源站没有返回规则要求的 JSON'); }
  }
  async search(id, keyword) {
    const rule = this.rule(id), c = rule.arguments.searchConfig;
    keyword = text(keyword); if (!keyword) return [];
    const key = id + ':' + keyword; const cached = this.cache[key];
    if (cached && cached.until > Date.now()) return cached.items;
    let items = [];
    if (rule.factoryId === 'json-api') {
      const s = c.search, j = await this.api(rule, s, { keyword: keyword, page: 1, pageSize: s.pageSize || 20 });
      items = list(j, s.selectItems).map(function (x) { const rid = text(first(x, s.selectId)), name = text(first(x, s.selectName)); return { sourceId: id, id: rid, name: name, url: template(s.subjectUrlTemplate, { id: rid }, 'url') }; }).filter(function (x) { return x.id && x.name; });
    } else {
      const vars = { keyword: c.searchUseOnlyFirstWord ? keyword.split(/\s+/)[0] : keyword, page: 1 };
      const url = template(c.searchUrl, vars, 'url');
      const res = await this.fetch(rule, url, { headers: { 'User-Agent': c.userAgent || transport.UA } });
      const base = c.rawBaseUrl || res.url || url;
      if (c.subjectFormatId === 'json-path-indexed') {
        let data; try { data = JSON.parse(res.text); } catch (e) { throw new Error('搜索接口未返回 JSON，可能需要站点验证'); }
        const f = c.selectorSubjectFormatJsonPathIndexed, ns = list(data, f.selectNames), ls = list(data, f.selectLinks);
        items = ns.map(function (n, i) { const href = template(f.linkTemplate || '{value}', { value: text(ls[i]), id: text(ls[i]) }); return { name: text(n), url: ls[i] ? absolute(href, base) : '' }; });
      } else {
        const $ = cheerio.load(res.text);
        if (c.subjectFormatId === 'indexed') {
          const f = c.selectorSubjectFormatIndexed, ns = $(f.selectNames).toArray(), ls = $(f.selectLinks).toArray();
          items = ns.map(function (n, i) { const href = ls[i] && $(ls[i]).attr('href'); return { name: text($(n).attr('title') || $(n).text()), url: href ? absolute(template(f.linkTemplate || '{value}', { value: href, id: href }), base) : '' }; });
        } else if (!c.subjectFormatId || c.subjectFormatId === 'a') {
          const f = c.selectorSubjectFormatA || {};
          items = $(f.selectLists || 'a').toArray().map(function (n) { const href = $(n).attr('href'); return { name: text($(n).attr('title') || $(n).text()), url: href ? absolute(template(f.linkTemplate || '{value}', { value: href, id: href }), base) : '' }; });
        } else throw new Error('尚不支持此搜索规则格式: ' + c.subjectFormatId);
      }
      const seen = {};
      items = items.filter(function (x) { if (!x.name || !x.url || seen[x.url]) return false; seen[x.url] = true; return true; }).map(function (x) { x.id = x.url; x.sourceId = id; return x; });
    }
    if (!items.length) throw new Error('此源没有找到结果；也可能是站点验证或规则已失效，请换源');
    this.cache[key] = { until: Date.now() + Math.min(c.searchCacheTtl || 300000, 1800000), items: items };
    return items.slice(0,80);
  }
  async detail(id, subject) {
    const rule = this.rule(id), c = rule.arguments.searchConfig;
    let channels;
    if (rule.factoryId === 'json-api') {
      const s = c.subject, data = await this.api(rule, s, { id: subject.id, url: subject.url, name: subject.name });
      const f = s.episodes;
      let groups;
      if (s.channelFormatId === 'grouped') groups = list(data, s.channelFormatGrouped.selectChannels).map(function (x) { const name = text(first(x, s.channelFormatGrouped.selectChannelName)); return { name: name, match: name, data: x }; });
      else if (s.channelFormatId === 'declared') groups = s.channelFormatDeclared.channels.map(function (x) { return { name: x.name, match: x.match, data: data }; });
      else groups = [{ name: '默认线路', match: null, data: data }];
      channels = groups.map(function (g) {
        const eps = list(g.data, f.selectEpisodes).map(function (e, i) {
          const eid = text(first(e, f.selectId)), rawName = text(first(e, f.selectName));
          const sort = text(first(e, f.selectSort)) || groupOrText(f.matchEpisodeSortFromName || '第\\s*(?<ep>.+?)\\s*[话集]', rawName, 'ep') || String(i+1);
          return { id: eid, name: f.nameTemplate ? template(f.nameTemplate, { sort: sort, name: rawName, id: eid }) : rawName || '第' + sort + '集', sort: sort, type: text(first(e, f.selectType)), url: template(f.episodeUrlTemplate, { id: eid, subjectId: subject.id }, 'url'), videoUrl: text(first(e, f.selectVideoUrl)), channelMatch: g.match, channelName: g.name };
        }).filter(function (e) { return e.id; });
        return { name: g.name, match: g.match, episodes: eps };
      });
    } else {
      const res = await this.fetch(rule, subject.url, { headers: { 'User-Agent': c.userAgent || transport.UA } });
      const $ = cheerio.load(res.text); const base = c.rawBaseUrl || res.url || subject.url;
      const grouped = !c.channelFormatId || c.channelFormatId === 'index-grouped';
      if (!grouped && c.channelFormatId !== 'no-channel') throw new Error('尚不支持此剧集规则格式');
      const f = grouped ? c.selectorChannelFormatFlattened : c.selectorChannelFormatNoChannel;
      const labels = grouped ? $(f.selectChannelNames).toArray().map(function (e) { return text($(e).text()); }) : ['默认线路'];
      const lists = grouped ? $(f.selectEpisodeLists).toArray() : [$.root()[0]];
      channels = lists.map(function (l, index) {
        const label = labels[index] || '线路' + (index+1), match = groupOrText(f.matchChannelName || '', label, 'ch') || label;
        const $list = $(l), es = $list.find(grouped ? f.selectEpisodesFromList : f.selectEpisodes).toArray();
        const linkSelector = grouped ? f.selectEpisodeLinksFromList : f.selectEpisodeLinks;
        const links = linkSelector ? $list.find(linkSelector).toArray() : es;
        const episodes = es.map(function (e, i) {
          const name = text($(e).text() || $(e).attr('title')), href = links[i] && $(links[i]).attr('href');
          if (!name || !href || /^javascript:/i.test(href)) return null;
          const url = absolute(href, base), sort = groupOrText(f.matchEpisodeSortFromName || '第\\s*(?<ep>.+?)\\s*[话集]', name, 'ep');
          return { id: url, url: url, name: name, sort: sort || String(i+1), channelName: label, channelMatch: match };
        }).filter(Boolean);
        return { name: label, match: match, episodes: episodes };
      });
    }
    channels = channels.filter(function (g) { return g.episodes.length; });
    const tiers = rule.arguments.channelTiers || {};
    channels.sort(function (a,b) { return (tiers[a.name] == null ? 9 : tiers[a.name]) - (tiers[b.name] == null ? 9 : tiers[b.name]); });
    if (!channels.length) throw new Error('未按原始规则找到剧集，源站可能已变化或需要验证');
    return { subject: subject, channels: channels };
  }
  async resolve(id, subject, episode) {
    const rule = this.rule(id), c = rule.arguments.searchConfig;
    if (rule.factoryId === 'json-api') {
      const stage = c.play || {}; let url = '';
      if (c.subject.episodes.selectVideoUrl) {
        const fresh = await this.detail(id, subject);
        fresh.channels.forEach(function (g) { if (g.match === episode.channelMatch) { const e = g.episodes.find(function (x) { return x.id === episode.id; }); if (e) url = e.videoUrl; } });
      } else {
        const j = await this.api(rule, stage, { id: episode.id, subjectId: subject.id, url: episode.url, name: episode.name, channel: episode.channelName || '', channelMatch: episode.channelMatch || '' });
        if (stage.selectCandidates) {
          const candidates = list(j, stage.selectCandidates).map(function (x) { return { channel: text(first(x, stage.selectCandidateChannel)), url: text(first(x, stage.selectVideoUrl)) }; }).filter(function (x) { return /^https?:\/\//i.test(x.url); });
          let chosen = candidates.find(function (x) { return x.channel.toLowerCase() === text(episode.channelMatch).toLowerCase(); });
          if (!chosen && stage.fallbackToFirstCandidate === true) chosen = candidates[0];
          if (!chosen && !stage.selectCandidateChannel) chosen = candidates[0];
          if (!chosen) throw new Error('规则指定线路暂无可用播放地址，请切换线路');
          url = chosen.url;
        } else url = text(first(j, stage.selectVideoUrl || '$.url'));
      }
      url = absolute(url, c.baseUrl);
      return { url: url, type: mediaType(url), headers: Object.assign({}, c.userAgent ? { 'User-Agent': c.userAgent } : {}, stage.referer ? { Referer: template(stage.referer, { url: episode.url, subjectId: subject.id, id: episode.id }) } : {}), trace: ['原始 JSON API 规则', '电视端请求播放接口'] };
    }
    return this.resolveWeb(rule, episode.url, subject.url);
  }
  async resolveWeb(rule, pageUrl, referer) {
    const c = rule.arguments.searchConfig, m = c.matchVideo || {};
    const pattern = compileRegex(m.matchVideoUrl || 'https?://.+\\.(mp4|m3u8)(\\?.*)?$');
    const h = { 'User-Agent': c.userAgent || (m.addHeadersToVideo || {}).userAgent || transport.UA, Referer: (m.addHeadersToVideo || {}).referer || referer || pageUrl };
    if (m.cookies) h.Cookie = m.cookies;
    const queue = [pageUrl], seen = {}, trace = [];
    for (let count = 0; queue.length && count < 6; count++) {
      const current = queue.shift(); if (seen[current]) continue; seen[current] = true;
      const res = await this.fetch(rule, current, { headers: h });
      trace.push('电视解析第 ' + (count+1) + ' 层页面');
      if (/^#EXTM3U/.test(res.text)) return { url: res.url, type: 'hls', headers: h, trace: trace };
      const $ = cheerio.load(res.text), candidates = [];
      $('video[src],source[src],iframe[src]').each(function (_, e) { candidates.push($(e).attr('src')); });
      $('script').each(function (_, e) {
        const s = $(e).html() || '';
        const re = /(?:var\s+)?player_[\w]+\s*=\s*/g; let hit;
        while ((hit = re.exec(s))) {
          const start = s.indexOf('{', hit.index + hit[0].length); if (start < 0) continue;
          let depth = 0, quoted = false, esc = false, end = -1;
          for (let i = start; i < s.length; i++) { const ch = s[i]; if (esc) { esc = false; continue; } if (ch === '\\' && quoted) { esc = true; continue; } if (ch === '"') quoted = !quoted; if (!quoted) { if (ch === '{') depth++; if (ch === '}' && --depth === 0) { end = i+1; break; } } }
          if (end > start) { try { const obj = JSON.parse(s.slice(start,end)); let u = text(obj.url); if (Number(obj.encrypt) === 1) u = unescape(u); if (Number(obj.encrypt) === 2) u = unescape(Buffer.from(u,'base64').toString('utf8')); if (u) candidates.unshift(u); } catch (e) {} }
        }
        const decoded = s.replace(/\\\//g, '/').replace(/\\u0026/g,'&').replace(/&amp;/g,'&');
        const urls = decoded.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
        urls.forEach(function (u) { candidates.push(u); });
      });
      const nestedSeen = {};
      for (let ci = 0; ci < candidates.length && ci < 120; ci++) {
        const raw = candidates[ci];
        let u; try { u = absolute(raw, res.url); } catch (e) { continue; }
        let match = pattern.exec(u);
        if (match && /^https?:\/\//i.test(match.named.v || match[0])) {
          const video = match.named.v || match[0];
          if (/\.(?:m3u8|mp4|mkv|mpd)(?:[?#]|$)/i.test(video)) return { url: video, type: mediaType(video), headers: h, trace: trace };
        }
        if (m.enableNestedUrl !== false) {
          const parsed = new URL(u);
          parsed.searchParams.forEach(function (v) { if (/^https?:\/\//i.test(v) && !nestedSeen[v]) { nestedSeen[v] = true; candidates.push(v); } });
          if (!seen[u] && (m.matchNestedUrl && compileRegex(m.matchNestedUrl).test(u) || /<iframe/i.test(res.text))) queue.push(u);
        }
      }
    }
    const e = new Error('此源需要网页脚本执行或站点验证，首版静态提取器未取得视频地址；请换源'); e.code = 'BROWSER_REQUIRED'; throw e;
  }
}
function ruleHash(rule) { return crypto.createHash('sha256').update(JSON.stringify(rule)).digest('hex'); }
module.exports = { Engine: Engine, jsonPath: jsonPath, template: template, headers: headers, compileRegex: compileRegex, absolute: absolute, ruleHash: ruleHash };
