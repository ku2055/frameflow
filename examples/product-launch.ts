// ~10s product promo: title card -> 3 feature cards -> call to action, crossfaded with a negative sequence gap.
import { video, text, rect, circle, path, line, group, sequence, stagger } from 'frameflow';

const W = 1280;
const H = 720;
const FONT = 'DejaVu Sans';
const INK = '#f8fafc';
const MUTED = '#a5b4fc';
const ACCENTS = ['#22d3ee', '#f472b6', '#facc15'];

// ---- Scene 1: title card -------------------------------------------------------------------
const title = group(
  [
    circle({ x: 640, y: 250, r: 54, fill: { type: 'linear', stops: [[0, '#22d3ee'], [1, '#6366f1']], angle: 45 }, enter: 'pop', shadow: { color: '#22d3ee', blur: 40 } }),
    path({ d: 'M-16 -22 L26 0 L-16 22 Z', x: 640, y: 250, fill: '#0b1020', enter: { type: 'pop', delay: 0.15 } }),
    text('Meet Pulse', { x: 640, y: 380, size: 104, weight: 'bold', color: INK, enter: { type: 'fadeUp', dur: 0.7, delay: 0.3 } }),
    text('Analytics that keep up with you', { x: 640, y: 470, size: 34, color: MUTED, enter: { type: 'fade', dur: 0.6, delay: 0.8 } }),
  ],
  { duration: 3.4, enter: { type: 'fade', dur: 0.4 }, exit: { type: 'fade', dur: 0.6 } },
);

// ---- Scene 2: feature cards ----------------------------------------------------------------
type Icon = (c: string) => any[];
const icons: Icon[] = [
  // speed: bolt
  (c) => [path({ d: 'M6 -34 L-18 4 L-2 4 L-8 34 L18 -8 L2 -8 Z', fill: c })],
  // insight: three bars
  (c) => [
    rect({ x: -18, y: 14, w: 12, h: 20, fill: c, radius: 3 }),
    rect({ x: 0, y: 4, w: 12, h: 40, fill: c, radius: 3 }),
    rect({ x: 18, y: -8, w: 12, h: 64, fill: c, radius: 3 }),
  ],
  // sync: ring + dot
  (c) => [circle({ r: 28, stroke: c, strokeWidth: 8 }), circle({ r: 9, fill: c })],
];
const features = [
  ['Blazing fast', 'Queries in under 50 ms'],
  ['Clear insights', 'Dashboards that explain'],
  ['Always in sync', 'Every device, instantly'],
];
const cardW = 340;
const cardH = 380;
const cards = features.map(([head, sub], i) => {
  const c = ACCENTS[i]!;
  return group(
    [
      rect({ w: cardW, h: cardH, radius: 28, fill: 'rgba(255,255,255,0.07)', stroke: 'rgba(255,255,255,0.18)', strokeWidth: 2 }),
      circle({ y: -80, r: 62, fill: c, opacity: 0.18 }),
      group(icons[i]!(c), { y: -80, enter: { type: 'pop', delay: 0.25 } }),
      text(head!, { y: 40, size: 36, weight: 'bold', color: INK }),
      text(sub!, { y: 92, size: 22, color: MUTED }),
      rect({ y: 150, w: 60, h: 6, radius: 3, fill: c }),
    ],
    { x: 270 + i * (cardW + 30), y: 370, enter: { type: 'fadeUp', dur: 0.7, distance: 70 } },
  );
});
const features3 = group(
  [
    text('Everything you need', { x: 640, y: 85, size: 52, weight: 'bold', color: INK, enter: { type: "fadeDown", dur: 0.5, delay: 0.4 } }),
    stagger(cards, { start: 0.6, step: 0.22 }),
  ],
  { duration: 3.6, enter: { type: 'fade', dur: 0.4 }, exit: { type: 'fade', dur: 0.6 } },
);

// ---- Scene 3: call to action ---------------------------------------------------------------
const cta = group(
  [
    text('Ready to try it?', { x: 640, y: 240, size: 84, weight: 'bold', color: INK, enter: { type: 'fadeUp', dur: 0.7, delay: 0.5 } }),
    text('Free for 30 days. No credit card.', { x: 640, y: 335, size: 30, color: MUTED, enter: { type: 'fade', delay: 0.9 } }),
    // Button: a positioned group is a container (children default to its origin) and scale pivots on that origin,
    // so pop-in (enter preset) and an endless pulse (looping keyframes) combine on one group.
    group(
      [
        rect({ w: 380, h: 96, radius: 48, fill: { type: 'linear', stops: [[0, '#22d3ee'], [1, '#6366f1']], angle: 0 }, shadow: { color: 'rgba(99,102,241,0.8)', blur: 36, y: 8 } }),
        text('Get started', { size: 36, weight: 'bold', color: '#0b1020' }),
      ],
      { x: 640, y: 480, start: 1.2, enter: 'pop', scale: { '0': 1, '0.6': 1.07, '1.2': 1, loop: true, ease: 'easeInOut' } },
    ),
    line({ points: [[540, 580], [740, 580]], color: '#6366f1', width: 4, progress: { from: 0, to: 1, at: 1.6, dur: 0.8, ease: 'easeOutCubic' } }),
  ],
  { duration: 4, enter: { type: 'fade', dur: 0.4 }, exit: { type: 'fade', dur: 0.5 } },
);

export default video(
  {
    width: W,
    height: H,
    fps: 30,
    font: FONT,
    background: { type: 'linear', stops: [[0, '#0b1020'], [0.55, '#1e1b4b'], [1, '#312e81']], angle: 135 },
  },
  [
    // faint decorative orbs behind everything
    circle({ x: 1100, y: 100, r: 220, fill: '#6366f1', opacity: 0.12 }),
    circle({ x: 120, y: 640, r: 180, fill: '#22d3ee', opacity: 0.1 }),
    sequence([title, features3, cta], { gap: -0.6 }),
  ],
);
