// Render race: Remotion vs Frameflow on the benchmark video (bench/results.json), in English or Chinese.
//   frameflow render examples/comparison.ts out/comparison.mp4 --props '{"lang":"zh"}'
// The two empty panels are filled with the real outputs of both tools by scripts/make-comparison.mjs.
import { video, text, counter, rect, circle, group } from 'frameflow';
import results from '../bench/results.json';

export const W = 1280;
export const H = 720;
/** Panel rectangles (top-left x/y, size) that scripts/make-comparison.mjs overlays the videos into. */
export const PANEL = { w: 560, h: 315, y: 150, left: 40, right: 680 };
/** The race starts here; each tool's video appears once its render time has elapsed. */
export const RACE = 1.2;
export const CLIP = 6; // length of the benchmark video
export const remotionTime = results.contenders.remotion.medianSeconds;
export const frameflowTime = results.contenders.frameflow.medianSeconds;
/** Both clips play again side by side once Remotion finishes. */
export const SYNC = RACE + remotionTime;
const END = SYNC + CLIP; // overlays are gone after this, so the summary card can take the screen

const speedup = (remotionTime / frameflowTime).toFixed(1);
const psnr = results.psnrAverageDb.toFixed(1);
const at1080 = results.variants['remotion --scale=1.5 (1080p)'].medianSeconds;
const ff1080 = results.variants['frameflow --scale 1.5 (1080p)'].medianSeconds;

const STRINGS = {
  en: {
    title: 'Same video. Two engines.',
    subtitle: `Render race · ${results.machine.cpus} vCPU · 720p · real time`,
    rendering: 'Rendering…',
    done: (s: string) => `Done in ${s} s`,
    waiting: 'Frameflow is done. Remotion is still rendering…',
    same: `Same pixels (${psnr} dB PSNR), ${speedup}× faster`,
    summary: 'Remotion vs Frameflow',
    rows: [
      ['Render 6 s @ 720p', `${remotionTime.toFixed(2)} s`, `${frameflowTime.toFixed(2)} s`],
      ['Render 6 s @ 1080p', `${at1080.toFixed(2)} s`, `${ff1080.toFixed(2)} s`],
      ['Install size', '342 MB + Chrome', '76 MB'],
      ['Runtime packages', '254', '25'],
      ['Scene code', '125 lines', '16 lines'],
      ['License', 'Paid for 4+ people', 'MIT'],
    ],
    cta: 'github.com/ku2055/frameflow',
  },
  zh: {
    title: '同一个视频，两种引擎',
    subtitle: `渲染竞速 · ${results.machine.cpus} 核 CPU · 720p · 真实时间`,
    rendering: '渲染中…',
    done: (s: string) => `${s} 秒完成`,
    waiting: 'Frameflow 已完成，Remotion 仍在渲染…',
    same: `画面一致（PSNR ${psnr} dB），速度快 ${speedup} 倍`,
    summary: 'Remotion 对比 Frameflow',
    rows: [
      ['渲染 6 秒 720p', `${remotionTime.toFixed(2)} 秒`, `${frameflowTime.toFixed(2)} 秒`],
      ['渲染 6 秒 1080p', `${at1080.toFixed(2)} 秒`, `${ff1080.toFixed(2)} 秒`],
      ['安装体积', '342 MB + Chrome', '76 MB'],
      ['运行时依赖包', '254 个', '25 个'],
      ['场景代码', '125 行', '16 行'],
      ['许可证', '4 人以上公司需付费', 'MIT 开源'],
    ],
    cta: 'github.com/ku2055/frameflow',
  },
};

const BG = '#0f172a';
const MUTED = '#94a3b8';
const REMOTION = '#f97316';
const FRAMEFLOW = '#38bdf8';
const GOOD = '#22c55e';

/** One lane of the race: panel, name, progress bar, stopwatch. */
function lane(name: string, x: number, color: string, seconds: number, s: (typeof STRINGS)['en']) {
  const cx = x + PANEL.w / 2;
  const panelCy = PANEL.y + PANEL.h / 2;
  const barY = PANEL.y + PANEL.h + 62;
  const finish = RACE + seconds;
  return group([
    rect({ x, y: PANEL.y, anchor: 'topLeft', w: PANEL.w, h: PANEL.h, radius: 10, fill: '#1e293b', stroke: color, strokeWidth: 2 }),
    // spinner + "Rendering…" until this tool finishes (covered by the real video afterwards)
    group(
      [
        circle({ x: cx, y: panelCy - 24, r: 18, fill: 'rgba(0,0,0,0)', stroke: color, strokeWidth: 4, opacity: 0.35 }),
        group([circle({ x: 18, y: 0, r: 5, fill: color })], {
          x: cx,
          y: panelCy - 24,
          rotate: { from: 0, to: 360, dur: 1, ease: 'linear', repeat: true },
        }),
        text(s.rendering, { x: cx, y: panelCy + 22, size: 26, color: MUTED }),
      ],
      { start: RACE, duration: seconds },
    ),
    // shows in the panel after the first playback of this tool's video ends
    text('✓', { x: cx, y: panelCy - 10, size: 120, color: GOOD, font: 'DejaVu Sans', start: finish }),
    text(name, { x, y: PANEL.y + PANEL.h + 30, anchor: 'left', size: 30, weight: 'bold', color }),
    counter(
      { from: 0, to: seconds, dur: seconds, decimals: 2, suffix: ' s', ease: 'linear' },
      { x: x + PANEL.w, y: PANEL.y + PANEL.h + 30, anchor: 'right', size: 30, color: 'white', start: RACE, font: 'DejaVu Sans Mono' },
    ),
    rect({ x, y: barY, anchor: 'topLeft', w: PANEL.w, h: 12, radius: 6, fill: '#334155' }),
    rect({
      x,
      y: barY,
      anchor: 'topLeft',
      h: 12,
      radius: 6,
      fill: color,
      w: { from: 0, to: PANEL.w, at: RACE, dur: seconds, ease: 'linear' },
    }),
    text(s.done(seconds.toFixed(2)), {
      x: cx,
      y: barY + 44,
      size: 26,
      weight: 'bold',
      color: GOOD,
      start: finish,
      enter: 'pop',
    }),
  ]);
}

export default (props: Record<string, unknown> = {}) => {
  const lang = props.lang === 'zh' ? 'zh' : 'en';
  const s = STRINGS[lang];
  const font = lang === 'zh' ? 'Noto Sans SC' : 'DejaVu Sans';

  const rowY = (i: number) => 230 + i * 62;
  const summary = group(
    [
      rect({ x: 0, y: 0, anchor: 'topLeft', w: W, h: H, fill: BG }),
      text(s.summary, { y: 90, size: 52, weight: 'bold', enter: 'fadeUp' }),
      text('Remotion', { x: 760, y: 170, size: 28, weight: 'bold', color: REMOTION, enter: 'fade' }),
      text('Frameflow', { x: 1060, y: 170, size: 28, weight: 'bold', color: FRAMEFLOW, enter: 'fade' }),
      ...s.rows.map(([label, a, b], i) =>
        group(
          [
            rect({ x: 80, y: rowY(i) - 28, anchor: 'topLeft', w: 1120, h: 56, radius: 8, fill: i % 2 ? BG : '#1e293b' }),
            text(label, { x: 110, y: rowY(i), anchor: 'left', size: 28, color: MUTED }),
            text(a, { x: 760, y: rowY(i), size: 28, color: 'white' }),
            text(b, { x: 1060, y: rowY(i), size: 28, weight: 'bold', color: GOOD }),
          ],
          { start: 0.3 + i * 0.12, enter: 'fadeUp' },
        ),
      ),
      text(s.cta, { y: 640, size: 30, color: FRAMEFLOW, start: 1.2, enter: 'fade' }),
    ],
    { start: END + 0.2, enter: { type: 'fade', dur: 0.4 } },
  );

  return video({ width: W, height: H, fps: 30, duration: END + 6, background: BG, font, fonts: lang === 'zh' ? { 'Noto Sans SC': 'assets/fonts/NotoSansSC-subset.ttf' } : {} }, [
    text(s.title, { y: 58, size: 48, weight: 'bold', enter: 'fadeDown' }),
    text(s.subtitle, { y: 108, size: 24, color: MUTED, start: 0.3, enter: 'fade' }),
    lane('Remotion', PANEL.left, REMOTION, remotionTime, s),
    lane('Frameflow', PANEL.right, FRAMEFLOW, frameflowTime, s),
    text(s.waiting, { y: 662, size: 28, color: MUTED, start: RACE + frameflowTime + 0.6, duration: remotionTime - frameflowTime - 0.6, enter: 'fade', exit: 'fade' }),
    text(s.same, { y: 662, size: 32, weight: 'bold', color: GOOD, start: SYNC + 0.3, enter: 'fadeUp' }),
    summary,
  ]);
};
