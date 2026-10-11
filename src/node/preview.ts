import { createReadStream, existsSync, statSync, watch } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { FRAMEFLOW_ENTRY } from './load.js';

const PLAYER_ENTRY = resolve(dirname(FRAMEFLOW_ENTRY), 'browser/player.js');

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.json': 'application/json',
};

const page = (title: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Frameflow preview</title>
<style>
  :root { color-scheme: dark; --bg:#0b0d12; --fg:#e6e8ee; --muted:#8b93a7; --err:#ff6b6b; --warn:#f5c451; }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px system-ui,sans-serif; }
  header { display:flex; justify-content:space-between; align-items:center; padding:10px 16px; color:var(--muted); }
  header b { color:var(--fg); }
  main { max-width:1200px; margin:0 auto; padding:0 16px 24px; }
  #issues { white-space:pre-wrap; font:13px ui-monospace,monospace; margin:12px 0; }
  #issues .error { color:var(--err); } #issues .warning { color:var(--warn); }
  kbd { border:1px solid #333; border-radius:4px; padding:0 4px; font-size:12px; }
</style></head>
<body><header><span><b>Frameflow</b> · ${title}</span><span id="meta"></span></header>
<main><div id="app"></div><div id="issues"></div>
<p style="color:var(--muted)"><kbd>Space</kbd> play/pause · <kbd>←</kbd>/<kbd>→</kbd> step frame · <kbd>Shift</kbd>+arrows ±1s · edits reload automatically</p></main>
<script type="module" src="/bundle.js"></script>
<script>new EventSource('/events').onmessage = () => location.reload();</script>
</body></html>`;

const entrySource = (scenePath: string, props: Record<string, unknown>) => `
import scene from ${JSON.stringify(scenePath)};
import { createPlayer, normalizeVideo, validate } from ${JSON.stringify(PLAYER_ENTRY)};
const exported = typeof scene === 'function' ? await scene(${JSON.stringify(props)}) : scene;
const video = exported.type === 'video' ? exported : normalizeVideo(exported);
document.getElementById('meta').textContent = video.width + 'x' + video.height + ' @ ' + video.fps + 'fps · ' + video.duration + 's';
const issues = validate(video);
const box = document.getElementById('issues');
for (const i of issues) {
  const div = document.createElement('div');
  div.className = i.level;
  div.textContent = (i.level === 'error' ? '✖ ' : '⚠ ') + i.path + ': ' + i.message;
  box.appendChild(div);
}
if (!issues.some((i) => i.level === 'error')) {
  const startAt = Number(sessionStorage.getItem('ff-time') || 0);
  const player = await createPlayer(document.getElementById('app'), video, { assetBase: '/assets/', startAt, loop: true,
    onTimeUpdate: (t) => { try { sessionStorage.setItem('ff-time', String(t)); } catch {} } });
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement && e.key !== ' ') return;
    const step = e.shiftKey ? 1 : 1 / video.fps;
    if (e.key === ' ') { e.preventDefault(); player.playing ? player.pause() : player.play(); }
    if (e.key === 'ArrowRight') { player.pause(); player.seek(player.time + step); }
    if (e.key === 'ArrowLeft') { player.pause(); player.seek(player.time - step); }
  });
}
`;

export interface PreviewOptions {
  port: number;
  props: Record<string, unknown>;
}

/** Start a live-reloading preview server for a scene file. */
export async function startPreview(file: string, options: PreviewOptions): Promise<void> {
  const scenePath = resolve(file);
  const baseDir = dirname(scenePath);
  const clients = new Set<ServerResponse>();
  let bundle = '';
  let buildError = '';

  const rebuild = async () => {
    try {
      const result = await build({
        stdin: { contents: entrySource(scenePath, options.props), resolveDir: baseDir, sourcefile: 'frameflow-preview-entry.js' },
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        logLevel: 'silent',
        alias: { frameflow: FRAMEFLOW_ENTRY, 'frameflow/player': PLAYER_ENTRY },
        loader: { '.json': 'json' },
      });
      bundle = result.outputFiles[0]!.text;
      buildError = '';
    } catch (e) {
      buildError = (e as Error).message;
      bundle = `document.getElementById('issues').innerHTML = '<div class="error"></div>';
        document.querySelector('#issues .error').textContent = ${JSON.stringify('✖ Build failed:\n' + (e as Error).message)};`;
    }
  };
  await rebuild();

  let timer: NodeJS.Timeout | undefined;
  watch(baseDir, { recursive: true }, (_event, name) => {
    if (name && (name.includes('node_modules') || name.startsWith('out'))) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await rebuild();
      console.log(buildError ? `✖ rebuild failed: ${buildError.split('\n')[0]}` : `↻ reloaded (${name})`);
      for (const c of clients) c.write('data: reload\n\n');
    }, 80);
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(file));
    } else if (url.pathname === '/bundle.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }).end(bundle);
    } else if (url.pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
    } else if (url.pathname.startsWith('/assets/')) {
      const rel = decodeURIComponent(url.pathname.slice('/assets/'.length));
      const abs = normalize(join(baseDir, rel));
      if (!abs.startsWith(baseDir + sep) || !existsSync(abs) || !statSync(abs).isFile()) {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream' });
      createReadStream(abs).pipe(res);
    } else {
      res.writeHead(404).end('Not found');
    }
  });
  await new Promise<void>((r) => server.listen(options.port, r));
  console.log(`Frameflow preview: http://localhost:${options.port}  (watching ${baseDir})`);
}
