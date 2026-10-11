# Frameflow — guide for coding agents

Frameflow renders videos from a **data tree** whose times are all in **seconds**. Scenes are `.ts` (export default `video(...)`, or `(props) => video(...)`) or `.json` (same data, with `"type"` on each node; schema at `schema/scene.schema.json`).

## The loop (always follow it)
1. Write or edit the scene.
2. `node dist/cli.js check <scene>`. Fix every ✖ using the path and suggestion it prints. Use `--json` to get machine-readable output.
3. `node dist/cli.js storyboard <scene> out/sb.png --count 8`, then **look at the PNG** to check layout, overlap, and timing.
4. `node dist/cli.js render <scene> out/video.mp4`

(In a project that installs frameflow as a dependency, use `npx frameflow …` instead of `node dist/cli.js …`.)

## Vocabulary
- `video({ width=1920, height=1080, fps=30, duration?, background, font, fonts: {Family: 'file.ttf'}, audio: [{src,start,trim,volume,fadeIn,fadeOut}] }, children)`. Duration defaults to the end of the content plus 1s.
- Nodes: `text(str, {...})`, `rect({w,h,radius,fill,stroke})`, `circle({r,fill})`, `line({points:[[x,y],...], width, color, progress})`, `path({d: 'M0 0 L…', fill, stroke})`, `image(src, {w,h,fit:'cover'|'contain'|'fill', radius})`, `group(children, {...})`
- Common props on every node: `start`, `duration` (seconds, relative to parent), `x`, `y` (px or `"50%"`; **default = frame center**, except group/line/path which default to 0), `anchor` (`center` default, `topLeft`, `left`, …), `opacity`, `scale`, `scaleX`, `scaleY`, `rotate` (degrees), `blur`, `shadow: {color, blur, x, y}`, `enter`, `exit`
- Text props: `size` (48), `color`, `font`, `weight`, `italic`, `align`, `maxWidth` (wraps), `lineHeight`, `letterSpacing`, `stroke`, `strokeWidth`
- Fill can be a gradient: `{ type: 'linear'|'radial', angle: 90, stops: [[0,'#f00'],[1,'#00f']] }`
- Animatable value forms (any numeric, length or color prop):
  - constant: `0.5`
  - tween: `{ from, to, at = 0, dur = 0.5, ease }`. It is **clamped** outside its window.
  - keyframes: `{ "0": 0, "1.5": 1, "3": 0, "ease": "easeInOut" }`
  - function (TS only): `({ t, duration, progress, time, frame, fps }) => value`
- Eases: linear, easeIn/Out/InOut, easeIn/Out/InOutCubic, …Quart, …Sine, easeInExpo, easeOutExpo, easeIn/Out/InOutBack, easeOutElastic, easeOutBounce, spring, `{ spring: { damping, stiffness, mass } }`, `"cubic-bezier(a,b,c,d)"`
- Presets for `enter`/`exit`: fade, fadeUp, fadeDown, fadeLeft, fadeRight, pop (spring), zoom, slideUp/Down/Left/Right, typewriter, wipe, blur. Long form: `{ type, dur, ease, distance, delay }`. Exits end exactly when the node ends.
- Timing helpers: `sequence(nodes, { gap })` plays nodes back to back (a negative gap overlaps them), and `stagger(nodes, { start, step })`. `random(seed)` is deterministic.

## Rules of thumb
- Give text an explicit `y`, or several centered texts will overlap.
- A node with `exit` needs a known end: give it (or its parent) a `duration`, or rely on the video end.
- Keep width and height even (H.264).
- Don't use `Math.random()` or `Date.now()` in function props. Use `random(seed)` and `info.t`.

## Repo map
`src/core` is the isomorphic engine (types, animate, easing, presets, timeline, draw, validate). `src/node` holds rendering, preview and loading. `src/browser/player.ts` is the browser player. `examples/` holds scenes. `bench/` compares against Remotion. Tests: `npm test`. Regenerate the schema after changing node props: `npm run schema`.
