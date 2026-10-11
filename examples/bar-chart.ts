// Data-driven bar chart. Usage:
//   frameflow render examples/bar-chart.ts out/bar-chart.mp4 --props '{"title":"My data","data":[{"label":"A","value":3}]}'
import { video, text, counter, rect, line, group, spring } from 'frameflow';

interface Datum {
  label: string;
  value: number;
}

const DEFAULT_DATA: Datum[] = [
  { label: 'Jan', value: 42 },
  { label: 'Feb', value: 58 },
  { label: 'Mar', value: 51 },
  { label: 'Apr', value: 76 },
  { label: 'May', value: 93 },
  { label: 'Jun', value: 120 },
];

const W = 1280;
const H = 720;
const LEFT = 140;
const RIGHT = 1180;
const BASE = 600; // baseline y
const TOP = 190; // y of the tallest bar's top

export default (props: Record<string, unknown>) => {
  const data = (props.data as Datum[] | undefined) ?? DEFAULT_DATA;
  const title = (props.title as string | undefined) ?? 'Monthly active users (thousands)';
  const max = Math.max(...data.map((d) => d.value));
  const niceMax = Math.ceil(max / 20) * 20;
  const scale = (BASE - TOP) / niceMax;
  const slot = (RIGHT - LEFT) / data.length;
  const barW = Math.min(110, slot * 0.62);
  const top = data.findIndex((d) => d.value === max);

  // horizontal grid lines + tick labels
  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = (niceMax / ticks) * i;
    const y = BASE - v * scale;
    return group(
      [
        line({ points: [[LEFT, y], [RIGHT, y]], color: i === 0 ? '#94a3b8' : '#1e293b', width: i === 0 ? 3 : 2, progress: { from: 0, to: 1, at: 0.1 + i * 0.08, dur: 0.7, ease: 'easeOutCubic' } }),
        text(String(Math.round(v)), { x: LEFT - 20, y, anchor: 'right', size: 20, color: '#64748b', enter: { type: 'fade', delay: 0.2 + i * 0.08 } }),
      ],
    );
  });

  const bars = data.map((d, i) => {
    const cx = LEFT + slot * (i + 0.5);
    const h = d.value * scale;
    const hot = i === top;
    const delay = 0.8 + i * 0.12; // staggered springs: each bar group starts a bit later
    const fill = hot
      ? { type: 'linear' as const, stops: [[0, '#fbbf24'], [1, '#f97316']] as Array<[number, string]> }
      : { type: 'linear' as const, stops: [[0, '#38bdf8'], [1, '#6366f1']] as Array<[number, string]> };
    const grow = spring({ damping: 14, stiffness: 120 });
    // Counting label: counter() animates the number; the group's y rides on the same spring as the bar.
    const label = counter(
      { from: 0, to: d.value, at: 0.15, dur: 0.7, ease: 'easeOutCubic' },
      { x: cx, y: BASE - 30, size: 28, weight: 'bold', color: hot ? '#fbbf24' : '#e2e8f0' },
    );
    return group(
      [
        rect({
          x: cx,
          y: BASE,
          anchor: 'bottom',
          w: barW,
          h: { from: 0, to: h, ease: grow },
          radius: 10,
          fill,
          shadow: hot ? { color: 'rgba(249,115,22,0.6)', blur: 30 } : undefined,
        }),
        group([label], { y: { from: 0, to: -h, ease: grow } }),
        text(d.label, { x: cx, y: BASE + 36, size: 24, color: '#94a3b8', enter: { type: 'fadeUp', dur: 0.4, distance: 14 } }),
      ],
      { start: delay },
    );
  });

  return video({ width: W, height: H, fps: 30, font: 'DejaVu Sans', background: '#0b1220', duration: Math.round((0.8 + data.length * 0.12 + 3.2) * 30) / 30 }, [
    text(title, { x: LEFT, y: 90, anchor: 'left', size: 44, weight: 'bold', color: '#f8fafc', enter: { type: 'fadeRight', dur: 0.6 } }),
    text('Highlighted: best month', { x: LEFT, y: 140, anchor: 'left', size: 22, color: '#fbbf24', enter: { type: 'fade', delay: 1.4 } }),
    ...grid,
    ...bars,
  ]);
};
