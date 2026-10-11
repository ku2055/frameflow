#!/usr/bin/env node
/**
 * Build the side-by-side comparison videos (English + Chinese) in docs/media/.
 *
 *   node bench/compare.mjs 3              # produces both benchmark outputs + bench/results.json
 *   node scripts/make-comparison.mjs
 *
 * Renders examples/comparison.ts (the race UI), then overlays the real outputs of both tools
 * into its panels with FFmpeg and encodes a small web-friendly MP4.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ffmpeg = join(root, 'node_modules/ffmpeg-static/ffmpeg');
const remotionOut = join(root, 'bench/remotion-baseline/out/promo.mp4');
const frameflowOut = join(root, 'out/bench-hello.mp4');

for (const f of [remotionOut, frameflowOut]) {
  if (!existsSync(f)) {
    console.error(`Missing ${f}. Run the benchmark first: node bench/compare.mjs 3`);
    process.exit(1);
  }
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stderr.slice(-3000)}`);
}

// Panel geometry and timings come from the scene itself, so the overlay always lines up.
const { PANEL, RACE, SYNC, frameflowTime } = await bundleMeta();

/** Bundle examples/comparison.ts with esbuild just to read its exported constants. */
async function bundleMeta() {
  const { build } = await import('esbuild');
  const out = join(root, 'out/.comparison-meta.mjs');
  await build({
    entryPoints: [join(root, 'examples/comparison.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: out,
    alias: { frameflow: join(root, 'dist/index.js') },
    logLevel: 'error',
  });
  return import(`${pathToFileURL(out).href}?t=${Date.now()}`);
}

mkdirSync(join(root, 'out'), { recursive: true });
mkdirSync(join(root, 'docs/media'), { recursive: true });

// The panel has a 2 px border: inset the video so the border stays visible (sizes kept even for H.264).
const w = PANEL.w - 4;
const h = PANEL.h - 4 + ((PANEL.h - 4) % 2);
const y = PANEL.y + 2;
const xs = { remotion: PANEL.left + 2, frameflow: PANEL.right + 2 };

for (const lang of ['en', 'zh']) {
  const ui = join(root, `out/comparison-ui.${lang}.mp4`);
  run('node', ['dist/cli.js', 'render', 'examples/comparison.ts', ui, '--quiet', '--crf', '12', '--props', JSON.stringify({ lang })]);

  const clip = (input, at, label) =>
    `[${input}:v]scale=${w}:${h},setpts=PTS-STARTPTS+${at.toFixed(3)}/TB[${label}]`;
  const filter = [
    clip(1, SYNC, 'r'), // Remotion appears when its render would have finished…
    clip(2, RACE + frameflowTime, 'f1'), // …Frameflow much earlier,
    clip(3, SYNC, 'f2'), // then both play again in sync to show they look the same.
    `[0:v][r]overlay=${xs.remotion}:${y}:eof_action=pass[a]`,
    `[a][f1]overlay=${xs.frameflow}:${y}:eof_action=pass[b]`,
    `[b][f2]overlay=${xs.frameflow}:${y}:eof_action=pass,format=yuv420p[v]`,
  ].join(';');

  const out = join(root, `docs/media/comparison${lang === 'en' ? '' : '.zh'}.mp4`);
  run(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', ui, '-i', remotionOut, '-i', frameflowOut, '-i', frameflowOut,
    '-filter_complex', filter, '-map', '[v]',
    // Mostly flat graphics: a high CRF with x264 "animation" tuning stays sharp and tiny.
    '-c:v', 'libx264', '-preset', 'veryslow', '-tune', 'animation', '-crf', '30',
    '-movflags', '+faststart', out,
  ]);
  console.log(`✔ ${out}  (${(statSync(out).size / 1024).toFixed(0)} KB)`);
}
