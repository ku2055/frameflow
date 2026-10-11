/**
 * Browser player: plays a Frameflow video on a <canvas> using the exact same
 * drawFrame() as the Node renderer, so the preview matches the final render.
 */
import { drawFrame, type DrawableImage, type RenderEnv } from '../core/draw.js';
import type { Node, Video } from '../core/types.js';

export { normalizeVideo } from '../core/builders.js';
export { validate, formatIssues } from '../core/validate.js';

export interface PlayerOptions {
  autoplay?: boolean;
  loop?: boolean;
  /** Show the built-in control bar. Default true. */
  controls?: boolean;
  /** Prefix for relative asset paths (images, fonts). Default "". */
  assetBase?: string;
  /** Start position in seconds. */
  startAt?: number;
  onTimeUpdate?: (seconds: number) => void;
}

export interface Player {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  readonly time: number;
  readonly playing: boolean;
  destroy(): void;
  canvas: HTMLCanvasElement;
}

function assetUrl(src: string, base: string) {
  return /^(https?:|data:|blob:|\/)/.test(src) ? src : base + src;
}

function collectImages(nodes: Node[], out: Set<string>) {
  for (const n of nodes) {
    if (n.type === 'image') out.add(n.src);
    if (n.type === 'group') collectImages(n.children, out);
  }
}

/** Load fonts and images for a video in the browser. */
export async function createBrowserEnv(video: Video, assetBase = ''): Promise<RenderEnv> {
  await Promise.all(
    Object.entries(video.fonts).map(async ([family, file]) => {
      const face = new FontFace(family, `url(${assetUrl(file, assetBase)})`);
      document.fonts.add(await face.load());
    }),
  );
  const srcs = new Set<string>();
  collectImages(video.children, srcs);
  const images = new Map<string, DrawableImage>();
  await Promise.all(
    [...srcs].map(
      (src) =>
        new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            images.set(src, img);
            resolve();
          };
          img.onerror = () => reject(new Error(`Could not load image "${src}"`));
          img.src = assetUrl(src, assetBase);
        }),
    ),
  );
  // Make sure system fonts referenced by text are ready before the first draw.
  await document.fonts.ready;
  return { images, createPath: (d) => new Path2D(d) };
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
};

/** Mount a player into a container element. */
export async function createPlayer(container: HTMLElement, video: Video, options: PlayerOptions = {}): Promise<Player> {
  const env = await createBrowserEnv(video, options.assetBase ?? '');
  const totalFrames = Math.max(1, Math.round(video.duration * video.fps));
  const root = document.createElement('div');
  root.className = 'ff-player';
  root.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;';
  const canvas = document.createElement('canvas');
  canvas.width = video.width;
  canvas.height = video.height;
  canvas.style.cssText = `width:100%;height:auto;aspect-ratio:${video.width}/${video.height};display:block;background:#000;border-radius:6px;`;
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  let time = Math.min(Math.max(0, options.startAt ?? 0), video.duration);
  let playing = false;
  let raf = 0;
  let last = 0;

  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;gap:10px;font:13px ui-monospace,monospace;color:inherit;';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.style.cssText = 'min-width:72px;padding:6px 10px;border-radius:6px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;font:inherit;';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = String(totalFrames - 1);
  range.step = '1';
  range.style.cssText = 'flex:1;min-width:0;';
  range.setAttribute('aria-label', 'Seek');
  const label = document.createElement('span');
  label.style.cssText = 'white-space:nowrap;font-variant-numeric:tabular-nums;';
  bar.append(btn, range, label);
  if (options.controls !== false) root.appendChild(bar);
  container.appendChild(root);

  const frameOf = (t: number) => Math.min(totalFrames - 1, Math.floor(t * video.fps + 1e-6));
  const draw = () => {
    const f = frameOf(time);
    drawFrame(ctx, video, f, env);
    range.value = String(f);
    label.textContent = `${fmt(f / video.fps)} / ${fmt(video.duration)}  ·  frame ${f}/${totalFrames - 1}`;
    btn.textContent = playing ? '❚❚ Pause' : '▶ Play';
    options.onTimeUpdate?.(time);
  };

  const tick = (now: number) => {
    if (!playing) return;
    time += (now - last) / 1000;
    last = now;
    if (time >= video.duration) {
      if (options.loop !== false) time %= video.duration;
      else {
        time = video.duration - 1 / video.fps;
        playing = false;
      }
    }
    draw();
    if (playing) raf = requestAnimationFrame(tick);
  };

  const player: Player = {
    canvas,
    get time() {
      return time;
    },
    get playing() {
      return playing;
    },
    play() {
      if (playing) return;
      if (time >= video.duration - 1 / video.fps) time = 0;
      playing = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
      draw();
    },
    pause() {
      playing = false;
      cancelAnimationFrame(raf);
      draw();
    },
    seek(s: number) {
      time = Math.min(Math.max(0, s), video.duration - 1 / video.fps);
      draw();
    },
    destroy() {
      playing = false;
      cancelAnimationFrame(raf);
      root.remove();
    },
  };

  btn.onclick = () => (playing ? player.pause() : player.play());
  range.oninput = () => {
    player.pause();
    player.seek(Number(range.value) / video.fps);
  };
  canvas.onclick = () => (playing ? player.pause() : player.play());
  draw();
  if (options.autoplay) player.play();
  return player;
}
