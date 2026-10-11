import { isKeyframes, isTween, toPx } from './animate.js';
import { isColor } from './color.js';
import { easeNames } from './easing.js';
import { presetNames } from './presets.js';
import type { Node, Video } from './types.js';

export interface Issue {
  level: 'error' | 'warning';
  /** JSON-path-like location, e.g. children[2].enter */
  path: string;
  message: string;
}

const BASE = ['type', 'id', 'start', 'duration', 'x', 'y', 'anchor', 'opacity', 'scale', 'scaleX', 'scaleY', 'rotate', 'blur', 'shadow', 'enter', 'exit'];

export const NODE_PROPS: Record<Node['type'], { required: string[]; optional: string[] }> = {
  text: { required: ['text'], optional: ['count', 'size', 'color', 'font', 'weight', 'italic', 'align', 'maxWidth', 'lineHeight', 'letterSpacing', 'stroke', 'strokeWidth'] },
  rect: { required: ['w', 'h'], optional: ['fill', 'radius', 'stroke', 'strokeWidth'] },
  circle: { required: ['r'], optional: ['fill', 'stroke', 'strokeWidth'] },
  line: { required: ['points'], optional: ['color', 'width', 'progress', 'cap'] },
  path: { required: ['d'], optional: ['fill', 'stroke', 'strokeWidth'] },
  image: { required: ['src'], optional: ['w', 'h', 'fit', 'radius'] },
  group: { required: ['children'], optional: [] },
};

const VIDEO_PROPS = ['type', 'width', 'height', 'fps', 'duration', 'background', 'font', 'fonts', 'audio', 'children'];
const ANCHORS = ['center', 'top', 'bottom', 'left', 'right', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
const NUMERIC = new Set(['opacity', 'scale', 'scaleX', 'scaleY', 'rotate', 'blur', 'size', 'radius', 'r', 'width', 'progress']);
const LENGTHS = new Set(['x', 'y', 'w', 'h']);
const COLORS = new Set(['color', 'fill']);

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length]![b.length]!;
}

/** Suggest the closest known name, if any is close enough to be a typo. */
export function didYouMean(input: string, options: string[]): string {
  let best = '';
  let bestD = Infinity;
  for (const o of options) {
    const d = distance(input.toLowerCase(), o.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  if (bestD <= Math.max(2, Math.floor(input.length / 3))) return ` Did you mean "${best}"?`;
  // Abbreviations and long forms: "rectangle" → "rect", "col" → "color".
  const lower = input.toLowerCase();
  const prefix = options.find((o) => o.length >= 3 && lower.length >= 3 && (lower.startsWith(o.toLowerCase()) || o.toLowerCase().startsWith(lower)));
  return prefix ? ` Did you mean "${prefix}"?` : '';
}

function checkEase(ease: unknown, path: string, issues: Issue[]) {
  if (ease === undefined || typeof ease === 'function') return;
  if (typeof ease === 'string') {
    if (ease.startsWith('cubic-bezier(')) {
      const nums = ease.slice(13, -1).split(',').map(Number);
      if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n)))
        issues.push({ level: 'error', path, message: `Invalid "${ease}" — expected cubic-bezier(x1, y1, x2, y2)` });
      return;
    }
    if (!easeNames.includes(ease as never))
      issues.push({ level: 'error', path, message: `Unknown ease "${ease}".${didYouMean(ease, easeNames)} Valid: ${easeNames.join(', ')}, cubic-bezier(...)` });
    return;
  }
  if (typeof ease === 'object' && ease !== null && 'spring' in ease) return;
  issues.push({ level: 'error', path, message: `Invalid ease — use a name like "easeOut", "spring", { "spring": { "damping": 12 } } or "cubic-bezier(...)"` });
}

function checkScalar(kind: 'number' | 'length' | 'color', v: unknown, path: string, issues: Issue[]) {
  if (kind === 'number' && (typeof v !== 'number' || !Number.isFinite(v)))
    issues.push({ level: 'error', path, message: `Expected a number, got ${JSON.stringify(v)}` });
  if (kind === 'length') {
    try {
      if (typeof v !== 'number' && typeof v !== 'string') throw new Error();
      toPx(v as string, 100);
    } catch {
      issues.push({ level: 'error', path, message: `Expected px number or percentage like "50%", got ${JSON.stringify(v)}` });
    }
  }
  if (kind === 'color' && !isColor(v))
    issues.push({ level: 'error', path, message: `Invalid color ${JSON.stringify(v)} — use hex like "#38bdf8", rgb()/rgba(), or a basic name` });
}

function checkAnimatable(kind: 'number' | 'length' | 'color', v: unknown, path: string, issues: Issue[]) {
  if (v === undefined || typeof v === 'function') return;
  if (kind === 'color' && typeof v === 'object' && v !== null && 'stops' in v) return; // gradient
  if (isTween(v)) {
    const tw = v as unknown as Record<string, unknown>;
    checkScalar(kind, tw.from, `${path}.from`, issues);
    checkScalar(kind, tw.to, `${path}.to`, issues);
    for (const k of ['at', 'dur']) if (tw[k] !== undefined) checkScalar('number', tw[k], `${path}.${k}`, issues);
    checkEase(tw.ease, `${path}.ease`, issues);
    checkRepeat(tw.repeat, `${path}.repeat`, issues);
    const fields = ['from', 'to', 'at', 'dur', 'ease', 'repeat', 'yoyo'];
    for (const k of Object.keys(tw))
      if (!fields.includes(k))
        issues.push({ level: 'error', path: `${path}.${k}`, message: `Unknown tween field "${k}".${didYouMean(k, fields)} Tween fields: ${fields.join(', ')}` });
    return;
  }
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    if (!isKeyframes(v)) {
      const keys = Object.keys(v);
      const hint = keys.some((k) => ['start', 'end', 'begin', 'duration', 'delay'].includes(k))
        ? ' Tweens use { from, to, at, dur, ease } (seconds).'
        : ' Use a constant, a tween { from, to, at, dur, ease }, or keyframes { "0": a, "1.5": b }.';
      issues.push({ level: 'error', path, message: `Not a valid animation.${hint}` });
      return;
    }
    const kf = v as Record<string, unknown>;
    for (const [k, val] of Object.entries(kf)) {
      if (k === 'ease') checkEase(val, `${path}.ease`, issues);
      else if (k === 'loop') checkRepeat(val, `${path}.loop`, issues);
      else if (k === 'yoyo') {
        if (typeof val !== 'boolean') issues.push({ level: 'error', path: `${path}.yoyo`, message: 'yoyo must be true or false' });
      } else {
        if (Number(k) < 0) issues.push({ level: 'error', path: `${path}["${k}"]`, message: 'Keyframe times must be >= 0 seconds' });
        checkScalar(kind, val, `${path}["${k}"]`, issues);
      }
    }
    return;
  }
  checkScalar(kind, v, path, issues);
}

function checkRepeat(v: unknown, path: string, issues: Issue[]) {
  if (v === undefined || v === true) return;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1)
    issues.push({ level: 'error', path, message: 'Must be true (forever) or a whole number of plays >= 1' });
}

function checkPreset(p: unknown, path: string, issues: Issue[]) {
  if (p === undefined) return;
  const type = typeof p === 'string' ? p : typeof p === 'object' && p !== null ? (p as { type?: unknown }).type : undefined;
  if (typeof type !== 'string' || !presetNames.includes(type as never)) {
    issues.push({
      level: 'error',
      path,
      message: `Unknown preset ${JSON.stringify(type)}.${typeof type === 'string' ? didYouMean(type, presetNames) : ''} Valid: ${presetNames.join(', ')}`,
    });
    return;
  }
  if (typeof p === 'object' && p !== null) {
    const spec = p as Record<string, unknown>;
    checkEase(spec.ease, `${path}.ease`, issues);
    for (const k of ['dur', 'distance', 'delay']) if (spec[k] !== undefined) checkScalar('number', spec[k], `${path}.${k}`, issues);
  }
}

function checkNode(node: unknown, path: string, video: Video, parentDuration: number, issues: Issue[]) {
  if (typeof node !== 'object' || node === null) {
    issues.push({ level: 'error', path, message: 'Expected a node object like { "type": "text", "text": "Hi" }' });
    return;
  }
  const n = node as Record<string, unknown>;
  const type = n.type as string;
  const spec = NODE_PROPS[type as Node['type']];
  if (!spec) {
    issues.push({ level: 'error', path: `${path}.type`, message: `Unknown node type ${JSON.stringify(type)}.${typeof type === 'string' ? didYouMean(type, Object.keys(NODE_PROPS)) : ''} Valid: ${Object.keys(NODE_PROPS).join(', ')}` });
    return;
  }
  const known = [...BASE, ...spec.required, ...spec.optional];
  for (const key of Object.keys(n)) {
    if (!known.includes(key))
      issues.push({ level: 'error', path: `${path}.${key}`, message: `"${key}" is not a ${type} property.${didYouMean(key, known)} Allowed: ${known.filter((k) => k !== 'type').join(', ')}` });
  }
  for (const key of spec.required) {
    if (n[key] === undefined) issues.push({ level: 'error', path: `${path}.${key}`, message: `${type} requires "${key}"` });
  }

  for (const [key, v] of Object.entries(n)) {
    if (NUMERIC.has(key)) checkAnimatable('number', v, `${path}.${key}`, issues);
    else if (LENGTHS.has(key)) checkAnimatable('length', v, `${path}.${key}`, issues);
    else if (COLORS.has(key)) checkAnimatable('color', v, `${path}.${key}`, issues);
  }
  if (n.stroke !== undefined) checkScalar('color', n.stroke, `${path}.stroke`, issues);
  if (n.anchor !== undefined && !ANCHORS.includes(n.anchor as string))
    issues.push({ level: 'error', path: `${path}.anchor`, message: `Unknown anchor ${JSON.stringify(n.anchor)}.${didYouMean(String(n.anchor), ANCHORS)} Valid: ${ANCHORS.join(', ')}` });
  checkPreset(n.enter, `${path}.enter`, issues);
  checkPreset(n.exit, `${path}.exit`, issues);

  const start = typeof n.start === 'number' ? n.start : 0;
  if (n.start !== undefined) checkScalar('number', n.start, `${path}.start`, issues);
  if (n.duration !== undefined) {
    checkScalar('number', n.duration, `${path}.duration`, issues);
    if (typeof n.duration === 'number' && n.duration <= 0) issues.push({ level: 'error', path: `${path}.duration`, message: 'duration must be > 0 seconds' });
  }
  if (start >= parentDuration)
    issues.push({ level: 'warning', path: `${path}.start`, message: `Starts at ${start}s but its parent ends at ${round(parentDuration)}s, so it is never visible` });
  const duration = typeof n.duration === 'number' ? n.duration : parentDuration - start;
  if (typeof n.duration === 'number' && start + n.duration > parentDuration + 1e-9)
    issues.push({ level: 'warning', path: `${path}.duration`, message: `Ends at ${round(start + n.duration)}s, after its parent ends (${round(parentDuration)}s) — it will be cut off` });

  // Static position sanity check (only when x/y are constants).
  if (type !== 'group' && type !== 'line' && type !== 'path') {
    for (const [axis, ref] of [['x', video.width], ['y', video.height]] as const) {
      const v = n[axis];
      if (typeof v === 'number' || (typeof v === 'string' && v.endsWith('%'))) {
        const px = toPx(v as number, ref);
        if (px < -ref * 0.5 || px > ref * 1.5)
          issues.push({ level: 'warning', path: `${path}.${axis}`, message: `${axis}=${JSON.stringify(v)} is far outside the ${ref}px frame` });
      }
    }
  }

  if (type === 'text' && typeof n.text !== 'string' && typeof n.text !== 'function')
    issues.push({ level: 'error', path: `${path}.text`, message: 'text must be a string (or a function of time in TypeScript)' });
  if (type === 'text' && n.count !== undefined) {
    const c = n.count as Record<string, unknown>;
    if (!isTween(c)) issues.push({ level: 'error', path: `${path}.count`, message: 'count needs { from, to } (plus optional at, dur, ease, decimals, prefix, suffix, separator)' });
    else {
      checkScalar('number', c.from, `${path}.count.from`, issues);
      checkScalar('number', c.to, `${path}.count.to`, issues);
      checkEase(c.ease, `${path}.count.ease`, issues);
      const fields = ['from', 'to', 'at', 'dur', 'ease', 'repeat', 'yoyo', 'decimals', 'prefix', 'suffix', 'separator'];
      for (const k of Object.keys(c))
        if (!fields.includes(k)) issues.push({ level: 'error', path: `${path}.count.${k}`, message: `Unknown count field "${k}".${didYouMean(k, fields)}` });
    }
  }
  for (const which of ['enter', 'exit'] as const) {
    const p = n[which];
    const pt = typeof p === 'string' ? p : (p as { type?: string } | undefined)?.type;
    if (pt === 'wipe' && (type === 'group' || type === 'path'))
      issues.push({ level: 'warning', path: `${path}.${which}`, message: `"wipe" has no effect on a ${type} (it has no box). Put it on the rect/text/image/circle children, or use "fade"/"pop"/"zoom"` });
  }
  if (type === 'image' && typeof n.src !== 'string') issues.push({ level: 'error', path: `${path}.src`, message: 'src must be a string path or URL' });
  if (type === 'image' && n.fit !== undefined && !['cover', 'contain', 'fill'].includes(n.fit as string))
    issues.push({ level: 'error', path: `${path}.fit`, message: 'fit must be "cover", "contain" or "fill"' });
  if (type === 'line') {
    const pts = n.points;
    if (!Array.isArray(pts) || pts.length < 2 || pts.some((p) => !Array.isArray(p) || p.length !== 2 || p.some((c) => typeof c !== 'number')))
      issues.push({ level: 'error', path: `${path}.points`, message: 'points must be an array of at least two [x, y] number pairs' });
  }
  if (type === 'group') {
    if (!Array.isArray(n.children)) issues.push({ level: 'error', path: `${path}.children`, message: 'group.children must be an array of nodes' });
    else n.children.forEach((c, i) => checkNode(c, `${path}.children[${i}]`, video, duration, issues));
  }
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Validate a video. Returns every problem found, with paths and fix suggestions. */
export function validate(video: Video): Issue[] {
  const issues: Issue[] = [];
  const v = video as unknown as Record<string, unknown>;
  for (const key of Object.keys(v))
    if (!VIDEO_PROPS.includes(key))
      issues.push({ level: 'error', path: key, message: `"${key}" is not a video property.${didYouMean(key, VIDEO_PROPS)} Allowed: ${VIDEO_PROPS.slice(1).join(', ')}` });
  for (const key of ['width', 'height'] as const) {
    const n = video[key];
    if (!Number.isInteger(n) || n <= 0) issues.push({ level: 'error', path: key, message: `${key} must be a positive integer` });
    else if (n % 2 !== 0) issues.push({ level: 'error', path: key, message: `${key}=${n} is odd; H.264 needs even dimensions. Use ${n + 1}` });
  }
  if (!(video.fps > 0 && video.fps <= 240)) issues.push({ level: 'error', path: 'fps', message: 'fps must be between 1 and 240' });
  if (!(video.duration > 0)) issues.push({ level: 'error', path: 'duration', message: 'duration must be > 0 seconds' });
  if (typeof video.background === 'string') checkScalar('color', video.background, 'background', issues);
  if (!Array.isArray(video.children)) {
    issues.push({ level: 'error', path: 'children', message: 'children must be an array of nodes' });
    return issues;
  }
  video.children.forEach((c, i) => checkNode(c, `children[${i}]`, video, video.duration, issues));
  video.audio.forEach((a, i) => {
    if (typeof a?.src !== 'string') issues.push({ level: 'error', path: `audio[${i}].src`, message: 'audio src must be a file path or URL' });
    if (a?.volume !== undefined && !(a.volume >= 0)) issues.push({ level: 'error', path: `audio[${i}].volume`, message: 'volume must be >= 0' });
  });
  return issues;
}

export function formatIssues(issues: Issue[]): string {
  return issues.map((i) => `${i.level === 'error' ? '✖' : '⚠'} ${i.path}: ${i.message}`).join('\n');
}
