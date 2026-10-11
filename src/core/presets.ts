import { isSpring, resolveEase, springConfigOf, springDuration, springValue } from './easing.js';
import type { Ease, Preset, PresetName, PresetSpec } from './types.js';

export const presetNames: PresetName[] = [
  'fade',
  'fadeUp',
  'fadeDown',
  'fadeLeft',
  'fadeRight',
  'pop',
  'zoom',
  'slideUp',
  'slideDown',
  'slideLeft',
  'slideRight',
  'typewriter',
  'wipe',
  'blur',
];

export interface PresetEffect {
  opacity: number;
  dx: number;
  dy: number;
  scale: number;
  /** 0..1 fraction of characters shown (typewriter). */
  reveal: number;
  /** 0..1 fraction of the box shown, left→right (wipe). */
  clip: number;
  blur: number;
}

export const identityEffect = (): PresetEffect => ({ opacity: 1, dx: 0, dy: 0, scale: 1, reveal: 1, clip: 1, blur: 0 });

export function normalizePreset(p: Preset): PresetSpec {
  return typeof p === 'string' ? { type: p } : p;
}

function defaultEase(type: PresetName): Ease {
  if (type === 'pop') return { spring: { damping: 12 } };
  if (type === 'typewriter') return 'linear';
  if (type.startsWith('slide')) return 'easeOutQuart';
  return 'easeOutCubic';
}

/** Duration of a preset in seconds (springs: until settled). */
export function presetDuration(p: Preset, textLength = 0): number {
  const spec = normalizePreset(p);
  const ease = spec.ease ?? defaultEase(spec.type);
  if (spec.dur !== undefined) return spec.dur;
  if (isSpring(ease)) return springDuration(springConfigOf(ease));
  if (spec.type === 'typewriter') return Math.max(0.2, textLength * 0.05);
  return 0.5;
}

/** Visibility 0..1 for a preset `elapsed` seconds into it (springs may overshoot 1). */
function presetProgress(spec: PresetSpec, elapsed: number, dur: number): number {
  const ease = spec.ease ?? defaultEase(spec.type);
  if (isSpring(ease)) return springValue(elapsed, springConfigOf(ease));
  if (dur <= 0) return elapsed >= 0 ? 1 : 0;
  const p = Math.min(1, Math.max(0, elapsed / dur));
  return resolveEase(ease)(p);
}

function apply(fx: PresetEffect, spec: PresetSpec, p: number, isExit: boolean, frameW: number, frameH: number) {
  const q = 1 - p;
  const sign = isExit ? -1 : 1;
  const d = spec.distance;
  switch (spec.type) {
    case 'fade':
      fx.opacity *= clamp01(p);
      break;
    case 'fadeUp':
      fx.opacity *= clamp01(p);
      fx.dy += sign * q * (d ?? 40);
      break;
    case 'fadeDown':
      fx.opacity *= clamp01(p);
      fx.dy -= sign * q * (d ?? 40);
      break;
    case 'fadeLeft':
      fx.opacity *= clamp01(p);
      fx.dx += sign * q * (d ?? 40);
      break;
    case 'fadeRight':
      fx.opacity *= clamp01(p);
      fx.dx -= sign * q * (d ?? 40);
      break;
    case 'pop':
      fx.scale *= Math.max(0, p);
      break;
    case 'zoom':
      fx.scale *= 0.6 + 0.4 * p;
      fx.opacity *= clamp01(p);
      break;
    case 'slideUp':
      fx.dy += sign * q * (d ?? frameH);
      break;
    case 'slideDown':
      fx.dy -= sign * q * (d ?? frameH);
      break;
    case 'slideLeft':
      fx.dx += sign * q * (d ?? frameW);
      break;
    case 'slideRight':
      fx.dx -= sign * q * (d ?? frameW);
      break;
    case 'typewriter':
      fx.reveal *= clamp01(p);
      break;
    case 'wipe':
      fx.clip *= clamp01(p);
      break;
    case 'blur':
      fx.blur += q * (d ?? 20);
      fx.opacity *= clamp01(p);
      break;
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Combined effect of a node's enter and exit presets at local time t. */
export function presetEffect(
  enter: Preset | undefined,
  exit: Preset | undefined,
  t: number,
  duration: number,
  frameW: number,
  frameH: number,
  textLength = 0,
): PresetEffect {
  const fx = identityEffect();
  if (enter) {
    const spec = normalizePreset(enter);
    const dur = presetDuration(spec, textLength);
    apply(fx, spec, presetProgress(spec, t - (spec.delay ?? 0), dur), false, frameW, frameH);
  }
  if (exit) {
    // Exits default to an ease-in curve (accelerate out), never a spring.
    const base = normalizePreset(exit);
    const spec: PresetSpec = { ...base, ease: base.ease ?? (base.type === 'typewriter' ? 'linear' : 'easeInCubic') };
    const dur = presetDuration(spec, textLength);
    const exitStart = duration - (spec.delay ?? 0) - dur;
    if (t >= exitStart) {
      // Exit runs "backwards": visibility 1 at exitStart → 0 at the end.
      const p = 1 - presetProgress(spec, t - exitStart, dur);
      apply(fx, spec, p, true, frameW, frameH);
    }
  }
  return fx;
}
