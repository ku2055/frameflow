/**
 * Render worker: draws a contiguous range of frames and encodes them into one chunk file.
 * Each worker owns its own canvas and its own ffmpeg process, so chunks render fully in parallel.
 */
import { spawn } from 'node:child_process';
import { parentPort, workerData } from 'node:worker_threads';
import { createCanvas } from '@napi-rs/canvas';
import { drawFrame } from '../core/draw.js';
import { createNodeEnv } from './assets.js';
import { encodeArgs, ffmpegPath, scaledSize, type EncodeSettings } from './ffmpeg.js';
import { reloadScene, type SceneSource } from './load.js';

export interface WorkerJob {
  source: SceneSource;
  props: Record<string, unknown>;
  baseDir: string;
  from: number;
  to: number;
  output: string;
  encode: EncodeSettings;
  /** Output resolution multiplier. */
  scale: number;
}

export type WorkerMessage = { kind: 'progress'; frames: number } | { kind: 'done' } | { kind: 'error'; message: string };

async function run(job: WorkerJob) {
  const video = await reloadScene(job.source, job.props);
  const env = await createNodeEnv(video, job.baseDir);
  const [w, h] = scaledSize(video.width, video.height, job.scale);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;

  const ff = spawn(
    ffmpegPath(),
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(video.fps), '-i', 'pipe:0',
      ...encodeArgs(job.encode),
      '-r', String(video.fps),
      job.output,
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  );
  let stderr = '';
  ff.stderr.on('data', (d) => (stderr += d));
  const exited = new Promise<void>((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-2000)}`))));
  });

  let reported = 0;
  for (let f = job.from; f < job.to; f++) {
    drawFrame(ctx, video, f, env, w / video.width);
    const pixels = ctx.getImageData(0, 0, w, h).data;
    const ok = ff.stdin.write(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength));
    if (!ok) await new Promise<void>((r) => ff.stdin.once('drain', () => r()));
    reported++;
    if (reported >= 5) {
      parentPort!.postMessage({ kind: 'progress', frames: reported } satisfies WorkerMessage);
      reported = 0;
    }
  }
  if (reported) parentPort!.postMessage({ kind: 'progress', frames: reported } satisfies WorkerMessage);
  ff.stdin.end();
  await exited;
}

run(workerData as WorkerJob).then(
  () => parentPort!.postMessage({ kind: 'done' } satisfies WorkerMessage),
  (e: Error) => parentPort!.postMessage({ kind: 'error', message: e.stack ?? e.message } satisfies WorkerMessage),
);
