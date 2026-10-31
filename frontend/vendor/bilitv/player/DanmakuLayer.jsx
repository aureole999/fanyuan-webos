import React, { memo, useRef, useEffect } from 'react';
import { computeDanmakuLayout } from '../../../danmaku.cjs';

const MAX_WINDOW_ITEMS = 128;

function lowerBound(items, time) {
  let lo = 0, hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (items[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export default memo(function DanmakuLayer({ danmakus, currentTime, enabled, paused = false, fontScale = 1, settings = null, mtRef = null }) {
  const containerRef = useRef(null);
  const renderedRef = useRef(new Set());
  const layout = computeDanmakuLayout(settings || { danmakuScale: fontScale });
  const {
    baseFontSize,
    trackHeight,
    trackCount,
    durationSec,
    maxVisible,
    separationPx,
    fontWeight,
    strokeWidthPx,
    textShadow,
    enableFloating,
    enableColor,
  } = layout;
  const trackRef = useRef([]);
  const lastTimeRef = useRef(null);

  useEffect(() => {
    renderedRef.current.clear();
    trackRef.current = new Array(trackCount).fill(0);
    lastTimeRef.current = null;
    if (containerRef.current) containerRef.current.textContent = '';
  }, [danmakus, trackCount, enabled, enableFloating]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const children = container.children;
    for (let i = 0; i < children.length; i++) {
      const el = children[i];
      const tr = Number(el.dataset.track) || 0;
      const rawSize = Number(el.dataset.size) || 28;
      const rawColor = el.dataset.color || '#fff';
      el.style.top = `${tr * trackHeight + 18}px`;
      el.style.fontSize = `${Math.round(rawSize * layout.fontScale)}px`;
      el.style.color = enableColor ? rawColor : '#fff';
    }
  }, [trackHeight, layout.fontScale, enableColor]);

  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !enableFloating || !danmakus || !container) return;
    const now = currentTime, last = lastTimeRef.current;
    if (last !== null && (now < last - 1.5 || now > last + 2)) {
      renderedRef.current.clear();
      trackRef.current.fill(0);
      container.textContent = '';
    }
    lastTimeRef.current = now;
    if (paused) return;
    const start = lowerBound(danmakus, now - 0.5);
    renderedRef.current.forEach(i => { if (i < start) renderedRef.current.delete(i); });
    const batch = document.createDocumentFragment();
    let visible = container.childElementCount;
    for (let i = start; i < Math.min(danmakus.length, start + MAX_WINDOW_ITEMS); i++) {
      const dm = danmakus[i];
      if (dm.time > now + 0.3) break;
      if (renderedRef.current.has(i)) continue;
      if (dm.mode !== 1 && dm.mode !== undefined) continue;
      const text = mtRef ? mtRef.current?.get(i) : dm.text;
      if (!text) continue;
      renderedRef.current.add(i);
      if (visible >= maxVisible) continue;
      const track = trackRef.current.findIndex(free => free <= now);
      if (track < 0 || track >= trackCount) continue;
      const estWidth = Math.max(baseFontSize * 2, text.length * baseFontSize * 0.92) + separationPx;
      const occupySec = Math.max(1.1, (estWidth / (1920 + estWidth)) * durationSec);
      trackRef.current[track] = now + occupySec;
      const rawColor = dm.color || '#fff';
      const rawSize = dm.size || 28;
      const el = document.createElement('div');
      el.className = 'danmaku-item';
      el.textContent = text;
      el.dataset.track = String(track);
      el.dataset.size = String(rawSize);
      el.dataset.color = rawColor;
      el.style.top = `${track * trackHeight + 18}px`;
      el.style.color = enableColor ? rawColor : '#fff';
      el.style.fontSize = `${Math.round(rawSize * layout.fontScale)}px`;
      el.style.animationDuration = `${durationSec}s`;
      batch.appendChild(el);
      visible++;
    }
    container.appendChild(batch);
  }, [currentTime, danmakus, enabled, enableFloating, paused, layout.fontScale, baseFontSize, trackHeight, trackCount, durationSec, maxVisible, separationPx, enableColor, mtRef]);

  if (!enabled || !enableFloating) return null;
  return <div
    ref={containerRef}
    className={'danmaku-container' + (paused ? ' danmaku-paused' : '')}
    style={{
      fontWeight,
      WebkitTextStroke: strokeWidthPx > 0 ? `${strokeWidthPx}px rgba(0, 0, 0, 0.92)` : '0px transparent',
      textShadow,
    }}
    onAnimationEnd={e => { if (e.target.parentNode === e.currentTarget) e.target.remove(); }}
  />;
});
