'use strict';
// ============================================================
//  Weapons (original names; stats tuned to classic tactical-shooter feel)
//  spread values are radians.  rangeMod = damage multiplier per 5 units.
// ============================================================
const WEAPONS = {
  knife: { name: 'Combat Knife', slot: 3, type: 'knife', price: 0, dmg: 34, dmgAlt: 65, rate: 0.45, rateAlt: 1.0, range: 1.05, speed: 1.0, pen: 0.85 },
  p9: { name: 'P9 Compact', slot: 2, type: 'pistol', snd: 'pistol', price: 400, dmg: 25, rate: 0.15, mag: 20, reserve: 120, reload: 2.2, pen: 0.5, rangeMod: 0.75, speed: 1.0,
    spread: { base: 0.011, move: 0.045, perShot: 0.016, max: 0.06, recover: 0.12 }, kick: 0.011, kickMax: 0.06, side: 0.004 },
  k45: { name: 'K45 Tactical', slot: 2, type: 'pistol', snd: 'pistol', price: 500, dmg: 34, rate: 0.17, mag: 12, reserve: 100, reload: 2.6, pen: 0.5, rangeMod: 0.79, speed: 1.0,
    spread: { base: 0.009, move: 0.045, perShot: 0.018, max: 0.06, recover: 0.12 }, kick: 0.013, kickMax: 0.06, side: 0.004 },
  hawk: { name: 'Hawk .50', slot: 2, type: 'pistol', snd: 'hpistol', price: 650, dmg: 54, rate: 0.26, mag: 7, reserve: 35, reload: 2.2, pen: 0.93, rangeMod: 0.81, speed: 1.0,
    spread: { base: 0.008, move: 0.09, perShot: 0.05, max: 0.11, recover: 0.2 }, kick: 0.045, kickMax: 0.12, side: 0.01 },
  breacher: { name: 'Breacher-8', slot: 1, type: 'shotgun', snd: 'shotgun', price: 1700, dmg: 20, pellets: 9, rate: 0.88, mag: 8, reserve: 32, reload: 0.5, shell: true, pen: 0.5, rangeMod: 0.55, speed: 0.92,
    spread: { base: 0.06, move: 0.02, perShot: 0, max: 0, recover: 1 }, kick: 0.05, kickMax: 0.1, side: 0.01 },
  vespa: { name: 'Vespa SMG', slot: 1, type: 'smg', snd: 'smg', price: 1500, dmg: 26, rate: 0.08, auto: true, mag: 30, reserve: 120, reload: 2.6, pen: 0.5, rangeMod: 0.84, speed: 0.96,
    spread: { base: 0.011, move: 0.03, perShot: 0.006, max: 0.065, recover: 0.2 }, kick: 0.007, kickMax: 0.07, side: 0.004 },
  kestrel: { name: 'Kestrel PDW', slot: 1, type: 'smg', snd: 'smg', price: 2350, dmg: 21, rate: 0.066, auto: true, mag: 50, reserve: 100, reload: 3.3, pen: 0.69, rangeMod: 0.84, speed: 0.96,
    spread: { base: 0.012, move: 0.03, perShot: 0.005, max: 0.06, recover: 0.2 }, kick: 0.006, kickMax: 0.06, side: 0.004 },
  hyena: { name: 'Hyena Carbine', slot: 1, type: 'rifle', snd: 'rifle', team: 'R', price: 2000, dmg: 30, rate: 0.09, auto: true, mag: 35, reserve: 90, reload: 2.9, pen: 0.77, rangeMod: 0.98, speed: 0.87,
    spread: { base: 0.006, move: 0.09, perShot: 0.009, max: 0.09, recover: 0.22 }, kick: 0.011, kickMax: 0.11, side: 0.006, wood: '#a9773f' },
  gallant: { name: 'Gallant AR', slot: 1, type: 'rifle', snd: 'rifle', team: 'W', price: 2250, dmg: 30, rate: 0.09, auto: true, mag: 25, reserve: 90, reload: 3.0, pen: 0.7, rangeMod: 0.96, speed: 0.88,
    spread: { base: 0.006, move: 0.09, perShot: 0.009, max: 0.09, recover: 0.22 }, kick: 0.011, kickMax: 0.11, side: 0.006, wood: '#55595e' },
  avk: { name: 'AVK-7', slot: 1, type: 'rifle', snd: 'rifle', team: 'R', price: 2500, dmg: 36, rate: 0.1, auto: true, mag: 30, reserve: 90, reload: 2.5, pen: 0.775, rangeMod: 0.98, speed: 0.86,
    spread: { base: 0.005, move: 0.11, perShot: 0.011, max: 0.1, recover: 0.24 }, kick: 0.016, kickMax: 0.14, side: 0.008, wood: '#8a4b22' },
  mlance: { name: 'M-Lance', slot: 1, type: 'rifle', snd: 'rifle', team: 'W', price: 3100, dmg: 33, rate: 0.09, auto: true, mag: 30, reserve: 90, reload: 3.1, pen: 0.7, rangeMod: 0.97, speed: 0.9,
    spread: { base: 0.004, move: 0.1, perShot: 0.009, max: 0.085, recover: 0.24 }, kick: 0.013, kickMax: 0.12, side: 0.006, wood: '#2b2d30' },
  viper: { name: 'Viper Machine Pistol', slot: 2, type: 'pistol', snd: 'smg', price: 550, dmg: 22, rate: 0.065, auto: true, mag: 18, reserve: 90, reload: 2.4, pen: 0.47, rangeMod: 0.78, speed: 1.0,
    spread: { base: 0.02, move: 0.05, perShot: 0.012, max: 0.08, recover: 0.25 }, kick: 0.009, kickMax: 0.07, side: 0.007 },
  duke: { name: 'Duke Revolver', slot: 2, type: 'pistol', snd: 'hpistol', price: 700, dmg: 86, rate: 0.5, mag: 6, reserve: 24, reload: 2.3, pen: 0.93, rangeMod: 0.86, speed: 0.98,
    spread: { base: 0.006, move: 0.1, perShot: 0.06, max: 0.12, recover: 0.25 }, kick: 0.07, kickMax: 0.14, side: 0.01 },
  ratchet: { name: 'Ratchet SMG', slot: 1, type: 'smg', snd: 'smg', price: 1250, dmg: 20, rate: 0.06, auto: true, mag: 32, reserve: 120, reload: 2.3, pen: 0.5, rangeMod: 0.8, speed: 0.98,
    spread: { base: 0.014, move: 0.03, perShot: 0.006, max: 0.07, recover: 0.22 }, kick: 0.006, kickMax: 0.065, side: 0.005 },
  auto12: { name: 'Hailstorm Auto-12', slot: 1, type: 'shotgun', snd: 'shotgun', price: 3000, dmg: 22, pellets: 6, rate: 0.25, mag: 7, reserve: 32, reload: 0.45, shell: true, pen: 0.6, rangeMod: 0.6, speed: 0.9,
    spread: { base: 0.055, move: 0.02, perShot: 0.004, max: 0.02, recover: 0.5 }, kick: 0.04, kickMax: 0.1, side: 0.01 },
  bulwark: { name: 'Bulwark LMG', slot: 1, type: 'lmg', snd: 'rifle', price: 5200, dmg: 32, rate: 0.085, auto: true, mag: 100, reserve: 200, reload: 5.0, pen: 0.8, rangeMod: 0.97, speed: 0.78,
    spread: { base: 0.02, move: 0.12, perShot: 0.006, max: 0.1, recover: 0.15 }, kick: 0.009, kickMax: 0.1, side: 0.008, wood: '#3c3f36' },
  strix: { name: 'Strix Bullpup', slot: 1, type: 'rifle', snd: 'rifle', price: 3300, dmg: 32, rate: 0.09, auto: true, mag: 30, reserve: 90, reload: 3.3, pen: 0.9, rangeMod: 0.96, speed: 0.88,
    spread: { base: 0.004, scoped: 0.002, move: 0.1, perShot: 0.009, max: 0.085, recover: 0.24 }, kick: 0.012, kickMax: 0.11, side: 0.006, zoom: [55], wood: '#6b6f58' },
  ridgeline: { name: 'Ridgeline DMR', slot: 1, type: 'sniper', snd: 'sniper', price: 4200, dmg: 70, rate: 0.25, mag: 20, reserve: 90, reload: 3.0, pen: 0.9, rangeMod: 0.98, speed: 0.88,
    spread: { base: 0.035, scoped: 0.002, move: 0.11, perShot: 0.012, max: 0.05, recover: 0.3 }, kick: 0.03, kickMax: 0.1, side: 0.006, zoom: [40, 15], wood: '#2f3a44' },
  sparrow: { name: 'Sparrow Scout', slot: 1, type: 'sniper', snd: 'sniper', price: 2750, dmg: 75, rate: 1.25, mag: 10, reserve: 90, reload: 2.0, pen: 0.85, rangeMod: 0.98, speed: 1.0,
    spread: { base: 0.05, scoped: 0.0025, move: 0.1, perShot: 0, max: 0, recover: 1 }, kick: 0.03, kickMax: 0.06, side: 0.004, zoom: [40, 15], wood: '#3d4a33' },
  longshot: { name: 'Longshot .338', slot: 1, type: 'sniper', snd: 'sniper', price: 4750, dmg: 115, rate: 1.45, mag: 10, reserve: 30, reload: 2.9, pen: 0.97, rangeMod: 0.99, speed: 0.84,
    spread: { base: 0.13, scoped: 0.001, move: 0.25, perShot: 0, max: 0, recover: 1 }, kick: 0.05, kickMax: 0.08, side: 0.004, zoom: [40, 10], wood: '#4a5a3a' },
};
// Every gun can zoom: real scopes keep their levels (RMB cycles, wheel fine-tunes);
// everything else gets a hold-RMB aim zoom with a modest FOV change.
const ADS_FOV = { pistol: 74, smg: 70, rifle: 62, shotgun: 76, lmg: 66 };
for (const k in WEAPONS) {
  const d = WEAPONS[k]; d.key = k;
  if (d.type === 'knife') continue;
  if (d.zoom) d.scope = true; else { d.zoom = [ADS_FOV[d.type] || 70]; d.ads = true; }
}
const GEAR = {
  vest: { name: 'Kevlar Vest', price: 650 },
  vesthelm: { name: 'Kevlar + Helmet', price: 1000 },
  he: { name: 'HE Grenade', price: 300 },
  flash: { name: 'Flashbang', price: 200 },
  smoke: { name: 'Smoke Grenade', price: 300 },
  fire: { name: 'Incendiary', price: 500 },
  kit: { name: 'Defuse Kit', price: 200, team: 'W' },
};
const BUY_MENU = [
  { name: 'Pistols', items: ['p9', 'k45', 'viper', 'hawk', 'duke'] },
  { name: 'Heavy', items: ['breacher', 'auto12', 'bulwark'] },
  { name: 'SMGs', items: ['ratchet', 'vespa', 'kestrel'] },
  { name: 'Rifles', items: ['hyena', 'gallant', 'avk', 'mlance', 'strix'] },
  { name: 'Snipers', items: ['sparrow', 'ridgeline', 'longshot'] },
  { name: 'Gear', items: ['vest', 'vesthelm', 'he', 'flash', 'smoke', 'fire', 'kit'] },
];

// ============================================================
//  First-person viewmodel painter (pure canvas paths)
//  coordinate space: origin bottom-centre of screen, 720 units tall
// ============================================================
const VM_SPEC = {
  rifle: { N: [500, 120], F: [110, -240], taper: 0.42, body: '#262626', mag: 'curve', wf: 1.55 },
  smg: { N: [450, 100], F: [170, -200], taper: 0.5, body: '#2a2a2c', mag: 'straight', wf: 1.55 },
  shotgun: { N: [510, 120], F: [100, -230], taper: 0.42, body: '#2b2b2b', mag: 'tube', wf: 1.55 },
  sniper: { N: [520, 130], F: [80, -250], taper: 0.4, body: '#2d3326', mag: 'box', scope: true, wf: 1.5 },
  pistol: { N: [330, 70], F: [160, -175], taper: 0.6, body: '#222', mag: 'pistol', wf: 1.45 },
  lmg: { N: [520, 130], F: [120, -225], taper: 0.45, body: '#2b2d28', mag: 'drum', wf: 1.7 },
};
function vmFrame(spec) {
  const nx = spec.N[0], ny = spec.N[1], ax = spec.F[0] - nx, ay = spec.F[1] - ny, L = Math.hypot(ax, ay);
  const ux = ax / L, uy = ay / L, px = -uy, py = ux; // perpendicular (gun "up")
  const wf = spec.wf || 1; const P = (u, v) => { const k = lerp(1, spec.taper, u) * wf; return [nx + ax * u + px * v * k, ny + ay * u + py * v * k]; };
  return P;
}
function vmQuad(g, P, u0, u1, v0, v1, col) {
  const a = P(u0, v0), b = P(u1, v0), c = P(u1, v1), d = P(u0, v1);
  g.fillStyle = col; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
}
function vmPoly(g, P, pts, col) { g.fillStyle = col; g.beginPath(); pts.forEach((q, i) => { const p = P(q[0], q[1]); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); g.closePath(); g.fill(); }
function vmArm(g, from, to, w, sleeve, glove, cuff) {
  const dx = to[0] - from[0], dy = to[1] - from[1], L = Math.hypot(dx, dy), nx = -dy / L * w, ny = dx / L * w;
  g.fillStyle = sleeve; g.beginPath();
  g.moveTo(from[0] + nx, from[1] + ny); g.lineTo(to[0] + nx * 0.7, to[1] + ny * 0.7); g.lineTo(to[0] - nx * 0.7, to[1] - ny * 0.7); g.lineTo(from[0] - nx, from[1] - ny); g.fill();
  g.fillStyle = cuff; g.beginPath(); g.ellipse(to[0] - dx / L * 6, to[1] - dy / L * 6, w * 0.75, w * 0.45, Math.atan2(dy, dx) + Math.PI / 2, 0, TAU); g.fill();
  g.fillStyle = glove; g.beginPath(); g.ellipse(to[0] + dx / L * 8, to[1] + dy / L * 8, w * 0.62, w * 0.5, Math.atan2(dy, dx), 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.ellipse(to[0] + dx / L * 4, to[1] + dy / L * 4 - w * 0.15, w * 0.35, w * 0.2, Math.atan2(dy, dx), 0, TAU); g.fill();
}
function drawViewmodel(g, SW, SH, p, opt) {
  const w = curWeaponDef(p);
  const s = SH / 720;
  const team = TEAM_COL[p.team];
  const sleeve = team.top, glove = p.team === 'R' ? '#3a3025' : '#1c1f24', cuff = team.topD;
  g.save();
  let ox = opt.bobX, oy = opt.bobY + opt.lower * SH;
  g.translate(SW / 2 + ox, SH + oy); g.scale(s, s);
  if (opt.ads > 0 && w && w.ads) { const tx = { pistol: -190, smg: -250, rifle: -290, shotgun: -290, lmg: -310 }[w.type] || -270; g.translate(tx * opt.ads, -30 * opt.ads); }
  if (opt.kick) { g.translate(opt.kick * 6, opt.kick * 18 * (1 - 0.5 * (opt.ads || 0))); g.rotate(-opt.kick * 0.03); }
  const slot = p.cur;
  if (slot === 3) { drawKnifeVM(g, opt, sleeve, glove, cuff); g.restore(); return; }
  if (slot === 4) { drawNadeVM(g, p, opt, sleeve, glove, cuff); g.restore(); return; }
  if (slot === 5) { drawBombVM(g, opt, sleeve, glove, cuff); g.restore(); return; }
  if (!w) { g.restore(); return; }
  const spec = VM_SPEC[w.type] || VM_SPEC.rifle;
  const P = vmFrame(spec);
  const body = spec.body, light = 'rgba(255,255,255,0.12)', furn = w.wood || '#3a3a3a';
  if (w.type === 'pistol') {
    const big = p.slots[2] && (p.slots[2].key === 'hawk' || p.slots[2].key === 'duke');
    vmArm(g, [380, 140], P(0.12, -40), 46, sleeve, glove, cuff);
    vmArm(g, [-60, 160], P(0.18, -30), 44, sleeve, glove, cuff);
    vmQuad(g, P, 0.05, 0.3, -70, -10, '#1a1a1a');
    vmQuad(g, P, 0, 1, -10, big ? 26 : 20, big ? '#8c8f93' : body);
    vmQuad(g, P, 0, 1, (big ? 22 : 16), (big ? 26 : 20), light);
    vmQuad(g, P, 0.95, 1, -4, 6, '#000');
    vmQuad(g, P, 0.85, 0.9, 20, 28, '#111');
  } else {
    // stock / receiver
    vmQuad(g, P, -0.15, 0.08, -34, 18, furn);
    vmQuad(g, P, 0.05, 0.5, -24, 22, body);
    vmQuad(g, P, 0.05, 0.5, 16, 22, light);
    // handguard
    if (w.type === 'shotgun') { vmQuad(g, P, 0.5, 0.72, -28, 2, furn); vmQuad(g, P, 0.45, 1.0, 2, 14, body); vmQuad(g, P, 0.45, 0.95, -10, 2, '#1d1d1d'); }
    else { vmQuad(g, P, 0.48, 0.82, -18, 16, w.type === 'rifle' ? furn : body); vmQuad(g, P, 0.48, 0.82, 12, 16, light); vmQuad(g, P, 0.82, 1.0, -6, 6, '#151515'); }
    vmQuad(g, P, 0.97, 1.0, -8, 8, '#0a0a0a');
    // magazine
    if (spec.mag === 'curve') vmPoly(g, P, [[0.36, -24], [0.47, -24], [0.5, -80], [0.42, -95]], '#1f1f1f');
    else if (spec.mag === 'straight') vmQuad(g, P, 0.38, 0.46, -24, -80, '#1f1f1f');
    else if (spec.mag === 'box') vmQuad(g, P, 0.3, 0.38, -24, -50, '#1f1f1f');
    else if (spec.mag === 'drum') { const c = P(0.36, -52); g.fillStyle = '#1b1c18'; g.beginPath(); g.ellipse(c[0], c[1], 46, 40, -0.6, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.1)'; g.beginPath(); g.ellipse(c[0] - 8, c[1] - 8, 26, 20, -0.6, 0, TAU); g.fill(); }
    // sights / scope
    if (spec.scope || (w.zoom && w.type !== 'sniper')) { vmQuad(g, P, 0.15, 0.55, 26, 50, '#161616'); vmQuad(g, P, 0.15, 0.55, 44, 50, light); vmQuad(g, P, 0.12, 0.17, 22, 54, '#0d0d0d'); vmQuad(g, P, 0.53, 0.58, 22, 54, '#0d0d0d'); }
    else { vmQuad(g, P, 0.12, 0.22, 22, 32, '#151515'); vmQuad(g, P, 0.92, 0.95, 6, 20, '#151515'); }
    // grip + hands
    vmArm(g, [620, 220], P(0.12, -40), 58, sleeve, glove, cuff);
    const lh = w.type === 'shotgun' ? 0.6 : 0.64;
    vmArm(g, [-120, 240], P(lh, -24), 52, sleeve, glove, cuff);
  }
  if (opt.flash > 0) {
    const m = P(1.06, 0);
    g.save(); g.translate(m[0], m[1]); g.rotate(Math.random() * TAU);
    const r = 34 + Math.random() * 26;
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r * 1.6); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.3, 'rgba(255,200,90,0.9)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = gr; g.beginPath();
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, rr = i % 2 ? r * 0.4 : r * 1.5; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.fill(); g.restore();
  }
  g.restore();
}
function drawKnifeVM(g, opt, sleeve, glove, cuff) {
  const sw = opt.swing || 0; // 0..1
  g.save();
  g.translate(300 - sw * 260, -80 - Math.sin(sw * Math.PI) * 120); g.rotate(-0.5 - sw * 0.9);
  g.fillStyle = '#1b1b1b'; g.fillRect(-14, -10, 28, 70);
  g.fillStyle = '#c9ced3'; g.beginPath(); g.moveTo(-12, -10); g.lineTo(12, -10); g.lineTo(6, -150); g.lineTo(-12, -120); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.moveTo(-2, -14); g.lineTo(6, -14); g.lineTo(4, -140); g.closePath(); g.fill();
  g.fillStyle = '#333'; g.fillRect(-20, -14, 40, 8);
  g.restore();
  vmArm(g, [520, 180], [300 - sw * 260, -60 - Math.sin(sw * Math.PI) * 110], 50, sleeve, glove, cuff);
}
function drawNadeVM(g, p, opt, sleeve, glove, cuff) {
  const t = opt.throwT || 0;
  const x = 280 - t * 200, y = -150 - t * 200;
  const sel = p.nadeSel;
  if (t < 0.6) {
    g.fillStyle = sel === 'he' ? '#3f4a2e' : sel === 'flash' ? '#5a6068' : sel === 'fire' ? '#7a2a1c' : '#4a4f55';
    if (sel === 'he') { g.beginPath(); g.ellipse(x, y, 34, 40, 0, 0, TAU); g.fill(); }
    else { g.fillRect(x - 26, y - 48, 52, 92); g.fillStyle = sel === 'flash' ? '#c9c9c9' : sel === 'fire' ? '#e8a030' : '#7a8a7a'; g.fillRect(x - 26, y - 20, 52, 14); }
    g.fillStyle = '#999'; g.fillRect(x - 10, y - 62, 20, 16); g.fillStyle = '#777'; g.fillRect(x + 8, y - 60, 30, 8);
  }
  vmArm(g, [520, 200], [x + 10, y + 20], 50, sleeve, glove, cuff);
}
function drawBombVM(g, opt, sleeve, glove, cuff) {
  g.save(); g.translate(120, -150); g.rotate(-0.08);
  g.fillStyle = '#3d3a2c'; g.fillRect(-120, -60, 240, 120);
  g.fillStyle = '#5a5545'; g.fillRect(-120, -60, 240, 12);
  g.fillStyle = '#b8a77a'; g.fillRect(-100, -38, 90, 80);
  g.fillStyle = '#132313'; g.fillRect(10, -38, 90, 34); g.fillStyle = '#3f3'; g.font = 'bold 22px monospace'; g.fillText(opt.planting ? '* * * *' : '- - - -', 16, -14);
  g.fillStyle = '#222'; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g.fillRect(16 + i * 28, 6 + j * 16, 22, 12);
  g.strokeStyle = '#c33'; g.lineWidth = 5; g.beginPath(); g.moveTo(-110, -50); g.bezierCurveTo(-40, -100, 40, -100, 110, -50); g.stroke();
  g.restore();
  vmArm(g, [560, 200], [250, -120], 50, sleeve, glove, cuff);
  vmArm(g, [-300, 200], [-10, -110], 50, sleeve, glove, cuff);
}
