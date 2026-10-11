import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { drawFrame, video, rect, circle, text } from '../dist/index.js';
import { render, renderStill, renderStoryboard } from '../dist/node/render.js';
import { loadScene } from '../dist/node/load.js';
import { ffmpegPath } from '../dist/node/ffmpeg.js';

const env = { images: new Map(), createPath: () => null };
const pixel = (ctx, x, y) => [...ctx.getImageData(x, y, 1, 1).data];

/** Count decoded video frames in a file. */
function countFrames(file) {
  const log = execFileSync(ffmpegPath(), ['-hide_banner', '-nostats', '-i', file, '-map', '0:v:0', '-f', 'null', '-', '-progress', 'pipe:1'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return Number([...log.matchAll(/frame=(\d+)/g)].pop()[1]);
}

test('drawFrame paints background, shapes and respects timing', () => {
  const v = video({ width: 100, height: 100, fps: 10, duration: 2, background: '#ff0000' }, [
    rect({ x: 50, y: 50, w: 20, h: 20, fill: '#00ff00', start: 1 }),
    circle({ x: 10, y: 10, r: 5, fill: '#0000ff' }),
  ]);
  const ctx = createCanvas(100, 100).getContext('2d');
  drawFrame(ctx, v, 0, env);
  assert.deepEqual(pixel(ctx, 50, 50), [255, 0, 0, 255], 'rect not visible before start');
  assert.deepEqual(pixel(ctx, 10, 10), [0, 0, 255, 255]);
  drawFrame(ctx, v, 10, env);
  assert.deepEqual(pixel(ctx, 50, 50), [0, 255, 0, 255], 'rect visible after start');
});

test('opacity tweens blend correctly', () => {
  const v = video({ width: 10, height: 10, fps: 10, duration: 1, background: '#000000' }, [
    rect({ w: 10, h: 10, fill: '#ffffff', opacity: { from: 0, to: 1, dur: 1, ease: 'linear' } }),
  ]);
  const ctx = createCanvas(10, 10).getContext('2d');
  drawFrame(ctx, v, 5, env);
  const [r] = pixel(ctx, 5, 5);
  assert.ok(Math.abs(r - 128) <= 2, `got ${r}`);
});

test('rendering is deterministic: same frame twice → identical pixels', () => {
  const v = video({ width: 64, height: 64, duration: 1 }, [text('Hi', { size: 30, enter: 'pop', rotate: { from: 0, to: 45 } })]);
  const a = createCanvas(64, 64).getContext('2d');
  const b = createCanvas(64, 64).getContext('2d');
  drawFrame(a, v, 7, env);
  drawFrame(b, v, 7, env);
  assert.deepEqual(a.getImageData(0, 0, 64, 64).data, b.getImageData(0, 0, 64, 64).data);
});

test('end-to-end: render a TS scene with props to mp4 using parallel workers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ff-test-'));
  const scene = join(dir, 'scene.ts');
  writeFileSync(
    scene,
    `import { video, text, rect } from 'frameflow';
     export default (props: { label?: string }) => video({ width: 160, height: 90, fps: 30, duration: 2, background: '#112233' }, [
       rect({ w: { from: 0, to: 160 }, h: 10, y: 80 }),
       text(props.label ?? 'none', { size: 20, enter: 'fadeUp' }),
     ]);`,
  );
  const loaded = await loadScene(scene, { label: 'from props' });
  assert.equal(loaded.video.children[1].text, 'from props');
  const out = join(dir, 'out.mp4');
  const result = await render(scene, { output: out, props: { label: 'x' }, workers: 3, preset: 'ultrafast' });
  assert.equal(result.frames, 60);
  assert.equal(result.workers, 3);
  assert.ok(existsSync(out) && statSync(out).size > 1000);
  assert.equal(countFrames(out), 60, 'chunk concatenation keeps every frame');
});

test('audio tracks are mixed into the output', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ff-test-'));
  const wav = join(dir, 'tone.wav');
  execFileSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', wav]);
  const file = join(dir, 'scene.json');
  writeFileSync(file, JSON.stringify({ width: 64, height: 64, duration: 2, audio: [{ src: 'tone.wav', start: 0.5, volume: 0.5 }], children: [] }));
  const out = join(dir, 'out.mp4');
  await render(file, { output: out, preset: 'ultrafast' });
  // `ffmpeg -i` with no output exits non-zero but prints the stream list to stderr.
  let streams = '';
  try {
    execFileSync(ffmpegPath(), ['-hide_banner', '-i', out], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    streams = String(e.stderr);
  }
  assert.match(streams, /Audio: aac/);
  assert.match(streams, /Video: h264/);
});

test('JSON scenes load, and still + storyboard produce PNGs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ff-test-'));
  const file = join(dir, 'scene.json');
  writeFileSync(file, JSON.stringify({ width: 320, height: 180, duration: 2, children: [{ type: 'text', text: 'JSON!', enter: 'zoom' }] }));
  const scene = await loadScene(file);
  const png = await renderStill(scene, 1);
  assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47]); // "PNG"
  const sheet = await renderStoryboard(scene, { count: 4, columns: 2, thumbWidth: 160 });
  assert.ok(sheet.length > 1000);
});

test('render refuses invalid scenes with readable errors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ff-test-'));
  const file = join(dir, 'bad.json');
  writeFileSync(file, JSON.stringify({ children: [{ type: 'txt', text: 'x' }] }));
  await assert.rejects(render(file, { output: join(dir, 'bad.mp4') }), /Did you mean "text"/);
});

test('--scale renders at a different (even) resolution', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ff-test-'));
  const file = join(dir, 'scene.json');
  writeFileSync(file, JSON.stringify({ width: 160, height: 90, duration: 1, children: [{ type: 'circle', r: 20 }] }));
  const out = join(dir, 'half.mp4');
  await render(file, { output: out, scale: 0.5, preset: 'ultrafast' });
  let streams = '';
  try {
    execFileSync(ffmpegPath(), ['-hide_banner', '-i', out], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    streams = String(e.stderr);
  }
  assert.match(streams, /80x46/); // 45 rounds to the nearest even number
});
