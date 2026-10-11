import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { build } from 'esbuild';
import { setTextMeasurer } from '../core/measure.js';
import { normalizeVideo } from '../core/builders.js';
import type { SceneExport, Video } from '../core/types.js';

const here = dirname(fileURLToPath(import.meta.url));
/** Absolute path of this package's isomorphic entry (dist/index.js). */
export const FRAMEFLOW_ENTRY = resolve(here, '../index.js');

export interface LoadedScene {
  video: Video;
  /** Directory that relative asset paths resolve against. */
  baseDir: string;
  /** How a worker thread can reload the same scene. */
  source: SceneSource;
}

export type SceneSource = { kind: 'json'; json: string } | { kind: 'module'; bundle: string };

// measureText() inside scenes uses Skia, the same engine that draws the frames.
const measureCtx = createCanvas(1, 1).getContext('2d');
setTextMeasurer((text, font, letterSpacing) => {
  measureCtx.font = font;
  (measureCtx as unknown as { letterSpacing: string }).letterSpacing = `${letterSpacing}px`;
  return measureCtx.measureText(text).width;
});

/**
 * Where bundled scenes go: <nearest node_modules>/.cache/frameflow, so that packages the
 * scene imports (including native ones kept external) resolve from the user's project.
 */
function bundleDir(sceneDir: string): string {
  for (let dir = sceneDir; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'node_modules'))) return join(dir, 'node_modules', '.cache', 'frameflow');
    if (dirname(dir) === dir) break;
  }
  return join(tmpdir(), 'frameflow-bundles');
}

let bundleCount = 0;
const bundles = new Set<string>();
// Bundles are only needed while this process (and its render workers) run.
process.on('exit', () => {
  for (const b of bundles) rmSync(b, { force: true });
});

/** Bundle a TS/JS scene file into a single ESM file that Node can import. */
export async function bundleScene(file: string): Promise<string> {
  const abs = resolve(file);
  const dir = bundleDir(dirname(abs));
  mkdirSync(dir, { recursive: true });
  const hash = createHash('sha1').update(abs).update(`${process.pid}-${++bundleCount}`).digest('hex').slice(0, 12);
  const outfile = join(dir, `scene-${hash}.mjs`);
  bundles.add(outfile);
  await build({
    entryPoints: [abs],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
    alias: { frameflow: FRAMEFLOW_ENTRY },
    // Native / heavy packages must stay external.
    external: ['@napi-rs/canvas', 'esbuild', 'ffmpeg-static'],
  });
  return outfile;
}

async function fromSource(source: SceneSource, props: Record<string, unknown>): Promise<Video> {
  if (source.kind === 'json') return normalizeVideo(JSON.parse(source.json));
  const mod = (await import(pathToFileURL(source.bundle).href)) as { default?: SceneExport };
  const exported = mod.default;
  if (exported === undefined) throw new Error('Scene file has no default export. Use: export default video({...}, [...])');
  const result = typeof exported === 'function' ? await exported(props) : exported;
  if (typeof result !== 'object' || result === null) throw new Error('Scene default export must be a video object (or a function returning one)');
  return result.type === 'video' ? result : normalizeVideo(result as Partial<Video>);
}

/** Load a scene from .json, .ts, .tsx, .js or .mjs. Props are passed to function exports. */
export async function loadScene(file: string, props: Record<string, unknown> = {}): Promise<LoadedScene> {
  const abs = resolve(file);
  const baseDir = dirname(abs);
  const ext = extname(abs).toLowerCase();
  let source: SceneSource;
  if (ext === '.json') {
    const json = readFileSync(abs, 'utf8');
    try {
      JSON.parse(json);
    } catch (e) {
      throw new Error(`${file} is not valid JSON: ${(e as Error).message}`);
    }
    source = { kind: 'json', json };
  } else {
    source = { kind: 'module', bundle: await bundleScene(abs) };
  }
  return { video: await fromSource(source, props), baseDir, source };
}

/** Used by worker threads to rebuild the exact same video. */
export const reloadScene = fromSource;
