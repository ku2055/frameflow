/**
 * Text measurement for layout code in scenes (e.g. placing a badge right after a word).
 * The renderer installs a platform measurer (Skia in Node, canvas in the browser) on globalThis,
 * so it is shared even when a scene bundle carries its own copy of this module.
 */
export interface TextStyle {
  size?: number;
  font?: string;
  weight?: string | number;
  italic?: boolean;
  letterSpacing?: number;
  /** Line height multiplier for multi-line text. Default 1.2. */
  lineHeight?: number;
}

export interface TextMetrics2 {
  width: number;
  height: number;
  lines: number;
}

type Measurer = (text: string, font: string, letterSpacing: number) => number;
const KEY = '__frameflowMeasureText';

export function setTextMeasurer(fn: Measurer): void {
  (globalThis as Record<string, unknown>)[KEY] = fn;
}

/**
 * Generic "sans-serif" means different fonts on different machines (Skia on Linux may even pick a
 * monospace face), so expand it to an explicit stack of common sans fonts.
 */
const SANS_STACK = 'Inter, "Helvetica Neue", Helvetica, Arial, "Segoe UI", Roboto, "DejaVu Sans", "Liberation Sans", "Noto Sans"';

export function fontString(family: string, weight: string | number, italic: boolean, size: number): string {
  if (family === 'sans-serif') family = SANS_STACK;
  const quoted = /[\s]/.test(family) && !family.includes('"') && !family.includes(',') ? `"${family}"` : family;
  return `${italic ? 'italic ' : ''}${weight} ${size}px ${quoted}, sans-serif`;
}

function measurer(): Measurer {
  const existing = (globalThis as Record<string, unknown>)[KEY] as Measurer | undefined;
  if (existing) return existing;
  // Browser fallback.
  const Off = (globalThis as { OffscreenCanvas?: new (w: number, h: number) => { getContext(t: '2d'): CanvasRenderingContext2D | null } }).OffscreenCanvas;
  if (Off) {
    const ctx = new Off(1, 1).getContext('2d')!;
    const fn: Measurer = (text, font, ls) => {
      ctx.font = font;
      if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${ls}px`;
      return ctx.measureText(text).width;
    };
    setTextMeasurer(fn);
    return fn;
  }
  throw new Error('measureText() needs a canvas. Call it inside a scene rendered by frameflow (render/preview/still).');
}

/**
 * Measure text with the same font logic the renderer uses.
 * Note: only fonts available when the scene is built can be measured (system fonts in Node;
 * fonts from video({ fonts }) are registered later, at render time).
 */
export function measureText(text: string, style: TextStyle = {}): TextMetrics2 {
  const size = style.size ?? 48;
  const font = fontString(style.font ?? 'sans-serif', style.weight ?? 'normal', style.italic ?? false, size);
  const lines = text.split('\n');
  const width = Math.max(0, ...lines.map((l) => measurer()(l, font, style.letterSpacing ?? 0)));
  return { width, height: lines.length * size * (style.lineHeight ?? 1.2), lines: lines.length };
}
