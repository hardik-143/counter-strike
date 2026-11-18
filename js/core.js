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
//  MAP "Sandline"  (original layout: 2 bomb sites, 3 lanes)
//  # sandstone  = plaster  X crate stack  C low crate (cover)
//  . sand  t indoor tunnel  a site A  b site B  T raider spawn  K warden spawn
// ------------------------------------------------------------
const MAP_SRC = [
  '########################################',
  '#bbbbbbbbbbb###KKKKKKKKKK###aaaaaaaaaaa#',
  '#bbXbbbbbbbb###KKKKKKKKKK###aaaaaaaXXaa#',
  '#bbXCbbbbbbb...KKKKKKKKKK...aaaaaaaXXaa#',
  '#bbbbbbbbbbb...KKKKKKKKKK...aaaCaaaaaaa#',
  '#bbbbbbXXbbb###KKKKKKKKKK###aaaCaaaaaaa#',
  '#bbCbbbXXbbb###KKKKKKKKKK###aaaaaaaaCaa#',
  '#bbbbbbbbbbb######....######aaaaaaaaCaa#',
  '#bbbbbCbbbbb######....######aaXaaaaaaaa#',
  '#bbbbbbbbbbb######....######aaaaaaaaaaa#',
  '#=tttt======######....########..###....#',
  '#=tttt======######....########..###....#',
  '#=tttt======######..............###....#',
  '#=tttt======######..............###.C..#',
  '#=tttt======######...C#############....#',
  '#=tttt============....#############....#',
  '#=tttttttttttttttt....#############....#',
  '#=tttttttttttttttt....#############....#',
  '#=tttt============....#############.C..#',
  '#=tttt============....#############....#',
  '#=tttt============....#############....#',
  '#=tttt============##..#############....#',
  '#=tttt============....#############....#',
  '#=tttt============..###############C...#',
  '#=tttt============....#############....#',
  '#=tttt============....#############....#',
  '#=tttt============....#############....#',
  '#=ttttttttttTTTTTTTTTTTTTTTTT..........#',
  '#=ttttttttttTTTTTTTTTTTTTTTTT..........#',
  '#===========TTTTTTTTTTTTTTTTT###########',
  '#===========TTTTTTTTTTTTTTTTT###########',
  '#===========TTTTTTTTTTTTTTTTT###########',
  '#===========TTTTTTTTTTTTTTTTT###########',
  '########################################',
];
const MH = MAP_SRC.length, MW = MAP_SRC[0].length;
const W_SAND = 1, W_PLASTER = 2, W_CRATES = 3, W_SIGNA = 4, W_SIGNB = 5, W_LOW = 6;
const F_SAND = 0, F_TILE = 1, F_PAVE = 2, F_SPAWN = 3;
const FL_IN = 1, FL_A = 2, FL_B = 4, FL_TS = 8, FL_CS = 16;
const mapWall = new Uint8Array(MW * MH), mapFloor = new Uint8Array(MW * MH), mapFlags = new Uint8Array(MW * MH);
const SITES = { A: { cells: [], cx: 0, cy: 0 }, B: { cells: [], cx: 0, cy: 0 } };
const SPAWNS = { R: [], W: [] };

(function parseMap() {
  for (let y = 0; y < MH; y++) {
    const row = MAP_SRC[y];
    if (row.length !== MW) console.warn('map row', y, 'len', row.length);
    for (let x = 0; x < MW; x++) {
      const ch = row[x], i = y * MW + x;
      switch (ch) {
        case '#': mapWall[i] = W_SAND; break;
        case '=': mapWall[i] = W_PLASTER; break;
        case 'X': mapWall[i] = W_CRATES; break;
        case 'C': mapWall[i] = W_LOW; mapFloor[i] = F_PAVE; break;
        case 't': mapFloor[i] = F_TILE; mapFlags[i] = FL_IN; break;
        case 'a': mapFloor[i] = F_PAVE; mapFlags[i] = FL_A; SITES.A.cells.push([x, y]); break;
        case 'b': mapFloor[i] = F_PAVE; mapFlags[i] = FL_B; SITES.B.cells.push([x, y]); break;
        case 'T': mapFloor[i] = F_SPAWN; mapFlags[i] = FL_TS; SPAWNS.R.push([x, y]); break;
        case 'K': mapFloor[i] = F_SPAWN; mapFlags[i] = FL_CS; SPAWNS.W.push([x, y]); break;
        default: mapFloor[i] = F_SAND;
      }
    }
  }
  // painted site signs
  const sign = (x, y, w) => { mapWall[y * MW + x] = w; };
  sign(33, 0, W_SIGNA); sign(34, 11, W_SIGNA); sign(29, 11, W_SIGNA); sign(26, 2, W_SIGNA);
  sign(6, 0, W_SIGNB); sign(1, 12, W_SIGNB); sign(13, 2, W_SIGNB);
  for (const k of ['A', 'B']) {
    const s = SITES[k]; let sx = 0, sy = 0;
    for (const c of s.cells) { sx += c[0] + 0.5; sy += c[1] + 0.5; }
    s.cx = sx / s.cells.length; s.cy = sy / s.cells.length;
  }
})();

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

function paintSandstone(g, w, h, r) {
  g.fillStyle = '#8c6d44'; g.fillRect(0, 0, w, h);
  for (let row = 0; row < 4; row++) {
    const off = (row % 2) * 16;
    for (let col = -1; col < 3; col++) {
      const x = col * 32 + off, y = row * 16, v = (r() * 34 - 17) | 0;
      g.fillStyle = `rgb(${203 + v},${168 + v},${112 + v})`; g.fillRect(x + 1, y + 1, 30, 14);
      g.fillStyle = 'rgba(255,240,205,0.28)'; g.fillRect(x + 1, y + 1, 30, 2);
      g.fillStyle = 'rgba(70,45,15,0.22)'; g.fillRect(x + 1, y + 12, 30, 3);
    }
  }
  addNoise(g, w, h, 30, r);
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(90,60,25,${0.15 + r() * 0.25})`; g.fillRect(r() * 64 | 0, r() * 64 | 0, 1 + r() * 3 | 0, 1 + r() * 2 | 0); }
}
function paintPlaster(g, w, h, r) {
  g.fillStyle = '#b9a17b'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,245,220' : '90,70,45'},${r() * 0.12})`; g.fillRect(r() * 64 | 0, 0, 1 + r() * 4 | 0, 64); }
  const gr = g.createLinearGradient(0, 40, 0, 64); gr.addColorStop(0, 'rgba(60,40,20,0)'); gr.addColorStop(1, 'rgba(60,40,20,0.45)');
  g.fillStyle = gr; g.fillRect(0, 40, 64, 24);
  g.strokeStyle = 'rgba(70,50,30,0.6)'; g.lineWidth = 1; g.beginPath();
  let x = 10 + r() * 40, y = 5; g.moveTo(x, y); for (let i = 0; i < 6; i++) { x += r() * 8 - 4; y += 3 + r() * 5; g.lineTo(x, y); } g.stroke();
  addNoise(g, w, h, 22, r);
}
function paintCrate(g, w, h, r) {
  g.fillStyle = '#9b6b36'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) { const v = (r() * 24 - 12) | 0; g.fillStyle = `rgb(${150 + v},${104 + v},${54 + v})`; g.fillRect(i * 16 + 1, 0, 14, 64); g.fillStyle = 'rgba(40,25,10,0.5)'; g.fillRect(i * 16, 0, 1, 64); }
  g.fillStyle = '#6a4520'; g.fillRect(0, 0, 64, 7); g.fillRect(0, 57, 64, 7); g.fillRect(0, 0, 7, 64); g.fillRect(57, 0, 7, 64);
  g.save(); g.translate(32, 32); g.rotate(Math.PI / 4); g.fillRect(-42, -4, 84, 8); g.restore();
  g.fillStyle = 'rgba(255,220,160,0.2)'; g.fillRect(0, 0, 64, 2); g.fillRect(0, 0, 2, 64);
  g.fillStyle = '#2a2a2a'; for (const p of [[3, 3], [60, 3], [3, 60], [60, 60]]) g.fillRect(p[0] - 1, p[1] - 1, 2, 2);
  addNoise(g, w, h, 22, r);
}
function paintCrateTop(g, w, h, r) {
  g.fillStyle = '#a77540'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) { const v = (r() * 24 - 12) | 0; g.fillStyle = `rgb(${165 + v},${118 + v},${64 + v})`; g.fillRect(1, i * 16 + 1, 62, 14); }
  g.fillStyle = '#6a4520'; g.fillRect(0, 0, 64, 5); g.fillRect(0, 59, 64, 5); g.fillRect(0, 0, 5, 64); g.fillRect(59, 0, 5, 64);
  addNoise(g, w, h, 20, r);
}
function paintSign(letter) {
  return (g, w, h, r) => {
    paintSandstone(g, w, h, r);
    g.fillStyle = 'rgba(160,25,20,0.9)'; g.font = 'bold 46px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(letter, 32, 34);
    g.strokeStyle = 'rgba(160,25,20,0.8)'; g.lineWidth = 3; g.strokeRect(9, 9, 46, 48);
    addNoise(g, w, h, 18, r);
  };
}
function paintSand(base) {
  return (g, w, h, r) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { g.strokeStyle = `rgba(120,90,50,${0.08 + r() * 0.08})`; g.lineWidth = 2; g.beginPath(); const y = r() * 64; g.moveTo(0, y); g.bezierCurveTo(20, y + 6, 40, y - 6, 64, y); g.stroke(); }
    addNoise(g, w, h, 34, r);
    for (let i = 0; i < 25; i++) { g.fillStyle = `rgba(80,60,35,${r() * 0.35})`; g.fillRect(r() * 64 | 0, r() * 64 | 0, 1, 1); }
  };
}
function paintTile(g, w, h, r) {
  g.fillStyle = '#4e4336'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = (r() * 20 - 10) | 0, dk = (x + y) % 2 ? 0 : 14; g.fillStyle = `rgb(${128 + v - dk},${110 + v - dk},${88 + v - dk})`; g.fillRect(x * 16 + 1, y * 16 + 1, 14, 14); }
  addNoise(g, w, h, 18, r);
}
function paintPave(g, w, h, r) {
  g.fillStyle = '#7d6a4f'; g.fillRect(0, 0, w, h);
  for (let row = 0; row < 4; row++) { const off = (row % 2) * 12; for (let c = -1; c < 3; c++) { const v = (r() * 26 - 13) | 0; g.fillStyle = `rgb(${178 + v},${156 + v},${120 + v})`; g.fillRect(c * 26 + off + 1, row * 16 + 1, 24, 14); } }
  addNoise(g, w, h, 22, r);
}
function paintCeil(g, w, h, r) {
  g.fillStyle = '#3e2f22'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) { const v = (r() * 14) | 0; g.fillStyle = `rgb(${92 + v},${70 + v},${48 + v})`; g.fillRect(0, i * 16 + 2, 64, 11); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, i * 16 + 12, 64, 2); }
  addNoise(g, w, h, 16, r);
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
const HAZE = [214, 198, 166], DARKFOG = [22, 18, 14];
function buildTables(src, lights, indoorFromIdx) {
  const tabs = [];
  for (let li = 0; li < lights.length; li++) {
    const indoor = li >= indoorFromIdx;
    for (let f = 0; f < 16; f++) {
      const t = Math.pow(f / 15, 1.15) * (indoor ? 0.75 : 0.55);
      const fc = indoor ? DARKFOG : HAZE;
      tabs.push(shadeU32(src, lights[li], t, fc[0], fc[1], fc[2]));
    }
  }
  return tabs;
}

const WALL_SH = [], WALL_VS = [];
let FLOOR_SH = [], CEIL_SH = [], CTOP_SH = [];
const SKY = { w: 1024, h: 160, data: null };

function buildTextures() {
  const wallC = [];
  wallC[W_SAND] = texCanvas(paintSandstone, 11);
  wallC[W_PLASTER] = texCanvas(paintPlaster, 12);
  wallC[W_CRATES] = texCanvas(paintCrate, 13);
  wallC[W_SIGNA] = texCanvas(paintSign('A'), 14);
  wallC[W_SIGNB] = texCanvas(paintSign('B'), 15);
  wallC[W_LOW] = texCanvas(paintCrate, 16);
  const lights = [1.0, 0.8, 0.6, 0.5];
  for (const k of [W_SAND, W_PLASTER, W_CRATES, W_SIGNA, W_SIGNB, W_LOW]) WALL_SH[k] = buildTables(canvasU32(wallC[k]), lights, 2);
  WALL_VS[W_SAND] = 64; WALL_VS[W_PLASTER] = 64 / 1.5 * 1.0; WALL_VS[W_CRATES] = 64 * 2 / WALLH; WALL_VS[W_SIGNA] = 64 / WALLH; WALL_VS[W_SIGNB] = 64 / WALLH; WALL_VS[W_LOW] = 64 / CRATE_H;
  const floorC = [texCanvas(paintSand('#c6a46d'), 21), texCanvas(paintTile, 22), texCanvas(paintPave, 23), texCanvas(paintSand('#bd9d68'), 24)];
  FLOOR_SH = floorC.map(c => buildTables(canvasU32(c), [1.0, 0.55], 1));
  CEIL_SH = buildTables(canvasU32(texCanvas(paintCeil, 31)), [0.55], 0);
  CTOP_SH = buildTables(canvasU32(texCanvas(paintCrateTop, 32)), [1.08], 1);
  // sky panorama
  const sc = makeCanvas(SKY.w, SKY.h), g = sc.getContext('2d'), r = mulberry32(77);
  const gr = g.createLinearGradient(0, 0, 0, SKY.h);
  gr.addColorStop(0, '#5b8fcf'); gr.addColorStop(0.55, '#9cc0e3'); gr.addColorStop(0.85, '#e6d8bb'); gr.addColorStop(1, '#efe0c2');
  g.fillStyle = gr; g.fillRect(0, 0, SKY.w, SKY.h);
  const sun = g.createRadialGradient(300, 70, 2, 300, 70, 60); sun.addColorStop(0, 'rgba(255,255,240,1)'); sun.addColorStop(0.15, 'rgba(255,250,220,0.9)'); sun.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = sun; g.fillRect(200, 0, 200, 160);
  for (let i = 0; i < 26; i++) { const x = r() * SKY.w, y = 15 + r() * 70, w = 60 + r() * 140; g.fillStyle = `rgba(255,255,255,${0.12 + r() * 0.2})`; g.beginPath(); g.ellipse(x, y, w, 6 + r() * 8, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(x + SKY.w, y, w, 7, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(x - SKY.w, y, w, 7, 0, 0, TAU); g.fill(); }
  // distant dunes / town silhouettes
  g.fillStyle = 'rgba(176,150,112,0.85)';
  g.beginPath(); g.moveTo(0, SKY.h);
  for (let x = 0; x <= SKY.w; x += 8) g.lineTo(x, SKY.h - 10 - 8 * Math.sin(x / 90) - 5 * Math.sin(x / 23 + 1));
  g.lineTo(SKY.w, SKY.h); g.fill();
  g.fillStyle = 'rgba(150,126,92,0.9)';
  for (let i = 0; i < 14; i++) { const x = r() * SKY.w, w = 10 + r() * 30, h = 6 + r() * 14; g.fillRect(x, SKY.h - 8 - h, w, h + 8); if (r() < 0.3) { g.beginPath(); g.arc(x + w / 2, SKY.h - 8 - h, w / 3, Math.PI, 0); g.fill(); } }
  SKY.data = canvasU32(sc);
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
