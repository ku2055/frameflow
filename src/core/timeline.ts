import { DEFAULT_TWEEN_DUR, KEYFRAME_OPTIONS, isKeyframes, isTween } from './animate.js';
import { isSpring, springConfigOf, springDuration } from './easing.js';
import { presetDuration } from './presets.js';
import type { Node, Tween } from './types.js';

/** Last moment (seconds, relative to the node start) at which an animated prop still changes. */
function animEnd(value: unknown): number {
  if (isTween(value)) {
    const tw = value as Tween<unknown>;
    const dur = isSpring(tw.ease) ? springDuration(springConfigOf(tw.ease)) : (tw.dur ?? DEFAULT_TWEEN_DUR);
    // Infinite repeats count as one play: they shouldn't stretch the video forever.
    const plays = typeof tw.repeat === 'number' ? tw.repeat : 1;
    return (tw.at ?? 0) + dur * plays;
  }
  if (isKeyframes(value)) {
    const times = Object.keys(value as object).filter((k) => !KEYFRAME_OPTIONS.includes(k)).map(Number);
    const loop = (value as { loop?: unknown }).loop;
    const plays = typeof loop === 'number' ? loop : 1;
    return Math.min(...times) + (Math.max(...times) - Math.min(...times)) * plays;
  }
  return 0;
}

const NON_ANIM_KEYS = new Set(['type', 'id', 'start', 'duration', 'children', 'enter', 'exit', 'text', 'src', 'points', 'd']);
// Note: `count` is a tween, so it is included in natural-length inference.

/**
 * How long a node "wants" to be when it has no explicit duration:
 * long enough for its entrance, its exit, and every tween/keyframe to finish.
 */
export function naturalLength(node: Node): number {
  if (node.duration !== undefined) return node.duration;
  // Be defensive: this runs on unvalidated JSON before validate() can report problems.
  const textLen = node.type === 'text' && typeof node.text === 'string' ? node.text.length : 0;
  let len = 0;
  if (node.enter) {
    const spec = typeof node.enter === 'string' ? { type: node.enter } : node.enter;
    len = Math.max(len, (spec.delay ?? 0) + presetDuration(node.enter, textLen));
  }
  for (const [key, value] of Object.entries(node)) {
    if (!NON_ANIM_KEYS.has(key)) len = Math.max(len, animEnd(value));
  }
  if (node.type === 'group' && Array.isArray(node.children)) {
    for (const child of node.children) len = Math.max(len, (child.start ?? 0) + naturalLength(child));
  }
  if (node.exit) len += presetDuration(node.exit, textLen);
  return len;
}

/** End time (seconds) of a list of sibling nodes, using natural lengths where durations are missing. */
export function contentEnd(children: Node[]): number {
  let end = 0;
  for (const c of Array.isArray(children) ? children : []) end = Math.max(end, (c.start ?? 0) + naturalLength(c));
  return end;
}
