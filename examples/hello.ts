// The benchmark video: same spec as bench/remotion-baseline/src/Promo.tsx
import { video, text, circle, rect, group, stagger } from 'frameflow';

export default video({ width: 1280, height: 720, fps: 30, duration: 6, background: '#0f172a', font: 'DejaVu Sans' }, [
  group(
    [
      text('Hello, Frameflow', { y: 300, size: 96, weight: 'bold', start: 0.2, enter: { type: 'fadeUp', dur: 0.6 } }),
      text('Video as code, made simple', { y: 390, color: '#94a3b8', start: 0.8, enter: { type: 'fade', ease: 'linear' } }),
    ],
    { exit: { type: 'fade', dur: 0.6, ease: 'linear' } },
  ),
  stagger(
    ['#f43f5e', '#22c55e', '#3b82f6'].map((fill, i) => circle({ x: 440 + i * 200, y: 540, r: 40, fill, enter: 'pop' })),
    { start: 1.5, step: 0.15 },
  ),
  rect({ x: 0, y: 704, anchor: 'topLeft', h: 16, w: { from: 0, to: 1280, dur: 6, ease: 'linear' }, fill: '#38bdf8' }),
]);
