# Benchmark: Remotion vs Frameflow

The same 6-second video built twice: idiomatic Remotion ([`bench/remotion-baseline/src/Promo.tsx`](../bench/remotion-baseline/src/Promo.tsx), written by a separate agent from a written spec) and Frameflow ([`examples/hello.ts`](../examples/hello.ts)). Reproduce with:

```bash
(cd bench/remotion-baseline && npm install)   # one-time
npm run build && node bench/compare.mjs 3
```

**Setup:** AWS VM, 4 vCPU AMD EPYC 7571, 15 GB RAM, Ubuntu 24.04, Node 22.23. Remotion 4.0.534. Both tools encode H.264 at **CRF 18** with x264 preset **medium**, which are Remotion's defaults. After one warm-up run, we take the median of 3 timed runs. Raw numbers are in [`bench/results.json`](../bench/results.json).

## Results

| | Remotion 4.0.534 | Frameflow 0.1 | |
|---|---|---|---|
| **Render time, 720p** (each tool's default concurrency) | 13.15 s | **2.65 s** | **5.0× faster** |
| Render time, equal concurrency (4) | 12.01 s | **2.65 s** | 4.5× faster |
| Render time, **one** Frameflow worker vs Remotion at 4 | 12.01 s | **2.52 s** | 4.8× faster |
| **Render time, 1080p** (`--scale 1.5`) | 17.28 s | **4.82 s** | **3.6× faster** |
| Peak memory (largest process) | 519 MB | 535 MB | about the same |
| Cold `npm ci --omit=dev` | 14.8 s | **2.7 s** | 5.5× faster |
| Production install size | 342 MB + 236 MB Chrome on first render | **76 MB** | ~7.5× smaller |
| Runtime packages | 254 | **25** | 10× fewer |
| Scene code (non-blank lines) | 125 (3 files) | **16** (1 file) | 7.8× less |
| Output file size | 81 KB | 118 KB | Remotion smaller* |
| Visual parity (PSNR of Frameflow vs Remotion) | — | **42.3 dB** | visually identical (>40 dB) |

\* Remotion's output is smaller, probably because it encodes from JPEG screenshots (quality 80), which soften edges, while Frameflow encodes lossless RGBA. Frameflow is sharper. Both are tiny in absolute terms.

## Frame 60, side by side

| Remotion | Frameflow |
|---|---|
| ![Remotion frame 60](media/remotion-frame60.png) | ![Frameflow frame 60](media/frameflow-frame60.png) |

## The code

Remotion (excerpt; 118 lines in `Promo.tsx` plus `Root.tsx` and `index.ts`):

```tsx
const titleIn = interpolate(frame, [0.2 * fps, 0.8 * fps], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
const subIn = interpolate(frame, [0.8 * fps, 1.3 * fps], [0, 1], clamp);
const fadeOut = interpolate(frame, [5.4 * fps, durationInFrames], [1, 0], clamp);
// … plus a Circle component with spring({ frame: frame - delay, fps, config: { damping: 12 } }),
// three <Sequence from={Math.round(1.5 * fps)}> blocks, and an interpolated progress bar.
```

Frameflow (the whole file):

```ts
import { video, text, circle, rect, group, stagger } from 'frameflow';

export default video({ width: 1280, height: 720, fps: 30, duration: 6, background: '#0f172a', font: 'DejaVu Sans' }, [
  group(
    [
      text('Hello, Frameflow', { y: 300, size: 96, weight: 'bold', start: 0.2, enter: { type: 'fadeUp', dur: 0.6 } }),
      text('Video as code, made simple', { y: 390, color: '#94a3b8', start: 0.8, enter: { type: 'fade', ease: 'linear' } }),
    ],
    { exit: { type: 'fade', dur: 0.6, ease: 'linear' } },
  ),
  stagger(
    ['#f43f5e', '#22c55e', '#3b82f6'].map((fill, i) => circle({ x: 440 + i * 200, y: 540, r: 40, fill, enter: 'pop' })),
    { start: 1.5, step: 0.15 },
  ),
  rect({ x: 0, y: 704, anchor: 'topLeft', h: 16, w: { from: 0, to: 1280, dur: 6, ease: 'linear' }, fill: '#38bdf8' }),
]);
```

## Why it's faster

1. **No browser round-trip.** Remotion asks Chrome to lay out the DOM, paint it, encode a JPEG screenshot, and send it back over the DevTools protocol, then decodes it again for FFmpeg. Frameflow draws straight into a Skia bitmap and pipes the raw pixels to FFmpeg.
2. **No per-frame waiting.** There is nothing like `delayRender`: assets are preloaded once per worker.
3. **Independent workers.** Each worker thread owns a canvas and an FFmpeg encoder for its chunk, so drawing and encoding overlap. Chunks are joined with a stream copy, with no re-encode.

## Caveats (read before quoting the numbers)

- **One small video on 4 cores.** Frameflow's fixed startup is only ~0.45 s (we measured a 3-frame render). It barely gains from more workers here because **a single worker already keeps ~2.9 of the 4 cores busy**: x264 encodes with its own threads (1 worker: 287% CPU; 4 workers: 353%). With `--preset ultrafast` the render drops to ~1.9 s. More workers should help on machines with more cores, but we haven't measured that. The 1080p row shows the per-frame advantage holds as frames get heavier.
- **Different scope.** Remotion can render anything Chrome can: CSS layout, video clips, WebGL. Frameflow can't (see [design trade-offs](03-frameflow-design.md#6-honest-trade-offs)). This compares the motion-graphics job both can do.
- **4 vCPU machine.** Remotion's own issue tracker reports poor scaling on many-core machines ([#4664](https://github.com/remotion-dev/remotion/issues/4664)). We have not tested more than 4 cores.
- The Remotion baseline was written idiomatically by an independent agent from a spec and was not tuned. Remotion options such as `--image-format=png` or a different `--concurrency` could change its numbers slightly. We tested concurrency 2 and 4.
