import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { createCanvas } from '@napi-rs/canvas';
import { drawFrame } from '../core/draw.js';
import { formatIssues, validate } from '../core/validate.js';
import type { Video } from '../core/types.js';
import { createNodeEnv, resolveAsset } from './assets.js';
import { chunkExtension, codecForFile, runFfmpeg, type Codec, type EncodeSettings } from './ffmpeg.js';
import { loadScene, type LoadedScene } from './load.js';
import type { WorkerJob, WorkerMessage } from './worker.js';

const here = dirname(fileURLToPath(import.meta.url));

export interface RenderOptions {
  /** Output file (.mp4, .webm or .mov). */
  output: string;
  /** Props passed to scene functions (like Remotion's inputProps). */
  props?: Record<string, unknown>;
  /** Parallel workers. Default: all CPU cores. */
  workers?: number;
  codec?: Codec;
  crf?: number;
  /** x264 preset. Default "medium" (same quality/size trade-off as most tools). */
  preset?: string;
  /** Render only part of the video, in seconds. */
  from?: number;
  to?: number;
  onProgress?: (p: { frame: number; total: number; fps: number }) => void;
  /** Render at a different resolution, e.g. 1.5 turns 1280x720 into 1920x1080. Default 1. */
  scale?: number;
  /** Skip validation errors (not recommended). */
  force?: boolean;
}

export interface RenderResult {
  output: string;
  frames: number;
  seconds: number;
  workers: number;
}

/** Throw a readable error if the video has validation errors. */
export function assertValid(video: Video, force = false) {
  const issues = validate(video);
  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length && !force) throw new Error(`Scene has ${errors.length} error(s):\n${formatIssues(errors)}`);
  return issues;
}

/** Render a scene file (.ts/.js/.json) to a video file. */
export async function render(file: string, options: RenderOptions): Promise<RenderResult> {
  const scene = await loadScene(file, options.props);
  return renderLoaded(scene, options);
}

export async function renderLoaded(scene: LoadedScene, options: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  const { video } = scene;
  assertValid(video, options.force);

  const totalFrames = Math.round(video.duration * video.fps);
  const first = Math.max(0, Math.round((options.from ?? 0) * video.fps));
  const last = Math.min(totalFrames, options.to !== undefined ? Math.round(options.to * video.fps) : totalFrames);
  const count = last - first;
  if (count <= 0) throw new Error('Nothing to render: the frame range is empty');

  const codec = options.codec ?? codecForFile(options.output);
  const encode: EncodeSettings = { codec, crf: options.crf ?? 18, preset: options.preset ?? 'medium' };
  // Keep chunks >= 20 frames: tiny chunks cost more in ffmpeg startup than they save.
  const workers = Math.max(1, Math.min(options.workers ?? availableParallelism(), Math.ceil(count / 20)));

  const output = resolve(options.output);
  mkdirSync(dirname(output), { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'frameflow-render-'));

  try {
    const chunks: string[] = [];
    let done = 0;
    const jobs = Array.from({ length: workers }, (_, i) => {
      const from = first + Math.floor((count * i) / workers);
      const to = first + Math.floor((count * (i + 1)) / workers);
      const chunk = join(tmp, `chunk-${String(i).padStart(4, '0')}${chunkExtension(codec)}`);
      chunks.push(chunk);
      const job: WorkerJob = { source: scene.source, props: options.props ?? {}, baseDir: scene.baseDir, from, to, output: chunk, encode, scale: options.scale ?? 1 };
      return new Promise<void>((resolveJob, reject) => {
        const w = new Worker(join(here, 'worker.js'), { workerData: job });
        w.on('message', (m: WorkerMessage) => {
          if (m.kind === 'progress') {
            done += m.frames;
            const elapsed = (performance.now() - t0) / 1000;
            options.onProgress?.({ frame: done, total: count, fps: done / elapsed });
          } else if (m.kind === 'done') resolveJob();
          else reject(new Error(m.message));
        });
        w.on('error', reject);
        w.on('exit', (code) => code !== 0 && reject(new Error(`Render worker exited with code ${code}`)));
      });
    });
    await Promise.all(jobs);

    // Stitch chunks (stream copy, no re-encode) and mix audio in one ffmpeg pass.
    const list = join(tmp, 'chunks.txt');
    writeFileSync(list, chunks.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join('\n'));
    const args = ['-f', 'concat', '-safe', '0', '-i', list];
    const audio = video.audio;
    if (audio.length) {
      const filters: string[] = [];
      audio.forEach((a, i) => {
        if (a.trim) args.push('-ss', String(a.trim));
        args.push('-i', resolveAsset(a.src, scene.baseDir));
        const delay = Math.max(0, Math.round(((a.start ?? 0) - first / video.fps) * 1000));
        const chain = [`adelay=${delay}|${delay}`, `volume=${a.volume ?? 1}`];
        if (a.fadeIn) chain.push(`afade=t=in:st=${delay / 1000}:d=${a.fadeIn}`);
        if (a.fadeOut) chain.push(`afade=t=out:st=${Math.max(0, count / video.fps - a.fadeOut)}:d=${a.fadeOut}`);
        filters.push(`[${i + 1}:a]${chain.join(',')}[a${i}]`);
      });
      filters.push(`${audio.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audio.length}:normalize=0:duration=longest[aout]`);
      args.push('-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[aout]', '-c:a', codec === 'vp9' ? 'libopus' : 'aac');
    }
    args.push('-c:v', 'copy', '-t', String(count / video.fps));
    if (codec === 'h264' || codec === 'h265') args.push('-movflags', '+faststart');
    args.push(output);
    await runFfmpeg(args);

    return { output, frames: count, seconds: (performance.now() - t0) / 1000, workers };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Render one frame to a PNG buffer. `time` is in seconds. */
export async function renderStill(scene: LoadedScene, time: number): Promise<Buffer> {
  const { video } = scene;
  const env = await createNodeEnv(video, scene.baseDir);
  const canvas = createCanvas(video.width, video.height);
  const frame = Math.min(Math.round(video.duration * video.fps) - 1, Math.max(0, Math.round(time * video.fps)));
  drawFrame(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, video, frame, env);
  return canvas.encode('png');
}

export interface StoryboardOptions {
  /** Number of evenly spaced frames. Default 8. Ignored when `times` is given. */
  count?: number;
  /** Exact times (seconds) to sample. */
  times?: number[];
  /** Columns in the grid. Default 4. */
  columns?: number;
  /** Thumbnail width in px. Default 480. */
  thumbWidth?: number;
}

/**
 * A contact sheet of frames across the video, labeled with timestamps.
 * One image an AI agent (or a human) can look at to check the whole animation.
 */
export async function renderStoryboard(scene: LoadedScene, options: StoryboardOptions = {}): Promise<Buffer> {
  const { video } = scene;
  const env = await createNodeEnv(video, scene.baseDir);
  const lastFrame = Math.round(video.duration * video.fps) - 1;
  const n = options.count ?? 8;
  const times =
    options.times ?? Array.from({ length: n }, (_, i) => (n === 1 ? 0 : (i / (n - 1)) * (lastFrame / video.fps)));
  const cols = Math.min(options.columns ?? 4, times.length);
  const rows = Math.ceil(times.length / cols);
  const tw = options.thumbWidth ?? 480;
  const th = Math.round((tw * video.height) / video.width);
  const label = 28;
  const pad = 8;

  const frameCanvas = createCanvas(video.width, video.height);
  const fctx = frameCanvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const sheet = createCanvas(cols * (tw + pad) + pad, rows * (th + label + pad) + pad);
  const sctx = sheet.getContext('2d');
  sctx.fillStyle = '#111';
  sctx.fillRect(0, 0, sheet.width, sheet.height);
  sctx.font = '16px sans-serif';
  sctx.textBaseline = 'middle';

  times.forEach((t, i) => {
    const frame = Math.min(lastFrame, Math.max(0, Math.round(t * video.fps)));
    drawFrame(fctx, video, frame, env);
    const x = pad + (i % cols) * (tw + pad);
    const y = pad + Math.floor(i / cols) * (th + label + pad);
    sctx.drawImage(frameCanvas, x, y + label, tw, th);
    sctx.fillStyle = '#ddd';
    sctx.fillText(`#${i + 1}  t=${(frame / video.fps).toFixed(2)}s  frame ${frame}`, x + 4, y + label / 2);
  });
  return sheet.encode('png');
}
