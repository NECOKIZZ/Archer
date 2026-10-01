// Deterministic renderer: serves this folder, seeks the film frame by frame, pipes JPEGs to ffmpeg.
//   node render.mjs stills out/ 0 4.5 13.6 ...      → out/t_XX.XX.png
//   node render.mjs video out/part0.mp4 0 15 60      → frames [0s,15s) at 60 fps
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const root = path.dirname(new URL(import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const [mode, out, ...rest] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--font-render-hinting=none'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const cdp = await page.context().newCDPSession(page);
const shot = async (format, quality) => Buffer.from((await cdp.send('Page.captureScreenshot', { format, quality, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 } })).data, 'base64');
const seek = async (t) => { await page.evaluate((t) => window.__seek(t), t); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r()))); };

if (mode === 'stills') {
  fs.mkdirSync(out, { recursive: true });
  for (const s of rest) { const t = parseFloat(s); await seek(t); fs.writeFileSync(path.join(out, `t_${t.toFixed(2).padStart(5, '0')}.png`), await shot('png')); }
} else if (mode === 'video') {
  const [a, b, fps] = rest.map(Number);
  const n0 = Math.round(a * fps), n1 = Math.round(b * fps);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(fps), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let n = n0; n < n1; n++) {
    await seek(n / fps);
    const buf = await shot('jpeg', 95);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((n - n0) % 120 === 0) console.log(`${out}: frame ${n - n0}/${n1 - n0} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r));
}
await browser.close(); server.close();
