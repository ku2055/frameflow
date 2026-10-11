import type { Ease, EaseName, SpringConfig } from './types.js';

export type EaseFn = (t: number) => number;

const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;

export const easings: Record<Exclude<EaseName, 'spring'>, EaseFn> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => 1 - Math.pow(1 - t, 4),
  easeInOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeInBack: (t) => c3 * t * t * t - c1 * t * t,
  easeOutBack: (t) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
  easeInOutBack: (t) =>
    t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2,
  easeOutElastic: (t) =>
    t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  easeOutBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

/** CSS cubic-bezier timing function (same algorithm as browsers). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EaseFn {
  const ax = 3 * x1 - 3 * x2 + 1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 3 * y1 - 3 * y2 + 1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return sampleY(t);
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

/**
 * Damped spring from 0 to 1 at `t` seconds (closed-form solution, initial velocity 0).
 * Same physics model as Remotion's spring(): mass, stiffness, damping.
 */
export function springValue(t: number, config: SpringConfig = {}): number {
  if (t <= 0) return 0;
  const m = config.mass ?? 1;
  const k = config.stiffness ?? 100;
  const c = config.damping ?? 10;
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  if (zeta === 1) {
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  }
  const s = Math.sqrt(zeta * zeta - 1);
  const r1 = -w0 * (zeta - s);
  const r2 = -w0 * (zeta + s);
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}

/** Seconds until a spring is visually settled (within 0.1% of its target and slow). */
export function springDuration(config: SpringConfig = {}): number {
  const step = 1 / 240;
  let settledSince = -1;
  for (let t = 0; t < 30; t += step) {
    const v = springValue(t, config);
    if (Math.abs(1 - v) < 0.001) {
      if (settledSince < 0) settledSince = t;
      if (t - settledSince > 0.25) return settledSince;
    } else {
      settledSince = -1;
    }
  }
  return 30;
}

export function isSpring(ease: Ease | undefined): ease is 'spring' | { spring: SpringConfig } {
  return ease === 'spring' || (typeof ease === 'object' && ease !== null && 'spring' in ease);
}

export function springConfigOf(ease: 'spring' | { spring: SpringConfig }): SpringConfig {
  return ease === 'spring' ? {} : ease.spring;
}

/** Resolve an Ease to a function over normalized time 0..1. Springs are handled separately. */
export function resolveEase(ease: Ease | undefined, fallback: EaseFn = easings.easeInOutCubic): EaseFn {
  if (ease === undefined) return fallback;
  if (typeof ease === 'function') return ease;
  if (typeof ease === 'string') {
    if (ease.startsWith('cubic-bezier(')) {
      const nums = ease.slice(13, -1).split(',').map(Number);
      if (nums.length === 4 && nums.every((n) => Number.isFinite(n))) {
        return cubicBezier(nums[0]!, nums[1]!, nums[2]!, nums[3]!);
      }
      throw new Error(`Invalid ease "${ease}" — expected cubic-bezier(x1, y1, x2, y2)`);
    }
    if (ease === 'spring') {
      const d = springDuration();
      return (t) => springValue(t * d);
    }
    const fn = easings[ease as Exclude<EaseName, 'spring'>];
    if (!fn) throw new Error(`Unknown ease "${ease}". Valid: ${Object.keys(easings).join(', ')}, spring, cubic-bezier(...)`);
    return fn;
  }
  const cfg = ease.spring;
  const d = springDuration(cfg);
  return (t) => springValue(t * d, cfg);
}

export const easeNames = [...Object.keys(easings), 'spring'] as EaseName[];
