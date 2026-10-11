import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SCENE = `import { video, text, rect, stagger } from 'frameflow';

// Times are in seconds. x/y default to the center of the frame.
export default video({ width: 1920, height: 1080, fps: 30, background: '#0f172a' }, [
  text('My first Frameflow video', { y: '45%', size: 110, weight: 'bold', enter: 'fadeUp', exit: 'fade', duration: 4 }),
  text('Edit scene.ts and watch it update', { y: '58%', size: 48, color: '#94a3b8', start: 0.6, enter: 'fade', duration: 3.4 }),
  stagger(
    ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6'].map((fill, i) =>
      rect({ x: 810 + i * 100, y: '75%', w: 60, h: 60, radius: 14, fill, enter: 'pop', rotate: { from: 0, to: 90, at: 1, dur: 1 } }),
    ),
    { start: 1.2, step: 0.12 },
  ),
]);
`;

const AGENTS = `# Working on this video project

This project uses Frameflow (video as code). Scenes are TypeScript or JSON; all times are in seconds.

- Preview: \`npx frameflow preview scene.ts\`
- Validate after every edit: \`npx frameflow check scene.ts\` (exit code 1 on errors; messages include fixes)
- Look at the result without a browser: \`npx frameflow storyboard scene.ts out/storyboard.png\` then open the PNG
- Render: \`npx frameflow render scene.ts out/video.mp4\`
`;

/** Scaffold a minimal project in `dir`. */
export function initProject(dir: string) {
  const root = resolve(dir);
  mkdirSync(root, { recursive: true });
  const files: Record<string, string> = {
    'scene.ts': SCENE,
    'AGENTS.md': AGENTS,
    'package.json': JSON.stringify(
      {
        name: 'my-frameflow-video',
        private: true,
        type: 'module',
        scripts: { preview: 'frameflow preview scene.ts', render: 'frameflow render scene.ts out/video.mp4', check: 'frameflow check scene.ts' },
        dependencies: { frameflow: 'github:ku2055/frameflow' },
      },
      null,
      2,
    ) + '\n',
    '.gitignore': 'node_modules/\nout/\n',
  };
  for (const [name, content] of Object.entries(files)) {
    const p = join(root, name);
    if (existsSync(p)) {
      console.log(`  skip ${name} (exists)`);
      continue;
    }
    writeFileSync(p, content);
    console.log(`  create ${name}`);
  }
  console.log(`\nNext:\n  cd ${dir}\n  npm install\n  npm run preview`);
}
