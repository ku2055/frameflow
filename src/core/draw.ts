import { length, num, toPx } from './animate.js';
import { color } from './color.js';
import { presetEffect } from './presets.js';
import { fontString } from './measure.js';
import type { Anchor, CountSpec, FrameInfo, Gradient, Node, Paint, TextNode, Video } from './types.js';

/** A drawable image: browser HTMLImageElement / ImageBitmap or @napi-rs/canvas Image. */
export interface DrawableImage {
  width: number;
  height: number;
}

/** Platform services the renderer needs. Implemented for Node (skia) and the browser. */
export interface RenderEnv {
  images: Map<string, DrawableImage>;
  createPath: (d: string) => Path2D;
}

type Ctx = CanvasRenderingContext2D;

interface Scope {
  ctx: Ctx;
  video: Video;
  env: RenderEnv;
  time: number;
  frame: number;
}

const ANCHORS: Record<Anchor, [number, number]> = {
  center: [0.5, 0.5],
  top: [0.5, 0],
  bottom: [0.5, 1],
  left: [0, 0.5],
  right: [1, 0.5],
  topLeft: [0, 0],
  topRight: [1, 0],
  bottomLeft: [0, 1],
  bottomRight: [1, 1],
};

/**
 * Draw one frame of the video onto a 2D canvas context. Pure: same inputs → same pixels.
 * `scale` renders at a different resolution (the canvas must be width*scale × height*scale).
 */
export function drawFrame(ctx: Ctx, video: Video, frame: number, env: RenderEnv, scale = 1): void {
  const scope: Scope = { ctx, video, env, time: frame / video.fps, frame };
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, video.width, video.height);
  ctx.fillStyle = paint(ctx, video.background, 0, 0, video.width, video.height);
  ctx.fillRect(0, 0, video.width, video.height);
  for (const child of video.children) drawNode(scope, child, 0, video.duration, video.width / 2, video.height / 2);
  ctx.restore();
}

function paint(ctx: Ctx, p: Paint, x: number, y: number, w: number, h: number): string | CanvasGradient {
  if (typeof p === 'string') return p;
  return gradient(ctx, p, x, y, w, h);
}

function gradient(ctx: Ctx, g: Gradient, x: number, y: number, w: number, h: number): CanvasGradient {
  let grad: CanvasGradient;
  if (g.type === 'radial') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) / 2);
  } else {
    const a = ((g.angle ?? 90) * Math.PI) / 180;
    // Project the box onto the gradient direction so the stops span the whole box.
    const half = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const dx = Math.cos(a) * half;
    const dy = Math.sin(a) * half;
    grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  }
  for (const [offset, c] of g.stops) grad.addColorStop(offset, c);
  return grad;
}

function fillOf(ctx: Ctx, fill: unknown, info: FrameInfo, x: number, y: number, w: number, h: number, fallback: string) {
  if (typeof fill === 'object' && fill !== null && 'stops' in fill) return gradient(ctx, fill as Gradient, x, y, w, h);
  return color(fill as string | undefined, info, fallback);
}

/**
 * (cx, cy) is the default position for nodes without x/y: the frame center at the top level,
 * or the origin of the nearest positioned group (a group with x or y set acts as a container).
 */
function drawNode(s: Scope, node: Node, parentStart: number, parentDuration: number, cx: number, cy: number): void {
  const start = node.start ?? 0;
  const absStart = parentStart + start;
  const duration = node.duration ?? parentDuration - start;
  const t = s.time - absStart;
  if (t < 0 || t >= duration) return;

  const { ctx, video } = s;
  const info: FrameInfo = { t, duration, progress: duration > 0 ? t / duration : 1, time: s.time, frame: s.frame, fps: video.fps };
  const str = node.type === 'text' ? textOf(node, info) : '';
  const textLen = str.length;
  const fx = presetEffect(node.enter, node.exit, t, duration, video.width, video.height, textLen);

  const opacity = num(node.opacity, info, 1) * fx.opacity;
  if (opacity <= 0.001) return;

  // Groups, lines and paths use the parent origin by default; everything else sits at (cx, cy).
  const originDefault = node.type === 'group' || node.type === 'line' || node.type === 'path';
  const x = length(node.x, info, video.width, originDefault ? 0 : cx) + fx.dx;
  const y = length(node.y, info, video.height, originDefault ? 0 : cy) + fx.dy;
  const scale = num(node.scale, info, 1) * fx.scale;
  const sx = num(node.scaleX, info, 1) * scale;
  const sy = num(node.scaleY, info, 1) * scale;
  if (sx === 0 || sy === 0) return;
  const rotate = num(node.rotate, info, 0);
  const blur = num(node.blur, info, 0) + fx.blur;

  ctx.save();
  ctx.translate(x, y);
  if (rotate) ctx.rotate((rotate * Math.PI) / 180);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.globalAlpha *= Math.min(1, opacity);
  if (blur > 0.01) ctx.filter = `blur(${blur.toFixed(2)}px)`;
  if (node.shadow) {
    ctx.shadowColor = node.shadow.color ?? 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = node.shadow.blur ?? 10;
    ctx.shadowOffsetX = node.shadow.x ?? 0;
    ctx.shadowOffsetY = node.shadow.y ?? 0;
  }

  const [ax, ay] = ANCHORS[node.anchor ?? 'center'] ?? ANCHORS.center;
  const clipBox = (bx: number, by: number, bw: number, bh: number) => {
    if (fx.clip < 1) {
      ctx.beginPath();
      ctx.rect(bx - 1, by - 1, (bw + 2) * fx.clip, bh + 2);
      ctx.clip();
    }
  };

  switch (node.type) {
    case 'group': {
      const positioned = node.x !== undefined || node.y !== undefined;
      const [ccx, ccy] = positioned ? [0, 0] : [cx, cy];
      for (const child of node.children) drawNode(s, child, absStart, duration, ccx, ccy);
      break;
    }

    case 'rect': {
      const w = length(node.w, info, video.width, 0);
      const h = length(node.h, info, video.height, 0);
      const bx = -ax * w;
      const by = -ay * h;
      clipBox(bx, by, w, h);
      const r = Math.min(num(node.radius, info, 0), w / 2, h / 2);
      ctx.beginPath();
      if (r > 0) roundRectPath(ctx, bx, by, w, h, r);
      else ctx.rect(bx, by, w, h);
      if (node.fill !== undefined || !node.stroke) {
        ctx.fillStyle = fillOf(ctx, node.fill, info, bx, by, w, h, '#ffffff');
        ctx.fill();
      }
      if (node.stroke) strokeCurrent(ctx, node.stroke, node.strokeWidth);
      break;
    }

    case 'circle': {
      const r = Math.max(0, num(node.r, info, 0));
      const bx = -ax * 2 * r;
      const by = -ay * 2 * r;
      clipBox(bx, by, 2 * r, 2 * r);
      ctx.beginPath();
      ctx.arc(bx + r, by + r, r, 0, Math.PI * 2);
      if (node.fill !== undefined || !node.stroke) {
        ctx.fillStyle = fillOf(ctx, node.fill, info, bx, by, 2 * r, 2 * r, '#ffffff');
        ctx.fill();
      }
      if (node.stroke) strokeCurrent(ctx, node.stroke, node.strokeWidth);
      break;
    }

    case 'line': {
      const progress = Math.min(1, Math.max(0, num(node.progress, info, 1) * fx.clip));
      const pts = node.points;
      if (pts.length < 2 || progress <= 0) break;
      const segs: number[] = [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        const l = Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
        segs.push(l);
        total += l;
      }
      let remaining = total * progress;
      ctx.beginPath();
      ctx.moveTo(pts[0]![0], pts[0]![1]);
      for (let i = 1; i < pts.length && remaining > 0; i++) {
        const l = segs[i - 1]!;
        const f = l > 0 ? Math.min(1, remaining / l) : 1;
        const [x0, y0] = pts[i - 1]!;
        const [x1, y1] = pts[i]!;
        ctx.lineTo(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
        remaining -= l;
      }
      ctx.lineCap = node.cap ?? 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color(node.color, info, '#ffffff');
      ctx.lineWidth = num(node.width, info, 4);
      ctx.stroke();
      break;
    }

    case 'path': {
      const p = s.env.createPath(node.d);
      if (node.fill !== undefined || !node.stroke) {
        ctx.fillStyle = fillOf(ctx, node.fill, info, 0, 0, video.width, video.height, '#ffffff');
        ctx.fill(p);
      }
      if (node.stroke) {
        ctx.strokeStyle = node.stroke;
        ctx.lineWidth = node.strokeWidth ?? 2;
        ctx.stroke(p);
      }
      break;
    }

    case 'image': {
      const img = s.env.images.get(node.src);
      if (!img) throw new Error(`Image "${node.src}" was not preloaded`);
      const natW = img.width;
      const natH = img.height;
      let w = node.w !== undefined ? length(node.w, info, video.width, natW) : undefined;
      let h = node.h !== undefined ? length(node.h, info, video.height, natH) : undefined;
      if (w === undefined && h === undefined) {
        w = natW;
        h = natH;
      } else if (w === undefined) w = (h! * natW) / natH;
      else if (h === undefined) h = (w * natH) / natW;
      const bw = w!;
      const bh = h!;
      const bx = -ax * bw;
      const by = -ay * bh;
      clipBox(bx, by, bw, bh);
      if (node.radius) {
        ctx.beginPath();
        roundRectPath(ctx, bx, by, bw, bh, Math.min(node.radius, bw / 2, bh / 2));
        ctx.clip();
      }
      const fit = node.fit ?? 'cover';
      if (fit === 'fill') {
        ctx.drawImage(img as CanvasImageSource, bx, by, bw, bh);
      } else {
        const sc = fit === 'cover' ? Math.max(bw / natW, bh / natH) : Math.min(bw / natW, bh / natH);
        const dw = natW * sc;
        const dh = natH * sc;
        if (fit === 'cover') {
          const sw = bw / sc;
          const sh = bh / sc;
          ctx.drawImage(img as CanvasImageSource, (natW - sw) / 2, (natH - sh) / 2, sw, sh, bx, by, bw, bh);
        } else {
          ctx.drawImage(img as CanvasImageSource, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh);
        }
      }
      break;
    }

    case 'text':
      drawText(s, node, str, info, ax, ay, fx.reveal, clipBox);
      break;
  }
  ctx.restore();
}

function strokeCurrent(ctx: Ctx, stroke: string, width = 2) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function formatCount(value: number, c: CountSpec): string {
  const fixed = value.toFixed(c.decimals ?? 0);
  const [int, dec] = fixed.split('.');
  const grouped = c.separator ? int!.replace(/\B(?=(\d{3})+(?!\d))/g, c.separator) : int!;
  return `${c.prefix ?? ''}${grouped}${dec !== undefined ? '.' + dec : ''}${c.suffix ?? ''}`;
}

/** The string a text node shows at this moment. */
function textOf(node: TextNode, info: FrameInfo): string {
  if (node.count) return formatCount(num(node.count, info, 0), node.count);
  return typeof node.text === 'function' ? String(node.text(info)) : String(node.text ?? '');
}

/** Split text into lines, honoring explicit newlines and wrapping at maxWidth. */
export function layoutLines(ctx: Ctx, text: string, maxWidth: number | undefined): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (!maxWidth) {
      out.push(para);
      continue;
    }
    const words = para.split(/\s+/).filter((w, i) => w !== '' || i === 0);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(candidate).width > maxWidth) {
        out.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    out.push(current);
  }
  return out;
}

function drawText(
  s: Scope,
  node: TextNode,
  str: string,
  info: FrameInfo,
  ax: number,
  ay: number,
  reveal: number,
  clipBox: (x: number, y: number, w: number, h: number) => void,
) {
  const { ctx, video } = s;
  const size = num(node.size, info, 48);
  ctx.font = fontString(node.font ?? video.font, node.weight ?? 'normal', node.italic ?? false, size);
  if (node.letterSpacing !== undefined && 'letterSpacing' in ctx) {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${node.letterSpacing}px`;
  }
  const maxWidth = node.maxWidth !== undefined ? toPx(node.maxWidth, video.width) : undefined;
  const lines = layoutLines(ctx, str, maxWidth);
  const widths = lines.map((l) => ctx.measureText(l).width);
  const lineH = size * (node.lineHeight ?? 1.2);
  const boxW = Math.max(0, ...widths);
  const boxH = lineH * lines.length;
  const bx = -ax * boxW;
  const by = -ay * boxH;
  clipBox(bx, by, boxW, boxH);

  const align = node.align ?? 'center';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fillOf(ctx, node.color, info, bx, by, boxW, boxH, '#ffffff');
  if (node.stroke) {
    ctx.strokeStyle = node.stroke;
    ctx.lineWidth = node.strokeWidth ?? 2;
    ctx.lineJoin = 'round';
  }

  const total = lines.reduce((n, l) => n + l.length, 0);
  let chars = reveal >= 1 ? Infinity : Math.floor(total * reveal);
  for (let i = 0; i < lines.length && chars > 0; i++) {
    const line = lines[i]!;
    const lx = align === 'left' ? bx : align === 'right' ? bx + boxW - widths[i]! : bx + (boxW - widths[i]!) / 2;
    const ly = by + lineH * (i + 0.5);
    const shown = chars >= line.length ? line : line.slice(0, chars);
    chars -= line.length;
    if (node.stroke) ctx.strokeText(shown, lx, ly);
    ctx.fillText(shown, lx, ly);
  }
}
