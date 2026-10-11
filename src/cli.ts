#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { formatIssues, validate } from './core/validate.js';
import { loadScene } from './node/load.js';
import { renderLoaded, renderStill, renderStoryboard } from './node/render.js';

const secs = (s: number) => `${+s.toFixed(3)}s`;

const HELP = `frameflow — video as code, made simple

Usage:
  frameflow render <scene> [out.mp4]   Render to .mp4 / .webm / .mov
      --workers <n>   parallel workers (default: all cores)
      --crf <n>       quality, lower = better (default 18)
      --preset <p>    x264 preset (default medium; ultrafast…veryslow)
      --from <s> --to <s>   render a time range in seconds
      --scale <x>     output resolution multiplier (e.g. 1.5: 720p → 1080p)
      --props <json|file>   props for scene functions
  frameflow still <scene> [out.png] --time <s> | --frame <n>   Render one frame
  frameflow storyboard <scene> [out.png]           Contact sheet of frames (great for AI review)
      --count <n> | --times 0,0.5,2   --cols <n>
  frameflow check <scene> [--json]                 Validate; exit 1 on errors
  frameflow preview <scene> [--port 3000]          Live preview in the browser (hot reload)
  frameflow init [dir]                             Create a starter project
  frameflow schema                                 Print the JSON Schema for scene files

Scenes are .ts/.js modules (export default video(...)) or .json files.`;

function parseProps(v: string | undefined): Record<string, unknown> {
  if (!v) return {};
  const raw = existsSync(v) ? readFileSync(v, 'utf8') : v;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`--props must be JSON or a path to a JSON file`);
  }
}

function defaultOut(scene: string, ext: string) {
  return join('out', basename(scene, extname(scene)) + ext);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      workers: { type: 'string' },
      crf: { type: 'string' },
      preset: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      props: { type: 'string' },
      time: { type: 'string' },
      frame: { type: 'string' },
      scale: { type: 'string' },
      count: { type: 'string' },
      times: { type: 'string' },
      cols: { type: 'string' },
      port: { type: 'string' },
      json: { type: 'boolean' },
      force: { type: 'boolean' },
      quiet: { type: 'boolean', short: 'q' },
    },
  });
  const props = parseProps(values.props);
  const sceneFile = positionals[0];
  const needScene = () => {
    if (!sceneFile) throw new Error(`Missing scene file. Try: frameflow ${cmd} examples/hello.ts`);
    if (!existsSync(sceneFile)) throw new Error(`Scene file not found: ${sceneFile}`);
    return sceneFile;
  };

  switch (cmd) {
    case 'render': {
      const scene = await loadScene(needScene(), props);
      const out = positionals[1] ?? defaultOut(sceneFile!, '.mp4');
      const { video } = scene;
      if (!values.quiet)
        console.log(`Rendering ${sceneFile} → ${out}  (${video.width}x${video.height} @ ${video.fps}fps, ${secs(video.duration)})`);
      let lastPrint = 0;
      const result = await renderLoaded(scene, {
        output: out,
        props,
        workers: values.workers ? Number(values.workers) : undefined,
        crf: values.crf ? Number(values.crf) : undefined,
        preset: values.preset,
        from: values.from ? Number(values.from) : undefined,
        to: values.to ? Number(values.to) : undefined,
        scale: values.scale ? Number(values.scale) : undefined,
        force: values.force,
        onProgress: ({ frame, total, fps }) => {
          const now = Date.now();
          if (values.quiet || (now - lastPrint < 200 && frame < total)) return;
          lastPrint = now;
          const pct = Math.floor((frame / total) * 100);
          const bar = '█'.repeat(Math.floor(pct / 4)).padEnd(25, '░');
          process.stdout.write(`\r  ${bar} ${String(pct).padStart(3)}%  ${frame}/${total} frames  ${fps.toFixed(0)} fps`);
        },
      });
      if (!values.quiet) process.stdout.write('\n');
      console.log(`✔ ${result.output}  ${result.frames} frames in ${result.seconds.toFixed(2)}s (${(result.frames / result.seconds).toFixed(0)} fps, ${result.workers} workers)`);
      break;
    }
    case 'still': {
      const scene = await loadScene(needScene(), props);
      const out = positionals[1] ?? defaultOut(sceneFile!, '.png');
      mkdirSync(dirname(resolve(out)), { recursive: true });
      const time = values.frame !== undefined ? Number(values.frame) / scene.video.fps : Number(values.time ?? 0);
      writeFileSync(out, await renderStill(scene, time));
      console.log(`✔ ${out}`);
      break;
    }
    case 'storyboard': {
      const scene = await loadScene(needScene(), props);
      const out = positionals[1] ?? defaultOut(sceneFile!, '.storyboard.png');
      mkdirSync(dirname(resolve(out)), { recursive: true });
      const png = await renderStoryboard(scene, {
        count: values.count ? Number(values.count) : undefined,
        times: values.times ? values.times.split(',').map(Number) : undefined,
        columns: values.cols ? Number(values.cols) : undefined,
      });
      writeFileSync(out, png);
      console.log(`✔ ${out}`);
      break;
    }
    case 'check': {
      const scene = await loadScene(needScene(), props);
      const issues = validate(scene.video);
      const errors = issues.filter((i) => i.level === 'error').length;
      if (values.json) {
        console.log(JSON.stringify({ ok: errors === 0, issues, video: { width: scene.video.width, height: scene.video.height, fps: scene.video.fps, duration: scene.video.duration } }, null, 2));
      } else if (issues.length === 0) {
        const v = scene.video;
        console.log(`✔ ${sceneFile} is valid  (${v.width}x${v.height} @ ${v.fps}fps, ${secs(v.duration)}, ${Math.round(v.duration * v.fps)} frames)`);
      } else {
        console.log(formatIssues(issues));
        console.log(`\n${errors} error(s), ${issues.length - errors} warning(s)`);
      }
      process.exitCode = errors ? 1 : 0;
      break;
    }
    case 'preview': {
      const { startPreview } = await import('./node/preview.js');
      await startPreview(needScene(), { port: values.port ? Number(values.port) : 3000, props });
      break;
    }
    case 'init': {
      const { initProject } = await import('./node/init.js');
      initProject(positionals[0] ?? '.');
      break;
    }
    case 'schema': {
      const here = dirname(fileURLToPath(import.meta.url));
      process.stdout.write(readFileSync(resolve(here, '../schema/scene.schema.json'), 'utf8'));
      break;
    }
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      break;
    default:
      console.error(`Unknown command "${cmd}".\n\n${HELP}`);
      process.exitCode = 1;
  }
}

main().catch((e: Error) => {
  console.error(`✖ ${e.message}`);
  process.exit(1);
});
