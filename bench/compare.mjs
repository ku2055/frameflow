#!/usr/bin/env node
/**
 * Head-to-head benchmark: the same 6s 1280x720 video rendered by Remotion and by Frameflow.
 *
 *   node bench/compare.mjs [runs=3]
 *
 * Both use H.264, CRF 18, x264 preset "medium" (Remotion's defaults) and their default concurrency.
 * Writes bench/results.json and prints a markdown table.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const runs = Number(process.argv[2] ?? 3);
const baseline = join(root, 'bench/remotion-baseline');

if (!existsSync(join(baseline, 'node_modules'))) {
  console.error('Install the Remotion baseline first: (cd bench/remotion-baseline && npm install)');
  process.exit(1);
}

/** Run a command under /usr/bin/time -v; return wall seconds and peak RSS (MB). */
function timed(cmd, args, cwd) {
  const r = spawnSync('/usr/bin/time', ['-v', cmd, ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stderr.slice(-3000)}`);
  const wall = r.stderr.match(/Elapsed \(wall clock\) time.*: (?:(\d+):)?(\d+):([\d.]+)/);
  const seconds = Number(wall[1] ?? 0) * 3600 + Number(wall[2]) * 60 + Number(wall[3]);
  const rss = Number(r.stderr.match(/Maximum resident set size \(kbytes\): (\d+)/)[1]) / 1024;
  return { seconds, rssMB: Math.round(rss) };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const du = (p) => execFileSync('du', ['-sm', p], { encoding: 'utf8' }).split('\t')[0] + ' MB';

const contenders = {
  remotion: {
    cwd: baseline,
    cmd: 'npx',
    args: ['remotion', 'render', 'src/index.ts', 'Promo', 'out/promo.mp4', '--log=error'],
    out: join(baseline, 'out/promo.mp4'),
  },
  frameflow: {
    cwd: root,
    cmd: 'node',
    args: ['dist/cli.js', 'render', 'examples/hello.ts', 'out/bench-hello.mp4', '--quiet'],
    out: join(root, 'out/bench-hello.mp4'),
  },
};

// Equal-concurrency variants: defaults differ (Remotion: half the threads, Frameflow: all cores).
const threads = cpus().length;
const variants = {
  [`remotion --concurrency=${threads}`]: { ...contenders.remotion, args: [...contenders.remotion.args, `--concurrency=${threads}`] },
  'frameflow --workers=2': { ...contenders.frameflow, args: [...contenders.frameflow.args, '--workers', '2'] },
  'frameflow --workers=1': { ...contenders.frameflow, args: [...contenders.frameflow.args, '--workers', '1'] },
  // Same scene at 1080p (both tools support a resolution multiplier).
  'remotion --scale=1.5 (1080p)': { ...contenders.remotion, args: [...contenders.remotion.args, '--scale=1.5'] },
  'frameflow --scale 1.5 (1080p)': { ...contenders.frameflow, args: [...contenders.frameflow.args, '--scale', '1.5'] },
};

const results = {
  date: new Date().toISOString(),
  machine: { cpus: cpus().length, cpuModel: cpus()[0].model, memGB: Math.round(totalmem() / 2 ** 30), node: process.version },
  video: '1280x720, 30fps, 180 frames (6s), H.264 CRF 18 preset medium',
  runs,
  contenders: {},
};

for (const [name, c] of Object.entries(contenders)) {
  process.stdout.write(`${name}: warm-up…`);
  timed(c.cmd, c.args, c.cwd);
  const samples = [];
  for (let i = 0; i < runs; i++) {
    process.stdout.write(` run ${i + 1}…`);
    samples.push(timed(c.cmd, c.args, c.cwd));
  }
  console.log(' done');
  results.contenders[name] = {
    seconds: samples.map((s) => s.seconds),
    medianSeconds: median(samples.map((s) => s.seconds)),
    medianRssMB: median(samples.map((s) => s.rssMB)),
    outputBytes: statSync(c.out).size,
  };
}

// Visual parity: PSNR between the two outputs (higher = more similar; >35 dB is visually identical).
try {
  const log = spawnSync(
    join(root, 'node_modules/ffmpeg-static/ffmpeg'),
    ['-hide_banner', '-i', contenders.frameflow.out, '-i', contenders.remotion.out, '-lavfi', 'psnr', '-f', 'null', '-'],
    { encoding: 'utf8' },
  ).stderr;
  results.psnrAverageDb = Number(log.match(/average:([\d.]+|inf)/)[1]);
} catch {
  results.psnrAverageDb = null;
}

results.variants = {};
for (const [name, c] of Object.entries(variants)) {
  process.stdout.write(`${name}:`);
  const samples = [];
  for (let i = 0; i < runs; i++) {
    process.stdout.write(` run ${i + 1}…`);
    samples.push(timed(c.cmd, c.args, c.cwd).seconds);
  }
  console.log(' done');
  results.variants[name] = { seconds: samples, medianSeconds: median(samples) };
}

results.contenders.remotion.installSize = du(join(baseline, 'node_modules'));
results.contenders.frameflow.installSize = du(join(root, 'node_modules'));
const pkgCount = (dir) => execFileSync('npm', ['ls', '--all', '--parseable', '--omit=dev'], { cwd: dir, encoding: 'utf8' }).trim().split('\n').length - 1;
results.contenders.remotion.packages = pkgCount(baseline);
results.contenders.frameflow.packages = pkgCount(root);
const loc = (files) => files.reduce((n, f) => n + readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).length, 0);
results.contenders.remotion.sceneLoc = loc(['src/Promo.tsx', 'src/Root.tsx', 'src/index.ts'].map((f) => join(baseline, f)));
results.contenders.frameflow.sceneLoc = loc([join(root, 'examples/hello.ts')]);

writeFileSync(join(root, 'bench/results.json'), JSON.stringify(results, null, 2) + '\n');

const r = results.contenders.remotion;
const f = results.contenders.frameflow;
const x = (a, b) => `${(a / b).toFixed(1)}×`;
console.log(`
| | Remotion | Frameflow | Difference |
|---|---|---|---|
| Render time (median of ${runs}) | ${r.medianSeconds.toFixed(2)} s | ${f.medianSeconds.toFixed(2)} s | ${x(r.medianSeconds, f.medianSeconds)} faster |
| Peak memory (largest process RSS) | ${r.medianRssMB} MB | ${f.medianRssMB} MB | |
| node_modules size | ${r.installSize} | ${f.installSize} | |
| Runtime packages | ${r.packages} | ${f.packages} | |
| Scene code (non-blank lines) | ${r.sceneLoc} | ${f.sceneLoc} | |
| Output size | ${(r.outputBytes / 1024).toFixed(0)} KB | ${(f.outputBytes / 1024).toFixed(0)} KB | |
| Visual parity (PSNR vs Remotion) | — | ${results.psnrAverageDb?.toFixed(1)} dB | |

Variants (median of ${runs}):

| Variant | Render time |
|---|---|
${Object.entries(results.variants).map(([n, v]) => `| ${n} | ${v.medianSeconds.toFixed(2)} s |`).join('\n')}
`);
