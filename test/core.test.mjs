import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easings, cubicBezier, springValue, springDuration } from '../dist/core/easing.js';
import { num, length, toPx } from '../dist/core/animate.js';
import { color, parseColor } from '../dist/core/color.js';
import { presetEffect } from '../dist/core/presets.js';
import { video, text, rect, group, sequence, stagger, random, normalizeVideo } from '../dist/index.js';
import { naturalLength } from '../dist/core/timeline.js';

const info = (t, duration = 10) => ({ t, duration, progress: t / duration, time: t, frame: Math.round(t * 30), fps: 30 });
const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('every easing maps 0→0 and 1→1', () => {
  for (const [name, fn] of Object.entries(easings)) {
    close(fn(0), 0, 1e-9);
    close(fn(1), 1, 1e-9);
    assert.ok(Number.isFinite(fn(0.5)), name);
  }
});

test('cubic-bezier matches CSS "ease" midpoint', () => {
  const ease = cubicBezier(0.25, 0.1, 0.25, 1);
  close(ease(0.5), 0.8024, 1e-3);
  close(cubicBezier(0, 0, 1, 1)(0.3), 0.3);
});

test('spring starts at 0, overshoots when underdamped, settles at 1', () => {
  assert.equal(springValue(0), 0);
  const peak = Math.max(...Array.from({ length: 200 }, (_, i) => springValue(i / 100, { damping: 5 })));
  assert.ok(peak > 1.1, 'bouncy spring overshoots');
  close(springValue(5), 1);
  close(springValue(5, { damping: 30 }), 1); // overdamped
  close(springValue(5, { damping: 20 }), 1); // critically damped (zeta = 1)
  const d = springDuration({ damping: 12 });
  assert.ok(d > 0.3 && d < 2, `settle time ${d}`);
});

test('tween clamps outside its window (no Remotion-style extrapolation footgun)', () => {
  const tw = { from: 0, to: 100, at: 1, dur: 2, ease: 'linear' };
  assert.equal(num(tw, info(0), 0), 0);
  assert.equal(num(tw, info(2), 0), 50);
  assert.equal(num(tw, info(99), 0), 100);
});

test('keyframes interpolate between times and hold at the ends', () => {
  const kf = { 0: 0, 1: 10, 3: 10, 4: 0, ease: 'linear' };
  assert.equal(num(kf, info(0.5), -1), 5);
  assert.equal(num(kf, info(2), -1), 10);
  assert.equal(num(kf, info(3.5), -1), 5);
  assert.equal(num(kf, info(10), -1), 0);
});

test('function animatables receive frame info', () => {
  assert.equal(num(({ t, fps }) => t * fps, info(2), 0), 60);
});

test('lengths accept px and percentages, and tween between them', () => {
  assert.equal(toPx('50%', 1920), 960);
  assert.equal(toPx(12, 1920), 12);
  assert.equal(length({ from: '0%', to: '100%', dur: 1, ease: 'linear' }, info(0.5), 1000, 0), 500);
  assert.throws(() => toPx('abc', 10), /Invalid length/);
});

test('colors parse and animate', () => {
  assert.deepEqual(parseColor('#f00'), [255, 0, 0, 1]);
  assert.deepEqual(parseColor('rgba(1, 2, 3, 0.5)'), [1, 2, 3, 0.5]);
  assert.equal(color('#123456', info(0), '#000'), '#123456');
  assert.equal(color({ from: '#000000', to: '#ffffff', dur: 1, ease: 'linear' }, info(0.5), '#000'), 'rgba(128, 128, 128, 1.0000)');
  assert.throws(() => parseColor('notacolor'), /Invalid color/);
});

test('enter and exit presets', () => {
  const start = presetEffect('fadeUp', undefined, 0, 5, 1280, 720);
  assert.equal(start.opacity, 0);
  assert.equal(start.dy, 40);
  const done = presetEffect('fadeUp', undefined, 1, 5, 1280, 720);
  assert.equal(done.opacity, 1);
  close(done.dy, 0);
  const exiting = presetEffect(undefined, { type: 'fade', dur: 1, ease: 'linear' }, 4.5, 5, 1280, 720);
  close(exiting.opacity, 0.5);
  const typing = presetEffect({ type: 'typewriter', dur: 1 }, undefined, 0.5, 5, 1280, 720, 10);
  close(typing.reveal, 0.5);
});

test('video duration is inferred from content (+1s hold)', () => {
  const v = video({ fps: 30 }, [text('a', { start: 2, enter: { type: 'fade', dur: 1 } })]);
  close(v.duration, 4);
  assert.equal(video({ duration: 7 }, []).duration, 7);
});

test('naturalLength includes tweens, keyframes, enter and exit', () => {
  assert.equal(naturalLength(rect({ w: 1, h: 1, x: { from: 0, to: 1, at: 1, dur: 2 } })), 3);
  assert.equal(naturalLength(rect({ w: 1, h: 1, opacity: { 0: 0, 5: 1 } })), 5);
  assert.equal(naturalLength(rect({ w: 1, h: 1, enter: { type: 'fade', dur: 1 }, exit: { type: 'fade', dur: 0.5 } })), 1.5);
  assert.equal(naturalLength(rect({ w: 1, h: 1, duration: 9 })), 9);
});

test('sequence places items back to back, with negative gaps for overlap', () => {
  const s = sequence([text('a', { duration: 2 }), text('b', { duration: 3 }), text('c', { duration: 1 })], { gap: -0.5 });
  assert.deepEqual(s.children.map((c) => c.start), [0, 1.5, 4]);
  assert.equal(s.duration, 5);
});

test('stagger offsets starts', () => {
  const g = stagger([text('a'), text('b', { start: 1 }), text('c')], { start: 2, step: 0.25 });
  assert.deepEqual(g.children.map((c) => c.start), [2, 3.25, 2.5]);
});

test('random is deterministic per seed', () => {
  const a = random(42);
  const b = random(42);
  const c = random('other');
  const xs = [a(), a(), a()];
  assert.deepEqual(xs, [b(), b(), b()]);
  assert.notDeepEqual(xs, [c(), c(), c()]);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test('normalizeVideo fills defaults for JSON input', () => {
  const v = normalizeVideo({ children: [group([text('x', { duration: 2 })])] });
  assert.equal(v.type, 'video');
  assert.equal(v.width, 1920);
  assert.equal(v.fps, 30);
  assert.equal(v.duration, 3);
});
