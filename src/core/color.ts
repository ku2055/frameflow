import { evaluate } from './animate.js';
import type { Animatable, FrameInfo } from './types.js';

export type RGBA = [number, number, number, number];

const NAMED: Record<string, string> = {
  transparent: '#0000',
  black: '#000',
  white: '#fff',
  red: '#f00',
  green: '#008000',
  blue: '#00f',
  yellow: '#ff0',
  orange: '#ffa500',
  purple: '#800080',
  pink: '#ffc0cb',
  gray: '#808080',
  grey: '#808080',
  cyan: '#0ff',
  magenta: '#f0f',
};

/** Parse #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba() and a few named colors. */
export function parseColor(input: string): RGBA {
  let s = input.trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s]!;
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if ((h.length === 6 || h.length === 8) && /^[0-9a-f]+$/.test(h)) {
      const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
      return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
    }
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.every((p) => Number.isFinite(p))) {
      return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
    }
  }
  throw new Error(`Invalid color "${input}" — use hex (#1e293b), rgb()/rgba(), or a basic name`);
}

export function isColor(input: unknown): boolean {
  if (typeof input !== 'string') return false;
  try {
    parseColor(input);
    return true;
  } catch {
    return false;
  }
}

export function formatColor([r, g, b, a]: RGBA): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.max(0, Math.min(1, a)).toFixed(4)})`;
}

const lerpColor = (a: RGBA, b: RGBA, p: number): RGBA => [
  a[0] + (b[0] - a[0]) * p,
  a[1] + (b[1] - a[1]) * p,
  a[2] + (b[2] - a[2]) * p,
  a[3] + (b[3] - a[3]) * p,
];

/** Evaluate an animatable color. Constant colors are passed through untouched (fast path). */
export function color(value: Animatable<string> | undefined, info: FrameInfo, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value === 'string') return value;
  return formatColor(evaluate(value, info, parseColor(fallback), parseColor, lerpColor));
}
