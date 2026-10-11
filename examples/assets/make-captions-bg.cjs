// node examples/assets/make-captions-bg.cjs  -> examples/assets/captions-bg.png (abstract blurred backdrop)
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const c = createCanvas(1280, 720);
const x = c.getContext('2d');
const g = x.createLinearGradient(0, 0, 1280, 720);
g.addColorStop(0, '#1e1b4b'); g.addColorStop(1, '#4c1d95');
x.fillStyle = g; x.fillRect(0, 0, 1280, 720);
x.filter = 'blur(60px)';
for (const [px, py, r, col] of [[220, 160, 200, '#ec4899'], [1050, 200, 240, '#06b6d4'], [700, 620, 260, '#f59e0b'], [100, 650, 160, '#22d3ee']]) {
  x.fillStyle = col; x.globalAlpha = 0.55; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
}
fs.writeFileSync(__dirname + '/captions-bg.png', c.toBuffer('image/png'));
