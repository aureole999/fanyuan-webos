const ON = typeof __PERF__ !== 'undefined' ? __PERF__ : false;

const CAP_PER_KIND = 60;
const buckets = Object.create(null);

const now = () => (typeof performance !== 'undefined' && performance.now
  ? performance.now() : Date.now());

export function mark(kind, ms, extra) {
  if (!ON) return;
  let b = buckets[kind];
  if (!b) b = buckets[kind] = { arr: new Array(CAP_PER_KIND), head: 0, n: 0 };
  b.arr[b.head] = { k: kind, ms: Math.round(ms * 10) / 10, x: extra == null ? 0 : extra };
  b.head = (b.head + 1) % CAP_PER_KIND;
  if (b.n < CAP_PER_KIND) b.n++;
}

export function start(kind) {
  if (!ON) return function () {};
  const t0 = now();
  return (extra) => { mark(kind, now() - t0, extra); };
}

export function markAfterPaint(kind, t0, extra) {
  if (!ON) return;
  if (typeof requestAnimationFrame !== 'function') { mark(kind, now() - t0, extra); return; }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { mark(kind, now() - t0, extra); });
  });
}

function dump() {
  const out = [];
  for (const k in buckets) {
    const b = buckets[k];
    for (let i = 0; i < b.n; i++) out.push(b.arr[(b.head - b.n + i + CAP_PER_KIND) % CAP_PER_KIND]);
  }
  return out;
}

function memory() {
  const m = typeof performance !== 'undefined' && performance.memory;
  if (!m) return null;
  return { used: Math.round(m.usedJSHeapSize / 1048576), total: Math.round(m.totalJSHeapSize / 1048576) };
}

if (ON && typeof window !== 'undefined') {
  window.__perf = {
    dump, memory, mark,
    clear() { for (const k in buckets) delete buckets[k]; },
    longTasks: null,
  };
  try {
    if (typeof PerformanceObserver === 'function' &&
        PerformanceObserver.supportedEntryTypes &&
        PerformanceObserver.supportedEntryTypes.indexOf('longtask') >= 0) {
      const lt = [];
      const attr = Object.create(null);
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          lt.push(Math.round(e.duration));
          if (lt.length > 100) lt.shift();
          const a = (e.attribution && e.attribution[0]) || null;
          const kkey = a ? (a.containerType || 'window') + ':' + (a.containerName || a.containerSrc || '-') : 'unknown';
          attr[kkey] = (attr[kkey] || 0) + Math.round(e.duration);
        }
      }).observe({ entryTypes: ['longtask'] });
      window.__perf.longTasks = () => lt.slice();
      window.__perf.longTaskAttribution = () => Object.assign({}, attr);
    }
  } catch (e) {}
}
