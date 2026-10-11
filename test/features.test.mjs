import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { num, cycleTime } from '../dist/core/animate.js';
import { drawFrame, video, text, counter, rect, group, validate, normalizeVideo, measureText } from '../dist/index.js';
import { naturalLength } from '../dist/core/timeline.js';
import '../dist/node/load.js'; // installs the Skia text measurer

const info = (t) => ({ t, duration: 100, progress: 0, time: t, frame: 0, fps: 30 });
const env = { images: new Map(), createPath: () => null };
const pixel = (ctx, x, y) => [...ctx.getImageData(x, y, 1, 1).data];

test('tween repeat and yoyo', () => {
  const tw = { from: 0, to: 10, dur: 1, ease: 'linear', repeat: 3 };
  assert.equal(num(tw, info(0.5), 0), 5);
  assert.equal(num(tw, info(1.5), 0), 5);
  assert.equal(num(tw, info(2.25), 0), 2.5);
  assert.equal(num(tw, info(9), 0), 10, 'holds the end after the last play');
  const yoyo = { from: 0, to: 10, dur: 1, ease: 'linear', repeat: true, yoyo: true };
  assert.equal(num(yoyo, info(1.25), 0), 7.5, 'second play runs backwards');
  assert.equal(num(yoyo, info(2.25), 0), 2.5);
});

test('keyframes loop', () => {
  const kf = { 0: 1, 0.5: 2, 1: 1, ease: 'linear', loop: true };
  assert.equal(num(kf, info(0.25), 0), 1.5);
  assert.equal(num(kf, info(10.25), 0), 1.5);
  assert.equal(naturalLength(rect({ w: 1, h: 1, scale: { 0: 1, 1: 2, loop: 3 } })), 3);
  assert.equal(cycleTime(5, 2, Infinity, false), 1);
});

test('counter text formats numbers with separators and prefix', () => {
  const v = video({ width: 400, height: 100, fps: 10, duration: 2, background: '#000' }, [
    counter({ from: 0, to: 12400, dur: 1, ease: 'linear', prefix: '$', separator: ',' }, { size: 40, color: '#fff' }),
  ]);
  assert.deepEqual(validate(v), []);
  const ctx = createCanvas(400, 100).getContext('2d');
  drawFrame(ctx, v, 15, env); // after the count ends → "$12,400" drawn in white around the center
  let lit = 0;
  for (let x = 100; x < 300; x++) if (pixel(ctx, x, 50)[0] > 128) lit++;
  assert.ok(lit > 10, 'counter text is drawn');
});

test('text can be a function of time (TypeScript)', () => {
  const v = video({ width: 200, height: 100, duration: 1 }, [text(({ frame }) => `frame ${frame}`)]);
  assert.deepEqual(validate(v), []);
  drawFrame(createCanvas(200, 100).getContext('2d'), v, 3, env);
});

test('positioned groups are containers: children default to the group origin', () => {
  const v = video({ width: 200, height: 200, fps: 10, duration: 1, background: '#000000' }, [
    group([rect({ w: 10, h: 10, fill: '#ff0000' })], { x: 20, y: 20 }),
    group([rect({ w: 10, h: 10, fill: '#00ff00' })]), // unpositioned wrapper → frame center
  ]);
  const ctx = createCanvas(200, 200).getContext('2d');
  drawFrame(ctx, v, 0, env);
  assert.deepEqual(pixel(ctx, 20, 20), [255, 0, 0, 255]);
  assert.deepEqual(pixel(ctx, 100, 100), [0, 255, 0, 255]);
});

test('measureText uses the real font engine', () => {
  const small = measureText('Hello', { size: 20 });
  const big = measureText('Hello', { size: 40 });
  assert.ok(small.width > 20 && Math.abs(big.width / small.width - 2) < 0.1);
  assert.equal(measureText('a\nb', { size: 10 }).lines, 2);
});

test('validator: wipe on groups warns, bad repeat errors, inferred durations are clean', () => {
  const v = normalizeVideo({
    children: [
      { type: 'group', children: [], enter: 'wipe' },
      { type: 'rect', w: 1, h: 1, x: { from: 0, to: 1, repeat: 0 } },
    ],
  });
  const issues = validate(v).map((i) => `${i.level}:${i.path}`);
  assert.ok(issues.includes('warning:children[0].enter'));
  assert.ok(issues.includes('error:children[1].x.repeat'));
  const d = video({ fps: 30 }, [text('x', { start: 2.72, duration: 1 })]).duration;
  assert.equal(String(d).length <= 8, true, `duration ${d} has no float noise`);
});
