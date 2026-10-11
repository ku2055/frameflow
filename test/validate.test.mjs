import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, video, text, rect, normalizeVideo } from '../dist/index.js';

const errorsOf = (v) => validate(v).filter((i) => i.level === 'error');

test('a correct scene has no issues', () => {
  const v = video({ width: 1280, height: 720, duration: 3 }, [
    text('Hi', { enter: 'fadeUp', color: { from: '#fff', to: '#f00' }, x: '50%' }),
    rect({ w: 100, h: { 0: 0, 1: 50 }, fill: { type: 'linear', stops: [[0, '#000'], [1, '#fff']] } }),
  ]);
  assert.deepEqual(validate(v), []);
});

test('typos get "did you mean" suggestions with exact paths', () => {
  const v = normalizeVideo({ children: [{ type: 'text', text: 'x', colour: 'red', enter: 'fadeUpp' }, { type: 'rectangle' }] });
  const byPath = Object.fromEntries(errorsOf(v).map((e) => [e.path, e.message]));
  assert.match(byPath['children[0].colour'], /Did you mean "color"/);
  assert.match(byPath['children[0].enter'], /Did you mean "fadeUp"/);
  assert.match(byPath['children[1].type'], /Did you mean "rect"/);
});

test('frame-based or wrong-shaped animations are explained', () => {
  const v = normalizeVideo({ children: [{ type: 'text', text: 'x', opacity: { start: 0, end: 1 } }] });
  assert.match(errorsOf(v)[0].message, /from, to, at, dur, ease/);
});

test('invalid colors, eases and lengths are rejected', () => {
  const v = normalizeVideo({
    children: [
      { type: 'rect', w: 'wide', h: 10, fill: '#zzz' },
      { type: 'text', text: 'x', x: { from: 0, to: 10, ease: 'bouncy' } },
    ],
  });
  const paths = errorsOf(v).map((e) => e.path);
  assert.ok(paths.includes('children[0].w'));
  assert.ok(paths.includes('children[0].fill'));
  assert.ok(paths.includes('children[1].x.ease'));
});

test('odd dimensions are rejected for H.264', () => {
  assert.match(errorsOf(video({ width: 1279, height: 720, duration: 1 }, []))[0].message, /even/);
});

test('timing warnings: starts after the video ends, cut-off durations, off-frame', () => {
  const v = video({ width: 1000, height: 1000, duration: 2 }, [
    text('late', { start: 5 }),
    text('long', { start: 1, duration: 5 }),
    text('far', { x: 5000 }),
  ]);
  const warnings = validate(v).filter((i) => i.level === 'warning').map((i) => i.path);
  assert.deepEqual(warnings.sort(), ['children[0].start', 'children[1].duration', 'children[2].x']);
});

test('required properties are reported', () => {
  const v = normalizeVideo({ children: [{ type: 'rect', w: 10 }, { type: 'group' }] });
  const paths = errorsOf(v).map((e) => e.path);
  assert.ok(paths.includes('children[0].h'));
  assert.ok(paths.includes('children[1].children'));
});
