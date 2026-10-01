// Kickoff launch film. Every visual state is a pure function of timeline time `t`
// (seconds). The renderer calls window.__seek(t) per frame; nothing free-runs.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const DURATION = 60;
const $ = (id) => document.getElementById(id);
const EC = {};
const E = (n) => EC[n] || (EC[n] = gsap.parseEase(n));
const cl = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const P = (t, a, b, e = 'power2.inOut') => E(e)(cl((t - a) / (b - a)));
const L = (a, b, u) => a + (b - a) * u;
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, u) { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(L(v, B[i], u))).join(',')})`; }
const C = { bg: '#111210', card: '#1C1D1A', cream: '#F7F5F0', green: '#00C805', gdeep: '#008C04', purple: '#7B62F6', ink: '#6B6F63', grey: '#55584f', red: '#FF4D6D' };

// Place an element by an anchor point (ax/ay in % of its own box).
function T(el, { x = 0, y = 0, ax = 50, ay = 50, s = 1, sx, sy, r = 0, o = 1, b = 0 } = {}) {
  el.style.transform = `translate(${x}px,${y}px) translate(${-ax}%,${-ay}%) scale(${sx ?? s},${sy ?? s}) rotate(${r}deg)`;
  el.style.opacity = o;
  el.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : 'none';
  el.style.visibility = o <= 0.001 ? 'hidden' : 'visible';
}
// Masked line reveal: rises in from below, leaves upward.
function R(el, t, tin, tout, { x, y, ax = 50, ay = 50, dur = 0.6, outDur = 0.36, s = 1, o = 1 } = {}) {
  const u = P(t, tin, tin + dur, 'expo.out');
  const v = P(t, tout, tout + outDur, 'power3.in');
  const vis = t >= tin && t <= tout + outDur;
  T(el, { x, y, ax, ay, s, o: vis ? o : 0 });
  el.firstElementChild.style.transform = `translateY(${((1 - u) * 112 - v * 112).toFixed(2)}%)`;
}

// ───────────────────────── persistent ball (the K-mark's ball) ─────────────────────────
const ballEl = $('ball');
let B;
function ball(x, y, r, color = C.green, o = 1, glow = 1) { B = { x, y, r, color, o, glow }; } // screen space
// Every scene drifts in with a slow 4% camera push across its window, so no hold is ever frozen.
// Scene-space anchors are mapped to screen space with scr() so carried objects still land exactly.
const PUSH = 0.04;
function pushS(id, t) { const w = WIN[id]; return 1 + PUSH * cl((t - w[0]) / (w[1] - w[0])); }
function scr(id, t, x, y) { const s = pushS(id, t); return [960 + (x - 960) * s, 540 + (y - 540) * s, s]; }
function ballIn(id, t, x, y, r, ...rest) { const [X, Y, s] = scr(id, t, x, y); ball(X, Y, r * s, ...rest); }
function applyBall() {
  if (!B || B.o <= 0.001 || B.r <= 0.05) { ballEl.style.opacity = 0; return; }
  const s = B.r / 50;
  ballEl.style.transform = `translate(${B.x - 50}px,${B.y - 50}px) scale(${s})`;
  ballEl.style.background = B.color;
  ballEl.style.opacity = B.o;
  const g = (18 + 30 * B.glow) / Math.max(s, 0.2);
  ballEl.style.boxShadow = `0 0 ${g}px ${g * 0.25}px ${B.color.startsWith('rgb') ? B.color.replace('rgb', 'rgba').replace(')', ',0.45)') : B.color + '73'}`;
}

// ───────────────────────── background: glow + streaks (vignette is added in post) ─────────────────────────
const glowKeys = [ // t, green, purple
  [0, 0.62, 0], [3.6, 0.5, 0], [4.2, 0.18, 0], [9.0, 0.18, 0], [10.0, 0.55, 0], [12.4, 0.5, 0], [13.2, 0.32, 0.05],
  [19.5, 0.3, 0.05], [25, 0.28, 0.08], [30.5, 0.34, 0.08], [31.2, 0.12, 0.32], [34.6, 0.3, 0.14], [37.6, 0.5, 0], [42, 0.28, 0.06],
  [46, 0.42, 0], [50.4, 0.1, 0.38], [54.4, 0.26, 0.12], [56.8, 0.66, 0], [60, 0.7, 0],
];
function glowAt(t) {
  for (let i = 0; i < glowKeys.length - 1; i++) {
    const [a, g0, p0] = glowKeys[i], [b, g1, p1] = glowKeys[i + 1];
    if (t <= b) { const u = P(t, a, b, 'sine.inOut'); return [L(g0, g1, u), L(p0, p1, u)]; }
  }
  return glowKeys.at(-1).slice(1);
}
function makeStreaks() {
  // vertical "curtain" streaks, faded towards the top and edges inside the bitmap (no CSS blend/mask: cheap to composite)
  const c = document.createElement('canvas'); c.width = 2000; c.height = 540; const g = c.getContext('2d'); const r = rng(7);
  for (let x = 0; x < 2000;) { const w = 2 + r() * 26; g.fillStyle = `rgba(${r() > 0.5 ? '210,255,210' : '0,0,0'},${(r() * 0.22).toFixed(3)})`; g.fillRect(x, 0, w, 540); x += w; }
  g.globalCompositeOperation = 'destination-in';
  const grd = g.createRadialGradient(1000, 620, 0, 1000, 620, 1050); grd.addColorStop(0, '#000'); grd.addColorStop(0.55, 'rgba(0,0,0,0.6)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.setTransform(1, 0, 0, 0.55, 0, 260); g.fillStyle = grd; g.fillRect(-1000, -1000, 4000, 4000);
  $('streaks').style.backgroundImage = `url(${c.toDataURL()})`; $('streaks').style.backgroundSize = '2000px 100%';
}
function background(t) {
  // the floor glow pulses on every beat of the 120 BPM score (harder when the drums play)
  const drums = (t >= 13 && t < 42) || (t >= 46 && t < 56.8);
  const beat = Math.exp(-((t % 0.5) / 0.5) * 5) * (drums ? 0.22 : 0.12);
  const [g0, p0] = glowAt(t); const g = g0 * (1 + beat), p = p0 * (1 + beat);
  $('glowG').style.opacity = g; $('glowP').style.opacity = p;
  // curtain streaks drift continuously, like the reference's moving light
  $('streaks').style.backgroundPosition = `${(t * 34 + 40 * Math.sin(t * 0.7)).toFixed(1)}px 0`;
  $('streaks').style.opacity = 0.25 + 0.7 * Math.max(g, p);
}

// ───────────────────────── three.js football (bookends) ─────────────────────────
let three;
function initThree() {
  const canvas = $('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(1920, 1080, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(20, 1920 / 1080, 0.1, 100); camera.position.set(0, 0, 5.6);

  // Truncated icosahedron (a football), projected to a sphere.
  const phi = (1 + Math.sqrt(5)) / 2; const V = [];
  for (const [a, b, c] of [[0, 1, 3 * phi], [1, 2 + phi, 2 * phi], [phi, 2, phi ** 3]])
    for (const sa of a ? [1, -1] : [1]) for (const sb of [1, -1]) for (const sc of [1, -1]) {
      const v = [a * sa, b * sb, c * sc];
      for (let k = 0; k < 3; k++) V.push(new THREE.Vector3(v[k % 3], v[(k + 1) % 3], v[(k + 2) % 3]));
    }
  const group = new THREE.Group(); scene.add(group);
  const seamMat = new THREE.MeshStandardMaterial({ color: 0x00c805, emissive: 0x00c805, emissiveIntensity: 0.55, metalness: 0.35, roughness: 0.22 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x9dff9f, emissive: 0x00c805, emissiveIntensity: 1.4, metalness: 0.1, roughness: 0.3 });
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
    if (Math.abs(V[i].distanceTo(V[j]) - 2) > 1e-3) continue;
    const a = V[i].clone().normalize(), b = V[j].clone().normalize(); const pts = [];
    for (let k = 0; k <= 8; k++) { const u = k / 8; pts.push(new THREE.Vector3().lerpVectors(a, b, u).normalize().multiplyScalar(1.004)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.017, 8, false), seamMat));
    // thin bright core along each seam, picked up by bloom
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.006, 6, false), rimMat));
  }
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64),
    new THREE.MeshPhysicalMaterial({ color: 0x06200a, metalness: 0.2, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.9 }));
  group.add(shell);
  // pentagon panels: slightly raised green-tinted glass discs at the 12 icosahedron vertices
  const pentMat = new THREE.MeshPhysicalMaterial({ color: 0x0a5c10, metalness: 0.3, roughness: 0.1, clearcoat: 1, emissive: 0x00c805, emissiveIntensity: 0.08 });
  for (const v of [[0, 1, phi], [0, 1, -phi], [0, -1, phi], [0, -1, -phi]]) for (let k = 0; k < 3; k++) {
    const d = new THREE.Vector3(v[k % 3], v[(k + 1) % 3], v[(k + 2) % 3]).normalize();
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.002, 32, 8, 0, Math.PI * 2, 0, 0.2), pentMat);
    cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); group.add(cap);
  }
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-3, 4, 5); scene.add(key);
  const under = new THREE.PointLight(0x00c805, 30, 10); under.position.set(0, -2.5, 2); scene.add(under);
  scene.add(new THREE.AmbientLight(0x203020, 0.6));

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1920, 1080), 0.6, 0.5, 0.3));
  composer.addPass(new OutputPass());
  three = { renderer, composer, group, canvas };
}
const UNIT = 1080 / (2 * 5.6 * Math.tan((10 * Math.PI) / 180)); // px per world unit at z=0
function renderThree(t) {
  let show = false, y = 0, s = 1, rotY = 0, o = 1;
  if (t < 4.0) {
    show = true;
    const shrink = P(t, 3.05, 3.85, 'expo.in');
    y = L(L(-1.32, -1.18, P(t, 0, 3.0, 'sine.out')), 0, shrink);
    s = L(1, 0.018, shrink);
    rotY = t * 0.42;
    o = 1 - P(t, 3.7, 3.9);
  } else if (t >= 56.6) {
    show = true;
    y = L(-2.7, -1.55, P(t, 56.7, 58.3, 'expo.out'));
    s = 0.9 + 0.02 * P(t, 57.5, 60, 'sine.inOut');
    rotY = t * 0.42;
    o = P(t, 56.7, 57.1);
  }
  three.canvas.style.display = show ? 'block' : 'none';
  if (!show) return;
  three.canvas.style.opacity = o;
  three.group.position.set(0, y, 0); three.group.scale.setScalar(s);
  three.group.rotation.set(0.35 + 0.05 * Math.sin(t * 0.6), rotY, 0.12);
  three.composer.render();
}

// ───────────────────────── scene builders (static DOM, deterministic) ─────────────────────────
const cells = {};
function dist(h, a, H, A) { // Kickoff score-market distance (docs: outcome, goal difference, total goals, clean sheets)
  const out = Math.sign(h - a) !== Math.sign(H - A) ? 4 : 0;
  const gd = Math.min(3, Math.abs((h - a) - (H - A)));
  const tg = Math.min(4, Math.abs((h + a) - (H + A))) * 0.5;
  const cs = ((a === 0) !== (A === 0) ? 0.25 : 0) + ((h === 0) !== (H === 0) ? 0.25 : 0);
  return out + gd + tg + cs;
}
function buildGrid() {
  const wrap = $('gridWrap');
  for (let h = 0; h < 5; h++) for (let a = 0; a < 5; a++) {
    const d = document.createElement('div'); d.className = 'cell';
    d.style.left = 32 + a * 170 + 'px'; d.style.top = 42 + h * 126 + 'px';
    d.innerHTML = `${h}–${a}`;
    wrap.appendChild(d);
    cells[`${h}${a}`] = { el: d, h, a, D: dist(2, 1, h, a), r: Math.hypot(h - 2, a - 1) };
  }
  const tag = document.createElement('span'); tag.className = 'tag'; tag.id = 'ftTag'; tag.textContent = 'FT'; cells['20'].el.appendChild(tag);
}
let field;
function buildField() {
  const r = rng(42);
  const pool = [['10', 9], ['20', 7], ['11', 8], ['00', 5], ['01', 6], ['12', 6], ['22', 3], ['31', 4], ['30', 3], ['02', 4], ['32', 2], ['13', 1], ['41', 1], ['21', 2], ['03', 1]];
  const tot = pool.reduce((s, p) => s + p[1], 0); const picks = [];
  for (let i = 0; i < 40; i++) { let x = r() * tot; for (const [k, w] of pool) { if ((x -= w) <= 0) { picks.push(k); break; } } }
  const all = [{ D: 0, you: true }, ...picks.map((k) => ({ D: dist(+k[0], +k[1], 2, 1) }))];
  const sorted = all.map((p) => p.D).sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)];
  const X = (D) => 240 + (Math.min(D, 8) / 8) * 1440;
  const stacks = {}; const svg = $('field'); const ns = 'http://www.w3.org/2000/svg';
  const axis = document.createElementNS(ns, 'g'); axis.id = 'fAxis';
  axis.innerHTML = `<line x1="200" y1="728" x2="1720" y2="728" stroke="rgba(247,245,240,0.18)" stroke-width="2"/>` +
    `<text x="240" y="780" fill="#6B6F63" font-family="JetBrains Mono" font-size="19" letter-spacing="3" text-anchor="middle">EXACT</text>` +
    `<text x="1680" y="780" fill="#6B6F63" font-family="JetBrains Mono" font-size="19" letter-spacing="3" text-anchor="middle">WAY OFF</text>` +
    `<text x="960" y="780" fill="#6B6F63" font-family="JetBrains Mono" font-size="19" letter-spacing="3" text-anchor="middle">DISTANCE FROM THE RESULT →</text>`;
  svg.appendChild(axis);
  const dots = [];
  all.forEach((p, i) => {
    const k = p.D.toFixed(2); const n = (stacks[k] = (stacks[k] ?? -1) + 1);
    const c = document.createElementNS(ns, 'circle'); c.setAttribute('r', 13);
    const x = X(p.D), y = 700 - n * 32;
    c.setAttribute('cx', x); c.setAttribute('cy', y);
    if (p.you) c.setAttribute('opacity', 0);
    svg.appendChild(c); dots.push({ el: c, x, y, D: p.D, win: p.D < med, you: !!p.you, i, delay: r() * 0.9 });
  });
  const ml = document.createElementNS(ns, 'g'); ml.id = 'median';
  ml.innerHTML = `<line x1="0" y1="250" x2="0" y2="740" stroke="#F7F5F0" stroke-width="2.5" stroke-dasharray="8 8"/>` +
    `<text x="0" y="232" fill="#F7F5F0" font-family="JetBrains Mono" font-size="19" letter-spacing="3" text-anchor="middle">MEDIAN</text>`;
  svg.appendChild(ml);
  field = { dots, medX: X(med) - 16, youX: X(0), youY: 700 };
}
const rowsData = [
  { k: 'A', pick: '2–1', tag: 'exact', pay: 33.23, roi: 232 },
  { k: 'B', pick: '1–0', tag: '', pay: 13.77, roi: 38 },
  { k: 'C', pick: '3–1', tag: 'on the median', pay: 0, roi: -100 },
  { k: 'D', pick: '1–1', tag: '', pay: 0, roi: -100 },
  { k: 'E', pick: '0–2', tag: '', pay: 0, roi: -100 },
];
function buildRows() {
  const root = $('rows');
  rowsData.forEach((d, i) => {
    const el = document.createElement('div'); el.className = 'a'; el.id = 'row' + i;
    el.style.width = '1520px'; el.style.height = '90px';
    const win = d.pay > 0;
    el.innerHTML = `<div style="position:absolute;left:0;top:0;width:1520px;height:90px;border-bottom:1px solid rgba(247,245,240,0.07)"></div>
      <span class="mono" style="position:absolute;left:44px;top:26px;font-size:26px;color:${win ? '#00C805' : '#6B6F63'}">${d.k}</span>
      <span class="h1" style="position:absolute;left:100px;top:20px;font-size:48px;color:${win ? '#F7F5F0' : 'rgba(247,245,240,0.45)'}"><span class="mono" style="font-size:20px;letter-spacing:0.12em;color:#6B6F63;margin-right:14px">CALLED</span>${d.pick}</span>
      ${d.tag ? `<span class="pill" style="position:absolute;left:400px;top:24px;font-size:15px;${d.tag === 'exact' ? 'background:rgba(0,200,5,0.14);color:#00C805' : 'border:1px solid rgba(247,245,240,0.15);color:rgba(247,245,240,0.5)'}">${d.tag}</span>` : ''}
      <div class="stake" style="position:absolute;left:640px;top:30px;height:30px;border-radius:8px;background:${win ? 'rgba(247,245,240,0.22)' : 'transparent'};border:${win ? 'none' : '2px solid rgba(255,77,109,0.5)'}"></div>
      <div class="div" style="position:absolute;top:30px;height:30px;border-radius:8px;background:linear-gradient(90deg,#008C04,#00C805);box-shadow:0 0 30px rgba(0,200,5,0.35)"></div>
      <span class="h1 roi" style="position:absolute;right:0;top:18px;font-size:54px;color:${win ? '#00C805' : '#FF4D6D'}"></span>`;
    root.appendChild(el);
  });
}
function buildMarkets() {
  const names = ['ARS v CHE', 'LIV v MCI', 'NEW v BOU', 'TOT v WHU', 'EVE v FUL'];
  names.forEach((n, i) => {
    const el = document.createElement('div'); el.className = 'a panel'; el.id = 'mk' + i;
    el.style.cssText += ';width:400px;height:88px;border-radius:20px;display:flex;align-items:center;gap:18px;padding:0 26px';
    el.innerHTML = `<span style="width:14px;height:14px;border-radius:50%;background:#00C805;box-shadow:0 0 12px #00C805"></span><span class="h1" style="font-size:36px">${n}</span><span class="mono" style="margin-left:auto;font-size:16px;letter-spacing:0.12em;color:#6B6F63">SETTLED</span>`;
    $('mkts').appendChild(el);
  });
  const lad = $('ladder'); const r = rng(5); const hexs = '0123456789abcdef';
  for (let i = 0; i < 20; i++) {
    const h = () => hexs[Math.floor(r() * 16)];
    const el = document.createElement('div'); el.className = 'lrow'; el.style.top = i * 37 + 'px'; el.id = 'lr' + i;
    el.innerHTML = `<span style="width:34px">${String(i + 1).padStart(2, '0')}</span><span style="width:130px">0x${h()}${h()}…${h()}${h()}</span><span class="bar" style="width:${Math.round(220 - i * 8 + r() * 10)}px"></span>`;
    lad.appendChild(el);
  }
  const g = $('coins'); const ns = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < 10; i++) { const c = document.createElementNS(ns, 'circle'); c.setAttribute('r', 11); c.setAttribute('fill', '#00C805'); c.id = 'coin' + i; g.appendChild(c); }
}
const soul = ['# My agent', 'Back the in-form side.', 'Trust home advantage.', 'Stake 5 USDC a pick.'];
function buildPicks() {
  const rows = [['NEW v BOU', '2–0'], ['LIV v MCI', '1–1'], ['ARS v TOT', '2–1']];
  rows.forEach(([m, s], i) => {
    const el = document.createElement('div'); el.className = 'a'; el.id = 'pk' + i;
    el.style.cssText += `;width:572px;height:100px;border-radius:20px;background:rgba(247,245,240,0.04);border:1px solid rgba(247,245,240,0.08);display:flex;align-items:center;padding:0 26px;gap:24px`;
    el.innerHTML = `<span class="h1" style="font-size:36px;width:220px">${m}</span><span class="h1" style="font-size:44px;color:#9d8bff">${s}</span><span class="mono" style="margin-left:auto;font-size:18px;letter-spacing:0.12em;color:#00C805">STAKED ✓</span>`;
    $('picks').appendChild(el);
  });
}
function buildMarquee() {
  const fx = ['ARS v CHE', 'LIV v MCI', 'NEW v BOU', 'TOT v WHU', 'EVE v FUL', 'AVL v BHA', 'BRE v CRY', 'MUN v NFO', 'WOL v LEE', 'SUN v BUR', 'MCI v ARS', 'CHE v LIV', 'BOU v TOT', 'WHU v NEW', 'FUL v AVL', 'BHA v MUN', 'CRY v EVE', 'NFO v BRE', 'LEE v SUN', 'BUR v WOL'];
  const r = rng(99);
  for (let row = 0; row < 4; row++) {
    const el = document.createElement('div'); el.className = 'a'; el.id = 'mq' + row; el.style.display = 'flex'; el.style.gap = '24px';
    let html = '';
    for (let i = 0; i < 26; i++) {
      const f = fx[(i * 3 + row * 7) % fx.length]; const lit = r() < 0.18;
      html += `<div style="flex:none;width:330px;height:110px;border-radius:24px;display:flex;align-items:center;justify-content:center;font-family:'Clash Display';font-weight:500;font-size:42px;white-space:nowrap;${lit ? 'background:rgba(0,200,5,0.12);border:1px solid rgba(0,200,5,0.55);color:#00C805' : 'background:rgba(28,29,26,0.9);border:1px solid rgba(247,245,240,0.08);color:rgba(247,245,240,0.7)'}">${f}</div>`;
    }
    el.innerHTML = html; $('marquee').appendChild(el);
  }
}

// ───────────────────────── scenes ─────────────────────────
const M = {}; // measured anchors

function s1(t) {
  // frame 0 is complete; caption breathes, then lifts away as the ball collapses
  const out = P(t, 3.0, 3.5, 'power3.in');
  T($('s1cap'), { x: 960, y: 300 - out * 80, o: 1 - out, b: out * 10, s: 1 + 0.03 * P(t, 0, 3.2, 'sine.out') });
  if (t >= 3.55) ball(960, 540, L(0, 10, P(t, 3.55, 3.9, 'expo.out')), C.green, 1, 1);
}

function s2(t) {
  const enter = P(t, 3.95, 4.6, 'expo.out');
  const coll = P(t, 6.3, 7.0, 'power3.in');
  const drift = 18 * P(t, 4.6, 6.3, 'sine.inOut');
  const vin = (1 - P(t, 3.95, 4.6, 'expo.out'));
  T($('s2L'), { x: L(L(-500, 590, enter) + drift, 960, coll), y: 548, sx: L(1, 0.12, coll), sy: L(1, 0.7, coll), o: 1 - P(t, 6.75, 7.0), b: vin * 14 + coll * 16 });
  T($('s2R'), { x: L(L(2420, 1330, enter) - drift, 960, coll), y: 548, sx: L(1, 0.12, coll), sy: L(1, 0.7, coll), o: 1 - P(t, 6.75, 7.0), b: vin * 14 + coll * 16 });
  const lab = P(t, 4.4, 4.9) * (1 - P(t, 6.2, 6.5));
  T($('s2labL'), { x: 590, y: 360, o: lab }); T($('s2labR'), { x: 1330, y: 360, o: lab });
  R($('s2capA'), t, 4.5, 6.25, { x: 960, y: 180 });
  // the collapse produces a single grey verdict
  const pill = P(t, 6.85, 7.4, 'expo.out'); const pOut = P(t, 9.05, 9.45, 'power3.in');
  T($('s2pill'), { x: 960, y: 540, sx: L(0.2, 1, pill) * L(1, 0.4, pOut), sy: L(0.6, 1, pill), o: pill * (1 - pOut) });
  R($('s2capB'), t, 7.3, 9.0, { x: 960, y: 180 });
  R($('s2sub'), t, 7.95, 9.0, { x: 960, y: 760 });
  // ball: sits between the reads, greys out with the verdict, then ignites
  if (t >= 3.9) {
    const toPill = P(t, 6.9, 7.35, 'power3.inOut');
    const ign = P(t, 9.0, 9.35, 'back.out(2)');
    const col = ign > 0 ? mix(C.grey, C.green, cl(ign)) : mix(C.green, C.grey, P(t, 6.3, 6.9));
    ballIn('s2', t, L(960, 704, toPill), 540, L(10, 18, toPill) + 6 * ign, col, 1, ign);
  }
}

function s3(t) {
  const lk = M.lockup;
  // lockup: K draws in with a kick-direction wipe, the wordmark wipes on, then it lifts
  const lift = P(t, 11.0, 11.7, 'power3.inOut'); const out = P(t, 12.05, 12.45, 'power3.in');
  const cy = L(440, 330, lift); const sc = L(1, 0.78, lift) * L(1, 0.92, out);
  T($('lockup'), { x: 960, y: cy - out * 40, s: sc, o: 1 - out, b: out * 12 });
  const k = 100 * P(t, 9.75, 10.4, 'power3.out');
  $('mark').style.clipPath = `polygon(0% 100%, 0% ${100 - 2 * k}%, ${2 * k}% 100%)`;
  const w = 100 * P(t, 10.15, 10.8, 'expo.out');
  $('word').style.clipPath = `inset(-20% ${100 - w}% -20% 0)`;
  R($('s3h'), t, 11.3, 12.05, { x: 960, y: 620 });
  R($('s3sub'), t, 11.6, 12.05, { x: 960, y: 735 });
  // ball path: pill dot → K-mark ball → follows lockup → dives into the 2–1 cell → opens as a portal
  const bx = 960 + (lk.bx - lk.w / 2) * sc, by = cy - out * 40 + (lk.by - 100) * sc, br = lk.br * sc;
  if (t < 12.15) {
    const m = P(t, 9.4, 10.2, 'power3.inOut');
    const [ax, ay, as] = scr('s2', 9.4, 704, 540), [zx, zy, zs] = scr('s3', t, bx, by);
    ball(L(ax, zx, m), L(ay, zy, m), L(24 * as, br * zs, m), C.green, 1, 1);
  } else if (t < 12.5) {
    const m = P(t, 12.15, 12.5, 'power3.inOut');
    const [ax, ay, as] = scr('s3', t, bx, by);
    ball(L(ax, M.cell21.x, m), L(ay, M.cell21.y, m), L(br * as, 42, m), C.green, 1, 1);
  }
}

function portal(t) {
  const ring = $('portalRing'); const s4 = $('s4');
  if (t < 12.45 || t >= 13.05) { s4.style.clipPath = 'none'; ring.style.display = 'none'; return; }
  const R0 = L(42, 1500, P(t, 12.45, 13.05, 'expo.in'));
  const { x, y } = M.cell21;
  s4.style.clipPath = `circle(${R0}px at ${x}px ${y}px)`;
  ring.style.display = 'block';
  ring.style.background = `radial-gradient(circle at ${x}px ${y}px, transparent ${R0 - 3}px, rgba(0,200,5,0.95) ${R0}px, rgba(0,200,5,0.25) ${R0 + 14}px, transparent ${R0 + 60}px)`;
  ball(x, y, R0, C.green, 1 - P(t, 12.45, 12.7), 1);
}

function gridTransform(t) {
  const ry = L(-17, -11, P(t, 12.4, 18.4, 'sine.inOut'));
  const rx = L(16, 12, P(t, 12.4, 18.4, 'sine.inOut'));
  const push = P(t, 18.35, 19.3, 'expo.in');
  return { ry, rx, sc: L(1, 3.2, push), o: 1 - P(t, 18.8, 19.3), b: push * 10 };
}
function s4(t) {
  const g = gridTransform(t); const wrap = $('gridWrap');
  wrap.style.transformOrigin = `${32 + 170 + 78}px ${42 + 252 + 56}px`;
  wrap.style.transform = `rotateX(${g.rx}deg) rotateY(${g.ry}deg) scale(${g.sc})`;
  wrap.style.opacity = g.o; wrap.style.filter = g.b > 0.05 ? `blur(${g.b}px)` : 'none';
  const tap = 14.0, wave0 = 14.3;
  for (const k in cells) {
    const c = cells[k];
    const ent = P(t, 12.35 + c.r * 0.12, 12.85 + c.r * 0.12, 'expo.out');
    c.el.style.transform = `translateZ(${L(-120, 0, ent)}px)`;
    c.el.style.opacity = ent;
    // proximity glow, revealed by a wave travelling out from the pick
    let a = Math.pow(1 / (1 + c.D), 1.35);
    const reach = P(t, wave0 + c.r * 0.32, wave0 + c.r * 0.32 + 0.5, 'power2.out');
    a *= reach;
    if (k === '21') {
      const on = P(t, tap + 0.02, tap + 0.22, 'power2.out');
      c.el.style.background = mix(C.card, C.green, on); c.el.style.color = mix('#d8d6d0', C.bg, on);
      c.el.style.boxShadow = `0 0 ${60 * on}px rgba(0,200,5,${0.55 * on})`;
      c.el.style.borderColor = `rgba(0,200,5,${on})`;
    } else {
      c.el.style.background = `rgba(${L(28, 0, a * 0.55).toFixed(0)},${L(29, 200, a * 0.55).toFixed(0)},${L(26, 5, a * 0.55).toFixed(0)},0.95)`;
      c.el.style.boxShadow = a > 0.02 ? `0 0 ${50 * a}px rgba(0,200,5,${(0.45 * a).toFixed(3)})` : 'none';
      c.el.style.borderColor = `rgba(0,200,5,${(a * 0.8).toFixed(3)})`;
      c.el.style.color = `rgba(247,245,240,${(0.55 + 0.45 * a).toFixed(3)})`;
    }
  }
  const ft = P(t, 16.3, 16.6, 'back.out(2)');
  const ftEl = $('ftTag'); ftEl.style.opacity = ft; ftEl.style.transform = `scale(${L(0.6, 1, ft)})`;
  cells['20'].el.style.outline = ft > 0 ? `3px solid rgba(247,245,240,${0.85 * ft})` : 'none';
  cells['20'].el.style.outlineOffset = '4px';
  T($('s4lab'), { x: 1270, y: 178, o: P(t, 12.9, 13.4) * (1 - P(t, 18.3, 18.6)) });
  T($('s4leg'), { x: 1270, y: 958, o: P(t, 15.0, 15.5) * (1 - P(t, 18.3, 18.6)) });
  R($('s4c1'), t, 13.15, 15.35, { x: 140, y: 470, ax: 0 });
  R($('s4c2'), t, 15.55, 18.35, { x: 140, y: 440, ax: 0 });
  R($('s4s1'), t, 16.15, 18.35, { x: 140, y: 560, ax: 0 });
  R($('s4s2'), t, 16.4, 18.35, { x: 140, y: 610, ax: 0 });
  // the tapping ball
  if (t >= 13.2 && t < 14.75) {
    const r = $('gridWrap').children[11].getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const m = P(t, 13.45, 14.0, 'power3.inOut');
    const press = Math.sin(Math.PI * cl((t - 13.97) / 0.14));
    const fade = P(t, 14.35, 14.75, 'power2.in');
    ball(L(cx - 230, cx, m), L(cy + 170, cy, m), L(0, 14, P(t, 13.2, 13.5, 'expo.out')) * (1 - 0.35 * press) * (1 - fade) + 40 * fade, C.green, 1 - fade, 1);
  }
  // carry the 2–1 into the market card
  const carry = $('carry');
  if (t >= 18.45 && t < 19.42 && M.cell21Rect && M.pickRect) {
    const u = P(t, 18.45, 19.4, 'power3.inOut');
    const s = pushS('s4', 18.45), r0 = M.cell21Rect, [ax, ay] = scr('s4', 18.45, r0.left, r0.top);
    const a = { left: ax, top: ay, width: r0.width * s, height: r0.height * s };
    const sb = pushS('s5', 19.4), r1 = M.pickRect, [bx, by] = scr('s5', 19.4, r1.left, r1.top);
    const b = { left: bx, top: by, width: r1.width * sb, height: r1.height * sb };
    carry.style.display = 'flex';
    carry.style.left = L(a.left, b.left, u) + 'px'; carry.style.top = L(a.top, b.top, u) + 'px';
    carry.style.width = L(a.width, b.width, u) + 'px'; carry.style.height = L(a.height, b.height, u) + 'px';
    carry.style.fontSize = L(46, 128, u) + 'px'; carry.style.borderRadius = L(18, 22, u) + 'px';
    carry.style.boxShadow = `0 0 80px rgba(0,200,5,${0.4 * (1 - u)})`;
    carry.textContent = '2–1';
  } else carry.style.display = 'none';
}

function s5(t) {
  const card = $('card');
  const shell = P(t, 18.95, 19.35, 'expo.out'); const ex = P(t, 24.6, 25.25, 'expo.in');
  T(card, { x: 0, y: 0, ax: 0, ay: 0, s: L(0.965, 1, shell) * L(1, 0.92, ex), o: shell * (1 - P(t, 24.95, 25.25)), b: ex * 14 });
  card.style.translate = `${-ex * 900}px 0`;
  card.querySelectorAll('.rg').forEach((el, i) => {
    const u = P(t, 19.3 + i * 0.07, 19.75 + i * 0.07, 'expo.out');
    el.style.opacity = u; el.style.transform = `translateY(${(1 - u) * 22}px)`;
  });
  $('pickBox').style.opacity = t >= 19.4 ? 1 : 0;
  // stake: chip tap → amount counts up
  const chip = P(t, 20.85, 21.0); $('chip25').style.background = `rgba(0,200,5,${0.16 * chip})`; $('chip25').style.borderColor = `rgba(0,200,5,${0.12 + 0.7 * chip})`; $('chip25').style.color = chip > 0.5 ? '#00C805' : '';
  $('amt').textContent = (25 * P(t, 20.9, 21.6, 'power2.out')).toFixed(2);
  // slide to stake: the ball is the thumb
  const tr = M.track; const slide = P(t, 22.3, 23.0, 'power3.inOut');
  const x0 = tr.left + 48, x1 = tr.right - 48, ty = tr.top + tr.height / 2;
  $('trackFill').style.width = (slide * (x1 - x0) + 96) * (t >= 22.3 ? 1 : 0) + 'px';
  const done = P(t, 23.0, 23.2);
  $('tt1').style.opacity = 1 - P(t, 22.35, 22.7); $('tt2').style.opacity = done;
  // status: open → countdown → locked
  const st = $('status');
  if (t < 23.4) st.innerHTML = '● Open';
  else if (t < 24.2) st.innerHTML = `Kickoff in 00:0${Math.max(0, 3 - Math.floor((t - 23.4) / 0.27))}`;
  else st.innerHTML = '🔒︎ Locked'.replace('🔒︎', '■');
  const locked = t >= 24.2;
  st.style.color = locked ? '#9d8bff' : 'rgba(247,245,240,0.8)'; st.style.borderColor = locked ? 'rgba(123,98,246,0.7)' : 'rgba(247,245,240,0.16)';
  st.style.background = locked ? 'rgba(123,98,246,0.14)' : 'transparent';
  R($('s5c1'), t, 19.55, 23.3, { x: 150, y: 420, ax: 0 });
  R($('s5c2'), t, 19.65, 23.3, { x: 150, y: 530, ax: 0 });
  R($('s5s1'), t, 20.3, 23.3, { x: 150, y: 650, ax: 0 });
  R($('s5c3'), t, 23.6, 24.6, { x: 150, y: 480, ax: 0 });
  if (t >= 21.8 && t < 24.6) {
    const press = 1 - 0.08 * Math.sin(Math.PI * cl((t - 22.2) / 0.2));
    ballIn('s5', t, L(x0, x1, slide), ty, L(0, 36, P(t, 21.8, 22.1, 'back.out(1.6)')) * press, C.green, 1, 0.7);
  }
}

const goals = [[23, 1, 0], [51, 1, 1], [74, 2, 1]];
const sig = (x) => 1 / (1 + Math.exp(-x));
function val(m) {
  let v = 0.08 * (m / 23) * (m < 23 ? 1 : 0);
  v += 0.62 * sig((m - 23) / 0.6) - 1.15 * sig((m - 51) / 0.6) + 1.75 * sig((m - 74) / 0.6);
  v += m > 74 ? ((m - 74) / 16) * 0.28 : 0;
  v += 0.05 * Math.sin(m * 1.7) + 0.035 * Math.sin(m * 3.9 + 1) + 0.02 * Math.sin(m * 7.3 + 2);
  return v;
}
const CX = (m) => 170 + (m / 90) * 1580, CY = (v) => 640 - v * 190;
function s6(t) {
  const mt = 90 * P(t, 25.35, 30.0, 'sine.inOut');
  let d = '';
  for (let m = 0; m <= mt + 1e-6; m += 0.25) d += (d ? 'L' : 'M') + CX(m).toFixed(1) + ' ' + CY(val(m)).toFixed(1);
  d += 'L' + CX(mt).toFixed(1) + ' ' + CY(val(mt)).toFixed(1);
  const out = P(t, 30.8, 31.25, 'power3.in');
  $('line').setAttribute('d', d);
  $('area').setAttribute('d', d + `L${CX(mt).toFixed(1)} 640 L170 640 Z`);
  $('chart').style.opacity = 1 - out;
  $('chart').style.transform = `translateY(${-out * 40}px)`;
  const gEl = $('goals'); let gh = '';
  goals.forEach(([gm, h, a], i) => {
    const o = P(mt, gm, gm + 2.5);
    if (o <= 0) return;
    gh += `<g opacity="${o}"><line x1="${CX(gm)}" y1="300" x2="${CX(gm)}" y2="760" stroke="rgba(247,245,240,0.22)" stroke-width="2" stroke-dasharray="4 8"/>` +
      `<text x="${CX(gm) + 14}" y="318" fill="${i === 1 ? '#9d8bff' : '#00C805'}" font-family="JetBrains Mono" font-size="20" letter-spacing="2">${gm}'  ${i === 1 ? 'CHE' : 'ARS'}  ${h}–${a}</text></g>`;
  });
  gEl.innerHTML = gh;
  $('chartGrid').innerHTML = `<line x1="170" y1="640" x2="1750" y2="640" stroke="rgba(247,245,240,0.16)" stroke-width="2" stroke-dasharray="2 10"/>` +
    [0, 45, 90].map((m) => `<text x="${CX(m)}" y="810" fill="#6B6F63" font-family="JetBrains Mono" font-size="19" text-anchor="middle">${m}'</text>`).join('');
  const gs = goals.filter((g) => mt >= g[0]).at(-1);
  const ft = t >= 30.05;
  $('scoreTxt').innerHTML = gs ? `ARS ${gs[1]}–${gs[2]} CHE` : 'ARS 0–0 CHE';
  $('minute').textContent = ft ? 'FT' : Math.floor(mt) + "'";
  $('livePill').innerHTML = ft ? 'Full time' : '● Live';
  $('rank').textContent = ft ? '1' : mt < 23 ? '31' : mt < 51 ? '14' : mt < 74 ? '52' : '3';
  const top = P(t, 25.0, 25.5, 'expo.out') * (1 - out);
  T($('score'), { x: 1750, y: 180, ax: 100, o: top, s: 0.85 });
  T($('s6l1'), { x: 170, y: 880, ax: 0, o: top }); T($('s6l2'), { x: 1750, y: 880, ax: 100, o: top });
  R($('s6c1'), t, 25.1, 29.95, { x: 170, y: 180, ax: 0, s: 0.8 });
  R($('s6c2'), t, 30.1, 30.8, { x: 170, y: 180, ax: 0, s: 0.8 });
  // ball: thumb → start of the line → rides the endpoint → drops into the field
  if (t >= 24.6 && t < 31.0) {
    const v = val(mt); const ex = CX(mt), ey = CY(v);
    const col = v >= 0 ? C.green : C.purple;
    if (t < 25.4) { const m = P(t, 24.6, 25.4, 'power3.inOut'); const [ax, ay, as] = scr('s5', 24.6, M.thumbEnd.x, M.thumbEnd.y), [zx, zy, zs] = scr('s6', t, 170, CY(val(0))); ball(L(ax, zx, m), L(ay, zy, m), L(36 * as, 12 * zs, m), C.green, 1, 1); }
    else ballIn('s6', t, ex, ey, 12, col, 1, 1);
  }
}

function s7(t) {
  // field + median gate
  R($('s7c1'), t, 31.2, 32.85, { x: 960, y: 170, s: 0.95 });
  R($('s7c2'), t, 33.0, 34.55, { x: 960, y: 170 });
  R($('s7s1'), t, 33.55, 34.55, { x: 960, y: 880 });
  const fo = P(t, 34.55, 35.0, 'power3.in');
  $('field').style.opacity = 1 - fo;
  $('fAxis').style.opacity = P(t, 31.05, 31.5);
  for (const d of field.dots) {
    const u = P(t, 31.15 + d.delay, 31.75 + d.delay, 'back.out(1.4)');
    const gate = P(t, 33.0 + (d.x - 240) / 1440 * 0.5, 33.25 + (d.x - 240) / 1440 * 0.5);
    const col = d.win ? mix(C.purple, C.green, gate) : mix(C.purple, '#3a3c36', gate);
    d.el.setAttribute('fill', col);
    d.el.setAttribute('cy', (L(d.y - 260, d.y, u) - (d.win ? fo * 60 : -fo * 40)).toFixed(1));
    if (!d.you) d.el.setAttribute('opacity', u.toFixed(3));
  }
  const ml = P(t, 32.45, 33.05, 'power3.out');
  $('median').setAttribute('transform', `translate(${L(1760, field.medX, ml)},0)`);
  $('median').setAttribute('opacity', P(t, 32.4, 32.6));
  // payout split (worked example from the docs)
  R($('s7c3'), t, 34.7, 37.3, { x: 960, y: 170 });
  T($('s7hd'), { x: 200, y: 300, ax: 0, o: P(t, 34.9, 35.3) * (1 - P(t, 37.3, 37.6)) });
  T($('s7fn'), { x: 960, y: 1000, o: P(t, 35.2, 35.6) * (1 - P(t, 37.3, 37.6)) });
  rowsData.forEach((d, i) => {
    const el = $('row' + i); const u = P(t, 34.85 + i * 0.08, 35.35 + i * 0.08, 'expo.out'); const ex = P(t, 37.25, 37.6, 'power3.in');
    T(el, { x: 200, y: 400 + i * 112, ax: 0, ay: 50, o: u * (1 - ex) });
    el.style.translate = `${(1 - u) * 60}px ${-ex * 50}px`;
    const g = P(t, 35.45 + i * 0.06, 36.45 + i * 0.06, 'power3.out');
    const W = 600, stakeW = (10 / 33.23) * W;
    const st = el.querySelector('.stake'), dv = el.querySelector('.div'), roi = el.querySelector('.roi');
    if (d.pay > 0) {
      st.style.width = stakeW * P(t, 35.35, 35.6) + 'px';
      dv.style.left = 640 + stakeW + 6 + 'px'; dv.style.width = Math.max(0, ((d.pay - 10) / 33.23) * W * g) + 'px';
    } else {
      st.style.width = stakeW * (1 - g * 0.98) + 'px'; dv.style.width = '0px';
    }
    const n = Math.round(d.roi * g);
    roi.textContent = (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) + '%';
  });
  // ball: line end → your dot in the field → row A marker
  if (t >= 31.0 && t < 37.6) {
    const m1 = P(t, 31.0, 31.7, 'power3.inOut'), m2 = P(t, 34.6, 35.1, 'power3.inOut');
    const [ax, ay] = scr('s6', 31.0, M.lineEnd.x, M.lineEnd.y), [fx, fy, fs] = scr('s7', t, field.youX, field.youY), [rx, ry] = scr('s7', t, 222, 400);
    ball(L(L(ax, fx, m1), rx, m2), L(L(ay, fy, m1), ry, m2), 13 * fs, C.green, 1 - P(t, 37.3, 37.6), 1);
  }
}

function s8(t) {
  R($('s8a'), t, 37.6, 38.8, { x: 960, y: 470 });
  R($('s8as'), t, 37.85, 38.8, { x: 960, y: 650 });
  const pin = P(t, 38.95, 39.5, 'expo.out'); const pout = P(t, 41.65, 42.05, 'power3.in');
  T($('s8pct'), { x: L(2500, 720, pin) - pout * 300, y: 520, o: (t >= 38.95 ? 1 : 0) * (1 - pout), b: (1 - pin) * 20 + pout * 14, s: 1 + 0.03 * P(t, 39.5, 41.6, 'sine.inOut') });
  R($('s8b1'), t, 39.3, 41.6, { x: 1130, y: 410, ax: 0 });
  R($('s8b2'), t, 39.55, 40.45, { x: 1130, y: 505, ax: 0 });
  R($('s8b3'), t, 40.6, 41.6, { x: 1130, y: 505, ax: 0 });
  const ch = P(t, 40.75, 41.2, 'expo.out');
  T($('s8chips'), { x: 1130, y: 640, ax: 0, o: ch * (1 - P(t, 41.6, 41.9)), s: L(0.94, 1, ch) });
}

function bez(p0, p1, p2, p3, u) {
  const v = 1 - u; return [v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0], v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]];
}
function s9(t) {
  const ex = P(t, 45.7, 46.1, 'power3.in');
  const a = P(t, 42.0, 42.5, 'expo.out'), b = P(t, 42.12, 42.62, 'expo.out');
  T($('srcA'), { x: L(-300, 230, a), y: 300, ax: 0, ay: 0, o: a * (1 - ex) });
  T($('srcB'), { x: L(-300, 230, b), y: 610, ax: 0, ay: 0, o: b * (1 - ex) });
  const A0 = [700, 385], A1 = [880, 385], A2 = [900, 540], A3 = [1006, 540];
  const B0 = [700, 695], B1 = [880, 695], B2 = [900, 540], B3 = [1006, 540];
  const pa = `M${A0} C${A1} ${A2} ${A3}`, pb = `M${B0} C${B1} ${B2} ${B3}`;
  $('pA').setAttribute('d', pa); $('pB').setAttribute('d', pb);
  const draw = P(t, 42.55, 43.65, 'power2.inOut');
  for (const id of ['pA', 'pB']) { $(id).style.opacity = P(t, 42.5, 42.7) * (1 - ex); $(id).style.clipPath = `inset(0 ${100 - draw * 100}% 0 0)`; }
  const da = bez(A0, A1, A2, A3, draw), db = bez(B0, B1, B2, B3, P(t, 42.65, 43.65, 'power2.inOut'));
  $('dA').setAttribute('cx', da[0]); $('dA').setAttribute('cy', da[1]); $('dB').setAttribute('cx', db[0]); $('dB').setAttribute('cy', db[1]);
  const dots = t >= 42.55 && t < 43.7 ? 1 : 0; $('dA').style.opacity = dots; $('dB').style.opacity = dots;
  $('node').style.opacity = P(t, 42.4, 42.8) * (1 - ex);
  const rip = P(t, 43.7, 44.5, 'power2.out');
  $('ripple').setAttribute('r', 74 + rip * 120); $('ripple').style.opacity = t >= 43.7 ? (1 - rip) * 0.8 : 0;
  const ck = P(t, 43.85, 44.2, 'power3.out');
  $('chk').style.strokeDasharray = '120'; $('chk').style.strokeDashoffset = 120 * (1 - ck);
  $('check').style.opacity = t >= 43.85 ? 1 - P(t, 45.6, 45.8) : 0;
  R($('s9h'), t, 43.95, 45.7, { x: 1230, y: 470, ax: 0 });
  R($('s9s1'), t, 44.25, 45.7, { x: 1236, y: 605, ax: 0 });
  R($('s9s2'), t, 44.4, 45.7, { x: 1236, y: 655, ax: 0 });
  T($('s9fn'), { x: 960, y: 960, o: P(t, 44.7, 45.1) * (1 - ex) });
  // ball: becomes the settled node, then rolls into the season pot
  if (t >= 43.65 && t < 46.6) {
    const pop = P(t, 43.65, 44.0, 'back.out(1.8)');
    const go = P(t, 45.7, 46.3, 'power3.inOut');
    const [ax, ay, as] = scr('s9', t, 1080, 540), [zx, zy] = scr('s10', t, 960, 640);
    ball(L(ax, zx, go), L(ay, zy, go), L(0, 74, pop) * L(1, 1.3, go) * as, C.green, 1 - P(t, 46.15, 46.55), 1);
  }
}

function s10(t) {
  const ex = P(t, 50.25, 50.65, 'power3.in');
  R($('s10c'), t, 46.1, 50.25, { x: 960, y: 140 });
  R($('s10s'), t, 46.45, 50.25, { x: 960, y: 212 });
  for (let i = 0; i < 5; i++) {
    const u = P(t, 46.2 + i * 0.14, 46.7 + i * 0.14, 'expo.out');
    T($('mk' + i), { x: L(60, 160, u), y: 380 + i * 116, ax: 0, o: u * (1 - ex) });
  }
  const prog = L(0.06, 0.78, P(t, 46.5, 50.0, 'power1.inOut'));
  const C0 = 2 * Math.PI * 210;
  $('arc').style.strokeDasharray = `${C0 * prog} ${C0}`;
  $('ring').style.opacity = P(t, 46.1, 46.5) * (1 - ex);
  T($('ringTxt'), { x: 960, y: 640, o: P(t, 46.4, 46.8) * (1 - ex) });
  for (let i = 0; i < 10; i++) {
    const t0 = 46.75 + i * 0.3; const u = P(t, t0, t0 + 0.6, 'power2.inOut');
    const c = $('coin' + i); const sy = 380 + (i % 5) * 116;
    const ang = -Math.PI / 2 + 2 * Math.PI * (0.06 + 0.072 * (i + 1));
    const tx = 960 + 210 * Math.cos(ang), ty = 640 + 210 * Math.sin(ang);
    const p = bez([560, sy], [700, sy - 160], [tx - 80, ty - 200], [tx, ty], u);
    c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]);
    c.style.opacity = t >= t0 && u < 1 ? 1 : 0;
  }
  T($('ladHd'), { x: 1330, y: 262, ax: 0, o: P(t, 46.5, 46.9) * (1 - ex) });
  T($('ladder'), { x: 1330, y: 300, ax: 0, ay: 0, o: P(t, 46.5, 46.9) * (1 - ex) });
  for (let i = 0; i < 20; i++) {
    const on = P(t, 47.3 + i * 0.1, 47.55 + i * 0.1);
    const el = $('lr' + i); el.style.color = mix('#6b6f63', '#F7F5F0', on);
    el.querySelector('.bar').style.background = `rgba(${L(247, 0, on)},${L(245, 200, on)},${L(240, 5, on)},${L(0.12, 0.9, on)})`;
  }
}

function s11(t) {
  const ex = P(t, 54.25, 54.65, 'power3.in');
  R($('s11c'), t, 50.65, 54.25, { x: 960, y: 140 });
  R($('s11s'), t, 50.95, 54.25, { x: 960, y: 215 });
  const e = P(t, 50.6, 51.1, 'expo.out'), g = P(t, 50.75, 51.25, 'expo.out');
  T($('editor'), { x: 160, y: L(380, 320, e) - ex * 60, ax: 0, ay: 0, o: e * (1 - ex) });
  T($('agent'), { x: 1100, y: L(380, 320, g) - ex * 60, ax: 0, ay: 0, o: g * (1 - ex) });
  const full = soul.join('\n'); const n = Math.floor(full.length * P(t, 51.0, 52.7, 'none'));
  const caret = Math.floor(t * 2.5) % 2 === 0 || (t > 51 && t < 52.7) ? '<span style="color:#00C805">▍</span>' : ' ';
  const shown = full.slice(0, n).split('\n').map((l, i) => (i === 0 ? `<span style="color:#9d8bff">${l}</span>` : l)).join('\n');
  $('codeTxt').innerHTML = shown + caret;
  for (let i = 0; i < 3; i++) {
    const u = P(t, 52.75 + i * 0.38, 53.2 + i * 0.38, 'back.out(1.4)');
    T($('pk' + i), { x: 0, y: i * 120, ax: 0, ay: 0, o: u, s: L(0.92, 1, u) });
  }
}

function s12(t) {
  const io = P(t, 54.55, 54.95) * (1 - P(t, 56.5, 56.95));
  for (let r = 0; r < 4; r++) {
    const dir = r % 2 ? 1 : -1; const sp = 820 + r * 90;
    T($('mq' + r), { x: -1400 + dir * sp * (t - 55.6) + (r % 2 ? -900 : 0), y: 120 + r * 260, ax: 0, ay: 0, o: io });
  }
  $('band').style.opacity = io;
  R($('s12a'), t, 54.75, 56.45, { x: 960, y: 488 });
  R($('s12b'), t, 55.0, 56.45, { x: 960, y: 600 });
}

function s13(t) {
  const W = M.lock2W; const u = P(t, 56.9, 57.6, 'expo.out');
  const drift = 1 + 0.025 * P(t, 57.6, 60, 'sine.inOut');
  T($('lock2'), { x: 960, y: 300, s: L(0.9, 1, u) * drift, o: u, b: (1 - u) * 10 });
  $('lock2').style.width = W + 'px'; $('lock2').style.height = '151px';
  R($('s13t'), t, 57.25, 99, { x: 960, y: 470, s: drift });
  const c = P(t, 57.55, 58.05, 'back.out(1.5)');
  T($('cta'), { x: 960, y: 600, s: L(0.85, 1, c) * drift, o: c });
  T($('disc'), { x: 960, y: 712, o: P(t, 57.7, 58.1) });
}

const scenes = [
  ['s1', 0, 4.1, s1], ['s2', 3.9, 9.6, s2], ['s3', 9.35, 12.5, s3], ['s4', 12.0, 19.45, s4], ['s5', 18.9, 25.3, s5],
  ['s6', 24.55, 31.3, s6], ['s7', 30.95, 37.65, s7], ['s8', 37.55, 42.1, s8], ['s9', 41.95, 46.6, s9], ['s10', 46.0, 50.7, s10],
  ['s11', 50.55, 54.7, s11], ['s12', 54.5, 57.0, s12], ['s13', 56.75, 60.01, s13],
];

const WIN = Object.fromEntries(scenes.map(([id, a, b]) => [id, [a, b]]));

function seek(t) {
  B = null;
  background(t);
  // later scenes first: earlier scenes may read anchors that later scenes measure
  for (let i = scenes.length - 1; i >= 0; i--) {
    const [id, a, b, fn] = scenes[i];
    const on = t >= a && t < b;
    $(id).style.display = on ? 'block' : 'none';
    if (on) { $(id).style.transform = `scale(${pushS(id, t)})`; fn(t); }
  }
  if (!(t >= 12.0 && t < 19.45)) $('carry').style.display = 'none';
  portal(t);
  renderThree(t);
  applyBall();
}

async function init() {
  await document.fonts.ready;
  await Promise.all(['500 68px "Clash Display"', '600 100px "Clash Display"', 'italic 300 60px Fraunces', '400 30px Inter', '500 20px "JetBrains Mono"'].map((f) => document.fonts.load(f)));
  makeStreaks(); buildGrid(); buildField(); buildRows(); buildMarkets(); buildPicks(); buildMarquee();
  initThree();
  // measure the lockups
  $('word').textContent = 'kickoff';
  $('s3').style.display = 'block';
  const ww = $('word').getBoundingClientRect().width; const s = 200 / 502;
  $('word').style.left = 199 + 40 + 'px';
  const lw = 199 + 40 + ww; $('lockup').style.width = lw + 'px'; $('lockup').style.height = '200px';
  M.lockup = { w: lw, bx: 400 * s, by: 100 * s, br: 100 * s };
  $('s3').style.display = 'none';
  $('s13').style.display = 'block'; M.lock2W = 186 + $('word2').getBoundingClientRect().width; $('s13').style.display = 'none';
  // measure the card (at rest) and the 2–1 cell at the moments they hand over
  $('s5').style.display = 'block'; T($('card'), { x: 0, y: 0, ax: 0, ay: 0 }); $('card').style.translate = '0 0';
  const pr = $('pickBox').getBoundingClientRect(); M.pickRect = { left: pr.left, top: pr.top, width: pr.width, height: pr.height };
  const trk = $('track').getBoundingClientRect(); M.track = { left: trk.left, right: trk.right, top: trk.top, height: trk.height };
  $('s5').style.display = 'none';
  M.thumbEnd = { x: M.track.right - 48, y: M.track.top + M.track.height / 2 }; // slider end, handed to the chart
  M.lineEnd = { x: CX(90), y: CY(val(90)) }; // chart end, handed to the field
  $('s4').style.display = 'block';
  const cellAt = (tt) => { s4(tt); const r = cells['21'].el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  M.cell21 = cellAt(13.0); M.cell21Rect = cellAt(18.45);
  $('s4').style.display = 'none';
  seek(0);
  window.__ready = true;
}
window.__seek = (t) => seek(t);
window.__duration = DURATION;
init().then(() => {
  const q = new URLSearchParams(location.search);
  if (q.has('t')) seek(parseFloat(q.get('t')));
  if (q.has('play')) { const t0 = performance.now() - parseFloat(q.get('play') || 0) * 1000; const loop = () => { seek(((performance.now() - t0) / 1000) % DURATION); requestAnimationFrame(loop); }; loop(); }
});
