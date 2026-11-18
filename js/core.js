'use strict';
// ============================================================
//  LAST FUSE — core: constants, utils, map, tracing, textures
// ============================================================
const TAU = Math.PI * 2;
const WALLH = 1.5, CRATE_H = 0.72;
const STAND_H = 0.95, CROUCH_H = 0.7, STAND_EYE = 0.82, CROUCH_EYE = 0.57;
const P_RADIUS = 0.24, HIT_RADIUS = 0.2, HEAD_RADIUS = 0.105;
const RUN_SPEED = 2.6, GRAVITY = 9;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function angNorm(a) { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; }
function angDiff(a, b) { return angNorm(b - a); }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d', { willReadFrequently: true }); return c; }

// ------------------------------------------------------------
//  MAPS — layouts live in maps.js; loadMap() swaps the active one.
//  # main wall  = alt wall  X tall stack  C low crate (cover)
//  . ground  t indoor  a/b site (outdoor)  p/q site (indoor)  T raider spawn  K warden spawn
// ------------------------------------------------------------
const W_SAND = 1, W_PLASTER = 2, W_CRATES = 3, W_SIGNA = 4, W_SIGNB = 5, W_LOW = 6;
const F_SAND = 0, F_TILE = 1, F_PAVE = 2, F_SPAWN = 3;
const FL_IN = 1, FL_A = 2, FL_B = 4, FL_TS = 8, FL_CS = 16;
let MW = 1, MH = 1, MAP = null;
let mapWall = new Uint8Array(1), mapFloor = new Uint8Array(1), mapFlags = new Uint8Array(1);
const SITES = { A: { cells: [], cx: 0, cy: 0 }, B: { cells: [], cx: 0, cy: 0 } };
const SPAWNS = { R: [], W: [], rc: [0, 0], wc: [0, 0] };

function loadMap(id) {
  const def = MAP_DEFS.find(m => m.id === id) || MAP_DEFS[0];
  const src = def.grid;
  MH = src.length; MW = src[0].length;
  mapWall = new Uint8Array(MW * MH); mapFloor = new Uint8Array(MW * MH); mapFlags = new Uint8Array(MW * MH);
  SITES.A = { cells: [], cx: 0, cy: 0 }; SITES.B = { cells: [], cx: 0, cy: 0 };
  SPAWNS.R = []; SPAWNS.W = [];
  for (let y = 0; y < MH; y++) {
    const row = src[y];
    for (let x = 0; x < MW; x++) {
      const ch = row[x] || '#', i = y * MW + x;
      switch (ch) {
        case '#': mapWall[i] = W_SAND; break;
        case '=': mapWall[i] = W_PLASTER; break;
        case 'X': mapWall[i] = W_CRATES; break;
        case 'C': mapWall[i] = W_LOW; mapFloor[i] = F_PAVE; break;
        case 't': mapFloor[i] = F_TILE; mapFlags[i] = FL_IN; break;
        case 'a': mapFloor[i] = F_PAVE; mapFlags[i] = FL_A; SITES.A.cells.push([x, y]); break;
        case 'b': mapFloor[i] = F_PAVE; mapFlags[i] = FL_B; SITES.B.cells.push([x, y]); break;
        case 'p': mapFloor[i] = F_TILE; mapFlags[i] = FL_A | FL_IN; SITES.A.cells.push([x, y]); break;
        case 'q': mapFloor[i] = F_TILE; mapFlags[i] = FL_B | FL_IN; SITES.B.cells.push([x, y]); break;
        case 'T': mapFloor[i] = F_SPAWN; mapFlags[i] = FL_TS; SPAWNS.R.push([x, y]); break;
        case 'K': mapFloor[i] = F_SPAWN; mapFlags[i] = FL_CS; SPAWNS.W.push([x, y]); break;
        default: mapFloor[i] = F_SAND;
      }
    }
  }
  // the indoor floor under low crates inside buildings
  for (let i = 0; i < MW * MH; i++) if (mapWall[i] === W_LOW) {
    const x = i % MW, y = (i / MW) | 0; let ind = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (y + dy) * MW + x + dx; if (j >= 0 && j < MW * MH && (mapFlags[j] & FL_IN)) ind++; }
    if (ind >= 2) mapFlags[i] |= FL_IN;
  }
  const sign = (x, y, w) => { if (x >= 0 && y >= 0 && x < MW && y < MH && (mapWall[y * MW + x] === W_SAND || mapWall[y * MW + x] === W_PLASTER)) mapWall[y * MW + x] = w; };
  if (def.signs) for (const s of def.signs) sign(s[0], s[1], s[2] === 'A' ? W_SIGNA : W_SIGNB);
  else {
    // paint the letter on a few walls that face each site
    for (const [k, w] of [['A', W_SIGNA], ['B', W_SIGNB]]) {
      const cand = [];
      for (const [cx, cy] of SITES[k].cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = cx + dx, y = cy + dy; if (x <= 0 || y <= 0 || x >= MW - 1 || y >= MH - 1) continue;
        const m = mapWall[y * MW + x]; if (m === W_SAND || m === W_PLASTER) cand.push([x, y]);
      }
      const r = mulberry32(k === 'A' ? 7 : 9), chosen = [];
      for (let n = 0; n < 40 && chosen.length < 3 && cand.length; n++) { const c = cand[Math.floor(r() * cand.length)]; if (chosen.every(o => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) > 6)) chosen.push(c); }
      for (const c of chosen) sign(c[0], c[1], w);
    }
  }
  for (const k of ['A', 'B']) {
    const s = SITES[k]; let sx = 0, sy = 0;
    for (const c of s.cells) { sx += c[0] + 0.5; sy += c[1] + 0.5; }
    s.cx = sx / s.cells.length; s.cy = sy / s.cells.length;
  }
  const cent = (l) => { let sx = 0, sy = 0; for (const c of l) { sx += c[0] + 0.5; sy += c[1] + 0.5; } return [sx / l.length, sy / l.length]; };
  SPAWNS.rc = cent(SPAWNS.R); SPAWNS.wc = cent(SPAWNS.W);
  MAP = def;
  buildTextures(def.theme);
  if (typeof aiPrepareMap === 'function') aiPrepareMap();
  if (typeof HUD !== 'undefined' && HUD.ctx) buildRadar();
  return def;
}

function cellIdx(x, y) { return Math.floor(y) * MW + Math.floor(x); }
function solidCell(cx, cy) { if (cx < 0 || cy < 0 || cx >= MW || cy >= MH) return true; return mapWall[cy * MW + cx] !== 0; }
function solidAt(x, y) { return solidCell(Math.floor(x), Math.floor(y)); }
function flagsAt(x, y) { const cx = Math.floor(x), cy = Math.floor(y); if (cx < 0 || cy < 0 || cx >= MW || cy >= MH) return 0; return mapFlags[cy * MW + cx]; }
function siteAt(x, y) { const f = flagsAt(x, y); return (f & FL_A) ? 'A' : (f & FL_B) ? 'B' : null; }
function snapWalk(x, y) { // nearest walkable cell center
  let cx = clamp(Math.floor(x), 0, MW - 1), cy = clamp(Math.floor(y), 0, MH - 1);
  if (!solidCell(cx, cy)) return [cx + 0.5, cy + 0.5];
  for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (!solidCell(cx + dx, cy + dy)) return [cx + dx + 0.5, cy + dy + 0.5];
  }
  return [cx + 0.5, cy + 0.5];
}

// ------------------------------------------------------------
//  Ray tracing through the grid (bullets / line of sight)
//  kind: 0 none, 1 wall, 2 crate face, 3 crate top, 4 floor
// ------------------------------------------------------------
const TR = { t: 0, kind: 0, side: 0, x: 0, y: 0, z: 0, cx: 0, cy: 0 };
function traceWorld(x0, y0, z0, dx, dy, slope, maxT) {
  let mx = Math.floor(x0), my = Math.floor(y0);
  const ddx = dx === 0 ? 1e30 : Math.abs(1 / dx), ddy = dy === 0 ? 1e30 : Math.abs(1 / dy);
  let sx, sy, sdx, sdy;
  if (dx < 0) { sx = -1; sdx = (x0 - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - x0) * ddx; }
  if (dy < 0) { sy = -1; sdy = (y0 - my) * ddy; } else { sy = 1; sdy = (my + 1 - y0) * ddy; }
  const tFloor = slope < 0 ? -z0 / slope : 1e9;
  const tLim = Math.min(maxT, tFloor);
  let t = 0, side = 0, kind = 0;
  for (let i = 0; i < 300; i++) {
    if (sdx < sdy) { t = sdx; sdx += ddx; mx += sx; side = 0; } else { t = sdy; sdy += ddy; my += sy; side = 1; }
    if (t >= tLim) break;
    if (mx < 0 || my < 0 || mx >= MW || my >= MH) { kind = 1; break; }
    const w = mapWall[my * MW + mx];
    if (w === 0) continue;
    if (w === W_LOW) {
      const z1 = z0 + slope * t;
      if (z1 < CRATE_H) { kind = 2; break; }
      const tEx = Math.min(sdx, sdy), z2 = z0 + slope * tEx;
      if (z2 < CRATE_H && slope < 0) { t = (CRATE_H - z0) / slope; kind = 3; break; }
      continue;
    }
    kind = 1; break;
  }
  if (kind === 0) { if (tFloor <= maxT) { t = tFloor; kind = 4; } else t = maxT; }
  TR.t = t; TR.kind = kind; TR.side = side; TR.x = x0 + dx * t; TR.y = y0 + dy * t; TR.z = z0 + slope * t; TR.cx = mx; TR.cy = my;
  return TR;
}
function losClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  if (d < 1e-4) return true;
  const tr = traceWorld(ax, ay, az, dx / d, dy / d, (bz - az) / d, d);
  return tr.kind === 0 || tr.t >= d - 0.02;
}
// walkable straight line for a body of radius r
function walkLine(ax, ay, bx, by, r) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  const n = Math.ceil(d / 0.15);
  const px = -dy / (d || 1) * r, py = dx / (d || 1) * r;
  for (let i = 0; i <= n; i++) {
    const x = ax + dx * i / n, y = ay + dy * i / n;
    if (solidAt(x + px, y + py) || solidAt(x - px, y - py) || solidAt(x, y)) return false;
  }
  return true;
}

// ------------------------------------------------------------
//  Procedural textures (64x64) + precomputed shade tables
// ------------------------------------------------------------
function canvasU32(c) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; return new Uint32Array(d.buffer.slice(0)); }
function addNoise(g, w, h, amt, rnd, mono) {
  const id = g.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amt;
    d[i] += n; d[i + 1] += mono ? n : n * 0.95; d[i + 2] += n * 0.8;
  }
  g.putImageData(id, 0, 0);
}
function texCanvas(fn, seed) { const c = makeCanvas(64, 64), g = c.getContext('2d'); fn(g, 64, 64, mulberry32(seed)); return c; }

const rgb = (c, d) => { d = d || 0; return `rgb(${clamp(c[0] + d, 0, 255) | 0},${clamp(c[1] + d, 0, 255) | 0},${clamp(c[2] + d, 0, 255) | 0})`; };
const rgba = (c, a, d) => { d = d || 0; return `rgba(${clamp(c[0] + d, 0, 255) | 0},${clamp(c[1] + d, 0, 255) | 0},${clamp(c[2] + d, 0, 255) | 0},${a})`; };
// ---- wall painters (all parametric so each map has its own look) ----
const P = {
  brick: (o) => (g, w, h, r) => {
    const rows = o.rows || 4, bh = 64 / rows, bw = o.bw || 32;
    g.fillStyle = rgb(o.mortar); g.fillRect(0, 0, w, h);
    for (let row = 0; row < rows; row++) {
      const off = (row % 2) * (bw / 2);
      for (let col = -1; col < 64 / bw + 1; col++) {
        const x = col * bw + off, y = row * bh, v = (r() * (o.var || 34) - (o.var || 34) / 2) | 0;
        g.fillStyle = rgb(o.base, v); g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        g.fillStyle = 'rgba(255,245,215,0.22)'; g.fillRect(x + 1, y + 1, bw - 2, 2);
        g.fillStyle = 'rgba(30,20,10,0.22)'; g.fillRect(x + 1, y + bh - 4, bw - 2, 3);
      }
    }
    if (o.moss) for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(70,${110 + r() * 40 | 0},50,${0.2 + r() * 0.35})`; g.fillRect(r() * 64 | 0, (r() < 0.6 ? 44 + r() * 20 : r() * 64) | 0, 2 + r() * 5 | 0, 1 + r() * 3 | 0); }
    if (o.windows) for (let i = 0; i < 2; i++) { const lit = r() < 0.6; g.fillStyle = lit ? 'rgba(255,214,120,0.95)' : 'rgba(25,30,45,0.95)'; g.fillRect(10 + i * 28, 14, 14, 18); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(16 + i * 28, 14, 2, 18); g.fillRect(10 + i * 28, 22, 14, 2); }
    addNoise(g, w, h, o.noise || 28, r);
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(20,15,10,${0.12 + r() * 0.2})`; g.fillRect(r() * 64 | 0, r() * 64 | 0, 1 + r() * 3 | 0, 1 + r() * 2 | 0); }
  },
  plaster: (o) => (g, w, h, r) => {
    g.fillStyle = rgb(o.base); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,250,235' : '40,35,30'},${r() * 0.12})`; g.fillRect(r() * 64 | 0, 0, 1 + r() * 4 | 0, 64); }
    const gr = g.createLinearGradient(0, 40, 0, 64); gr.addColorStop(0, 'rgba(40,30,20,0)'); gr.addColorStop(1, `rgba(40,30,20,${o.grime === undefined ? 0.45 : o.grime})`);
    g.fillStyle = gr; g.fillRect(0, 40, 64, 24);
    if (o.stripe) { g.fillStyle = rgb(o.stripe); g.fillRect(0, 26, 64, 6); }
    g.strokeStyle = 'rgba(50,40,30,0.55)'; g.lineWidth = 1; g.beginPath();
    let x = 10 + r() * 40, y = 5; g.moveTo(x, y); for (let i = 0; i < 6; i++) { x += r() * 8 - 4; y += 3 + r() * 5; g.lineTo(x, y); } g.stroke();
    addNoise(g, w, h, o.noise || 22, r);
  },
  metal: (o) => (g, w, h, r) => {
    g.fillStyle = rgb(o.base, -30); g.fillRect(0, 0, w, h);
    for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
      const v = (r() * 18 - 9) | 0; g.fillStyle = rgb(o.base, v); g.fillRect(px * 32 + 1, py * 32 + 1, 30, 30);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(px * 32 + 1, py * 32 + 1, 30, 2);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(px * 32 + 1, py * 32 + 29, 30, 2);
      g.fillStyle = 'rgba(0,0,0,0.55)'; for (const [a, b] of [[4, 4], [27, 4], [4, 27], [27, 27]]) g.fillRect(px * 32 + a, py * 32 + b, 2, 2);
    }
    if (o.rust) for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(${130 + r() * 40 | 0},${60 + r() * 20 | 0},30,${0.2 + r() * 0.3})`; g.beginPath(); g.ellipse(r() * 64, r() * 64, 1 + r() * 5, 1 + r() * 3, 0, 0, TAU); g.fill(); }
    if (o.hazard) { for (let i = -4; i < 10; i++) { g.fillStyle = i % 2 ? '#d9b220' : '#1d1d1d'; g.beginPath(); g.moveTo(i * 8, 64); g.lineTo(i * 8 + 8, 64); g.lineTo(i * 8 + 16, 54); g.lineTo(i * 8 + 8, 54); g.fill(); } }
    addNoise(g, w, h, o.noise || 16, r);
  },
  stone: (o) => (g, w, h, r) => {
    g.fillStyle = rgb(o.mortar); g.fillRect(0, 0, w, h);
    let y = 0;
    while (y < 64) {
      const bh = 12 + (r() * 10 | 0); let x = -(r() * 20 | 0);
      while (x < 64) { const bw = 16 + (r() * 22 | 0), v = (r() * 30 - 15) | 0; g.fillStyle = rgb(o.base, v); g.fillRect(x + 1, y + 1, bw - 2, Math.min(bh, 64 - y) - 2); g.fillStyle = 'rgba(255,255,240,0.15)'; g.fillRect(x + 1, y + 1, bw - 2, 2); x += bw; }
      y += bh;
    }
    if (o.moss) for (let i = 0; i < 45; i++) { g.fillStyle = `rgba(${60 + r() * 30 | 0},${100 + r() * 50 | 0},${40 + r() * 20 | 0},${0.25 + r() * 0.4})`; g.beginPath(); g.ellipse(r() * 64, r() < 0.5 ? 50 + r() * 14 : r() * 64, 1 + r() * 4, 1 + r() * 2.5, 0, 0, TAU); g.fill(); }
    if (o.carve) { g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(32, 32, 10, 0, TAU); g.moveTo(22, 32); g.lineTo(42, 32); g.moveTo(32, 22); g.lineTo(32, 42); g.stroke(); }
    addNoise(g, w, h, o.noise || 26, r);
  },
  container: (o) => (g, w, h, r) => {
    g.fillStyle = rgb(o.base); g.fillRect(0, 0, w, h);
    for (let x = 0; x < 64; x += 6) { g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x, 0, 2, 64); g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 3, 0, 2, 64); }
    g.fillStyle = rgb(o.base, -45); g.fillRect(0, 0, 64, 4); g.fillRect(0, 60, 64, 4); g.fillRect(0, 31, 64, 2);
    for (let i = 0; i < 20; i++) { g.fillStyle = `rgba(120,60,30,${r() * 0.35})`; g.fillRect(r() * 64 | 0, r() * 64 | 0, 1 + r() * 3 | 0, 2 + r() * 6 | 0); }
    addNoise(g, w, h, 18, r);
  },
  crate: (o) => (g, w, h, r) => {
    const base = o.base || [155, 106, 54], frame = o.frame || [106, 69, 32];
    g.fillStyle = rgb(base); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { const v = (r() * 24 - 12) | 0; g.fillStyle = rgb(base, v); g.fillRect(i * 16 + 1, 0, 14, 64); g.fillStyle = 'rgba(30,20,10,0.45)'; g.fillRect(i * 16, 0, 1, 64); }
    g.fillStyle = rgb(frame); g.fillRect(0, 0, 64, 7); g.fillRect(0, 57, 64, 7); g.fillRect(0, 0, 7, 64); g.fillRect(57, 0, 7, 64);
    g.save(); g.translate(32, 32); g.rotate(Math.PI / 4); g.fillRect(-42, -4, 84, 8); g.restore();
    g.fillStyle = 'rgba(255,230,180,0.2)'; g.fillRect(0, 0, 64, 2); g.fillRect(0, 0, 2, 64);
    g.fillStyle = '#2a2a2a'; for (const p of [[3, 3], [60, 3], [3, 60], [60, 60]]) g.fillRect(p[0] - 1, p[1] - 1, 2, 2);
    if (o.snow) { g.fillStyle = 'rgba(240,248,255,0.9)'; g.fillRect(0, 0, 64, 4); for (let i = 0; i < 8; i++) g.fillRect(r() * 60 | 0, 3, 3 + r() * 6 | 0, 2 + r() * 3 | 0); }
    addNoise(g, w, h, 22, r);
  },
  crateTop: (o) => (g, w, h, r) => {
    const base = o.base || [167, 117, 64];
    g.fillStyle = rgb(base); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { const v = (r() * 24 - 12) | 0; g.fillStyle = rgb(base, 10 + v); g.fillRect(1, i * 16 + 1, 62, 14); }
    g.fillStyle = rgb(base, -55); g.fillRect(0, 0, 64, 5); g.fillRect(0, 59, 64, 5); g.fillRect(0, 0, 5, 64); g.fillRect(59, 0, 5, 64);
    if (o.snow) { g.fillStyle = 'rgba(238,246,255,0.85)'; g.fillRect(4, 4, 56, 56); }
    addNoise(g, w, h, 20, r);
  },
  sign: (letter, basePainter, col) => (g, w, h, r) => {
    basePainter(g, w, h, r);
    g.fillStyle = col || 'rgba(160,25,20,0.9)'; g.font = 'bold 46px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(letter, 32, 34);
    g.strokeStyle = col || 'rgba(160,25,20,0.8)'; g.lineWidth = 3; g.strokeRect(9, 9, 46, 48);
    addNoise(g, w, h, 16, r);
  },
  // ---- floors ----
  ground: (o) => (g, w, h, r) => {
    g.fillStyle = rgb(o.base); g.fillRect(0, 0, w, h);
    for (let i = 0; i < (o.ripples || 6); i++) { g.strokeStyle = rgba(o.ripple || [120, 90, 50], 0.08 + r() * 0.08); g.lineWidth = 2; g.beginPath(); const y = r() * 64; g.moveTo(0, y); g.bezierCurveTo(20, y + 6, 40, y - 6, 64, y); g.stroke(); }
    addNoise(g, w, h, o.noise || 34, r);
    for (let i = 0; i < (o.specks || 25); i++) { g.fillStyle = rgba(o.speck || [80, 60, 35], r() * 0.4); g.fillRect(r() * 64 | 0, r() * 64 | 0, 1 + (o.big ? r() * 3 | 0 : 0), 1); }
    if (o.grass) for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${50 + r() * 40 | 0},${100 + r() * 60 | 0},${30 + r() * 20 | 0},${0.5 + r() * 0.4})`; g.fillRect(r() * 64 | 0, r() * 64 | 0, 1, 2 + r() * 3 | 0); }
    if (o.lines) { g.fillStyle = 'rgba(230,200,60,0.55)'; g.fillRect(30, 0, 3, 64); }
  },
  tile: (o) => (g, w, h, r) => {
    g.fillStyle = rgb(o.grout || [78, 67, 54]); g.fillRect(0, 0, w, h);
    const n = o.n || 4, s = 64 / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = (r() * 20 - 10) | 0, dk = (x + y) % 2 ? 0 : (o.check === undefined ? 14 : o.check); g.fillStyle = rgb(o.base || [128, 110, 88], v - dk); g.fillRect(x * s + 1, y * s + 1, s - 2, s - 2); }
    addNoise(g, w, h, 18, r);
  },
  grate: (o) => (g, w, h, r) => {
    g.fillStyle = rgb(o.base, -40); g.fillRect(0, 0, w, h);
    for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) { g.fillStyle = rgb(o.base, (r() * 14 - 7) | 0); g.fillRect(x + 1, y + 1, 6, 6); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + 3, y + 3, 2, 2); }
    if (o.rust) for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(140,70,30,${r() * 0.4})`; g.fillRect(r() * 64 | 0, r() * 64 | 0, 3 + r() * 6 | 0, 2 + r() * 4 | 0); }
    addNoise(g, w, h, 14, r);
  },
  pave: (o) => (g, w, h, r) => {
    g.fillStyle = rgb(o.base, -50); g.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) { const off = (row % 2) * 12; for (let c = -1; c < 3; c++) { const v = (r() * 26 - 13) | 0; g.fillStyle = rgb(o.base, v); g.fillRect(c * 26 + off + 1, row * 16 + 1, 24, 14); } }
    if (o.paint) { g.fillStyle = rgba(o.paint, 0.5); g.fillRect(0, 60, 64, 4); }
    addNoise(g, w, h, 22, r);
  },
  ceil: (o) => (g, w, h, r) => {
    g.fillStyle = rgb(o.base, -30); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { const v = (r() * 14) | 0; g.fillStyle = rgb(o.base, v); g.fillRect(0, i * 16 + 2, 64, 11); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, i * 16 + 12, 64, 2); }
    if (o.lamp) { g.fillStyle = 'rgba(255,240,190,0.9)'; g.fillRect(26, 28, 12, 8); }
    addNoise(g, w, h, 16, r);
  },
};
// ---- skies ----
function paintSky(o) {
  const sc = makeCanvas(SKY.w, SKY.h), g = sc.getContext('2d'), r = mulberry32(o.seed || 77), W = SKY.w, H = SKY.h;
  const gr = g.createLinearGradient(0, 0, 0, H);
  o.stops.forEach((c, i) => gr.addColorStop(i / (o.stops.length - 1), c));
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  if (o.stars) for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; g.fillRect(r() * W | 0, r() * H * 0.75 | 0, 1, 1); }
  if (o.sun) {
    const [sx, sy, rad, col] = o.sun;
    const s = g.createRadialGradient(sx, sy, 2, sx, sy, rad); s.addColorStop(0, col[0]); s.addColorStop(0.15, col[1]); s.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = s; g.fillRect(sx - rad, 0, rad * 2, H);
  }
  if (o.clouds) for (let i = 0; i < o.clouds; i++) { const x = r() * W, y = 10 + r() * 70, w = 60 + r() * 140; g.fillStyle = o.cloudCol.replace('A', (0.1 + r() * 0.22).toFixed(2)); for (const dx of [0, W, -W]) { g.beginPath(); g.ellipse(x + dx, y, w, 6 + r() * 9, 0, 0, TAU); g.fill(); } }
  const base = H;
  g.fillStyle = o.far || 'rgba(176,150,112,0.85)';
  g.beginPath(); g.moveTo(0, base);
  const amp = o.hills || 8;
  for (let x = 0; x <= W; x += 8) g.lineTo(x, base - 10 - amp * Math.sin(x / 90) - amp * 0.6 * Math.sin(x / 23 + 1) - (o.mountains ? 18 * Math.abs(Math.sin(x / 140)) : 0));
  g.lineTo(W, base); g.fill();
  g.fillStyle = o.near || 'rgba(150,126,92,0.9)';
  const kind = o.silhouette || 'town';
  for (let i = 0; i < (o.count || 14); i++) {
    const x = r() * W;
    if (kind === 'town') { const w = 10 + r() * 30, h = 6 + r() * 14; g.fillRect(x, base - 8 - h, w, h + 8); if (r() < 0.3) { g.beginPath(); g.arc(x + w / 2, base - 8 - h, w / 3, Math.PI, 0); g.fill(); } }
    else if (kind === 'city') { const w = 14 + r() * 26, h = 20 + r() * 50; g.fillRect(x, base - h, w, h); if (o.lit) for (let k = 0; k < 10; k++) { g.fillStyle = r() < 0.5 ? 'rgba(255,210,120,0.8)' : 'rgba(120,200,255,0.6)'; g.fillRect(x + 2 + r() * (w - 4), base - h + 3 + r() * (h - 6), 2, 2); g.fillStyle = o.near; } }
    else if (kind === 'trees') { const h = 14 + r() * 28; g.fillRect(x + 4, base - h * 0.4, 3, h * 0.4); g.beginPath(); g.ellipse(x + 5, base - h * 0.55, 10 + r() * 10, h * 0.45, 0, 0, TAU); g.fill(); }
    else if (kind === 'cranes') { const h = 40 + r() * 40; g.fillRect(x, base - h, 4, h); g.fillRect(x - 30, base - h, 60, 4); g.fillRect(x + 22, base - h, 2, 20 + r() * 20); }
    else if (kind === 'stacks') { const h = 30 + r() * 50; g.fillRect(x, base - h, 8, h); g.fillRect(x - 10, base - 18, 30, 18); if (o.smoke) { g.fillStyle = 'rgba(80,70,70,0.3)'; g.beginPath(); g.ellipse(x + 4 + 10, base - h - 10, 18, 8, 0, 0, TAU); g.fill(); g.fillStyle = o.near; } }
    else if (kind === 'pines') { const h = 16 + r() * 30; g.beginPath(); g.moveTo(x, base); g.lineTo(x + 8, base - h); g.lineTo(x + 16, base); g.fill(); }
  }
  SKY.data = canvasU32(sc);
}
function shadeU32(src, mul, fogT, fr, fg, fb) {
  const out = new Uint32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    let r = (c & 255) * mul, g = ((c >> 8) & 255) * mul, b = ((c >> 16) & 255) * mul;
    r += (fr - r) * fogT; g += (fg - g) * fogT; b += (fb - b) * fogT;
    out[i] = (255 << 24) | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r);
  }
  return out;
}
let HAZE = [214, 198, 166], DARKFOG = [22, 18, 14], FOG_OUT = 0.55;
function buildTables(src, lights, indoorFromIdx) {
  const tabs = [];
  for (let li = 0; li < lights.length; li++) {
    const indoor = li >= indoorFromIdx;
    for (let f = 0; f < 16; f++) {
      const t = Math.pow(f / 15, 1.15) * (indoor ? 0.75 : FOG_OUT);
      const fc = indoor ? DARKFOG : HAZE;
      tabs.push(shadeU32(src, lights[li], t, fc[0], fc[1], fc[2]));
    }
  }
  return tabs;
}
const WALL_SH = [], WALL_VS = [];
let FLOOR_SH = [], CEIL_SH = [], CTOP_SH = [];
const SKY = { w: 1024, h: 160, data: null };
let TEX_KEY = '';
function buildTextures(T) {
  if (!T) T = MAP_DEFS[0].theme;
  if (TEX_KEY === T.id) return;
  TEX_KEY = T.id;
  HAZE = T.haze; DARKFOG = T.darkFog || [22, 18, 14]; FOG_OUT = T.fog || 0.55;
  const out = T.light || 1, ind = T.indoorLight || 0.6;
  const lights = [out, out * 0.8, ind, ind * 0.84];
  const wall1 = T.wall1, wall2 = T.wall2;
  const wallC = [];
  wallC[W_SAND] = texCanvas(wall1, 11);
  wallC[W_PLASTER] = texCanvas(wall2, 12);
  wallC[W_CRATES] = texCanvas(T.stack, 13);
  wallC[W_SIGNA] = texCanvas(P.sign('A', wall1, T.signCol), 14);
  wallC[W_SIGNB] = texCanvas(P.sign('B', wall1, T.signCol), 15);
  wallC[W_LOW] = texCanvas(T.crate, 16);
  for (const k of [W_SAND, W_PLASTER, W_CRATES, W_SIGNA, W_SIGNB, W_LOW]) WALL_SH[k] = buildTables(canvasU32(wallC[k]), lights, 2);
  WALL_VS[W_SAND] = T.wallVS || 64; WALL_VS[W_PLASTER] = 64 / 1.5; WALL_VS[W_CRATES] = T.stackVS || 64 * 2 / WALLH; WALL_VS[W_SIGNA] = 64 / WALLH; WALL_VS[W_SIGNB] = 64 / WALLH; WALL_VS[W_LOW] = 64 / CRATE_H;
  const floorC = [texCanvas(T.ground, 21), texCanvas(T.indoor, 22), texCanvas(T.site, 23), texCanvas(T.spawn || T.ground, 24)];
  FLOOR_SH = floorC.map(c => buildTables(canvasU32(c), [out, ind * 0.92], 1));
  CEIL_SH = buildTables(canvasU32(texCanvas(T.ceil, 31)), [ind * 0.92], 0);
  CTOP_SH = buildTables(canvasU32(texCanvas(T.crateTop, 32)), [out * 1.08], 1);
  paintSky(T.sky);
}

// ------------------------------------------------------------
//  Sprites (all drawn procedurally)
// ------------------------------------------------------------
function spriteFrom(c) { return { w: c.width, h: c.height, data: canvasU32(c) }; }
const SPR = {};
const TEAM_COL = {
  R: { head: '#2d2925', face: '#c99a72', top: '#8e6d44', topD: '#6b522f', vest: '#5e5136', pants: '#57482f', boots: '#231c15', gun: '#1b1b1b', acc: '#b8402c' },
  W: { head: '#262b33', face: '#d6aa8a', top: '#3a5276', topD: '#283a57', vest: '#2f3d4c', pants: '#2e3a4f', boots: '#141619', gun: '#141414', acc: '#8cc4ff' },
};
function drawSoldier(team, view, frame) {
  const c = makeCanvas(48, 96), g = c.getContext('2d'), C = TEAM_COL[team];
  const R = team === 'R';
  const rect = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  if (view === 2) { // side view facing right
    const s = frame ? 6 : 0;
    rect(C.pants, 19 - s / 2, 60, 8, 28); rect(C.boots, 18 - s / 2, 87, 11, 7);
    rect(C.topD, 22 + s / 2, 60, 8, 28); rect(C.boots, 22 + s / 2, 87, 12, 7);
    rect(C.top, 16, 30, 17, 31); rect(C.vest, 18, 33, 14, 20); rect(C.topD, 16, 30, 3, 31);
    rect(C.gear || '#2a2620', 16, 57, 17, 4);
    rect(C.gun, 14, 41, 34, 4); rect(C.gun, 30, 44, 4, 8); rect(C.gun, 12, 42, 6, 6);
    rect(C.top, 24, 38, 14, 6); rect(C.face, 36, 40, 4, 4);
    rect(C.head, 21, 23, 6, 6);
    g.fillStyle = C.head; g.beginPath(); g.arc(24, 17, 8, 0, TAU); g.fill();
    if (R) { rect(C.face, 26, 14, 6, 4); rect('#111', 29, 15, 2, 2); }
    else { rect('#1a1e24', 16, 9, 17, 6); rect('#9fd4ff', 27, 15, 6, 3); rect(C.face, 26, 19, 6, 4); }
    rect(C.acc, 22, 34, 4, 3);
  } else {
    const back = view === 1;
    const ls = frame ? 4 : 0;
    rect(C.pants, 14, 61, 8, 27 - ls); rect(C.boots, 13, 87 - ls, 10, 7);
    rect(C.pants, 26, 61, 8, 27); rect(C.boots, 25, 87, 10, 7);
    rect('rgba(0,0,0,0.2)', 30, 61, 4, 27);
    rect('#2a2620', 13, 57, 22, 5);
    rect(C.top, 12, 30, 24, 29);
    rect(back ? C.topD : C.vest, 14, 33, 20, 22);
    if (back) { rect('#3b3326', 15, 34, 18, 18); rect('rgba(255,255,255,0.08)', 15, 34, 18, 2); }
    rect('rgba(0,0,0,0.18)', 31, 30, 5, 29);
    // arms
    rect(C.top, 7, 31, 6, 15); rect(C.top, 35, 31, 6, 15);
    if (!back) {
      rect(C.top, 10, 44, 28, 6);
      rect(C.gun, 17, 39, 14, 12); g.fillStyle = '#000'; g.beginPath(); g.arc(24, 45, 3, 0, TAU); g.fill();
      rect('#3a3a3a', 18, 39, 12, 2);
      rect(R ? C.face : '#222', 13, 45, 5, 5); rect(R ? C.face : '#222', 30, 45, 5, 5);
    } else {
      rect(C.top, 8, 44, 6, 8); rect(C.top, 34, 44, 6, 8);
      rect(C.gun, 33, 20, 4, 16);
    }
    rect(C.acc, 7, 35, 6, 3);
    rect(C.head, 21, 24, 6, 6);
    g.fillStyle = C.head; g.beginPath(); g.arc(24, 17, 8.5, 0, TAU); g.fill();
    if (!back) {
      if (R) { rect(C.face, 17, 14, 14, 5); rect('#111', 19, 15, 3, 2); rect('#111', 26, 15, 3, 2); }
      else { rect('#1a1e24', 15, 8, 18, 6); rect('#9fd4ff', 17, 14, 14, 4); rect('rgba(255,255,255,0.5)', 18, 14, 4, 1); rect(C.face, 19, 19, 10, 5); }
    } else if (!R) rect('#1a1e24', 15, 8, 18, 7);
  }
  return c;
}
function drawDead(team) {
  const c = makeCanvas(96, 28), g = c.getContext('2d'), C = TEAM_COL[team];
  g.fillStyle = 'rgba(110,10,10,0.75)'; g.beginPath(); g.ellipse(40, 22, 34, 6, 0, 0, TAU); g.fill();
  g.fillStyle = C.pants; g.fillRect(54, 13, 34, 6); g.fillRect(54, 19, 32, 5);
  g.fillStyle = C.boots; g.fillRect(86, 12, 7, 7); g.fillRect(84, 19, 7, 6);
  g.fillStyle = C.top; g.fillRect(20, 10, 36, 14);
  g.fillStyle = C.vest; g.fillRect(24, 12, 26, 9);
  g.fillStyle = C.head; g.beginPath(); g.arc(13, 17, 7.5, 0, TAU); g.fill();
  g.fillStyle = C.gun; g.fillRect(24, 24, 30, 3);
  return c;
}
function radial(size, stops) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const s of stops) gr.addColorStop(s[0], s[1]);
  g.fillStyle = gr; g.fillRect(0, 0, size, size); return c;
}
function buildSprites() {
  for (const t of ['R', 'W']) {
    SPR[t] = [];
    for (let v = 0; v < 3; v++) { SPR[t][v] = []; for (let f = 0; f < 2; f++) SPR[t][v][f] = spriteFrom(drawSoldier(t, v, f)); }
    SPR['dead' + t] = spriteFrom(drawDead(t));
  }
  // muzzle flash star
  const mf = makeCanvas(32, 32), g = mf.getContext('2d');
  g.translate(16, 16); g.fillStyle = 'rgba(255,220,120,1)';
  g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i % 2 ? 5 : 15; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill();
  SPR.flash = spriteFrom(mf);
  SPR.puff = spriteFrom(radial(32, [[0, 'rgba(200,185,150,0.9)'], [0.5, 'rgba(180,165,130,0.5)'], [1, 'rgba(160,150,120,0)']]));
  SPR.spark = spriteFrom(radial(16, [[0, 'rgba(255,255,200,1)'], [0.4, 'rgba(255,190,80,0.9)'], [1, 'rgba(255,120,0,0)']]));
  SPR.blood = spriteFrom(radial(16, [[0, 'rgba(170,0,0,1)'], [0.6, 'rgba(120,0,0,0.7)'], [1, 'rgba(90,0,0,0)']]));
  SPR.fire = spriteFrom(radial(32, [[0, 'rgba(255,250,200,1)'], [0.3, 'rgba(255,190,60,0.95)'], [0.65, 'rgba(230,80,20,0.7)'], [1, 'rgba(120,20,0,0)']]));
  SPR.boom = spriteFrom(radial(64, [[0, 'rgba(255,255,220,1)'], [0.25, 'rgba(255,200,80,1)'], [0.6, 'rgba(230,90,20,0.8)'], [1, 'rgba(80,30,10,0)']]));
  SPR.smoke = spriteFrom(radial(64, [[0, 'rgba(210,210,205,0.95)'], [0.55, 'rgba(195,195,190,0.85)'], [0.85, 'rgba(180,180,175,0.4)'], [1, 'rgba(170,170,170,0)']]));
  // bomb
  for (const on of [0, 1]) {
    const c = makeCanvas(32, 16), b = c.getContext('2d');
    b.fillStyle = '#3d3a2c'; b.fillRect(2, 4, 28, 12); b.fillStyle = '#6b6650'; b.fillRect(2, 4, 28, 2);
    b.fillStyle = '#b8a77a'; b.fillRect(5, 7, 10, 6); b.fillStyle = '#222'; b.fillRect(18, 7, 9, 6);
    b.fillStyle = on ? '#ff2a2a' : '#5a1010'; b.fillRect(20, 8, 3, 3);
    b.strokeStyle = '#c33'; b.beginPath(); b.moveTo(4, 5); b.quadraticCurveTo(16, 0, 28, 5); b.stroke();
    SPR['bomb' + on] = spriteFrom(c);
  }
  // dropped gun
  const gc = makeCanvas(48, 14), gg = gc.getContext('2d');
  gg.fillStyle = '#1e1e1e'; gg.fillRect(2, 4, 40, 5); gg.fillRect(8, 8, 6, 6); gg.fillRect(22, 8, 4, 6); gg.fillRect(40, 5, 7, 2);
  gg.fillStyle = '#6a4626'; gg.fillRect(0, 3, 10, 6);
  SPR.gun = spriteFrom(gc);
  const nc = makeCanvas(12, 14), ng = nc.getContext('2d');
  ng.fillStyle = '#3f4a2e'; ng.beginPath(); ng.ellipse(6, 8, 5, 6, 0, 0, TAU); ng.fill(); ng.fillStyle = '#999'; ng.fillRect(4, 0, 4, 3);
  SPR.nade = spriteFrom(nc);
}
