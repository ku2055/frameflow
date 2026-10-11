import { naturalLength, contentEnd } from './timeline.js';
import type {
  CircleNode,
  CountSpec,
  Ease,
  GroupNode,
  ImageNode,
  LineNode,
  Node,
  PathNode,
  RectNode,
  SpringConfig,
  TextNode,
  Tween,
  Video,
  VideoConfig,
} from './types.js';

type Props<T extends Node> = Omit<T, 'type'>;

/** Seconds of "hold" appended after the last animation when the video duration is inferred. */
export const INFERRED_HOLD = 1;

/**
 * Create a video. Duration is inferred from the content when omitted.
 *
 *   export default video({ width: 1920, height: 1080 }, [ text('Hello', { enter: 'fadeUp' }) ])
 */
export function video(config: VideoConfig, children: Node[]): Video {
  const fps = config.fps ?? 30;
  // Snap inferred durations to the frame grid and strip float noise (4.7200000001 → 4.72).
  const inferred = Math.max(1, Math.ceil((contentEnd(children) + INFERRED_HOLD) * fps - 1e-6) / fps);
  const duration = config.duration ?? Math.round(inferred * 1e6) / 1e6;
  return {
    type: 'video',
    width: config.width ?? 1920,
    height: config.height ?? 1080,
    fps,
    duration,
    background: config.background ?? '#000000',
    font: config.font ?? 'sans-serif',
    fonts: config.fonts ?? {},
    audio: config.audio ?? [],
    children,
  };
}

/** Fill in defaults for a video object that came from JSON (or a partially specified object). */
export function normalizeVideo(input: Partial<Video> & { children?: Node[] }): Video {
  const { children = [], ...config } = input;
  return video(config as VideoConfig, children);
}

export const text = (text: TextNode['text'], props: Omit<Props<TextNode>, 'text'> = {}): TextNode => ({ type: 'text', text, ...props });

/** A number that counts up/down: counter({ from: 0, to: 12400, dur: 2, prefix: '$', separator: ',' }, { size: 80 }) */
export const counter = (count: CountSpec, props: Omit<Props<TextNode>, 'text' | 'count'> = {}): TextNode => ({ type: 'text', text: '', count, ...props });
export const rect = (props: Props<RectNode>): RectNode => ({ type: 'rect', ...props });
export const circle = (props: Props<CircleNode>): CircleNode => ({ type: 'circle', ...props });
export const line = (props: Props<LineNode>): LineNode => ({ type: 'line', ...props });
export const path = (props: Props<PathNode>): PathNode => ({ type: 'path', ...props });
export const image = (src: string, props: Omit<Props<ImageNode>, 'src'> = {}): ImageNode => ({ type: 'image', src, ...props });
export const group = (children: Node[], props: Omit<Props<GroupNode>, 'children'> = {}): GroupNode => ({
  type: 'group',
  children,
  ...props,
});

export interface SequenceOptions {
  /** When the sequence begins (seconds, relative to parent). */
  start?: number;
  /** Seconds between items. Negative values overlap items (use with enter/exit for crossfades). */
  gap?: number;
}

/**
 * Play nodes one after another. Each item lasts its `duration`, or its natural length
 * (entrance + animations + exit) when no duration is given.
 */
export function sequence(nodes: Node[], options: SequenceOptions = {}): GroupNode {
  let t = 0;
  const gap = options.gap ?? 0;
  const children = nodes.map((n, i) => {
    const duration = n.duration ?? naturalLength(n);
    const placed = { ...n, start: t + (n.start ?? 0), duration } as Node;
    t += (n.start ?? 0) + duration + (i < nodes.length - 1 ? gap : 0);
    return placed;
  });
  return { type: 'group', start: options.start, duration: t, children };
}

export interface StaggerOptions {
  /** When the first item starts (seconds, relative to parent). Default 0. */
  start?: number;
  /** Delay between consecutive items in seconds. Default 0.1. */
  step?: number;
}

/** Start each node `step` seconds after the previous one. */
export function stagger(nodes: Node[], options: StaggerOptions = {}): GroupNode {
  const step = options.step ?? 0.1;
  const base = options.start ?? 0;
  return {
    type: 'group',
    children: nodes.map((n, i) => ({ ...n, start: base + i * step + (n.start ?? 0) }) as Node),
  };
}

/** Tween helper: tween(0, 1, { at: 0.5, dur: 1, ease: 'easeOut' }) */
export function tween<T>(from: T, to: T, options: Omit<Tween<T>, 'from' | 'to'> = {}): Tween<T> {
  return { from, to, ...options };
}

/** Spring ease helper: tween(0, 1, { ease: spring({ damping: 8 }) }) */
export function spring(config: SpringConfig = {}): Ease {
  return { spring: config };
}

/** Deterministic pseudo-random generator (mulberry32). Same seed → same video, every render. */
export function random(seed: number | string): () => number {
  let a = typeof seed === 'number' ? seed : [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761), 1779033703);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
