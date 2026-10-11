// TikTok-style captions. Props: { words: [{ text, start, end }] } (seconds). Run:
//   frameflow render examples/captions.ts out/captions.mp4 --props '{"words":[{"text":"Hi","start":0.2,"end":0.6}]}'
import { video, text, image, group, rect, measureText } from 'frameflow';

interface Word {
  text: string;
  start: number;
  end: number;
}

const DEFAULT_WORDS: Word[] = [
  ['Making', 0.3, 0.75], ['videos', 0.75, 1.2], ['from', 1.2, 1.5], ['code', 1.5, 2.1],
  ['is', 2.4, 2.65], ['finally', 2.65, 3.2], ['simple', 3.2, 3.8], ['and', 3.8, 4.05],
  ['really', 4.3, 4.8], ['fast', 4.8, 5.4], ['for', 5.7, 5.95], ['everyone', 5.95, 6.8],
].map(([text, start, end]) => ({ text, start, end }) as Word);

const W = 1280;
const H = 720;
const SIZE = 96;
const FONT = 'DejaVu Sans';
const PER_LINE = 3;
const GAP = 44;

export default (props: Record<string, unknown>) => {
  const words = (props.words as Word[] | undefined) ?? DEFAULT_WORDS;
  const measure = (str: string) => measureText(str, { size: SIZE, font: FONT, weight: 'bold' }).width;
  const end = Math.max(...words.map((w) => w.end)) + 1.2;

  const chunks: Word[][] = [];
  for (let i = 0; i < words.length; i += PER_LINE) chunks.push(words.slice(i, i + PER_LINE));

  const groups = chunks.map((chunk, ci) => {
    const raw = chunk.map((w) => measure(w.text.toUpperCase()));
    const rawTotal = raw.reduce((a, b) => a + b, 0) + GAP * (chunk.length - 1);
    const k = Math.min(1, (W - 140) / rawTotal); // shrink-to-fit so a long chunk never leaves the frame
    const size = Math.round(SIZE * k);
    const widths = raw.map((v) => v * k);
    const total = rawTotal * k;
    const prevEnd = ci > 0 ? chunks[ci - 1]![chunks[ci - 1]!.length - 1]!.end : 0;
    const nextStart = ci < chunks.length - 1 ? chunks[ci + 1]![0]!.start : Infinity;
    const first = chunk[0]!.start;
    const last = chunk[chunk.length - 1]!.end;
    // appear a hair early / linger a hair late when there is silence around the chunk; never overlap neighbours
    const cStart = Math.max(prevEnd, first - 0.1);
    const cEnd = Math.min(nextStart, last + 0.4);
    let x = (W - total) / 2;
    const nodes = chunk.flatMap((w) => {
      const idx = chunk.indexOf(w);
      const cx = x + widths[idx]! / 2;
      x += widths[idx]! + GAP;
      const common = { x: cx, y: 560, size, weight: 'bold' as const };
      const label = w.text.toUpperCase();
      return [
        // base word: appears with its chunk, white with outline
        text(label, { ...common, color: '#ffffff', stroke: '#0f0a1f', strokeWidth: 10, start: 0, enter: { type: 'fadeUp', dur: 0.2, distance: 20 } }),
        // highlight: only while this word is spoken (per-word start/duration), yellow + pop
        text(label, { ...common, color: '#facc15', stroke: '#0f0a1f', strokeWidth: 10, start: w.start - cStart, duration: w.end - w.start, scale: { from: 0.85, to: 1.08, dur: 0.18, ease: 'easeOutBack' }, shadow: { color: 'rgba(250,204,21,0.7)', blur: 24 } }),
      ];
    });
    return group(nodes, { start: cStart, duration: cEnd - cStart });
  });

  return video({ width: W, height: H, fps: 30, font: FONT, background: '#0f0a1f', duration: end }, [
    image('./assets/captions-bg.png', { w: W, h: H, x: W / 2, y: H / 2 }),
    // simple "speaker" placeholder
    rect({ x: W / 2, y: 250, w: 220, h: 220, radius: 110, fill: 'rgba(255,255,255,0.12)', stroke: 'rgba(255,255,255,0.3)', strokeWidth: 4, scale: { '0': 1, '3': 1.04, '6': 1, ease: 'easeInOutSine' } }),
    ...groups,
  ]);
};
