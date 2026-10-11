import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** FFmpeg binary: $FRAMEFLOW_FFMPEG, then the bundled ffmpeg-static build, then "ffmpeg" on PATH. */
export function ffmpegPath(): string {
  if (process.env.FRAMEFLOW_FFMPEG) return process.env.FRAMEFLOW_FFMPEG;
  try {
    const p = require('ffmpeg-static') as string | null;
    if (p) return p;
  } catch {
    /* fall through */
  }
  return 'ffmpeg';
}

/** Run ffmpeg to completion; rejects with the tail of stderr on failure. */
export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (d) => (err += d));
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolvePromise() : reject(new Error(`ffmpeg exited with ${code}: ${err.slice(-2000)}`))));
  });
}

export type Codec = 'h264' | 'h265' | 'vp9' | 'prores';

export interface EncodeSettings {
  codec: Codec;
  /** Constant rate factor (quality). Lower = better. Default 18. */
  crf: number;
  /** x264/x265 speed preset. Default "veryfast". */
  preset: string;
}

/** ffmpeg output arguments for encoding raw RGBA frames with the chosen codec. */
export function encodeArgs(s: EncodeSettings): string[] {
  switch (s.codec) {
    case 'h264':
      return ['-c:v', 'libx264', '-preset', s.preset, '-crf', String(s.crf), '-pix_fmt', 'yuv420p'];
    case 'h265':
      return ['-c:v', 'libx265', '-preset', s.preset, '-crf', String(s.crf), '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1'];
    case 'vp9':
      return ['-c:v', 'libvpx-vp9', '-crf', String(s.crf + 13), '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p'];
    case 'prores':
      return ['-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuva444p10le'];
  }
}

export function codecForFile(file: string): Codec {
  const f = file.toLowerCase();
  if (f.endsWith('.webm')) return 'vp9';
  if (f.endsWith('.mov')) return 'prores';
  return 'h264';
}

export function chunkExtension(codec: Codec): string {
  return codec === 'vp9' ? '.webm' : codec === 'prores' ? '.mov' : '.mp4';
}

/** Output size for a scale factor, rounded to even numbers (required by yuv420p). */
export function scaledSize(width: number, height: number, scale: number): [number, number] {
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return [even(width), even(height)];
}
