'use strict';
// ============================================================
//  Front-end menu: tabs, map cards with engine-rendered previews,
//  overhead layouts, segmented setup controls and the Armory.
// ============================================================
const MENU = (() => {
  const $ = (id) => document.getElementById(id);
  const shots = {};          // map id -> dataURL of an in-engine screenshot
  let hooks = { onSetting() { }, previewMap() { } };
  const DIFF_HINT = {
    easy: 'Slow reactions, loose aim. Good for learning the maps.',
    normal: 'Fair fights. Bots trade, rotate and use utility.',
    hard: 'Quick reactions and tighter aim. Punishes wide peeks.',
    expert: 'Near-instant reactions, frequent headshots.',
  };
  const SIDE_NAME = { R: 'Raiders', W: 'Wardens', auto: 'Auto side' };

  // ---------------- map facts from the raw grid ----------------
  function mapFacts(def) {
    const g = def.grid, H = g.length, W = g[0].length;
    let floor = 0, indoor = 0, cover = 0, aIn = false, bIn = false;
    for (const row of g) for (const ch of row) {
      if ('.tapbqTK'.includes(ch)) floor++;
      if ('tpq'.includes(ch)) indoor++;
      if (ch === 'C' || ch === 'X') cover++;
      if (ch === 'p') aIn = true; if (ch === 'q') bIn = true;
    }
    return { W, H, indoor: Math.round(indoor / floor * 100), cover, aIn, bIn };
  }
  function drawOverview(cv, def) {
    const g = def.grid, H = g.length, W = g[0].length, c = cv.getContext('2d');
    const s = Math.min(cv.width / W, cv.height / H), ox = (cv.width - W * s) / 2, oy = (cv.height - H * s) / 2;
    c.clearRect(0, 0, cv.width, cv.height);
    const col = { '.': '#6a604f', t: '#4a443b', a: '#b0503c', b: '#b0503c', p: '#93402f', q: '#93402f', T: '#b9823c', K: '#4473b4', C: '#7a5a34', X: '#2a2e35' };
    const sites = { A: [0, 0, 0], B: [0, 0, 0] };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = g[y][x], k = col[ch];
      if (k) { c.fillStyle = k; c.fillRect(ox + x * s, oy + y * s, s + 0.6, s + 0.6); }
      if (ch === 'a' || ch === 'p') { sites.A[0] += x; sites.A[1] += y; sites.A[2]++; }
      if (ch === 'b' || ch === 'q') { sites.B[0] += x; sites.B[1] += y; sites.B[2]++; }
    }
    c.font = `bold ${Math.round(s * 3.4)}px Rajdhani, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const k of ['A', 'B']) { const q = sites[k]; if (!q[2]) continue; c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillText(k, ox + (q[0] / q[2] + 0.5) * s + 1, oy + (q[1] / q[2] + 0.5) * s + 1); c.fillStyle = '#ffe9d2'; c.fillText(k, ox + (q[0] / q[2] + 0.5) * s, oy + (q[1] / q[2] + 0.5) * s); }
  }

  // ---------------- in-engine screenshots ----------------
  function shootCurrentMap() {
    const site = SITES.A, ent = (ENTRY_LOOK.A && ENTRY_LOOK.A[0]) || SPAWNS.wc;
    let dx = ent[0] - site.cx, dy = ent[1] - site.cy; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    let pos = snapWalk(ent[0] + dx * 1.6, ent[1] + dy * 1.6);
    if (!walkLine(pos[0], pos[1], ent[0], ent[1], 0.05)) pos = snapWalk(ent[0], ent[1]);
    const cam = { x: pos[0], y: pos[1], z: STAND_EYE, yaw: Math.atan2(site.cy - pos[1], site.cx - pos[0]), pitch: 0.03, fov: 1.55 };
    return renderToCanvas(cam, 400, 225).toDataURL('image/jpeg', 0.86);
  }
  function buildShots(done) {
    const keep = G.settings.map;
    const ids = MAP_DEFS.map(m => m.id);
    let i = 0;
    const next = () => {
      if (i >= ids.length) { hooks.previewMap(keep === 'random' ? MAP_DEFS[0].id : keep); done && done(); return; }
      const id = ids[i++];
      try { loadMap(id); shots[id] = shootCurrentMap(); } catch (e) { console.error('preview', id, e); }
      paintShot(id);
      setTimeout(next, 16);
    };
    setTimeout(next, 30);
  }
  function paintShot(id) {
    document.querySelectorAll(`img[data-shot="${id}"]`).forEach(img => { img.src = shots[id]; img.parentElement.classList.add('ready'); });
    if (G.settings.map === id) $('md-img').src = shots[id];
  }

  // ---------------- map cards ----------------
  function cardHTML(def, compact) {
    if (def === 'random') return `<button class="map-card random" data-id="random"><div class="mc-img ready"><div class="dice">?</div></div><div class="mc-body"><b>Random map</b>${compact ? '' : '<small>Surprise me each match</small>'}</div></button>`;
    const f = mapFacts(def);
    const tags = compact ? '' : `<div class="tags"><span>${f.W}×${f.H}</span><span>${f.indoor}% indoor</span><span>A ${f.aIn ? 'inside' : 'open'} · B ${f.bIn ? 'inside' : 'open'}</span></div>`;
    return `<button class="map-card" data-id="${def.id}"><div class="mc-img${shots[def.id] ? ' ready' : ''}"><img data-shot="${def.id}" alt="${def.name} preview" ${shots[def.id] ? `src="${shots[def.id]}"` : ''}><span class="shimmer"></span></div><div class="mc-body"><b>${def.name}</b>${compact ? '' : `<small>${def.blurb.split(' · ')[0]}</small>`}${tags}</div></button>`;
  }
  function renderMapCards() {
    const el = $('map-cards');
    el.innerHTML = MAP_DEFS.map(d => cardHTML(d)).join('') + cardHTML('random');
    el.querySelectorAll('.map-card').forEach(b => b.onclick = () => pickMap(b.dataset.id));
    markMap();
  }
  function pickMap(id) {
    G.settings.map = id; saveSettings();
    if (id !== 'random') hooks.previewMap(id);
    markMap(); summary();
  }
  function markMap() {
    const id = G.settings.map;
    document.querySelectorAll('#map-cards .map-card').forEach(b => b.classList.toggle('sel', b.dataset.id === id));
    const def = MAP_DEFS.find(m => m.id === id);
    const md = $('map-detail');
    if (!def) {
      md.classList.add('rnd'); $('md-name').textContent = 'Random map'; $('md-blurb').textContent = 'A different battlefield every match, picked when you deploy.';
      $('md-stats').innerHTML = MAP_DEFS.map(m => `<span>${m.name}</span>`).join(''); $('md-img').removeAttribute('src');
      const rc = $('md-radar'); rc.getContext('2d').clearRect(0, 0, rc.width, rc.height); return;
    }
    md.classList.remove('rnd');
    const f = mapFacts(def);
    $('md-name').textContent = def.name; $('md-blurb').textContent = def.blurb;
    $('md-stats').innerHTML = `<span><b>${f.W}×${f.H}</b> grid</span><span><b>${f.indoor}%</b> indoor</span><span><b>${f.cover}</b> cover blocks</span><span>Site A <b>${f.aIn ? 'inside' : 'open air'}</b></span><span>Site B <b>${f.bIn ? 'inside' : 'open air'}</b></span>`;
    if (shots[id]) $('md-img').src = shots[id]; else $('md-img').removeAttribute('src');
    drawOverview($('md-radar'), def);
  }
  function lobbyMaps() {
    const el = $('lob-maps'); if (!el) return;
    const sel = $('lob-map').value || 'sandline', amHost = NET.id && NET.id === NET.hostId;
    if (el.dataset.built !== '1') { el.innerHTML = MAP_DEFS.map(d => cardHTML(d, true)).join('') + cardHTML('random', true); el.dataset.built = '1'; }
    el.classList.toggle('readonly', !amHost);
    el.querySelectorAll('.map-card').forEach(b => {
      b.classList.toggle('sel', b.dataset.id === sel);
      b.disabled = !amHost;
      b.onclick = () => { if (!amHost) return; $('lob-map').value = b.dataset.id; $('lob-map').dispatchEvent(new Event('change')); };
    });
  }

  // ---------------- segmented controls ----------------
  function bindSegs(root) {
    root.querySelectorAll('[data-seg]').forEach(seg => {
      const key = seg.dataset.seg, num = seg.dataset.num === '1';
      const mark = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(G.settings[key]) === b.dataset.v));
      seg.querySelectorAll('button').forEach(b => b.onclick = () => {
        G.settings[key] = num ? Number(b.dataset.v) : b.dataset.v; saveSettings(); mark(); hooks.onSetting(key); summary();
      });
      mark();
    });
  }
  function summary() {
    const S = G.settings, def = MAP_DEFS.find(m => m.id === S.map);
    $('deploy-sum').textContent = `${def ? def.name : 'Random map'} · ${SIDE_NAME[S.team] || 'Auto side'} · ${S.diff} bots · ${S.size}v${S.size} · first to ${S.rounds}`;
    $('diff-hint').textContent = DIFF_HINT[S.diff] || '';
  }

  // ---------------- armory ----------------
  function stat(label, v) { v = clamp(v, 0, 1); return `<div class="stat"><span>${label}</span><i><em style="width:${Math.round(v * 100)}%"></em></i></div>`; }
  // lighten dark furniture colours so they read on the dark cards
  function lift(hex) { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, L = (r + g + b) / 3; const k = L < 90 ? 90 - L : 0; return `rgb(${Math.min(255, r + k)},${Math.min(255, g + k)},${Math.min(255, b + k)})`; }
  function drawGun(cv, key) {
    const d = WEAPONS[key], g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    g.save(); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 8; g.shadowOffsetY = 4;
    const body = '#5d636b', hi = 'rgba(255,255,255,0.28)', furn = lift(d.wood || '#6b6f75'), mid = H * 0.48;
    const L = { pistol: 0.56, smg: 0.66, rifle: 0.9, sniper: 0.96, shotgun: 0.9, lmg: 0.96 }[d.type] * W;
    const x0 = (W - L) / 2, R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    if (d.type === 'pistol') {
      const big = key === 'hawk' || key === 'duke';
      R(x0, mid - 10, L * 0.95, big ? 20 : 16, big ? '#a7abb0' : body); R(x0, mid - 10, L * 0.95, 3, hi);
      g.fillStyle = '#40454c'; g.beginPath(); g.moveTo(x0 + L * 0.05, mid + 6); g.lineTo(x0 + L * 0.35, mid + 6); g.lineTo(x0 + L * 0.3, mid + 42); g.lineTo(x0 + L * 0.02, mid + 40); g.fill();
      if (key === 'duke') { g.fillStyle = '#5d6168'; g.beginPath(); g.ellipse(x0 + L * 0.42, mid + 2, 13, 11, 0, 0, TAU); g.fill(); }
      if (d.auto) R(x0 + L * 0.12, mid + 38, 12, 22, '#40454c');
      R(x0 + L * 0.3, mid + 8, 14, 3, '#40454c');
      g.restore(); return;
    }
    // stock
    if (d.type !== 'smg') { g.fillStyle = furn; g.beginPath(); g.moveTo(x0, mid - 8); g.lineTo(x0 + L * 0.22, mid - 10); g.lineTo(x0 + L * 0.22, mid + 10); g.lineTo(x0, mid + 22); g.fill(); }
    else { R(x0, mid - 2, L * 0.2, 4, body); R(x0, mid - 2, 4, 18, body); }
    // receiver + barrel
    R(x0 + L * 0.2, mid - 12, L * 0.38, 22, body); R(x0 + L * 0.2, mid - 12, L * 0.38, 3, hi);
    const barStart = x0 + L * 0.58;
    if (d.type === 'shotgun') { R(barStart, mid - 8, L * 0.42, 7, body); R(barStart, mid, L * 0.36, 6, '#4a4f56'); R(barStart + L * 0.05, mid - 2, L * 0.16, 12, furn); }
    else {
      R(barStart, mid - 9, L * (d.type === 'smg' ? 0.16 : 0.22), 16, d.type === 'rifle' ? furn : body);
      R(barStart, mid - 4, L * 0.42, 6, '#40454c'); R(x0 + L - 6, mid - 6, 6, 10, '#2a2d31');
    }
    // grip
    g.fillStyle = '#40454c'; g.beginPath(); g.moveTo(x0 + L * 0.26, mid + 10); g.lineTo(x0 + L * 0.33, mid + 10); g.lineTo(x0 + L * 0.3, mid + 34); g.lineTo(x0 + L * 0.23, mid + 32); g.fill();
    // magazine
    if (d.type === 'lmg') { g.fillStyle = '#3d3f38'; g.beginPath(); g.ellipse(x0 + L * 0.46, mid + 22, 18, 16, 0, 0, TAU); g.fill(); }
    else if (key === 'avk' || key === 'hyena') { g.fillStyle = '#474c53'; g.beginPath(); g.moveTo(x0 + L * 0.4, mid + 10); g.lineTo(x0 + L * 0.47, mid + 10); g.quadraticCurveTo(x0 + L * 0.5, mid + 30, x0 + L * 0.54, mid + 42); g.lineTo(x0 + L * 0.47, mid + 46); g.quadraticCurveTo(x0 + L * 0.43, mid + 30, x0 + L * 0.4, mid + 10); g.fill(); }
    else if (d.type !== 'shotgun') R(x0 + L * 0.41, mid + 10, L * 0.06, d.mag >= 40 ? 40 : 28, '#474c53');
    // optics
    if (d.zoom) { R(x0 + L * 0.3, mid - 24, L * 0.26, 9, '#33373d'); R(x0 + L * 0.3, mid - 24, L * 0.26, 2, hi); R(x0 + L * 0.28, mid - 26, 6, 13, '#26292e'); R(x0 + L * 0.55, mid - 26, 6, 13, '#26292e'); R(x0 + L * 0.4, mid - 15, 8, 4, '#33373d'); }
    else R(x0 + L * 0.3, mid - 17, L * 0.06, 5, '#33373d');
    g.restore();
  }
  function drawGear(cv, key) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
    g.clearRect(0, 0, W, H);
    if (key === 'vest' || key === 'vesthelm') {
      g.fillStyle = '#3c4a5a'; g.beginPath(); g.moveTo(cx - 34, cy - 30); g.lineTo(cx + 34, cy - 30); g.lineTo(cx + 30, cy + 34); g.lineTo(cx - 30, cy + 34); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(cx - 22, cy - 18, 44, 10);
      if (key === 'vesthelm') { g.fillStyle = '#2a3038'; g.beginPath(); g.arc(cx + 58, cy - 6, 22, Math.PI, 0); g.fill(); g.fillRect(cx + 34, cy - 6, 48, 6); }
    } else if (key === 'kit') {
      g.strokeStyle = '#c33'; g.lineWidth = 7; g.beginPath(); g.moveTo(cx - 30, cy + 26); g.lineTo(cx + 10, cy - 14); g.moveTo(cx + 30, cy + 26); g.lineTo(cx - 10, cy - 14); g.stroke();
      g.fillStyle = '#9aa1a8'; g.beginPath(); g.moveTo(cx - 10, cy - 14); g.lineTo(cx, cy - 34); g.lineTo(cx + 10, cy - 14); g.fill();
    } else {
      const col = { he: '#3f4a2e', flash: '#5a6068', smoke: '#4a4f55', fire: '#7a2a1c' }[key];
      if (key === 'he') { g.fillStyle = col; g.beginPath(); g.ellipse(cx, cy + 6, 22, 26, 0, 0, TAU); g.fill(); }
      else { g.fillStyle = col; g.fillRect(cx - 18, cy - 22, 36, 54); g.fillStyle = key === 'flash' ? '#c9c9c9' : key === 'fire' ? '#e8a030' : '#7a8a7a'; g.fillRect(cx - 18, cy - 6, 36, 10); }
      g.fillStyle = '#9a9a9a'; g.fillRect(cx - 7, cy - 34, 14, 12); g.fillStyle = '#777'; g.fillRect(cx + 6, cy - 32, 20, 5);
      if (key === 'fire') { g.fillStyle = 'rgba(255,170,60,0.9)'; g.beginPath(); g.moveTo(cx + 30, cy + 30); g.quadraticCurveTo(cx + 44, cy + 6, cx + 36, cy - 6); g.quadraticCurveTo(cx + 54, cy + 10, cx + 46, cy + 30); g.fill(); }
    }
  }
  const GEAR_NOTE = { vest: 'Absorbs body damage. Lasts until it breaks.', vesthelm: 'Vest plus helmet: protects against headshots. $350 if you already wear a vest.', he: 'Explodes after 1.6s. Up to 98 damage close in.', flash: 'Blinds everyone facing it. Carry up to two.', smoke: 'Blocks vision for ~16s and smothers fires.', fire: 'Spreads burning ground for 7s. Denies corners and plant spots.', kit: 'Wardens only. Halves defuse time to 5s.' };
  function renderArmory(filter) {
    const el = $('armory');
    const cats = BUY_MENU.filter(c => !filter || filter === 'All' || c.name === filter);
    el.innerHTML = cats.map(c => `<h3 class="arm-cat">${c.name}</h3><div class="arm-row">${c.items.map(k => {
      const d = WEAPONS[k], gear = GEAR[k];
      const team = (d || gear).team, badge = team ? `<span class="badge ${team === 'R' ? 'r' : 'w'}">${team === 'R' ? 'Raiders only' : 'Wardens only'}</span>` : '';
      if (gear) return `<div class="arm-card"><canvas data-gear="${k}" width="200" height="90"></canvas><div class="arm-top"><b>${gear.name}</b><span class="price">$${gear.price}</span></div>${badge}<p class="fine">${GEAR_NOTE[k] || ''}</p></div>`;
      const sp = d.spread ? (d.spread.scoped !== undefined ? d.spread.scoped : d.spread.base) : 0.01;
      const rpm = Math.round(60 / d.rate), dmg = d.dmg * (d.pellets || 1);
      return `<div class="arm-card"><canvas data-gun="${k}" width="260" height="96"></canvas><div class="arm-top"><b>${d.name}</b><span class="price">${d.price ? '$' + d.price : 'free'}</span></div>${badge}
        <div class="stats">${stat('Damage', dmg / 150)}${stat('Fire rate', rpm / 950)}${stat('Accuracy', 1 - sp / 0.07)}${stat('Recoil control', 1 - (d.kick || 0) / 0.08)}${stat('Mobility', ((d.speed || 1) - 0.74) / 0.28)}${stat('Armor pierce', d.pen || 0)}</div>
        <div class="arm-foot"><span>${d.mag ? d.mag + ' / ' + d.reserve : 'melee'}</span><span>${rpm} rpm</span><span>${d.dmg}${d.pellets ? '×' + d.pellets : ''} dmg</span>${d.zoom ? '<span>scope</span>' : ''}${d.auto ? '<span>auto</span>' : ''}</div></div>`;
    }).join('')}</div>`).join('');
    el.querySelectorAll('canvas[data-gun]').forEach(cv => drawGun(cv, cv.dataset.gun));
    el.querySelectorAll('canvas[data-gear]').forEach(cv => drawGear(cv, cv.dataset.gear));
  }

  // ---------------- init ----------------
  function init(h) {
    hooks = Object.assign(hooks, h);
    document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
      document.querySelectorAll('.tab').forEach(o => o.classList.toggle('active', o === t));
      document.querySelectorAll('.pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + t.dataset.tab));
    });
    if (!MAP_DEFS.some(m => m.id === G.settings.map) && G.settings.map !== 'random') G.settings.map = 'sandline';
    if (!['R', 'W', 'auto'].includes(G.settings.team)) G.settings.team = 'auto';
    renderMapCards(); bindSegs(document.getElementById('menu')); summary();
    // preferred multiplayer side
    const ts = $('lan-team-seg'), mark = () => ts.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === $('lan-team').value));
    ts.querySelectorAll('button').forEach(b => b.onclick = () => { $('lan-team').value = b.dataset.v; mark(); }); mark();
    const af = $('armory-filter');
    af.innerHTML = ['All', ...BUY_MENU.map(c => c.name)].map((n, i) => `<button data-f="${n}" class="${i ? '' : 'on'}">${n}</button>`).join('');
    af.querySelectorAll('button').forEach(b => b.onclick = () => { af.querySelectorAll('button').forEach(o => o.classList.toggle('on', o === b)); renderArmory(b.dataset.f); });
    renderArmory('All');
    buildShots(() => { markMap(); lobbyMaps(); });
  }
  return { init, lobbyMaps, shots };
})();
