'use strict';
// ============================================================
//  LAN multiplayer — host-authoritative "listen server" model.
//  One browser hosts and runs the whole simulation (incl. bots);
//  the others send input + their own movement and render snapshots.
//  Transport: WebSocket relay served by server.js on the LAN.
// ============================================================
const NET = {
  mode: 'off', ws: null, id: 0, hostId: 0, lobby: null, available: false, info: null,
  fx: [], sfx: [], outbox: new Map(), sendT: 0, inT: 0, ev: [], byId: new Map(), lastPhase: '', lastCenter: '', lastHp: 100, wasAlive: true, status: '',
};
function netTo(p, ev) { if (NET.mode !== 'host' || !p.remote || !p.nid) return; let q = NET.outbox.get(p.nid); if (!q) NET.outbox.set(p.nid, q = []); q.push(ev); }
function netEv(ev) { NET.ev.push(ev); }
function netSend(obj) { if (NET.ws && NET.ws.readyState === 1) NET.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); }

// ---------- capture positional sounds on the host so clients hear them ----------
(function patchSfx() {
  const play = SFX.play, step = SFX.step, shot = SFX.shot;
  const r2 = (v) => Math.round(v * 100) / 100;
  SFX.play = (n, x, y) => { play(n, x, y); if (NET.mode === 'host' && x !== undefined) NET.sfx.push(['p', n, r2(x), r2(y)]); };
  SFX.step = (x, y, l) => { step(x, y, l); if (NET.mode === 'host') NET.sfx.push(['st', r2(x), r2(y)]); };
  SFX.shot = (k, x, y, own, pid) => { shot(k, x, y, own); if (NET.mode === 'host') NET.sfx.push(['sh', k, r2(x), r2(y), pid]); };
})();

// ---------- connection & lobby ----------
async function netProbe() {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return false;
  try {
    const r = await fetch('/lan-info', { cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json(); if (!j || !j.lan) return false;
    NET.available = true; NET.info = j; return true;
  } catch (e) { return false; }
}
function netConnect(asHost, name, team) {
  if (NET.ws) { try { NET.ws.close(); } catch (e) { } }
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  NET.ws = ws; NET.status = 'connecting';
  ws.onopen = () => {
    NET.status = 'open';
    netSend({ t: 'hello', name, team });
    if (asHost) netSend({ t: 'host', settings: lobbySettings() });
  };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } netOnMessage(m); };
  ws.onclose = () => {
    const was = NET.mode;
    if (NET.ws !== ws) return;
    NET.ws = null; NET.status = 'closed';
    if (was !== 'off' || G.state === 'lobby') netAbort('Lost connection to the LAN server.');
  };
}
function lobbySettings() {
  const v = (id) => document.getElementById(id).value;
  return { map: v('lob-map'), mode: v('lob-mode'), bots: +v('lob-bots'), rounds: +v('lob-rounds'), diff: v('lob-diff') };
}
function netOnMessage(m) {
  switch (m.t) {
    case 'welcome': NET.id = m.id; break;
    case 'lobby': NET.lobby = m; NET.hostId = m.hostId; LOBBY.render(); break;
    case 'start': if (NET.id !== NET.hostId) netClientStart(m); break;
    case 'snap': if (NET.mode === 'client') netApplySnap(m); break;
    case 'ev': if (NET.mode === 'client') for (const ev of m.d) netClientEvent(ev); break;
    case 'in': if (NET.mode === 'host') netHostInput(m.from, m.d); break;
    case 'joined': if (NET.mode === 'host') netHostJoined(m); break;
    case 'left': if (NET.mode === 'host') netHostLeft(m.id); break;
    case 'tolobby': if (NET.mode === 'client') netBackToLobby(); break;
    case 'hostleft': netAbort('The host left the game.'); break;
  }
}
function netAbort(msg) {
  const wasPlaying = G.state === 'play' || G.state === 'over' || G.state === 'lobby';
  NET.mode = 'off';
  const ws = NET.ws; NET.ws = null;
  if (ws) { try { ws.close(); } catch (e) { } }
  onlineCleanup();
  if (wasPlaying) { UI.toMenu && UI.toMenu(); toastMenu(msg); }
}
function toastMenu(msg) { const el = document.getElementById('lan-msg'); if (el) { el.textContent = msg; } }

// ---------- host side ----------
function netHostStart() {
  const L = NET.lobby; if (!L) return;
  const S = lobbySettings();
  let players = L.players.slice();
  if (S.mode === 'duel') {
    players = players.slice(0, 2);
    if (players.length < 2) { LOBBY.note('A duel needs a second player — have them open this address and press Join.'); return; }
    let a = players[0], b = players[1];
    let ta = a.team === 'A' ? (b.team === 'R' ? 'W' : 'R') : a.team;
    let tb = ta === 'R' ? 'W' : 'R';
    var roster = [{ nid: a.id, name: a.name, team: ta }, { nid: b.id, name: b.name, team: tb }];
  } else {
    const cnt = { R: 0, W: 0 }; roster = [];
    for (const p of players) if (p.team !== 'A') { roster.push({ nid: p.id, name: p.name, team: p.team }); cnt[p.team]++; }
    for (const p of players) if (p.team === 'A') { const t = cnt.R <= cnt.W ? 'R' : 'W'; cnt[t]++; roster.push({ nid: p.id, name: p.name, team: t }); }
  }
  const humansR = roster.filter(r => r.team === 'R').length, humansW = roster.filter(r => r.team === 'W').length;
  const size = S.mode === 'duel' ? 1 : Math.max(humansR, humansW, S.bots);
  const mapId = S.map === 'random' ? pick(MAP_DEFS).id : S.map;
  Object.assign(G.settings, { size, rounds: S.rounds, diff: S.diff, map: mapId });
  NET.mode = 'host'; NET.roster = roster; NET.fx = []; NET.sfx = []; NET.outbox.clear();
  netSend({ t: 'start', roster, settings: { size, rounds: S.rounds, diff: S.diff, mode: S.mode, map: mapId } });
  UI.beginPlay(roster);
}
function netHostInput(from, d) {
  const p = G.players.find(q => q.remote && q.nid === from); if (!p) return;
  const prevEv = p.net ? p.net.ev : [];
  p.net = d; p.net.ev = prevEv.concat(d.ev || []);
}
function netApplyInputs(dt) {
  for (const p of G.players) {
    if (!p.remote) continue;
    const n = p.net, I = p.in;
    I.mag = 0; I.mx = I.my = 0;
    if (!n) { I.fire = I.alt = I.use = false; continue; }
    if (p.alive) {
      p.yaw = angNorm(n.yaw); p.pitch = clamp(n.pitch, -1.3, 1.3);
      if (n.sq === p.sp && typeof n.x === 'number' && isFinite(n.x)) {
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        if (d < 1.2 && !solidAt(n.x, n.y)) { p.x = n.x; p.y = n.y; }
        p.z = clamp(n.z || 0, 0, 1.2); p.crouch = clamp(n.cr || 0, 0, 1); p.speed = n.sp || 0; p.vx = n.vx || 0; p.vy = n.vy || 0;
      }
      if (G.phase === 'freeze') { p.speed = 0; }
    }
    I.crouch = (n.cr || 0) > 0.5; I.walk = !!n.walk; I.fire = !!n.fire; I.alt = !!n.alt; I.use = !!n.use;
    for (const ev of n.ev) {
      switch (ev[0]) {
        case 'f': I.fireP = true; break;
        case 'a': I.altP = true; break;
        case 'r': I.reload = true; break;
        case 'g': I.drop = true; break;
        case 's': I.slot = ev[1] | 0; break;
        case 'buy': if (typeof ev[1] === 'string' && (WEAPONS[ev[1]] || GEAR[ev[1]])) tryBuy(p, ev[1]); break;
        case 'use': tryUse(p); break;
      }
    }
    n.ev = [];
  }
}
function netHostJoined(m) {
  if (G.state !== 'play') return;
  const cnt = { R: 0, W: 0 }; for (const p of G.players) if (!p.isBot) cnt[p.team]++;
  let team = m.team === 'R' || m.team === 'W' ? m.team : (cnt.R <= cnt.W ? 'R' : 'W');
  // take a bot's slot on that team if there is one, otherwise add a player
  const bot = G.players.find(p => p.isBot && p.team === team);
  const p = newPlayer(m.name, team, false); p.nid = m.id; p.remote = true; p.alive = false; p.deathT = G.time; resetLoadout(p);
  if (bot) { if (bot.hasBomb) dropBomb(bot); G.players.splice(G.players.indexOf(bot), 1, p); }
  else G.players.push(p);
  radio(p, 'joined the game — spawns next round.');
}
function netHostLeft(nid) {
  const p = G.players.find(q => q.remote && q.nid === nid); if (!p) return;
  if (p.hasBomb) dropBomb(p);
  if (G.bomb && G.bomb.defuser === p) { G.bomb.defuser = null; G.bomb.defuseProg = 0; }
  // a bot takes over the slot so team sizes stay even
  const b = newPlayer(p.name + ' (bot)', p.team, true); aiInit(b);
  Object.assign(b, { x: p.x, y: p.y, yaw: p.yaw, alive: p.alive, hp: p.hp, armor: p.armor, helmet: p.helmet, money: p.money, slots: p.slots, nades: p.nades, kills: p.kills, deaths: p.deaths, hs: p.hs, cur: p.cur });
  G.players.splice(G.players.indexOf(p), 1, b);
  if (b.alive) aiRoundStart(b);
  radio(b, p.name + ' left — a bot took over.');
}
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
function packPlayer(p) {
  const w = (k) => { const s = p.slots[k]; return s ? [s.key, s.mag, s.reserve, r2(s.reloadT)] : 0; };
  return {
    id: p.id, nid: p.nid || 0, n: p.name, tm: p.team, b: p.isBot ? 1 : 0, al: p.alive ? 1 : 0, sp: p.sp || 0,
    x: r3(p.x), y: r3(p.y), z: r3(p.z), yw: r3(p.yaw), pt: r3(p.pitch), cr: r2(p.crouch), spd: r2(p.speed), wp: r2(p.walkPhase),
    hp: p.hp, ar: p.armor, hm: p.helmet ? 1 : 0, kit: p.kit ? 1 : 0, $: p.money, cur: p.cur, ns: p.nadeSel, nd: [p.nades.he, p.nades.flash, p.nades.smoke, p.nades.fire],
    bomb: p.hasBomb ? 1 : 0, zm: p.zoom, pl: r2(p.plantProg), df: p.defusing ? 1 : 0, fl: r2(Math.max(0, p.flash)), ff: r2(Math.max(0, p.fireFlashT)),
    pp: r3(p.punchP), py: r3(p.punchY), dt: r2(Math.max(0, p.drawT)), dm: p.drawMax, th: r2(p.throwT), sw: r2(p.vmSwing), ac: r3(p.accum),
    k: p.kills, d: p.deaths, h: p.hs, st: r2(p.spottedT), la: p.lastAttacker ? p.lastAttacker.id : -1, w: [w(1), w(2), w(3)],
  };
}
function netHostTick(dt, force) {
  if (NET.mode !== 'host') return;
  NET.sendT -= dt;
  for (const [nid, evs] of NET.outbox) if (evs.length) netSend({ t: 'to', id: nid, d: evs });
  NET.outbox.clear();
  if (NET.sendT > 0 && !force) return;
  NET.sendT = 1 / 30;
  const B = G.bomb;
  const snap = {
    t: 'snap', T: r3(G.time), st: G.state, ph: G.phase, phT: r2(G.phaseT), rT: r2(G.roundT), lT: r2(G.liveT), rd: G.round, sc: G.score, mw: G.matchWinner, rw: G.settings.rounds,
    P: G.players.map(packPlayer),
    B: { s: B.state, x: r2(B.x), y: r2(B.y), tm: r2(B.timer || 0), dp: r2(B.defuseProg || 0), du: B.defuser ? B.defuser.id : -1, site: B.site, led: r2(B.led || 0) },
    I: G.items.map(i => [r2(i.x), r2(i.y), i.key]),
    N: G.nades.map(n => [r2(n.x), r2(n.y), r2(n.z), n.type]),
    S: G.smokes.map(s => [r2(s.x), r2(s.y), r2(s.t), s.life, s.puffs.map(q => [r2(q.x), r2(q.y), r2(q.z), r2(q.s)])]),
    FI: G.fires.map(f => [r2(f.x), r2(f.y), r2(f.t), f.life, f.flames.map(q => [r2(q.x), r2(q.y), r2(q.s), r2(q.ph)])]),
    F: G.feed.slice(-6), C: G.chat.slice(-6), CT: G.center, E: NET.sfx, X: NET.fx,
  };
  NET.sfx = []; NET.fx = [];
  netSend(snap);
}

// ---------- client side ----------
function netClientStart(m) {
  NET.mode = 'client'; NET.byId.clear(); NET.ev = [];
  Object.assign(G.settings, { size: m.settings.size, rounds: m.settings.rounds, diff: m.settings.diff });
  if (m.settings.map && (!MAP || MAP.id !== m.settings.map)) loadMap(m.settings.map);
  G.players = []; G.human = null; G.viewP = null; G.items = []; G.nades = []; G.smokes = []; G.fires = []; G.fx = []; G.feed = []; G.chat = [];
  G.bomb = { state: 'none', x: 0, y: 0 }; G.score = { R: 0, W: 0 }; G.round = 0; G.phase = 'freeze'; G.matchWinner = null;
  NET.lastPhase = ''; NET.lastCenter = ''; NET.wasAlive = true;
  UI.beginPlay(null);
}
function netApplySnap(s) {
  G.time = s.T; G.round = s.rd; G.score = s.sc; G.matchWinner = s.mw; G.settings.rounds = s.rw;
  G.phaseT = s.phT; G.roundT = s.rT; G.liveT = s.lT;
  const prevPhase = G.phase; G.phase = s.ph;
  const seen = new Set();
  for (const q of s.P) {
    let p = NET.byId.get(q.id);
    if (!p) { p = newPlayer(q.n, q.tm, !!q.b); p.id = q.id; p.x = q.x; p.y = q.y; p.sp = -1; NET.byId.set(q.id, p); G.players.push(p); }
    seen.add(q.id);
    const own = q.nid === NET.id;
    if (own) G.human = p;
    p.name = q.n; p.team = q.tm; p.isBot = !!q.b; p.nid = q.nid;
    const wasAlive = p.alive; p.alive = !!q.al;
    const respawn = q.sp !== p.sp || (!wasAlive && p.alive);
    if (own) {
      if (respawn || !p.alive) { p.x = q.x; p.y = q.y; p.z = q.z; p.yaw = q.yw; p.pitch = q.pt; p.vx = p.vy = 0; p.crouch = q.cr; }
      else if (Math.hypot(p.x - q.x, p.y - q.y) > 1.0) { p.x = q.x; p.y = q.y; } // host rejected our position: resync
      if (respawn) closeBuy();
    } else {
      p.tx = q.x; p.ty = q.y; p.z = q.z; p.yaw = q.yw; p.pitch = q.pt; p.crouch = q.cr; p.speed = q.spd; p.walkPhase = q.wp;
      if (respawn || Math.hypot(p.x - q.x, p.y - q.y) > 2.5) { p.x = q.x; p.y = q.y; }
    }
    p.sp = q.sp;
    p.hp = q.hp; p.armor = q.ar; p.helmet = !!q.hm; p.kit = !!q.kit; p.money = q.$; p.cur = q.cur; p.nadeSel = q.ns;
    p.nades.he = q.nd[0]; p.nades.flash = q.nd[1]; p.nades.smoke = q.nd[2]; p.nades.fire = q.nd[3] || 0; p.hasBomb = !!q.bomb; p.zoom = q.zm; p.plantProg = q.pl; p.defusing = !!q.df;
    if (q.fl > p.flash || !own) { p.flash = q.fl; p.flashMax = Math.max(p.flashMax || 0, q.fl); }
    if (!own) p.fireFlashT = Math.max(p.fireFlashT, q.ff);
    p.punchP = q.pp; p.punchY = q.py; p.drawT = q.dt; p.drawMax = q.dm; p.throwT = q.th; p.vmSwing = q.sw; p.accum = q.ac;
    p.kills = q.k; p.deaths = q.d; p.hs = q.h; p.spottedT = q.st; p.la = q.la;
    for (let k = 1; k <= 3; k++) {
      const w = q.w[k - 1];
      if (!w) p.slots[k] = null;
      else { let o = p.slots[k]; if (!o || o.key !== w[0]) o = p.slots[k] = { key: w[0], def: WEAPONS[w[0]], mag: 0, reserve: 0, reloadT: 0 }; o.mag = w[1]; o.reserve = w[2]; o.reloadT = w[3]; }
    }
  }
  if (seen.size !== G.players.length) { G.players = G.players.filter(p => seen.has(p.id)); for (const id of [...NET.byId.keys()]) if (!seen.has(id)) NET.byId.delete(id); }
  const byId = NET.byId;
  for (const p of G.players) p.lastAttacker = p.la >= 0 ? byId.get(p.la) || null : null;
  const B = s.B;
  G.bomb = { state: B.s, x: B.x, y: B.y, timer: B.tm, defuseProg: B.dp, defuser: B.du >= 0 ? byId.get(B.du) || null : null, site: B.site, led: B.led, carrier: G.players.find(p => p.hasBomb) || null };
  G.items = s.I.map(i => ({ x: i[0], y: i[1], key: i[2] }));
  G.nades = s.N.map(n => ({ x: n[0], y: n[1], z: n[2], type: n[3] }));
  G.smokes = s.S.map(q => ({ x: q[0], y: q[1], t: q[2], life: q[3], puffs: q[4].map(u => ({ x: u[0], y: u[1], z: u[2], s: u[3] })) }));
  G.fires = (s.FI || []).map(q => ({ x: q[0], y: q[1], t: q[2], life: q[3], r: 1.8, flames: q[4].map(u => ({ x: u[0], y: u[1], s: u[2], ph: u[3] })) }));
  G.feed = s.F; G.chat = s.C; G.center = s.CT;
  for (const f of s.X) addFx(f[0], f[1], f[2], f[3], f[4], f[5], f[6]);
  const h = G.human;
  for (const e of s.E) {
    if (e[0] === 'p') { SFX.play(e[1], e[2], e[3]); if ((e[1] === 'bigboom' || e[1] === 'explode') && G.cam && Math.hypot(G.cam.x - e[2], G.cam.y - e[3]) < 8) G.shakeT = e[1] === 'bigboom' ? 1.2 : 0.5; }
    else if (e[0] === 'st') { if (!h || Math.hypot(h.x - e[1], h.y - e[2]) > 0.3) SFX.step(e[1], e[2], 0.55); }
    else if (e[0] === 'sh') {
      const own = h && e[4] === h.id;
      SFX.shot(e[1], e[2], e[3], own);
      if (own) { h.vmKick = 1; h.fireFlashT = 0.05; }
      else { const p = byId.get(e[4]); if (p) p.fireFlashT = 0.06; }
    }
  }
  // transitions
  if (prevPhase !== G.phase) {
    if (prevPhase === 'freeze' && G.phase === 'live') SFX.play('roundstart');
    if (G.phase === 'end' && h) { const won = G.center && G.center.text && G.center.text.indexOf(TEAM_NAME[h.team]) === 0; SFX.play(won ? 'win' : 'lose'); }
  }
  const ct = G.center ? G.center.text + G.center.t : '';
  if (ct !== NET.lastCenter) {
    NET.lastCenter = ct;
    if (G.center && G.center.text === 'BOMB PLANTED') SFX.say('Bomb has been planted.');
    else if (G.center && / win$/.test(G.center.text)) SFX.say(G.center.text + '.');
  }
  if (h) {
    if (h.hp < NET.lastHp && h.alive) { G.hurtT = 0.5; SFX.play('hurt'); if (h.lastAttacker) G.hurtDir = Math.atan2(h.lastAttacker.y - h.y, h.lastAttacker.x - h.x); }
    if (NET.wasAlive && !h.alive) { G.specT = G.time + 2.5; G.killer = h.lastAttacker; if (G.buyOpen) closeBuy(); }
    NET.lastHp = h.hp; NET.wasAlive = h.alive;
  }
  if (s.st === 'over' && G.state === 'play') { G.state = 'over'; if (document.pointerLockElement) document.exitPointerLock(); UI.showEnd(); }
}
function netClientEvent(ev) {
  switch (ev[0]) {
    case 's': SFX.play(ev[1]); break;
    case 'toast': toast(ev[1]); break;
    case 'hm': G.hitMarkT = 0.15; break;
  }
}
function netClientStep(dt) {
  G.time += dt;
  const h = G.human;
  if (!h) return;
  const I = h.in;
  if (h.alive && !G.paused) humanInput(h, dt); else { I.mag = 0; I.fire = I.alt = false; }
  if (h.alive) {
    movePlayer(h, dt);
    // keep the local body out of other players a little
    for (const o of G.players) { if (o === h || !o.alive) continue; const dx = h.x - o.x, dy = h.y - o.y, d = Math.hypot(dx, dy); if (d < P_RADIUS * 1.9 && d > 1e-4) moveBody(h, dx / d * (P_RADIUS * 1.9 - d) * 0.5, dy / d * (P_RADIUS * 1.9 - d) * 0.5); }
  }
  if (I.fireP) NET.ev.push(['f']); if (I.altP) NET.ev.push(['a']); if (I.reload) NET.ev.push(['r']); if (I.drop) NET.ev.push(['g']); if (I.slot) NET.ev.push(['s', I.slot]);
  I.fireP = I.altP = I.reload = I.drop = false; I.slot = 0;
  NET.inT -= dt;
  if (NET.inT <= 0 || NET.ev.length) {
    NET.inT = 1 / 60;
    netSend({ t: 'in', d: { x: r3(h.x), y: r3(h.y), z: r3(h.z), cr: r2(h.crouch), sp: r2(h.speed), vx: r2(h.vx), vy: r2(h.vy), yaw: r3(h.yaw), pitch: r3(h.pitch), fire: I.fire ? 1 : 0, alt: I.alt ? 1 : 0, use: I.use ? 1 : 0, walk: I.walk ? 1 : 0, sq: h.sp, ev: NET.ev } });
    NET.ev = [];
  }
  // smooth remote players toward the latest snapshot
  const k = 1 - Math.exp(-dt * 18);
  for (const p of G.players) {
    if (p === h || p.tx === undefined) continue;
    p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k;
    if (p.fireFlashT > 0) p.fireFlashT -= dt;
  }
  if (h.fireFlashT > 0) h.fireFlashT -= dt;
  h.vmKick = Math.max(0, h.vmKick - dt * 9);
  if (h.flash > 0) h.flash -= dt;
  for (const s of G.smokes) s.t += dt;
  for (const f of G.fires) f.t += dt;
  for (let i = G.fx.length - 1; i >= 0; i--) { const f = G.fx[i]; f.t += dt; if (f.vz) { f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; } if (f.t >= f.life) G.fx.splice(i, 1); }
  if (G.bomb && G.bomb.led > 0) G.bomb.led -= dt;
  if (G.hitMarkT > 0) G.hitMarkT -= dt;
  if (G.hurtT > 0) G.hurtT -= dt;
  if (G.shakeT > 0) G.shakeT -= dt;
  updateSpectator();
}
function netBackToLobby() {
  NET.mode = 'off'; G.state = 'lobby';
  document.getElementById('end').classList.add('hidden');
  LOBBY.show();
}

// ---------- lobby UI ----------
const LOBBY = {
  show() {
    G.state = 'lobby';
    for (const id of ['menu', 'end', 'pause']) document.getElementById(id).classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    this.render();
  },
  hide() { document.getElementById('lobby').classList.add('hidden'); },
  note(t) { document.getElementById('lob-note').textContent = t; },
  render() {
    const L = NET.lobby, el = document.getElementById('lob-teams');
    if (!el) return;
    const amHost = NET.id && NET.id === NET.hostId;
    document.getElementById('lob-host-opts').classList.toggle('disabled', !amHost);
    for (const id of ['lob-map', 'lob-mode', 'lob-bots', 'lob-rounds', 'lob-diff']) document.getElementById(id).disabled = !amHost;
    document.getElementById('lob-start').classList.toggle('hidden', !amHost);
    if (L && L.settings && !amHost) {
      if (L.settings.map) document.getElementById('lob-map').value = L.settings.map;
      document.getElementById('lob-mode').value = L.settings.mode; document.getElementById('lob-bots').value = L.settings.bots;
      document.getElementById('lob-rounds').value = L.settings.rounds; document.getElementById('lob-diff').value = L.settings.diff;
    }
    const mode = document.getElementById('lob-mode').value;
    document.getElementById('lob-bots-wrap').classList.toggle('hidden', mode === 'duel');
    if (!L) { el.innerHTML = '<p class="fine">Connecting…</p>'; return; }
    const host = L.players.find(p => p.id === L.hostId);
    const rc = document.getElementById('lob-room');
    if (L.room) { const link = location.origin + location.pathname + '?room=' + L.room; rc.innerHTML = `Room code <b>${L.room}</b> &nbsp;·&nbsp; invite link: <code id="lob-link">${escapeHtml(link)}</code> <button id="lob-copy" type="button">Copy link</button>`; rc.classList.remove('hidden');
      document.getElementById('lob-copy').onclick = () => { try { navigator.clipboard.writeText(link).then(() => LOBBY.note('Invite link copied.'), () => LOBBY.note('Copy failed — select the link and copy it.')); } catch (e) { LOBBY.note('Copy failed — select the link and copy it.'); } }; }
    else rc.classList.add('hidden');
    document.getElementById('lob-status').textContent = !L.hostId ? 'Waiting for someone to host…' : L.inGame ? `${host ? host.name : 'Host'} is mid-match — you will join at the next round.` : amHost ? 'You are hosting. Start when everyone has picked a side.' : `Hosted by ${host ? host.name : '?'} — waiting for the host to start.`;
    const col = (t, label) => {
      const list = L.players.filter(p => p.team === t);
      return `<div class="lob-col lob-${t}"><h4>${label} <span>${list.length}</span></h4>${list.map(p => `<div class="lob-p${p.id === NET.id ? ' me' : ''}">${escapeHtml(p.name)}${p.id === L.hostId ? ' <em>host</em>' : ''}</div>`).join('') || '<div class="fine">empty</div>'}<button data-team="${t}">${t === 'A' ? 'Auto-assign me' : 'Join ' + label}</button></div>`;
    };
    el.innerHTML = col('R', 'Raiders') + col('A', 'Undecided') + col('W', 'Wardens');
    el.querySelectorAll('button[data-team]').forEach(b => b.onclick = () => netSend({ t: 'team', team: b.dataset.team }));
    const startBtn = document.getElementById('lob-start');
    const n = L.players.length;
    startBtn.disabled = mode === 'duel' ? n < 2 : n < 1;
    startBtn.textContent = mode === 'duel' ? (n < 2 ? 'Waiting for a 2nd player' : 'Start 1v1 duel') : 'Start team match';
  },
};
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ============================================================
//  ONLINE play (works on any static host, e.g. Vercel):
//  WebRTC data channels via PeerJS. The free PeerJS cloud only
//  introduces players; game traffic goes browser-to-browser.
//  The host's browser runs the same lobby/relay logic as server.js.
// ============================================================
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS_SRI = 'sha384-nlUQ8ZqCbvStErob+biJNzSgltf6urV3VGqhfIfzhmg9RXmpeRm76ELw0pYnKlTR';
const ONLINE = { peer: null, vs: null, code: '' };
function loadPeerJS() {
  return new Promise((res, rej) => {
    if (window.Peer) return res();
    const local = new URLSearchParams(location.search).get('peerlib') === 'local';
    const s = document.createElement('script');
    s.src = local ? 'js/peerlib.js' : PEERJS_URL;
    if (!local) { s.integrity = PEERJS_SRI; s.crossOrigin = 'anonymous'; }
    s.onload = () => window.Peer ? res() : rej(new Error('networking library failed to start'));
    s.onerror = () => rej(new Error('could not download the networking library — check your internet connection'));
    document.head.appendChild(s);
  });
}
function peerOptions() {
  const q = new URLSearchParams(location.search), o = { debug: 0 };
  if (q.get('peerhost')) { o.host = q.get('peerhost'); o.port = +q.get('peerport') || 9000; o.secure = q.get('peersecure') === '1'; o.path = q.get('peerpath') || '/'; }
  return o;
}
function roomCode() { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
function peerErrorText(e) {
  const t = e && e.type;
  if (t === 'peer-unavailable') return 'No game found with that room code. Check the code, and that the host is still in the lobby.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Could not reach the matchmaking service. Check your internet connection and try again.';
  if (t === 'browser-incompatible') return 'This browser does not support online play (WebRTC). Try Chrome, Edge or Firefox.';
  return 'Online connection failed' + (t ? ' (' + t + ')' : '') + '.';
}
function onlineCleanup() {
  if (ONLINE.peer) { try { ONLINE.peer.destroy(); } catch (e) { } }
  ONLINE.peer = null; ONLINE.vs = null; ONLINE.code = '';
}
// in-browser port of server.js lobby + relay
function makeVServer() {
  const clients = new Map();
  let nextId = 1, hostId = 0, inGame = false, settings = { mode: 'team', bots: 4, rounds: 8, diff: 'normal' };
  const send = (c, s) => { try { c.send(s); } catch (e) { } };
  const lobbyMsg = () => JSON.stringify({ t: 'lobby', hostId, inGame, settings, room: ONLINE.code, players: [...clients.values()].filter(c => c.name).map(c => ({ id: c.id, name: c.name, team: c.team })) });
  const bLobby = () => { const s = lobbyMsg(); for (const c of clients.values()) if (c.name) send(c, s); };
  const to = (id, o) => { const c = clients.get(id); if (c) send(c, typeof o === 'string' ? o : JSON.stringify(o)); };
  const cleanName = (n) => String(n || 'Player').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16) || 'Player';
  const cleanTeam = (t) => t === 'R' || t === 'W' ? t : 'A';
  return {
    add(sendFn) { const c = { id: nextId++, send: sendFn, name: '', team: 'A' }; clients.set(c.id, c); return c; },
    count() { return clients.size; },
    onMessage(c, text) {
      if (!clients.has(c.id)) return;
      if (c.id === hostId && text.startsWith('{"t":"snap"')) { for (const o of clients.values()) if (o.id !== hostId && o.name) send(o, text); return; }
      let m; try { m = JSON.parse(text); } catch (e) { return; }
      switch (m.t) {
        case 'hello': c.name = cleanName(m.name); c.team = cleanTeam(m.team); send(c, JSON.stringify({ t: 'welcome', id: c.id })); if (inGame && hostId && c.id !== hostId) to(hostId, { t: 'joined', id: c.id, name: c.name, team: c.team }); bLobby(); break;
        case 'host': if (!hostId) { hostId = c.id; inGame = false; if (m.settings) settings = m.settings; } bLobby(); break;
        case 'team': c.team = cleanTeam(m.team); bLobby(); break;
        case 'settings': if (c.id === hostId && m.settings) { settings = m.settings; bLobby(); } break;
        case 'start': if (c.id !== hostId) break; inGame = true; { const s = JSON.stringify({ t: 'start', roster: m.roster, settings: m.settings }); for (const o of clients.values()) if (o.name) send(o, s); } bLobby(); break;
        case 'lobby': if (c.id !== hostId) break; inGame = false; for (const o of clients.values()) if (o.name) send(o, '{"t":"tolobby"}'); bLobby(); break;
        case 'in': if (hostId && c.id !== hostId) to(hostId, '{"t":"in","from":' + c.id + ',"d":' + JSON.stringify(m.d) + '}'); break;
        case 'to': if (c.id === hostId) to(m.id, { t: 'ev', d: m.d }); break;
      }
    },
    onClose(c) {
      if (!clients.has(c.id)) return;
      clients.delete(c.id);
      if (c.id === hostId) { hostId = 0; inGame = false; for (const o of clients.values()) if (o.name) send(o, '{"t":"hostleft"}'); }
      else if (hostId) to(hostId, { t: 'left', id: c.id });
      bLobby();
    },
  };
}
async function onlineHost(name, team) {
  NET.kind = 'online'; NET.lobby = null;
  try { await loadPeerJS(); } catch (e) { return netAbort('Online play unavailable: ' + e.message); }
  const tryOpen = (attempt) => {
    ONLINE.code = roomCode();
    const peer = new Peer('lastfuse-' + ONLINE.code, peerOptions());
    ONLINE.peer = peer;
    peer.on('open', () => {
      const vs = ONLINE.vs = makeVServer();
      const me = vs.add((s) => setTimeout(() => { let m; try { m = JSON.parse(s); } catch (e) { return; } netOnMessage(m); }, 0));
      NET.ws = { readyState: 1, send: (s) => vs.onMessage(me, s), close: () => { NET.ws && (NET.ws.readyState = 3); onlineCleanup(); } };
      netSend({ t: 'hello', name, team });
      netSend({ t: 'host', settings: lobbySettings() });
    });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        if (!ONLINE.vs) { conn.close(); return; }
        const c = ONLINE.vs.add((s) => { if (conn.open) conn.send(s); });
        conn.on('data', (d) => ONLINE.vs && ONLINE.vs.onMessage(c, String(d)));
        const bye = () => ONLINE.vs && ONLINE.vs.onClose(c);
        conn.on('close', bye); conn.on('error', bye);
      });
    });
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id' && attempt < 3) { try { peer.destroy(); } catch (x) { } return tryOpen(attempt + 1); }
      if (!ONLINE.vs) netAbort(peerErrorText(e));   // errors after the room is open (one player failing to connect) are not fatal
    });
  };
  tryOpen(0);
}
async function onlineJoin(code, name, team) {
  NET.kind = 'online'; NET.lobby = null;
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) return netAbort('Enter the 5-character room code from the host.');
  try { await loadPeerJS(); } catch (e) { return netAbort('Online play unavailable: ' + e.message); }
  ONLINE.code = code;
  const peer = ONLINE.peer = new Peer(peerOptions());
  let opened = false;
  const timer = setTimeout(() => { if (!opened) netAbort('Could not connect to the host. Some networks (offices, schools, mobile data) block direct connections — try another network, or have someone else host.'); }, 20000);
  peer.on('open', () => {
    const conn = peer.connect('lastfuse-' + code, { serialization: 'raw', reliable: true });
    conn.on('open', () => {
      opened = true; clearTimeout(timer);
      NET.ws = { readyState: 1, send: (s) => { if (conn.open) conn.send(s); }, close: () => { NET.ws && (NET.ws.readyState = 3); onlineCleanup(); } };
      netSend({ t: 'hello', name, team });
    });
    conn.on('data', (d) => { let m; try { m = JSON.parse(String(d)); } catch (e) { return; } netOnMessage(m); });
    conn.on('close', () => { if (NET.ws) { NET.ws = null; netAbort('Lost connection to the host.'); } });
  });
  peer.on('error', (e) => { clearTimeout(timer); netAbort(peerErrorText(e)); });
}
