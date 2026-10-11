// Logo reveal: outline draws on, SVG-path mark pops in with a glow, wordmark wipes, tagline blurs in.
import { video, text, circle, line, path, group, spring } from 'frameflow';

const W = 1280;
const H = 720;
const CX = 640;
const CY = 290;
const R = 120;
// closed hexagon outline, in local coords (origin = logo center)
const hex: Array<[number, number]> = Array.from({ length: 7 }, (_, i) => {
  const a = ((i * 60 - 90) * Math.PI) / 180;
  return [Math.cos(a) * R, Math.sin(a) * R];
});

const MARK_A = 'M-52 -46 L8 -46 L52 -46 L52 -22 L-24 -22 L-24 -4 L30 -4 L30 20 L-24 20 L-24 52 L-52 52 Z'; // an "F"
const MARK_B = 'M6 24 L52 24 L52 52 L6 52 Z'; // accent block

export default video({ width: W, height: H, fps: 30, duration: 7, font: 'DejaVu Sans', background: { type: 'radial', stops: [[0, '#1c2541'], [1, '#05070f']] } }, [
  // soft glow behind the logo
  circle({ x: CX, y: CY, r: { from: 0, to: 260, at: 0.2, dur: 1.6, ease: 'easeOutCubic' }, fill: { type: 'radial', stops: [[0, 'rgba(56,189,248,0.35)'], [1, 'rgba(56,189,248,0)']] }, opacity: { '0': 0, '1.5': 1, '5.5': 1, '6.8': 0.6 } }),

  group(
    [
      // 1. outline draws on
      line({ points: hex, color: '#38bdf8', width: 8, progress: { from: 0, to: 1, at: 0.2, dur: 1.3, ease: 'easeInOutCubic' }, shadow: { color: '#38bdf8', blur: 24 } }),
      // 2. the mark pops in with a glow
      group(
        [
          path({ d: MARK_A, fill: '#e0f2fe' }),
          path({ d: MARK_B, fill: '#f472b6' }),
        ],
        { enter: { type: 'pop', delay: 1.2, ease: spring({ damping: 9 }) }, shadow: { color: '#38bdf8', blur: 36 } },
      ),
    ],
    { x: CX, y: CY, rotate: { '0': -30, '1.5': 0, ease: 'easeOutCubic' }, exit: { type: 'fade', dur: 0.6, delay: 0.1 } },
  ),

  // 3. wordmark wipes in
  text('AURORA', { x: CX, y: 520, size: 88, weight: 'bold', letterSpacing: 18, color: '#f8fafc', start: 1.9, enter: { type: 'wipe', dur: 0.8, ease: 'easeOutQuart' }, shadow: { color: '#38bdf8', blur: 20 } }),
  // 4. underline draws on
  line({ points: [[470, 575], [810, 575]], color: '#f472b6', width: 4, progress: { from: 0, to: 1, at: 2.6, dur: 0.7, ease: 'easeOutCubic' } }),
  // 5. tagline blurs in
  text('light the way forward', { x: CX, y: 625, size: 28, letterSpacing: 6, color: '#94a3b8', start: 3.0, enter: { type: 'blur', dur: 0.9, distance: 24 } }),
]);
