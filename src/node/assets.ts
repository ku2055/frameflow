import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { GlobalFonts, Path2D, loadImage } from '@napi-rs/canvas';
import type { DrawableImage, RenderEnv } from '../core/draw.js';
import type { Node, Video } from '../core/types.js';

export function resolveAsset(src: string, baseDir: string): string {
  if (/^https?:\/\//.test(src) || src.startsWith('data:')) return src;
  return isAbsolute(src) ? src : resolve(baseDir, src);
}

function collectImages(nodes: Node[], out: Set<string>) {
  for (const n of nodes) {
    if (n.type === 'image') out.add(n.src);
    if (n.type === 'group') collectImages(n.children, out);
  }
}

const registeredFonts = new Set<string>();

/** Load images and register fonts so every frame can be drawn synchronously. */
export async function createNodeEnv(video: Video, baseDir: string): Promise<RenderEnv> {
  for (const [family, file] of Object.entries(video.fonts)) {
    const abs = resolveAsset(file, baseDir);
    const key = `${family}|${abs}`;
    if (registeredFonts.has(key)) continue;
    if (!existsSync(abs)) throw new Error(`Font file for "${family}" not found: ${abs}`);
    GlobalFonts.registerFromPath(abs, family);
    registeredFonts.add(key);
  }

  const srcs = new Set<string>();
  collectImages(video.children, srcs);
  const images = new Map<string, DrawableImage>();
  await Promise.all(
    [...srcs].map(async (src) => {
      const where = resolveAsset(src, baseDir);
      try {
        if (/^https?:\/\//.test(where)) {
          const res = await fetch(where);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          images.set(src, await loadImage(Buffer.from(await res.arrayBuffer())));
        } else {
          if (!where.startsWith('data:') && !existsSync(where)) throw new Error('file not found');
          images.set(src, await loadImage(where));
        }
      } catch (e) {
        throw new Error(`Could not load image "${src}" (${where}): ${(e as Error).message}`);
      }
    }),
  );

  return {
    images,
    createPath: (d: string) => new Path2D(d) as unknown as globalThis.Path2D,
  };
}
