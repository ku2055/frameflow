import { isSpring, resolveEase, springConfigOf, springDuration, springValue } from './easing.js';
import type { Animatable, Ease, FrameInfo, Keyframes, Length, Tween } from './types.js';

export const DEFAULT_TWEEN_DUR = 0.5;

export function isTween(v: unknown): v is Tween<unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && 'from' in v && 'to' in v;
}

/** Non-time keys allowed in a keyframes object. */
export const KEYFRAME_OPTIONS = ['ease', 'loop', 'yoyo'];

export function isKeyframes(v: unknown): v is Keyframes<unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v) || isTween(v)) return false;
  const keys = Object.keys(v).filter((k) => !KEYFRAME_OPTIONS.includes(k));
  return keys.length > 0 && keys.every((k) => k.trim() !== '' && Number.isFinite(Number(k)));
}

/** Eased progress 0..1 (springs may overshoot) of a tween at local time t. */
function tweenProgress(t: number, at: number, dur: number, ease: Ease | undefined): number {
  if (isSpring(ease)) return springValue(t - at, springConfigOf(ease));
  if (dur <= 0) return t >= at ? 1 : 0;
  const p = Math.min(1, Math.max(0, (t - at) / dur));
  return resolveEase(ease)(p);
}

type Lerp<T> = (a: T, b: T, p: number) => T;

/**
 * Map time inside a repeating cycle. `plays` = total plays (Infinity = forever).
 * With yoyo, every second play runs backwards.
 */
export function cycleTime(local: number, cycle: number, plays: number, yoyo: boolean): number {
  if (local <= 0 || cycle <= 0 || plays <= 1) return local;
  const k = Math.floor(local / cycle);
  if (k >= plays) return yoyo && plays % 2 === 0 ? 0 : cycle;
  const within = local - k * cycle;
  return yoyo && k % 2 === 1 ? cycle - within : within;
}

const playsOf = (r: number | boolean | undefined) => (r === true ? Infinity : typeof r === 'number' ? r : 1);

/**
 * Evaluate an animatable value at the given frame.
 * `norm` converts raw values (e.g. "50%") into interpolatable values (px).
 */
export function evaluate<T, R>(
  value: Animatable<T> | undefined,
  info: FrameInfo,
  fallback: R,
  norm: (v: T) => R,
  lerp: Lerp<R>,
): R {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'function') return norm((value as (i: FrameInfo) => T)(info));
  if (isTween(value)) {
    const tw = value as Tween<T>;
    const at = tw.at ?? 0;
    const dur = tw.dur ?? DEFAULT_TWEEN_DUR;
    const cycle = isSpring(tw.ease) ? springDuration(springConfigOf(tw.ease)) : dur;
    const t = at + cycleTime(info.t - at, cycle, playsOf(tw.repeat), tw.yoyo ?? false);
    const p = tweenProgress(t, at, dur, tw.ease);
    return lerp(norm(tw.from), norm(tw.to), p);
  }
  if (isKeyframes(value)) {
    const kf = value as Keyframes<T>;
    const frames = Object.keys(kf)
      .filter((k) => !KEYFRAME_OPTIONS.includes(k))
      .map((k) => [Number(k), kf[k] as T] as const)
      .sort((a, b) => a[0] - b[0]);
    const first = frames[0]!;
    const last = frames[frames.length - 1]!;
    const t = first[0] + cycleTime(info.t - first[0], last[0] - first[0], playsOf(kf.loop), kf.yoyo ?? false);
    if (t <= first[0]) return norm(first[1]);
    if (t >= last[0]) return norm(last[1]);
    for (let i = 0; i < frames.length - 1; i++) {
      const a = frames[i]!;
      const b = frames[i + 1]!;
      if (t >= a[0] && t < b[0]) {
        const p = tweenProgress(t, a[0], b[0] - a[0], kf.ease as Ease | undefined);
        return lerp(norm(a[1]), norm(b[1]), p);
      }
    }
    return norm(last[1]);
  }
  return norm(value as T);
}

const lerpNum = (a: number, b: number, p: number) => a + (b - a) * p;

export function num(value: Animatable<number> | undefined, info: FrameInfo, fallback: number): number {
  return evaluate(value, info, fallback, (v) => Number(v), lerpNum);
}

/** Resolve a Length ("50%" or px) against a reference size. */
export function toPx(v: Length | string | undefined, ref: number, fallback = 0): number {
  if (v === undefined) return fallback;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (s.endsWith('%')) return (parseFloat(s) / 100) * ref;
  if (s.endsWith('px')) return parseFloat(s);
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  throw new Error(`Invalid length "${v}" — use a number of px or a percentage like "50%"`);
}

export function length(value: Animatable<Length> | undefined, info: FrameInfo, ref: number, fallback: number): number {
  return evaluate(value, info, fallback, (v) => toPx(v, ref), lerpNum);
}
