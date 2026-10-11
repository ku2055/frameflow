/**
 * Frameflow scene model.
 *
 * A video is plain data: a tree of nodes with times in SECONDS.
 * Everything except function-valued props is JSON-serializable, so the
 * same scene can be written in TypeScript or emitted as JSON by an agent.
 */

export type EaseName =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInQuart'
  | 'easeOutQuart'
  | 'easeInOutQuart'
  | 'easeInSine'
  | 'easeOutSine'
  | 'easeInOutSine'
  | 'easeInExpo'
  | 'easeOutExpo'
  | 'easeInBack'
  | 'easeOutBack'
  | 'easeInOutBack'
  | 'easeOutElastic'
  | 'easeOutBounce'
  | 'spring';

export interface SpringConfig {
  /** Default 1 */
  mass?: number;
  /** Default 100 */
  stiffness?: number;
  /** Default 10 (lower = bouncier) */
  damping?: number;
}

/** A named ease, a CSS-style "cubic-bezier(a,b,c,d)" string, a spring, or a custom function. */
export type Ease = EaseName | `cubic-bezier(${string})` | { spring: SpringConfig } | ((t: number) => number);

/** Animate from one value to another. Times are seconds, relative to the node's start. */
export interface Tween<T = number> {
  from: T;
  to: T;
  /** When the tween starts (seconds after node start). Default 0. */
  at?: number;
  /** How long it takes in seconds. Default 0.5. Ignored for spring eases (they settle naturally). */
  dur?: number;
  ease?: Ease;
  /** Total number of plays, or true to repeat forever. Default 1. */
  repeat?: number | true;
  /** Play every other repetition backwards (ping-pong). */
  yoyo?: boolean;
}

/**
 * Keyframes: an object whose keys are times in seconds (relative to node start).
 * Example: { "0": 0, "0.5": 1, "2.5": 1, "3": 0, "ease": "easeInOut" }
 */
export type Keyframes<T = number> = { [time: string]: T | Ease | boolean | number | undefined } & {
  ease?: Ease;
  /** Repeat the keyframes: total number of plays, or true for forever. */
  loop?: number | true;
  /** Ping-pong every other loop. */
  yoyo?: boolean;
};

export interface FrameInfo {
  /** Seconds since the node started. */
  t: number;
  /** The node's duration in seconds. */
  duration: number;
  /** Progress through the node, 0..1. */
  progress: number;
  /** Absolute time in the video in seconds. */
  time: number;
  /** Absolute frame number. */
  frame: number;
  fps: number;
}

/** Any animatable prop accepts a constant, a tween, keyframes, or a function of time. */
export type Animatable<T = number> = T | Tween<T> | Keyframes<T> | ((info: FrameInfo) => T);

/** Lengths: px numbers or percentages of the parent box (e.g. "50%"). */
export type Length = number | `${number}%`;

export type Anchor =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight';

export interface Gradient {
  type: 'linear' | 'radial';
  /** Color stops: [[offset 0..1, color], ...] */
  stops: Array<[number, string]>;
  /** Linear gradient angle in degrees (0 = left→right, 90 = top→bottom). Default 90. */
  angle?: number;
}

export type Paint = string | Gradient;

export interface Shadow {
  color?: string;
  blur?: number;
  x?: number;
  y?: number;
}

export type PresetName =
  | 'fade'
  | 'fadeUp'
  | 'fadeDown'
  | 'fadeLeft'
  | 'fadeRight'
  | 'pop'
  | 'zoom'
  | 'slideUp'
  | 'slideDown'
  | 'slideLeft'
  | 'slideRight'
  | 'typewriter'
  | 'wipe'
  | 'blur';

export interface PresetSpec {
  type: PresetName;
  /** Seconds. Default 0.5 (typewriter: 0.05s per character). */
  dur?: number;
  ease?: Ease;
  /** Pixels moved by the fade and slide presets. Default 40 for fadeX, full frame for slideX. */
  distance?: number;
  /** Extra delay in seconds after the node starts (enter) or before it ends (exit). */
  delay?: number;
}

export type Preset = PresetName | PresetSpec;

export interface BaseNode {
  /** Optional id, used in error messages and for debugging. */
  id?: string;
  /** Start time in seconds, relative to the parent. Default 0. */
  start?: number;
  /** Duration in seconds. Default: until the parent ends. */
  duration?: number;
  x?: Animatable<Length>;
  y?: Animatable<Length>;
  /** Which point of the node sits at (x, y). Default "center". */
  anchor?: Anchor;
  opacity?: Animatable<number>;
  scale?: Animatable<number>;
  scaleX?: Animatable<number>;
  scaleY?: Animatable<number>;
  /** Degrees, clockwise. */
  rotate?: Animatable<number>;
  /** Gaussian blur in px. */
  blur?: Animatable<number>;
  shadow?: Shadow;
  /** Entrance animation played when the node starts. */
  enter?: Preset;
  /** Exit animation played when the node ends. */
  exit?: Preset;
}

/** A number that counts from → to over time, formatted as text. */
export interface CountSpec extends Tween<number> {
  /** Digits after the decimal point. Default 0. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Thousands separator, e.g. ",". Default none. */
  separator?: string;
}

export interface TextNode extends BaseNode {
  type: 'text';
  /** The string to show, or (TypeScript only) a function of time returning it. */
  text: string | ((info: FrameInfo) => string);
  /** Count a number up/down instead of showing static text (e.g. "$12,400"). */
  count?: CountSpec;
  /** Font size in px. Default 48. */
  size?: Animatable<number>;
  color?: Animatable<string> | Gradient;
  font?: string;
  weight?: string | number;
  italic?: boolean;
  /** Text alignment inside the text box. Default "center". */
  align?: 'left' | 'center' | 'right';
  /** Wrap lines wider than this (px or %). */
  maxWidth?: Length;
  /** Line height multiplier. Default 1.2. */
  lineHeight?: number;
  /** Extra space between letters in px. */
  letterSpacing?: number;
  stroke?: string;
  strokeWidth?: number;
}

export interface RectNode extends BaseNode {
  type: 'rect';
  w: Animatable<Length>;
  h: Animatable<Length>;
  fill?: Animatable<string> | Gradient;
  radius?: Animatable<number>;
  stroke?: string;
  strokeWidth?: number;
}

export interface CircleNode extends BaseNode {
  type: 'circle';
  r: Animatable<number>;
  fill?: Animatable<string> | Gradient;
  stroke?: string;
  strokeWidth?: number;
}

export interface LineNode extends BaseNode {
  type: 'line';
  /** Points relative to (x, y): [[x1,y1],[x2,y2],...] */
  points: Array<[number, number]>;
  color?: Animatable<string>;
  width?: Animatable<number>;
  /** 0..1 — how much of the line is drawn. Animate it to "draw on" the line. */
  progress?: Animatable<number>;
  cap?: 'butt' | 'round' | 'square';
}

export interface PathNode extends BaseNode {
  type: 'path';
  /** SVG path data, e.g. "M0 0 L100 0 L50 80 Z" */
  d: string;
  fill?: Animatable<string> | Gradient;
  stroke?: string;
  strokeWidth?: number;
}

export interface ImageNode extends BaseNode {
  type: 'image';
  /** Path relative to the scene file, absolute path, or http(s) URL. */
  src: string;
  w?: Animatable<Length>;
  h?: Animatable<Length>;
  /** How the image fills its w×h box. Default "cover". */
  fit?: 'cover' | 'contain' | 'fill';
  radius?: number;
}

export interface GroupNode extends BaseNode {
  type: 'group';
  children: Node[];
}

export type Node = TextNode | RectNode | CircleNode | LineNode | PathNode | ImageNode | GroupNode;

export interface AudioTrack {
  src: string;
  /** Seconds into the video when the audio starts. Default 0. */
  start?: number;
  /** Skip this many seconds from the start of the file. */
  trim?: number;
  /** 0..1. Default 1. */
  volume?: number;
  /** Fade in/out in seconds. */
  fadeIn?: number;
  fadeOut?: number;
}

export interface VideoConfig {
  width?: number;
  height?: number;
  fps?: number;
  /** Seconds. Default: when the last node ends. */
  duration?: number;
  background?: Paint;
  /** Default font family for all text. */
  font?: string;
  /** Extra fonts to load: { "Inter": "./fonts/Inter.ttf" } */
  fonts?: Record<string, string>;
  audio?: AudioTrack[];
}

export interface Video extends Required<Pick<VideoConfig, 'width' | 'height' | 'fps' | 'duration'>> {
  type: 'video';
  background: Paint;
  font: string;
  fonts: Record<string, string>;
  audio: AudioTrack[];
  children: Node[];
}

/** A scene module may export a Video, or a (possibly async) function of props returning one. */
export type SceneExport = Video | ((props: Record<string, unknown>) => Video | Promise<Video>);
