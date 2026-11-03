import React, { memo, useRef, useEffect } from 'react';
import { computeDanmakuLayout } from '../../../danmaku.cjs';

const MAX_WINDOW_ITEMS = 128;

// Scroll with pixel keyframes through the Web Animations API. The CSS animation ended at
// translateX(-100%), a value that depends on the box size; Chromium 79 (webOS 6) cannot run such an
// animation on the compositor, so every comment was ticked on the main thread each frame. On the
// LG C1 with 40 comments on screen: 40-43 fps with ~50 frames over 34 ms per 10 s, against 56-57 fps
// with 2-4 such frames once the end point is the element's measured width in pixels.
function scroll(el, durationMs) {
  const anim = el.animate(
    [{ transform: 'translateX(1920px)' }, { transform: `translateX(${-el.offsetWidth}px)` }],
    { duration: durationMs, easing: 'linear', fill: 'forwards' },
  );
  anim.onfinish = () => el.remove();
  el._scroll = anim;
}

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

  // Pausing the video freezes the comments on screen, and playing resumes them.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    for (const el of container.children) {
      if (el._scroll) { if (paused) el._scroll.pause(); else el._scroll.play(); }
    }
  }, [paused]);

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
    const batch = document.createDocumentFragment(), added = [];
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
      batch.appendChild(el);
      added.push(el);
      visible++;
    }
    container.appendChild(batch);
    // One layout for the whole batch: the first width read lays it out, the rest are cached.
    for (const el of added) scroll(el, durationSec * 1000);
  }, [currentTime, danmakus, enabled, enableFloating, paused, layout.fontScale, baseFontSize, trackHeight, trackCount, durationSec, maxVisible, separationPx, enableColor, mtRef]);

  if (!enabled || !enableFloating) return null;
  return <div
    ref={containerRef}
    className="danmaku-container"
    style={{
      fontWeight,
      WebkitTextStroke: strokeWidthPx > 0 ? `${strokeWidthPx}px rgba(0, 0, 0, 0.92)` : '0px transparent',
      textShadow,
    }}
  />;
});
