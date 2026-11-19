'use strict';
// ============================================================
//  LAST FUSE — game state, combat, economy, rounds, HUD, input
// ============================================================
const CFG = { FREEZE: 4, BUY_TIME: 25, ROUND_TIME: 115, BOMB_TIME: 35, PLANT_TIME: 3.2, DEFUSE: 10, DEFUSE_KIT: 5, END_DELAY: 5, START_MONEY: 800, MAX_MONEY: 16000 };
const TEAM_NAME = { R: 'Raiders', W: 'Wardens' };
const TEAM_HEX = { R: '#e0a050', W: '#7fb6ff' };
const BOT_NAMES = ['Hollis', 'Ramos', 'Okafor', 'Brandt', 'Kovac', 'Lindqvist', 'Sato', 'Moreau', 'Haddad', 'Petrov', 'Quinn', 'Duarte', 'Novak', 'Reyes', 'Vance', 'Achebe', 'Ibsen', 'Marsh', 'Toro', 'Wexley'];
const DEFAULT_SETTINGS = { ui: 100, map: 'sandline', team: 'auto', diff: 'normal', size: 5, rounds: 8, sens: 1.0, vol: 0.6, quality: 'fast', voice: true, fullscreen: true, fov: 90, name: 'You' };

function loadSettings() { try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem('lastfuse.settings') || '{}')); } catch (e) { return Object.assign({}, DEFAULT_SETTINGS); } }
function saveSettings() { try { localStorage.setItem('lastfuse.settings', JSON.stringify(G.settings)); } catch (e) { } }

const G = {
  state: 'menu', paused: false, players: [], human: null, viewP: null, specIdx: 0, cam: { x: 20, y: 13, z: STAND_EYE, yaw: 0, pitch: 0, fov: 1.6 },
  bomb: null, items: [], nades: [], smokes: [], fires: [], fx: [], noises: [], feed: [], chat: [],
  round: 0, score: { R: 0, W: 0 }, lossStreak: { R: 0, W: 0 }, phase: 'freeze', phaseT: 0, roundT: 0, liveT: 0,
  time: 0, center: null, matchWinner: null, buyOpen: false, buyCat: -1, showScores: false, hitMarkT: 0, hurtT: 0, hurtDir: 0,
  bombPlantedThisRound: false, settings: loadSettings(), test: false,
};

// ------------------------------------------------------------ players
let PID = 0;
function newPlayer(name, team, isBot) {
  return {
    id: PID++, name, team, isBot, x: 0, y: 0, z: 0, vz: 0, vx: 0, vy: 0, speed: 0, yaw: 0, pitch: 0, punchP: 0, punchY: 0, crouch: 0,
    hp: 100, armor: 0, helmet: false, kit: false, money: CFG.START_MONEY, alive: true, slots: { 1: null, 2: null, 3: null },
    nades: { he: 0, flash: 0, smoke: 0, fire: 0 }, nadeSel: 'he', hasBomb: false, cur: 2, last: 3, drawT: 0, drawMax: 0.6, accum: 0, shotsFired: 0, sprayDir: 1,
    nextFire: 0, lastShotT: -9, zoom: 0, rezoom: 0, rezoomT: 0, kills: 0, deaths: 0, hs: 0, stepT: 0, walkPhase: 0, flash: 0, flashMax: 0,
    plantProg: 0, keyT: 0, defusing: false, fireFlashT: 0, vmKick: 0, vmSwing: 0, throwT: 0, thrown: false, firing: false, deathT: 0, spottedT: -9, lastHitT: -9,
    in: { mx: 0, my: 0, mag: 0, fire: false, fireP: false, alt: false, altP: false, use: false, crouch: false, walk: false, jump: false, reload: false, slot: 0, drop: false },
    ai: null,
  };
}
function eyeZ(p) { return p.z + lerp(STAND_EYE, CROUCH_EYE, p.crouch); }
function bodyH(p) { return p.z + lerp(STAND_H, CROUCH_H, p.crouch); }
function curW(p) { return p.cur <= 3 ? p.slots[p.cur] : null; }
function curWeaponDef(p) { const w = curW(p); return w ? w.def : null; }
function mkWeapon(key) { const d = WEAPONS[key]; return { key, def: d, mag: d.mag || 0, reserve: d.reserve || 0, reloadT: 0 }; }
function totalNades(p) { return p.nades.he + p.nades.flash + p.nades.smoke + p.nades.fire; }
function bestSlot(p) { return p.slots[1] ? 1 : p.slots[2] ? 2 : 3; }
function addMoney(p, m) { p.money = clamp(p.money + m, 0, CFG.MAX_MONEY); }
function alive(team) { let n = 0; for (const p of G.players) if (p.alive && p.team === team) n++; return n; }
function enemyOf(t) { return t === 'R' ? 'W' : 'R'; }
function resetLoadout(p) {
  p.slots = { 1: null, 2: mkWeapon(p.team === 'R' ? 'p9' : 'k45'), 3: mkWeapon('knife') };
  p.nades = { he: 0, flash: 0, smoke: 0, fire: 0 }; p.armor = 0; p.helmet = false; p.kit = false; p.hasBomb = false;
}
function nextNade(p, from) {
  const order = ['he', 'flash', 'smoke', 'fire']; let i = order.indexOf(from);
  for (let k = 1; k <= 4; k++) { const t = order[(i + k) % 4]; if (p.nades[t] > 0) return t; }
  return from;
}
function switchSlot(p, slot) {
  if (slot === p.cur) { if (slot === 4) p.nadeSel = nextNade(p, p.nadeSel); return; }
  if ((slot === 1 || slot === 2) && !p.slots[slot]) return;
  if (slot === 4 && totalNades(p) === 0) return;
  if (slot === 5 && !p.hasBomb) return;
  const w = curW(p); if (w) w.reloadT = 0;
  p.zoom = 0; p.rezoomT = 0; p.last = p.cur; p.cur = slot; p.plantProg = 0; p.throwT = 0; p.thrown = false;
  p.drawMax = p.drawT = slot === 1 ? 0.85 : slot === 3 ? 0.4 : 0.55;
  if (slot === 4 && p.nades[p.nadeSel] <= 0) p.nadeSel = nextNade(p, p.nadeSel);
  ownSnd(p, 'deploy');
}
function maxSpeed(p) {
  let s = RUN_SPEED;
  const d = curWeaponDef(p); if (d) s *= d.speed;
  if (p.zoom > 0) s *= (d && d.ads) ? 0.8 : 0.65;
  if (p.crouch > 0.5) s *= 0.34; else if (p.in.walk) s *= 0.52;
  if (p.plantProg > 0 || p.defusing) s = 0;
  return s;
}
function moveBody(p, dx, dy) {
  const r = P_RADIUS;
  const nx = p.x + dx;
  if (!(solidAt(nx - r, p.y - r) || solidAt(nx + r, p.y - r) || solidAt(nx - r, p.y + r) || solidAt(nx + r, p.y + r))) p.x = nx; else p.vx *= 0.2;
  const ny = p.y + dy;
  if (!(solidAt(p.x - r, ny - r) || solidAt(p.x + r, ny - r) || solidAt(p.x - r, ny + r) || solidAt(p.x + r, ny + r))) p.y = ny; else p.vy *= 0.2;
}
function noise(p, r, type) { G.noises.push({ x: p.x, y: p.y, team: p.team, src: p, r, type, t: G.time }); }

function movePlayer(p, dt) {
  const I = p.in;
  p.crouch += clamp((I.crouch ? 1 : 0) - p.crouch, -dt * 6, dt * 6);
  const onGround = p.z <= 0.0001;
  if (I.jump && onGround && p.crouch < 0.5 && G.phase !== 'freeze') { p.vz = 2.8; }
  I.jump = false;
  if (!onGround || p.vz > 0) { p.vz -= GRAVITY * dt; p.z += p.vz * dt; if (p.z <= 0) { p.z = 0; p.vz = 0; if (p === G.viewP) SFX.step(p.x, p.y, 0.5); } }
  const frozen = G.phase === 'freeze';
  const ms = frozen ? 0 : maxSpeed(p) * clamp(I.mag, 0, 1);
  const tx = I.mx * ms, ty = I.my * ms, acc = p.z <= 0.0001 ? 11 : 1.5;
  p.vx += (tx - p.vx) * Math.min(1, dt * acc); p.vy += (ty - p.vy) * Math.min(1, dt * acc);
  moveBody(p, p.vx * dt, p.vy * dt);
  p.speed = Math.hypot(p.vx, p.vy);
  p.walkPhase += p.speed * dt * 2.4;
}
function updatePlayer(p, dt) {
  const I = p.in;
  if (I.slot) { switchSlot(p, I.slot); I.slot = 0; }
  if (!p.remote) movePlayer(p, dt); else p.walkPhase += p.speed * dt * 2.4;
  if (p.z <= 0.0001 && p.speed > RUN_SPEED * 0.62) {
    p.stepT += p.speed * dt;
    if (p.stepT > 1.1) { p.stepT = 0; SFX.step(p.x, p.y, p === G.viewP ? 0.22 : 0.55); noise(p, 10, 'step'); }
  }
  if (p.flash > 0) p.flash -= dt;
  weaponUpdate(p, dt);
  objectiveUpdate(p, dt);
  // pickups
  for (let i = G.items.length - 1; i >= 0; i--) {
    const it = G.items[i];
    if (Math.hypot(it.x - p.x, it.y - p.y) > 0.6) continue;
    if (it.dropper === p && G.time - it.t < 1.5) continue;
    const slot = WEAPONS[it.key].slot;
    if (!p.slots[slot]) {
      p.slots[slot] = { key: it.key, def: WEAPONS[it.key], mag: it.mag, reserve: it.reserve, reloadT: 0 };
      G.items.splice(i, 1);
      ownSnd(p, 'pickup');
      if (p.isBot && slot === 1) switchSlot(p, 1);
    }
  }
  const B = G.bomb;
  if (p.team === 'R' && B.state === 'dropped' && Math.hypot(B.x - p.x, B.y - p.y) < 0.6) {
    p.hasBomb = true; B.state = 'carried'; B.carrier = p;
    if (p === G.human) showCenter('You picked up the bomb', '', 2); ownSnd(p, 'pickup');
  }
}

// ------------------------------------------------------------ weapons
function computeSpread(p, d) {
  const S = d.spread;
  let base = (p.zoom > 0 && S.scoped !== undefined) ? S.scoped : S.base;
  const mv = clamp(p.speed / (RUN_SPEED * 0.9), 0, 1);
  let sp = base + S.move * Math.max(0, (mv - 0.2) / 0.8);
  if (p.z > 0.02) sp += 0.15;
  if (p.crouch > 0.5 && d.type !== 'shotgun') sp *= 0.75;
  sp += p.accum;
  if (p.zoom > 0 && d.ads) sp *= 0.72;
  return sp;
}
function startReload(p) {
  const w = curW(p); if (!w || !w.def.mag) return;
  if (w.reloadT > 0 || w.mag >= w.def.mag || w.reserve <= 0) return;
  w.reloadT = w.def.shell ? w.def.reload : w.def.reload;
  p.zoom = 0; p.rezoomT = 0;
  ownSnd(p, 'reload');
}
function weaponUpdate(p, dt) {
  const I = p.in;
  if (p.drawT > 0) p.drawT -= dt;
  const rec = Math.exp(-dt * (p.firing ? 2.2 : 7));
  p.punchP *= rec; p.punchY *= rec; p.firing = false;
  if (p.fireFlashT > 0) p.fireFlashT -= dt;
  p.vmKick = Math.max(0, p.vmKick - dt * 9); p.vmSwing = Math.max(0, p.vmSwing - dt * 3);
  if (G.time - p.lastShotT > 0.35) p.shotsFired = 0;
  const w = curW(p), d = w ? w.def : null;
  if (d && d.spread) p.accum = Math.max(0, p.accum - dt * d.spread.recover);
  if (w && w.reloadT > 0) {
    w.reloadT -= dt;
    if (w.reloadT <= 0) {
      if (d.shell) {
        if (w.mag < d.mag && w.reserve > 0) { w.mag++; w.reserve--; ownSnd(p, 'shell'); }
        w.reloadT = (w.mag < d.mag && w.reserve > 0) ? d.reload : 0;
      } else {
        const take = Math.min(d.mag - w.mag, w.reserve); w.mag += take; w.reserve -= take; w.reloadT = 0;
        ownSnd(p, 'reload_end');
      }
    }
  }
  if (p.rezoomT && G.time >= p.rezoomT) { if (p.cur === 1 && w && w.def.scope && w.reloadT <= 0) p.zoom = p.rezoom; p.rezoomT = 0; }
  // hold-to-aim zoom for non-scoped guns
  if (d && d.ads) p.zoom = (I.alt && w.reloadT <= 0 && p.drawT <= 0) ? 1 : 0;
  if (I.reload) { I.reload = false; startReload(p); }
  if (I.drop) { I.drop = false; dropCurrent(p); }
  if (G.phase === 'freeze') { I.fireP = false; I.altP = false; return; }
  if (I.altP) {
    I.altP = false;
    if (d && d.scope && w.reloadT <= 0) { p.zoom = (p.zoom + 1) % (d.zoom.length + 1); p.rezoomT = 0; ownSnd(p, 'click'); }
    else if (d && d.type === 'knife' && G.time >= p.nextFire && p.drawT <= 0) knifeAttack(p, true);
  }
  if (p.cur === 5) { I.fireP = false; return; }
  if (p.cur === 4) {
    if (I.fireP && p.drawT <= 0 && p.throwT === 0 && p.nades[p.nadeSel] > 0) { p.throwT = 0.0001; ownSnd(p, 'pin'); }
    if (p.throwT > 0) {
      p.throwT += dt;
      if (p.throwT >= 0.22 && !p.thrown) { throwNade(p); p.thrown = true; }
      if (p.throwT > 0.5) {
        p.throwT = 0; p.thrown = false;
        if (totalNades(p) > 0) { p.nadeSel = nextNade(p, p.nadeSel); p.drawT = p.drawMax = 0.4; }
        else switchSlot(p, bestSlot(p));
      }
    }
    I.fireP = false; return;
  }
  if (!w) { I.fireP = false; return; }
  const want = d.auto ? I.fire : I.fireP;
  if (want && p.drawT <= 0 && G.time >= p.nextFire) {
    if (d.type === 'knife') knifeAttack(p, false);
    else if (w.reloadT > 0 && !(d.shell && w.mag > 0)) { /* reloading */ }
    else if (w.mag <= 0) { if (I.fireP) ownSnd(p, 'click'); if (w.reserve > 0) startReload(p); p.nextFire = G.time + 0.25; }
    else { if (d.shell) w.reloadT = 0; fireGun(p, w); }
  }
  I.fireP = false;
}
function fireGun(p, w) {
  const d = w.def;
  w.mag--; p.nextFire = G.time + d.rate; p.lastShotT = G.time; p.shotsFired++; p.firing = true;
  if (p.shotsFired === 1) p.sprayDir = Math.random() < 0.5 ? -1 : 1;
  const sp = computeSpread(p, d);
  const yaw0 = p.yaw + p.punchY, pit0 = p.pitch + p.punchP, ez = eyeZ(p);
  const pellets = d.pellets || 1;
  let hit = false, hs = false;
  for (let i = 0; i < pellets; i++) {
    const r = sp * Math.sqrt(Math.random()), a = Math.random() * TAU;
    const res = hitscan(p, p.x, p.y, ez, yaw0 + Math.cos(a) * r, Math.tan(pit0 + Math.sin(a) * r), 70);
    if (res.victim) {
      applyDamage(res.victim, p, d.dmg, res.group, d, res.t, false);
      hit = true; if (res.group === 'head') hs = true;
      addFx('blood', res.x, res.y, res.z, 0.35, 0.18);
    } else if (res.kind) {
      addFx('puff', res.x - Math.cos(yaw0) * 0.03, res.y - Math.sin(yaw0) * 0.03, res.z, 0.5, 0.2);
      if (i === 0 && Math.random() < 0.5) addFx('spark', res.x - Math.cos(yaw0) * 0.04, res.y - Math.sin(yaw0) * 0.04, res.z, 0.08, 0.08);
    }
  }
  SFX.shot(d.snd, p.x, p.y, p === G.viewP, p.id);
  noise(p, 32, 'shot');
  const k = d.kick * (1 + Math.min(p.shotsFired, 10) * 0.1) * (p.crouch > 0.5 ? 0.8 : 1);
  p.punchP = Math.min(d.kickMax, p.punchP + k);
  p.punchY = clamp(p.punchY + (Math.random() - 0.5) * d.side * 2 + (p.shotsFired > 4 ? p.sprayDir * d.side : 0), -0.09, 0.09);
  if (d.spread) p.accum = Math.min(d.spread.max, p.accum + d.spread.perShot);
  p.fireFlashT = 0.05; p.vmKick = 1;
  if (d.type === 'sniper' && p.zoom > 0 && d.rate > 0.6) { p.rezoom = p.zoom; p.zoom = 0; p.rezoomT = G.time + d.rate * 0.9; }
  if (hit) { ownSnd(p, hs ? 'head' : 'hitmark'); if (p === G.human) G.hitMarkT = 0.15; else netTo(p, ['hm']); }
  if (w.mag === 0 && w.reserve > 0 && p.isBot) startReload(p);
}
function hitscan(shooter, x, y, z, yaw, slope, maxT) {
  const dx = Math.cos(yaw), dy = Math.sin(yaw);
  const tr = traceWorld(x, y, z, dx, dy, slope, maxT);
  const tWall = tr.t, kind = tr.kind;
  let best = null, bt = tWall, grp = null;
  for (const e of G.players) {
    if (!e.alive || e === shooter || e.team === shooter.team) continue;
    const rx = e.x - x, ry = e.y - y, proj = rx * dx + ry * dy;
    if (proj <= 0 || proj > bt + HIT_RADIUS) continue;
    const perp2 = rx * rx + ry * ry - proj * proj;
    if (perp2 > HIT_RADIUS * HIT_RADIUS) continue;
    const tHit = proj - Math.sqrt(HIT_RADIUS * HIT_RADIUS - perp2);
    if (tHit > bt) continue;
    const zt = z + slope * proj, base = e.z, h = bodyH(e) - base, rel = (zt - base) / h;
    if (rel < 0 || rel > 1) continue;
    let g;
    if (rel > 0.83) { if (perp2 > HEAD_RADIUS * HEAD_RADIUS) continue; g = 'head'; }
    else if (rel > 0.56) g = 'chest'; else if (rel > 0.42) g = 'stomach'; else g = 'legs';
    best = e; bt = tHit; grp = g;
  }
  return { victim: best, group: grp, t: bt, x: x + dx * bt, y: y + dy * bt, z: z + slope * bt, kind: best ? 0 : kind };
}
function knifeAttack(p, alt) {
  const d = WEAPONS.knife;
  p.nextFire = G.time + (alt ? d.rateAlt : d.rate); p.vmSwing = 1;
  SFX.play('knife', p.x, p.y);
  const ez = eyeZ(p);
  let best = null, bd = 9;
  for (const e of G.players) {
    if (!e.alive || e.team === p.team) continue;
    const dx = e.x - p.x, dy = e.y - p.y, dd = Math.hypot(dx, dy);
    if (dd > d.range + P_RADIUS) continue;
    if (Math.abs(angDiff(p.yaw, Math.atan2(dy, dx))) > 0.65) continue;
    if (!losClear(p.x, p.y, ez, e.x, e.y, e.z + 0.6)) continue;
    if (dd < bd) { bd = dd; best = e; }
  }
  if (best) {
    const back = Math.abs(angDiff(best.yaw, Math.atan2(best.y - p.y, best.x - p.x))) < 0.8;
    const dmg = alt ? (back ? 195 : d.dmgAlt) : (back ? 90 : d.dmg);
    applyDamage(best, p, dmg, 'chest', d, bd, true);
    SFX.play('knifehit', best.x, best.y);
    if (p === G.human) G.hitMarkT = 0.15; else netTo(p, ['hm']);
  } else {
    const tr = traceWorld(p.x, p.y, ez, Math.cos(p.yaw), Math.sin(p.yaw), Math.tan(p.pitch), d.range);
    if (tr.kind) SFX.play('wall', tr.x, tr.y);
  }
}
function applyDamage(v, a, base, group, def, dist, flat) {
  if (!v.alive) return;
  let dmg = base;
  if (!flat) dmg *= Math.pow(def.rangeMod || 1, dist / 5);
  if (!flat) dmg *= group === 'head' ? 4 : group === 'stomach' ? 1.25 : group === 'legs' ? 0.75 : 1;
  if (v.armor > 0 && (group !== 'head' || v.helmet) && group !== 'legs') {
    let nd = dmg * (def.pen || 0.5), ar = (dmg - nd) * 0.5;
    if (ar > v.armor) { ar = v.armor; nd = dmg - ar * 2; }
    v.armor = Math.max(0, Math.round(v.armor - ar)); dmg = nd;
  }
  dmg = Math.max(1, Math.round(dmg));
  v.hp -= dmg; v.lastHitT = G.time; v.lastAttacker = a;
  v.punchP += 0.015; // aim flinch
  if (v === G.human) { G.hurtT = 0.5; if (a) G.hurtDir = Math.atan2(a.y - v.y, a.x - v.x); SFX.play('hurt'); }
  if (v.isBot && a) aiOnDamaged(v, a);
  if (v.hp <= 0) { v.hp = 0; killPlayer(v, a, def, group === 'head'); }
  else SFX.play('hit', v.x, v.y);
}
function killPlayer(v, a, def, hs) {
  v.alive = false; v.deaths++; v.deathT = G.time;
  if (a && a !== v && a.team !== v.team) { a.kills++; if (hs) a.hs++; addMoney(a, 300); }
  G.feed.push({ k: a ? a.name : '', kt: a ? a.team : '', v: v.name, vt: v.team, w: def ? def.name : '', hs, t: G.time, mine: a === G.human || v === G.human });
  const dropW = v.slots[1] || v.slots[2];
  if (dropW) dropItem(v, dropW, true);
  if (v.hasBomb) dropBomb(v);
  v.plantProg = 0; v.defusing = false;
  if (G.bomb.defuser === v) { G.bomb.defuser = null; G.bomb.defuseProg = 0; }
  if (v === G.human) { G.specT = G.time + 2.5; G.killer = a; G.buyOpen && closeBuy(); }
  if (a && a.isBot && Math.random() < 0.35) radio(a, pick(['Enemy down.', 'Got one.', 'Target neutralized.']));
}
function dropItem(p, w, death) {
  const fx = Math.cos(p.yaw) * (death ? 0.1 : 0.7), fy = Math.sin(p.yaw) * (death ? 0.1 : 0.7);
  let x = p.x + fx, y = p.y + fy; if (solidAt(x, y)) { x = p.x; y = p.y; }
  G.items.push({ x, y, key: w.key, mag: w.mag, reserve: w.reserve, t: G.time, dropper: p });
}
function dropCurrent(p) {
  if (p.cur === 5 && p.hasBomb) { dropBomb(p); return; }
  if (p.cur !== 1 && p.cur !== 2) return;
  const w = p.slots[p.cur]; if (!w) return;
  dropItem(p, w, false); p.slots[p.cur] = null; p.cur = 0; switchSlot(p, bestSlot(p));
}
function dropBomb(p) {
  const B = G.bomb; p.hasBomb = false; p.plantProg = 0;
  let x = p.x + Math.cos(p.yaw) * (p.alive ? 0.7 : 0.1), y = p.y + Math.sin(p.yaw) * (p.alive ? 0.7 : 0.1);
  if (solidAt(x, y)) { x = p.x; y = p.y; }
  B.state = 'dropped'; B.x = x; B.y = y; B.carrier = null; B.dropT = G.time;
  if (p.alive && p.cur === 5) { p.cur = 0; switchSlot(p, bestSlot(p)); }
  if (p.alive) B.dropper = p;
}
function aimDir(p) { return { yaw: p.yaw + p.punchY, pitch: p.pitch + p.punchP }; }

// ------------------------------------------------------------ objectives
function objectiveUpdate(p, dt) {
  const B = G.bomb, I = p.in;
  if (p.alive && p.team === 'R' && p.hasBomb && p.cur === 5 && (I.fire || I.use) && G.phase === 'live' && siteAt(p.x, p.y) && p.z <= 0) {
    p.plantProg += dt; p.keyT -= dt;
    if (p.keyT <= 0) { p.keyT = 0.32; ownSnd(p, 'key'); }
    if (p.plantProg >= CFG.PLANT_TIME) plantBomb(p);
  } else p.plantProg = 0;
  if (p.alive && p.team === 'W' && B.state === 'planted' && I.use && Math.hypot(B.x - p.x, B.y - p.y) < 1.15 && p.z <= 0 && (!B.defuser || B.defuser === p)) {
    if (B.defuser !== p) { B.defuser = p; B.defuseProg = 0; if (p === G.human) showCenter('Defusing…', p.kit ? 'with kit: 5s' : 'no kit: 10s', 1.5); if (p.isBot) radio(p, 'Defusing the bomb, cover me!'); }
    p.defusing = true; B.defuseProg += dt; p.keyT -= dt;
    if (p.keyT <= 0) { p.keyT = 0.5; SFX.play('defuse', B.x, B.y); }
    if (B.defuseProg >= (p.kit ? CFG.DEFUSE_KIT : CFG.DEFUSE)) defuseBomb(p);
  } else if (B.defuser === p) { B.defuser = null; B.defuseProg = 0; p.defusing = false; }
  else p.defusing = false;
}
function plantBomb(p) {
  const B = G.bomb;
  B.state = 'planted'; B.x = p.x; B.y = p.y; B.site = siteAt(p.x, p.y); B.timer = CFG.BOMB_TIME; B.beepT = 0; B.planter = p; B.carrier = null;
  p.hasBomb = false; p.plantProg = 0; p.cur = 0; switchSlot(p, bestSlot(p));
  addMoney(p, 300); G.bombPlantedThisRound = true;
  showCenter('BOMB PLANTED', 'Site ' + B.site + ' — ' + CFG.BOMB_TIME + ' seconds to detonation', 3);
  SFX.say('Bomb has been planted.');
  for (const q of G.players) if (q.isBot && q.alive && q.ai) q.ai.goalDirty = true;
}
function defuseBomb(p) {
  const B = G.bomb; B.state = 'defused'; B.defuser = null; p.defusing = false;
  addMoney(p, 300);
  endRound('W', 'defuse');
}
function updateBomb(dt) {
  const B = G.bomb;
  if (B.state !== 'planted') return;
  B.timer -= dt; B.beepT -= dt;
  if (B.beepT <= 0) { B.beepT = clamp(B.timer / 11, 0.09, 1.0); SFX.play('beep', B.x, B.y); B.led = 0.08; }
  if (B.led > 0) B.led -= dt;
  if (B.timer <= 0) {
    B.state = 'exploded';
    SFX.play('bigboom', B.x, B.y);
    for (let i = 0; i < 18; i++) addFx('boom', B.x + rand(-2, 2), B.y + rand(-2, 2), rand(0.1, 1.5), rand(0.6, 1.3), rand(1.2, 3.2));
    G.shakeT = 1.2;
    for (const p of G.players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - B.x, p.y - B.y);
      if (d < 13) applyDamage(p, null, 420 * Math.pow(1 - d / 13, 1.3), 'chest', { pen: 0.5, name: 'Bomb' }, 0, true);
    }
    if (G.phase === 'live') endRound('R', 'bomb');
  }
}

// ------------------------------------------------------------ grenades & effects
function throwNade(p) {
  const type = p.nadeSel; if (p.nades[type] <= 0) return;
  p.nades[type]--;
  const yaw = p.yaw, pit = clamp(p.pitch + 0.15, -1.2, 1.3), sp = 10.5, ch = Math.cos(pit);
  let x = p.x + Math.cos(yaw) * 0.25, y = p.y + Math.sin(yaw) * 0.25; if (solidAt(x, y)) { x = p.x; y = p.y; }
  G.nades.push({ type, x, y, z: eyeZ(p) - 0.08, vx: Math.cos(yaw) * ch * sp + p.vx * 0.4, vy: Math.sin(yaw) * ch * sp + p.vy * 0.4, vz: Math.sin(pit) * sp, t: 0, owner: p, team: p.team, rest: false });
  ownSnd(p, 'throw');
  if (p.isBot && Math.random() < 0.6) radio(p, type === 'he' ? 'Fire in the hole!' : type === 'flash' ? 'Flashbang out!' : type === 'fire' ? 'Incendiary out!' : 'Smoke out!');
}
function nadeSolid(x, y, z) { const cx = Math.floor(x), cy = Math.floor(y); if (cx < 0 || cy < 0 || cx >= MW || cy >= MH) return true; const w = mapWall[cy * MW + cx]; if (!w) return false; if (w === W_LOW) return z < CRATE_H; return true; }
function groundZ(x, y) { const cx = Math.floor(x), cy = Math.floor(y); return (cx >= 0 && cy >= 0 && cx < MW && cy < MH && mapWall[cy * MW + cx] === W_LOW) ? CRATE_H : 0; }
function updateNades(dt) {
  for (let i = G.nades.length - 1; i >= 0; i--) {
    const n = G.nades[i]; n.t += dt;
    if (!n.rest) {
      const steps = 3, h = dt / steps;
      for (let s = 0; s < steps; s++) {
        n.vz -= GRAVITY * h;
        const nx = n.x + n.vx * h; if (nadeSolid(nx, n.y, n.z)) { n.vx *= -0.45; n.vy *= 0.8; if (Math.abs(n.vx) > 1) SFX.play('bounce', n.x, n.y); } else n.x = nx;
        const ny = n.y + n.vy * h; if (nadeSolid(n.x, ny, n.z)) { n.vy *= -0.45; n.vx *= 0.8; if (Math.abs(n.vy) > 1) SFX.play('bounce', n.x, n.y); } else n.y = ny;
        n.z += n.vz * h;
        const gz = groundZ(n.x, n.y);
        if (n.z < gz + 0.05) {
          n.z = gz + 0.05; if (Math.abs(n.vz) > 1.5) SFX.play('bounce', n.x, n.y);
          n.vz = -n.vz * 0.33; n.vx *= 0.6; n.vy *= 0.6;
          if (Math.hypot(n.vx, n.vy) < 0.25 && Math.abs(n.vz) < 0.6) { n.rest = true; n.vx = n.vy = n.vz = 0; }
        }
      }
    }
    const fuse = n.type === 'smoke' ? (n.rest ? Math.min(n.t, 1.2) + 99 : 2.6) : 1.6;
    const landed = n.type === 'fire' && (n.rest || (n.t > 0.25 && n.z < groundZ(n.x, n.y) + 0.1 && Math.abs(n.vz) < 2.5));
    if ((n.type !== 'smoke' && n.type !== 'fire' && n.t >= fuse) || (n.type === 'smoke' && (n.t >= 2.6 || (n.rest && n.t > 1.0))) || (n.type === 'fire' && (landed || n.t >= 2.2))) {
      G.nades.splice(i, 1);
      if (n.type === 'he') explodeHE(n); else if (n.type === 'flash') explodeFlash(n); else if (n.type === 'fire') popFire(n); else popSmoke(n);
    }
  }
  for (let i = G.smokes.length - 1; i >= 0; i--) { const s = G.smokes[i]; s.t += dt; if (s.t > s.life) G.smokes.splice(i, 1); }
  updateFires(dt);
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const f = G.fx[i]; f.t += dt;
    if (f.vz) { f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; }
    if (f.t >= f.life) G.fx.splice(i, 1);
  }
}
function explodeHE(n) {
  SFX.play('explode', n.x, n.y);
  addFx('boom', n.x, n.y, n.z + 0.3, 0.6, 2.2);
  for (let i = 0; i < 6; i++) addFx('puff', n.x + rand(-0.6, 0.6), n.y + rand(-0.6, 0.6), rand(0.1, 0.9), rand(0.8, 1.4), 0.9, true);
  for (const p of G.players) {
    if (!p.alive) continue;
    if (p.team === n.team && p !== n.owner) continue;
    const d = Math.hypot(p.x - n.x, p.y - n.y, (p.z + 0.5) - n.z);
    if (d > 4.6) continue;
    if (!losClear(n.x, n.y, n.z + 0.1, p.x, p.y, p.z + 0.5)) continue;
    applyDamage(p, n.owner === p ? null : n.owner, 98 * (1 - d / 4.6), 'chest', { pen: 0.5, name: 'HE Grenade' }, 0, true);
  }
  G.noises.push({ x: n.x, y: n.y, team: n.team, src: n.owner, r: 25, type: 'shot', t: G.time });
  if (G.viewP && Math.hypot(G.viewP.x - n.x, G.viewP.y - n.y) < 6) G.shakeT = 0.5;
}
function explodeFlash(n) {
  SFX.play('flashbang', n.x, n.y);
  addFx('boom', n.x, n.y, n.z, 0.25, 1.4);
  for (const p of G.players) {
    if (!p.alive) continue;
    const ez = eyeZ(p), d = Math.hypot(p.x - n.x, p.y - n.y);
    if (d > 24) continue;
    if (!losClear(n.x, n.y, n.z + 0.05, p.x, p.y, ez)) continue;
    const a = Math.abs(angDiff(p.yaw, Math.atan2(n.y - p.y, n.x - p.x)));
    const s = a < 0.9 ? 1 : a < 1.8 ? 0.45 : 0.15;
    const dur = s * 4.2 * clamp(1.15 - d / 22, 0.15, 1);
    if (dur > p.flash) { p.flash = dur; p.flashMax = dur; }
    if (dur > 1.5) ownSnd(p, 'ring');
  }
}
function popSmoke(n) {
  SFX.play('smoke', n.x, n.y);
  const puffs = [];
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 1.6;
    let px = n.x + Math.cos(a) * r, py = n.y + Math.sin(a) * r;
    if (solidAt(px, py)) { px = n.x + Math.cos(a) * r * 0.3; py = n.y + Math.sin(a) * r * 0.3; }
    puffs.push({ x: px, y: py, z: rand(-0.1, 1.0), s: rand(1.1, 1.7) });
  }
  G.smokes.push({ x: n.x, y: n.y, t: 0, life: 17, puffs });
}
function popFire(n) {
  SFX.play('explode', n.x, n.y);
  for (const s of G.smokes) if (smokeAlpha(s) > 0.3 && Math.hypot(s.x - n.x, s.y - n.y) < 2.2) { addFx('puff', n.x, n.y, 0.3, 0.8, 1.2, true); return; } // smoke snuffs it out
  const flames = [];
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 1.7;
    let fx = n.x + Math.cos(a) * r, fy = n.y + Math.sin(a) * r;
    if (solidAt(fx, fy)) { fx = n.x + Math.cos(a) * r * 0.3; fy = n.y + Math.sin(a) * r * 0.3; }
    flames.push({ x: fx, y: fy, s: rand(0.5, 0.95), ph: Math.random() * TAU });
  }
  G.fires.push({ x: n.x, y: n.y, t: 0, life: 7, r: 1.8, owner: n.owner, team: n.team, tick: 0, flames });
}
function updateFires(dt) {
  for (let i = G.fires.length - 1; i >= 0; i--) {
    const f = G.fires[i]; f.t += dt; f.tick -= dt;
    let out = f.t > f.life;
    for (const s of G.smokes) if (smokeAlpha(s) > 0.5 && Math.hypot(s.x - f.x, s.y - f.y) < 2.4) out = true;
    if (out) { G.fires.splice(i, 1); continue; }
    if (f.tick <= 0) {
      f.tick = 0.25;
      for (const p of G.players) {
        if (!p.alive || p.z > 0.4) continue;
        if (p.team === f.team && p !== f.owner) continue;
        if (Math.hypot(p.x - f.x, p.y - f.y) > f.r) continue;
        applyDamage(p, p === f.owner ? null : f.owner, 10, 'legs', { pen: 1, name: 'Incendiary' }, 0, true);
      }
      if (Math.random() < 0.5) SFX.play('smoke', f.x, f.y);
    }
  }
}
function fireAt(x, y) { for (const f of G.fires) if (Math.hypot(x - f.x, y - f.y) < f.r + 0.3) return f; return null; }
function smokeAlpha(s) { return clamp(s.t / 1.2, 0, 1) * clamp((s.life - s.t) / 2.5, 0, 1); }
function smokeBlocks(ax, ay, bx, by) {
  for (const s of G.smokes) {
    if (smokeAlpha(s) < 0.6) continue;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const t = clamp(((s.x - ax) * dx + (s.y - ay) * dy) / L2, 0, 1);
    if (Math.hypot(ax + dx * t - s.x, ay + dy * t - s.y) < 1.45) return true;
  }
  return false;
}
function addFx(type, x, y, z, life, size, rise) {
  if (NET.mode === 'host') NET.fx.push([type, +x.toFixed(2), +y.toFixed(2), +z.toFixed(2), life, size, rise ? 1 : 0]);
  const f = { type, x, y, z, t: 0, life, size };
  if (rise) { f.vx = rand(-0.2, 0.2); f.vy = rand(-0.2, 0.2); f.vz = 0.4; }
  else if (type === 'puff') { f.vx = 0; f.vy = 0; f.vz = 0.25; }
  G.fx.push(f);
  if (G.fx.length > 220) G.fx.shift();
}

// ------------------------------------------------------------ buying
function inBuyZone(p) { const f = flagsAt(p.x, p.y); return p.team === 'R' ? !!(f & FL_TS) : !!(f & FL_CS); }
function buyTimeLeft() { if (G.phase === 'freeze') return CFG.BUY_TIME; if (G.phase === 'live') return CFG.BUY_TIME - G.liveT; return 0; }
function canBuy(p) { return p.alive && buyTimeLeft() > 0 && inBuyZone(p); }
function itemPrice(p, key) {
  if (WEAPONS[key]) return WEAPONS[key].price;
  if (key === 'vesthelm' && p.armor >= 100 && !p.helmet) return 350;
  return GEAR[key].price;
}
function itemAllowed(p, key) {
  const d = WEAPONS[key] || GEAR[key];
  if (d.team && d.team !== p.team) return false;
  return true;
}
function itemOwned(p, key) {
  if (WEAPONS[key]) { const w = p.slots[WEAPONS[key].slot]; return w && w.key === key; }
  switch (key) {
    case 'vest': return p.armor >= 100;
    case 'vesthelm': return p.armor >= 100 && p.helmet;
    case 'he': return p.nades.he >= 1;
    case 'flash': return p.nades.flash >= 2;
    case 'smoke': return p.nades.smoke >= 1;
    case 'fire': return p.nades.fire >= 1;
    case 'kit': return p.kit;
  }
  return false;
}
function tryBuy(p, key, quiet) {
  if (NET.mode === 'client' && p === G.human) { netEv(['buy', key]); return true; }
  const fail = (m) => { if (!quiet) { ownSnd(p, 'deny'); ownToast(p, m); } return false; };
  if (!canBuy(p)) return fail(buyTimeLeft() <= 0 ? 'Buy time is over' : 'You must be in your spawn zone to buy');
  if (!itemAllowed(p, key)) return fail('Not available for your team');
  if (itemOwned(p, key)) return fail('You already have that');
  const price = itemPrice(p, key);
  if (p.money < price) return fail('Not enough money');
  p.money -= price;
  const W = WEAPONS[key];
  if (W) {
    const old = p.slots[W.slot];
    if (old && old.key !== 'knife') dropItem(p, old, false);
    p.slots[W.slot] = mkWeapon(key);
    p.cur = 0; switchSlot(p, W.slot);
  } else {
    switch (key) {
      case 'vest': p.armor = 100; break;
      case 'vesthelm': p.armor = 100; p.helmet = true; break;
      case 'he': p.nades.he++; break;
      case 'flash': p.nades.flash++; break;
      case 'smoke': p.nades.smoke++; break;
      case 'fire': p.nades.fire++; break;
      case 'kit': p.kit = true; break;
    }
  }
  if (!quiet) ownSnd(p, 'buy');
  return true;
}

// ------------------------------------------------------------ rounds
function setupMatch(roster) {
  const S = G.settings;
  const want = S.map === 'random' ? pick(MAP_DEFS).id : (S.map || 'sandline');
  G.mapId = want;
  G.tPlan = null; G.ctPlan = null;
  if (!MAP || MAP.id !== want) loadMap(want);
  PID = 0; G.players = []; G.round = 0; G.score = { R: 0, W: 0 }; G.lossStreak = { R: 0, W: 0 }; G.matchWinner = null; G.feed = []; G.chat = []; G.time = 0;
  let team = S.team; if (team === 'auto') team = Math.random() < 0.5 ? 'R' : 'W';
  const names = shuffle(BOT_NAMES.slice());
  if (roster) {
    for (const r of roster) {
      const p = newPlayer(r.name, r.team, false); p.nid = r.nid;
      if (r.nid === NET.id) G.human = p; else { p.remote = true; p.net = null; }
      G.players.push(p);
    }
  } else { const human = newPlayer(S.name || 'You', team, false); G.human = human; G.players.push(human); }
  const human = G.human;
  for (const t of ['R', 'W']) {
    const n = S.size - G.players.filter(q => q.team === t).length;
    for (let i = 0; i < n; i++) { const b = newPlayer(names.pop(), t, true); aiInit(b); G.players.push(b); }
  }
  if (G.test) { human.isBot = true; aiInit(human); }
  startRound();
}
function pickSpawns(team, n) {
  const cells = shuffle(SPAWNS[team].slice()), out = [];
  const ctr = team === 'R' ? SPAWNS.rc : SPAWNS.wc;
  cells.sort((a, b) => Math.hypot(a[0] - ctr[0], a[1] - ctr[1]) - Math.hypot(b[0] - ctr[0], b[1] - ctr[1]) + rand(-3, 3));
  for (const c of cells) {
    if (out.length >= n) break;
    if (out.every(o => Math.hypot(o[0] - c[0], o[1] - c[1]) >= 1.5)) out.push(c);
  }
  while (out.length < n) out.push(pick(cells));
  return out.map(c => [c[0] + 0.5, c[1] + 0.5]);
}
function startRound() {
  G.round++; G.phase = 'freeze'; G.phaseT = CFG.FREEZE; G.roundT = CFG.ROUND_TIME; G.liveT = 0; G.bombPlantedThisRound = false;
  G.bomb = { state: 'none', x: 0, y: 0, carrier: null, timer: 0, defuseProg: 0, defuser: null, beepT: 0, site: null, led: 0 };
  G.items = []; G.nades = []; G.smokes = []; G.fires = []; G.fx = []; G.noises = []; G.specT = 0; G.killer = null; G.shakeT = 0;
  for (const t of ['R', 'W']) {
    const team = G.players.filter(p => p.team === t);
    const sp = pickSpawns(t, team.length);
    team.forEach((p, i) => {
      if (!p.alive || G.round === 1) resetLoadout(p);
      if (G.round === 1) p.money = CFG.START_MONEY;
      p.alive = true; p.hp = 100; p.x = sp[i][0]; p.y = sp[i][1]; p.z = 0; p.vz = 0; p.vx = p.vy = 0; p.speed = 0;
      { const tg = t === 'R' ? [(SITES.A.cx + SITES.B.cx) / 2, (SITES.A.cy + SITES.B.cy) / 2] : [SPAWNS.rc[0], SPAWNS.rc[1]]; p.yaw = Math.atan2(tg[1] - p.y, tg[0] - p.x) + rand(-0.3, 0.3); } p.pitch = 0; p.punchP = p.punchY = 0; p.crouch = 0;
      p.flash = 0; p.zoom = 0; p.rezoomT = 0; p.plantProg = 0; p.defusing = false; p.accum = 0; p.throwT = 0; p.hasBomb = false;
      for (const k of [1, 2, 3]) if (p.slots[k]) p.slots[k].reloadT = 0;
      p.cur = 0; switchSlot(p, bestSlot(p)); p.drawT = 0; p.sp = (p.sp || 0) + 1;
      for (const k in p.in) p.in[k] = typeof p.in[k] === 'boolean' ? false : 0;
    });
  }
  const raiders = G.players.filter(p => p.team === 'R');
  if (raiders.length) { const c = pick(raiders); c.hasBomb = true; G.bomb.state = 'carried'; G.bomb.carrier = c; }
  for (const p of G.players) if (p.isBot) aiRoundStart(p);
  G.viewP = G.human;
  closeBuy();
  const h = G.human;
  showCenter('Round ' + G.round, h.team === 'R' ? (h.hasBomb ? 'You carry the bomb — plant it at site A or B' : 'Attack: escort the bomb to a site') : 'Defend sites A and B — stop the bomb', 3.2);
  if (G.round === 1) toast('Press B to open the buy menu');
}
function endRound(win, reason) {
  if (G.phase === 'end') return;
  G.phase = 'end'; G.phaseT = CFG.END_DELAY; G.score[win]++;
  const lose = enemyOf(win);
  const big = reason === 'bomb' || reason === 'defuse';
  for (const p of G.players) {
    if (p.team === win) addMoney(p, big ? 3500 : 3250);
    else addMoney(p, 1400 + 500 * Math.min(4, G.lossStreak[lose]) + (lose === 'R' && G.bombPlantedThisRound ? 800 : 0));
  }
  G.lossStreak[lose]++; G.lossStreak[win] = 0;
  const sub = { bomb: 'The bomb detonated', defuse: 'The bomb was defused', elim: 'Enemy team eliminated', time: 'Time ran out — sites held' }[reason];
  showCenter(TEAM_NAME[win] + ' win', sub, 4.5, TEAM_HEX[win]);
  SFX.play(G.human.team === win ? 'win' : 'lose');
  SFX.say(TEAM_NAME[win] + ' win.');
  if (G.score[win] >= G.settings.rounds) G.matchWinner = win;
}
function updateRound(dt) {
  if (G.phase === 'freeze') { G.phaseT -= dt; if (G.phaseT <= 0) { G.phase = 'live'; G.liveT = 0; SFX.play('roundstart'); } }
  else if (G.phase === 'live') {
    G.liveT += dt;
    if (G.bomb.state !== 'planted') G.roundT -= dt;
    const aR = alive('R'), aW = alive('W');
    if (G.bomb.state === 'planted') { if (aW === 0) endRound('R', 'elim'); }
    else if (aR === 0) endRound('W', 'elim');
    else if (aW === 0) endRound('R', 'elim');
    else if (G.roundT <= 0) endRound('W', 'time');
  } else if (G.phase === 'end') {
    G.phaseT -= dt;
    if (G.phaseT <= 0) { if (G.matchWinner) finishMatch(); else startRound(); }
  }
}
function finishMatch() {
  if (NET.mode === 'host') netHostTick(1, true);
  G.state = 'over'; if (document.pointerLockElement) document.exitPointerLock();
  UI.showEnd();
}

// ------------------------------------------------------------ messages
function showCenter(text, sub, dur, color) { G.center = { text, sub: sub || '', t: G.time, dur: dur || 3, color: color || '#fff' }; }
function toast(m) { G.toast = { text: m, t: G.time }; }
function ownSnd(p, name) { if (p === G.viewP) SFX.play(name); if (p.remote) netTo(p, ['s', name]); }
function ownToast(p, m) { if (p === G.human) toast(m); else if (p.remote) netTo(p, ['toast', m]); }
function radio(p, msg) {
  if (G.chat.length && G.chat[G.chat.length - 1].msg === msg && G.time - G.chat[G.chat.length - 1].t < 3) return;
  G.chat.push({ name: p.name, team: p.team, msg, t: G.time }); if (G.chat.length > 6) G.chat.shift();
}

// ------------------------------------------------------------ main step
function step(dt) {
  G.time += dt;
  const h = G.human;
  if (h.alive && !h.isBot && !G.paused) humanInput(h, dt); else if (h.alive && !h.isBot) { h.in.mag = 0; h.in.fire = false; }
  if (NET.mode === 'host') netApplyInputs(dt);
  for (const p of G.players) if (p.alive && p.isBot) aiUpdate(p, dt);
  for (const p of G.players) if (p.alive) updatePlayer(p, dt);
  // body separation
  const ps = G.players;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i]; if (!a.alive) continue;
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j]; if (!b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = P_RADIUS * 1.9;
      if (d < m && d > 1e-4) { const push = (m - d) / 2, ux = dx / d, uy = dy / d; if (!a.remote) moveBody(a, -ux * push, -uy * push); if (!b.remote) moveBody(b, ux * push, uy * push); }
    }
  }
  updateNades(dt);
  updateBomb(dt);
  updateRound(dt);
  if (G.noises.length) G.noises = G.noises.filter(n => G.time - n.t < 1.0);
  if (G.feed.length && G.time - G.feed[0].t > 7) G.feed.shift();
  if (G.chat.length && G.time - G.chat[0].t > 8) G.chat.shift();
  if (G.hitMarkT > 0) G.hitMarkT -= dt;
  if (G.hurtT > 0) G.hurtT -= dt;
  if (G.shakeT > 0) G.shakeT -= dt;
  updateSpectator();
}
function updateSpectator() {
  const h = G.human;
  if (h.alive || h.isBot) { G.viewP = h; return; }
  if (G.time < G.specT) { G.viewP = null; return; }
  const mates = G.players.filter(p => p.alive && p.team === h.team);
  const pool = mates.length ? mates : G.players.filter(p => p.alive);
  if (!pool.length) { G.viewP = null; return; }
  if (!G.viewP || !G.viewP.alive || !pool.includes(G.viewP)) G.viewP = pool[((G.specIdx % pool.length) + pool.length) % pool.length];
}
function cycleSpectator(dir) {
  const h = G.human; if (h.alive) return;
  const mates = G.players.filter(p => p.alive && p.team === h.team);
  const pool = mates.length ? mates : G.players.filter(p => p.alive);
  if (!pool.length) return;
  G.specIdx += dir; G.viewP = pool[((G.specIdx % pool.length) + pool.length) % pool.length];
}

// ------------------------------------------------------------ input
const KEYS = {};
const INP = { dx: 0, dy: 0, cx: -1, cy: -1, lmb: false, rmb: false, lmbP: false, rmbP: false, jumpP: false };
function humanInput(p, dt) {
  const I = p.in;
  const zf = camFovFor(p) / camFovFor(null);
  const sens = G.settings.sens * 0.0022 * zf;
  p.yaw = angNorm(p.yaw + INP.dx * sens); p.pitch = clamp(p.pitch - INP.dy * sens, -1.25, 1.25);
  INP.dx = INP.dy = 0;
  // fallback when the browser refuses pointer lock: turn while the cursor rests near a screen edge
  if (!document.pointerLockElement && INP.cx >= 0 && !G.buyOpen) {
    const ex = INP.cx / window.innerWidth, ey = INP.cy / window.innerHeight, r = 2.4 * G.settings.sens * zf * dt;
    if (ex < 0.06) p.yaw = angNorm(p.yaw - r * (1 - ex / 0.06 * 0.5)); else if (ex > 0.94) p.yaw = angNorm(p.yaw + r * (1 - (1 - ex) / 0.06 * 0.5));
    if (ey < 0.06) p.pitch = clamp(p.pitch + r * 0.5, -1.25, 1.25); else if (ey > 0.94) p.pitch = clamp(p.pitch - r * 0.5, -1.25, 1.25);
  }
  const blocked = G.buyOpen;
  let f = 0, s = 0;
  if (!blocked) { if (KEYS.KeyW) f += 1; if (KEYS.KeyS) f -= 1; if (KEYS.KeyA) s -= 1; if (KEYS.KeyD) s += 1; }
  const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
  let mx = c * f - sn * s, my = sn * f + c * s; const m = Math.hypot(mx, my);
  if (m > 0) { mx /= m; my /= m; }
  I.mx = mx; I.my = my; I.mag = m > 0 ? 1 : 0;
  I.crouch = !!(KEYS.KeyC || KEYS.ControlLeft || KEYS.ControlRight);
  I.walk = !!(KEYS.ShiftLeft || KEYS.ShiftRight);
  I.jump = INP.jumpP; INP.jumpP = false;
  I.fire = INP.lmb && !blocked; I.fireP = INP.lmbP && !blocked; I.alt = INP.rmb; I.altP = INP.rmbP && !blocked;
  INP.lmbP = INP.rmbP = false;
  I.use = !!KEYS.KeyE;
}
function camFovFor(p) {
  const aspect = RND.W / RND.H || 16 / 9;
  let f43 = G.settings.fov;
  if (p) {
    const d = curWeaponDef(p);
    if (d && d.ads) f43 = lerp(f43, d.zoom[0], p.adsT || 0);
    else if (d && d.scope && p.zoom > 0) f43 = (p.zfLvl === p.zoom && p.zfKey === d.key) ? p.zf : d.zoom[p.zoom - 1];
  }
  return 2 * Math.atan(Math.tan(f43 * Math.PI / 360) * aspect / (4 / 3));
}
function openBuy() {
  if (!G.human.alive || !canBuy(G.human)) { SFX.play('deny'); toast(!G.human.alive ? 'You are dead' : buyTimeLeft() <= 0 ? 'Buy time is over' : 'You must be in your spawn zone to buy'); return; }
  G.buyOpen = true; G.buyCat = -1; UI.renderBuy(); document.getElementById('buy').classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeBuy() {
  if (!G.buyOpen) return;
  G.buyOpen = false; document.getElementById('buy').classList.add('hidden');
  if (G.state === 'play' && !G.paused) lockPointer();
}
function lockPointer() {
  const c = document.getElementById('hud');
  if (!c.requestPointerLock || document.pointerLockElement) return;
  const plain = () => { try { const r2 = c.requestPointerLock(); if (r2 && r2.catch) r2.catch(() => { G.lockFailT = performance.now(); }); } catch (e) { G.lockFailT = performance.now(); } };
  try {
    const r = c.requestPointerLock({ unadjustedMovement: true });
    if (r && r.catch) r.catch((err) => { if (err && err.name === 'NotSupportedError') plain(); else G.lockFailT = performance.now(); });
  } catch (e) { plain(); }
}

function onKeyDown(e) {
  if (G.state !== 'play') return;
  if (['Tab', 'Space', 'ControlLeft', 'KeyB'].includes(e.code)) e.preventDefault();
  if (e.repeat) { KEYS[e.code] = true; return; }
  KEYS[e.code] = true;
  if (G.paused) return;
  const h = G.human;
  if (!h) return;
  if (G.buyOpen) {
    if (e.code === 'KeyB' || e.code === 'Escape') { closeBuy(); return; }
    const m = e.code.match(/^Digit(\d)$/);
    if (m) {
      const n = +m[1];
      if (n === 0) { if (G.buyCat >= 0) G.buyCat = -1; else closeBuy(); UI.renderBuy(); return; }
      if (G.buyCat < 0) { if (n <= BUY_MENU.length) G.buyCat = n - 1; }
      else {
        const items = BUY_MENU[G.buyCat].items.filter(k => itemAllowed(h, k));
        if (items[n - 1]) tryBuy(h, items[n - 1]);
        G.buyCat = -1;
      }
      UI.renderBuy();
    }
    return;
  }
  switch (e.code) {
    case 'Digit1': h.in.slot = 1; break; case 'Digit2': h.in.slot = 2; break; case 'Digit3': h.in.slot = 3; break;
    case 'Digit4': h.in.slot = 4; break; case 'Digit5': h.in.slot = 5; break;
    case 'KeyQ': h.in.slot = h.last || 3; break;
    case 'KeyR': h.in.reload = true; break;
    case 'KeyG': h.in.drop = true; break;
    case 'Space': if (h.alive) INP.jumpP = true; else cycleSpectator(1); break;
    case 'KeyB': openBuy(); break;
    case 'Tab': G.showScores = true; break;
    case 'KeyE': tryUse(h); break;
  }
}
function onKeyUp(e) { KEYS[e.code] = false; if (e.code === 'Tab') G.showScores = false; }
function tryUse(p) {
  if (!p.alive) return;
  if (NET.mode === 'client' && p === G.human) { netEv(['use']); return; }
  // swap for weapon on the ground you're looking at
  let best = null, bd = 1.5;
  for (const it of G.items) {
    const dx = it.x - p.x, dy = it.y - p.y, d = Math.hypot(dx, dy);
    if (d < bd && Math.abs(angDiff(p.yaw, Math.atan2(dy, dx))) < 0.6) { bd = d; best = it; }
  }
  if (best && !(G.bomb.state === 'planted' && p.team === 'W' && Math.hypot(G.bomb.x - p.x, G.bomb.y - p.y) < 1.2)) {
    const slot = WEAPONS[best.key].slot, old = p.slots[slot];
    if (old) dropItem(p, old, false);
    p.slots[slot] = { key: best.key, def: WEAPONS[best.key], mag: best.mag, reserve: best.reserve, reloadT: 0 };
    G.items.splice(G.items.indexOf(best), 1);
    p.cur = 0; switchSlot(p, slot); ownSnd(p, 'pickup');
  }
}
function slotAvailable(p, s) { return s === 3 || (s === 1 && p.slots[1]) || (s === 2 && p.slots[2]) || (s === 4 && totalNades(p) > 0) || (s === 5 && p.hasBomb); }
function onWheel(e) {
  if (G.state !== 'play' || G.paused || G.buyOpen) return;
  const h = G.human; if (!h.alive) { cycleSpectator(e.deltaY > 0 ? 1 : -1); return; }
  const d = curWeaponDef(h);
  if (d && d.scope && h.zoom > 0) {
    if (h.zfLvl !== h.zoom || h.zfKey !== d.key) { h.zf = d.zoom[h.zoom - 1]; h.zfLvl = h.zoom; h.zfKey = d.key; }
    h.zf = clamp(h.zf * (e.deltaY > 0 ? 1.12 : 1 / 1.12), Math.min(...d.zoom) * 0.6, 70);
    return;
  }
  const dir = e.deltaY > 0 ? 1 : -1;
  let s = h.cur;
  for (let i = 0; i < 5; i++) { s = ((s - 1 + dir + 5) % 5) + 1; if (slotAvailable(h, s)) { h.in.slot = s; break; } }
}

// ------------------------------------------------------------ HUD
const HUD = { canvas: null, ctx: null, W: 0, H: 0, dpr: 1, radar: null, rs: 4.4 };
function hudResize() {
  HUD.dpr = Math.min(2, window.devicePixelRatio || 1);
  HUD.ui = clamp((G.settings.ui || 100) / 100, 0.6, 2);
  HUD.W = window.innerWidth / HUD.ui; HUD.H = window.innerHeight / HUD.ui;
  HUD.canvas.width = window.innerWidth * HUD.dpr; HUD.canvas.height = window.innerHeight * HUD.dpr;
  HUD.ctx.setTransform(HUD.dpr * HUD.ui, 0, 0, HUD.dpr * HUD.ui, 0, 0);
  HUD.rs = clamp(Math.min(HUD.W, HUD.H) / 200, 3, 5.5);
  buildRadar();
}
function buildRadar() {
  const s = HUD.rs, c = makeCanvas(Math.ceil(MW * s), Math.ceil(MH * s)), g = c.getContext('2d');
  g.fillStyle = 'rgba(10,12,14,0.78)'; g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x, w = mapWall[i];
    if (w === 0) { const f = mapFlags[i]; g.fillStyle = (f & (FL_A | FL_B)) ? 'rgba(190,80,60,0.55)' : (f & FL_IN) ? 'rgba(120,110,95,0.6)' : (f & FL_TS) ? 'rgba(200,150,80,0.45)' : (f & FL_CS) ? 'rgba(90,140,210,0.45)' : 'rgba(175,160,130,0.55)'; g.fillRect(x * s, y * s, s + 0.5, s + 0.5); }
    else if (w === W_LOW) { g.fillStyle = 'rgba(120,85,45,0.8)'; g.fillRect(x * s, y * s, s + 0.5, s + 0.5); }
  }
  g.fillStyle = 'rgba(255,230,200,0.9)'; g.font = `bold ${Math.round(s * 3.2)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('A', SITES.A.cx * s, SITES.A.cy * s); g.fillText('B', SITES.B.cx * s, SITES.B.cy * s);
  HUD.radar = c;
}
function fmtTime(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
function panel(g, x, y, w, h, a) { g.fillStyle = `rgba(8,10,12,${a || 0.55})`; g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, 6); else g.rect(x, y, w, h); g.fill(); }

function drawHUD() {
  const g = HUD.ctx, SW = HUD.W, SH = HUD.H;
  g.clearRect(0, 0, SW, SH);
  if (G.state === 'menu' || G.state === 'lobby' || !G.human) return;
  const vp = G.viewP, h = G.human;
  const vpd = vp && vp.alive ? curWeaponDef(vp) : null;
  const scoped = !!(vpd && vpd.scope && vp.zoom > 0);
  // ---- viewmodel
  if (vp && vp.alive && !scoped) {
    const bobA = clamp(vp.speed / RUN_SPEED, 0, 1);
    const ph = vp.walkPhase * 1.6;
    const w = curW(vp);
    let lower = vp.drawT > 0 ? (vp.drawT / vp.drawMax) * 0.45 : 0;
    if (w && w.reloadT > 0 && !w.def.shell) lower += Math.sin(clamp(1 - w.reloadT / w.def.reload, 0, 1) * Math.PI) * 0.22;
    if (w && w.reloadT > 0 && w.def.shell) lower += 0.06;
    if (vp.plantProg > 0) lower -= 0.05;
    const ads = vp.adsT || 0;
    drawViewmodel(g, SW, SH, vp, { ads, bobX: Math.cos(ph) * 10 * bobA * (1 - 0.7 * ads), bobY: Math.abs(Math.sin(ph)) * 12 * bobA * (1 - 0.7 * ads) + vp.crouch * 8, lower, kick: vp.vmKick, flash: vp.fireFlashT > 0 ? 1 : 0, swing: vp.vmSwing > 0 ? 1 - vp.vmSwing : 0, throwT: vp.throwT > 0 ? vp.throwT / 0.5 : 0, planting: vp.plantProg > 0 });
  }
  // ---- scope
  if (scoped) {
    const r = Math.min(SW, SH) * 0.46, cx = SW / 2, cy = SH / 2;
    g.fillStyle = '#000'; g.beginPath(); g.rect(0, 0, SW, SH); g.arc(cx, cy, r, 0, TAU, true); g.fill();
    g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
    const blur = clamp(vp.speed / 1.2, 0, 1); if (blur > 0.1) { g.fillStyle = `rgba(0,0,0,${blur * 0.35})`; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill(); }
    const mag = Math.tan(camFovFor(null) / 2) / Math.tan(G.cam.fov / 2);
    g.textAlign = 'center'; g.font = 'bold 15px Inter, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillText(mag.toFixed(1) + '×', cx, cy + r * 0.62); g.font = '11px Inter, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillText('mouse wheel: zoom · RMB: next level', cx, cy + r * 0.62 + 18);
  }
  // ---- smoke inside overlay
  for (const s of G.smokes) { const d = Math.hypot(G.cam.x - s.x, G.cam.y - s.y); if (d < 1.9) { g.fillStyle = `rgba(190,190,186,${smokeAlpha(s) * clamp((1.9 - d) / 0.8, 0, 1) * 0.92})`; g.fillRect(0, 0, SW, SH); } }
  // ---- crosshair
  if (vp && vp.alive) {
    const d = curWeaponDef(vp);
    const showCH = vp.cur >= 3 || (d && d.type !== 'sniper') || scoped;
    if (showCH && !scoped && (vp.adsT || 0) > 0.6) {
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(SW / 2 - 2.5, SH / 2 - 2.5, 5, 5); g.fillStyle = '#5ef06a'; g.fillRect(SW / 2 - 1.5, SH / 2 - 1.5, 3, 3);
    } else if (showCH && !scoped) {
      let sp = d && d.spread ? computeSpread(vp, d) : 0.01;
      const gap = 3 + sp * (SH / 2) / Math.tan(G.cam.fov / 2 * RND.H / RND.W) * 1.2;
      const len = 7, cx = SW / 2, cy = SH / 2;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(cx - gap - len - 1, cy - 1.5, len + 2, 3); g.fillRect(cx + gap - 1, cy - 1.5, len + 2, 3); g.fillRect(cx - 1.5, cy - gap - len - 1, 3, len + 2); g.fillRect(cx - 1.5, cy + gap - 1, 3, len + 2);
      g.fillStyle = '#5ef06a';
      g.fillRect(cx - gap - len, cy - 0.5, len, 1.5); g.fillRect(cx + gap, cy - 0.5, len, 1.5); g.fillRect(cx - 0.5, cy - gap - len, 1.5, len); g.fillRect(cx - 0.5, cy + gap, 1.5, len);
    }
    if (G.hitMarkT > 0 && vp === h) {
      const cx = SW / 2, cy = SH / 2; g.strokeStyle = `rgba(255,255,255,${G.hitMarkT / 0.15})`; g.lineWidth = 2; g.beginPath();
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.moveTo(cx + a * 6, cy + b * 6); g.lineTo(cx + a * 12, cy + b * 12); } g.stroke();
    }
  }
  // ---- name tags for teammates
  if (vp) {
    g.font = '600 12px "Trebuchet MS", sans-serif'; g.textAlign = 'center';
    for (const p of G.players) {
      if (!p.alive || p === vp || p.team !== vp.team) continue;
      const d = Math.hypot(p.x - vp.x, p.y - vp.y); if (d > 25) continue;
      if (!losClear(G.cam.x, G.cam.y, G.cam.z, p.x, p.y, bodyH(p))) continue;
      const pt = projectPoint(G.cam, p.x, p.y, bodyH(p) + 0.18, SW, SH); if (!pt) continue;
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(p.name, pt.x + 1, pt.y + 1); g.fillStyle = TEAM_HEX[p.team]; g.fillText(p.name, pt.x, pt.y);
    }
  }
  // ---- hurt / flash
  if (G.hurtT > 0 && h.alive) {
    const a = G.hurtT / 0.5;
    const gr = g.createRadialGradient(SW / 2, SH / 2, SH * 0.3, SW / 2, SH / 2, SH * 0.8);
    gr.addColorStop(0, 'rgba(180,0,0,0)'); gr.addColorStop(1, `rgba(180,0,0,${0.45 * a})`); g.fillStyle = gr; g.fillRect(0, 0, SW, SH);
    const rel = angDiff(h.yaw, G.hurtDir);
    g.save(); g.translate(SW / 2, SH / 2); g.rotate(rel); g.fillStyle = `rgba(255,40,40,${0.8 * a})`;
    g.beginPath(); g.moveTo(SH * 0.18, -22); g.lineTo(SH * 0.23, 0); g.lineTo(SH * 0.18, 22); g.closePath(); g.fill(); g.restore();
  }
  if (vp && vp.flash > 0) { g.fillStyle = `rgba(255,255,255,${clamp(vp.flash / 1.6, 0, 1)})`; g.fillRect(0, 0, SW, SH); }

  // ---- top centre: scores + timer
  const B = G.bomb;
  panel(g, SW / 2 - 160, 8, 320, 50);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 22px "Trebuchet MS", sans-serif';
  g.fillStyle = TEAM_HEX.R; g.fillText(G.score.R, SW / 2 - 112, 29);
  g.fillStyle = TEAM_HEX.W; g.fillText(G.score.W, SW / 2 + 112, 29);
  g.font = '11px "Trebuchet MS", sans-serif';
  g.fillStyle = TEAM_HEX.R; g.fillText('RAIDERS · ' + alive('R'), SW / 2 - 112, 48);
  g.fillStyle = TEAM_HEX.W; g.fillText(alive('W') + ' · WARDENS', SW / 2 + 112, 48);
  g.font = 'bold 24px "Trebuchet MS", sans-serif';
  if (B.state === 'planted') { const pulse = B.led > 0 ? '#ff3b3b' : '#c22'; g.fillStyle = pulse; g.fillText('💣 ' + B.site, SW / 2, 29); }
  else { g.fillStyle = G.phase === 'freeze' ? '#ffd27a' : (G.roundT < 20 ? '#ff7a6a' : '#fff'); g.fillText(fmtTime(G.phase === 'freeze' ? G.phaseT : G.roundT), SW / 2, 29); }
  g.font = '10px "Trebuchet MS", sans-serif'; g.fillStyle = '#aaa'; g.fillText('ROUND ' + G.round + ' · FIRST TO ' + G.settings.rounds, SW / 2, 48);

  // ---- radar
  drawRadar(g, vp || h);

  // ---- kill feed
  g.textAlign = 'right'; g.textBaseline = 'middle'; g.font = '600 13px "Trebuchet MS", sans-serif';
  let fy = 16;
  for (const f of G.feed.slice(-6)) {
    const wtxt = ` [${f.w}${f.hs ? ' ⦿' : ''}] `;
    const wk = g.measureText(f.k).width, ww = g.measureText(wtxt).width, wv = g.measureText(f.v).width;
    const tw = wk + ww + wv + 16, x = SW - 12;
    panel(g, x - tw, fy - 11, tw, 22, f.mine ? 0.75 : 0.5);
    if (f.mine) { g.strokeStyle = 'rgba(255,80,60,0.8)'; g.lineWidth = 1; g.strokeRect(x - tw + 0.5, fy - 10.5, tw - 1, 21); }
    g.fillStyle = TEAM_HEX[f.vt]; g.fillText(f.v, x - 8, fy);
    g.fillStyle = '#ddd'; g.fillText(wtxt, x - 8 - wv, fy);
    g.fillStyle = TEAM_HEX[f.kt] || '#ddd'; g.fillText(f.k, x - 8 - wv - ww, fy);
    fy += 26;
  }

  // ---- radio chat
  g.textAlign = 'left'; g.font = '13px "Trebuchet MS", sans-serif';
  let cy = SH - 150;
  for (let i = G.chat.length - 1; i >= 0; i--) {
    const c = G.chat[i]; if (c.team !== h.team) continue;
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(`${c.name} (radio): ${c.msg}`, 17, cy + 1);
    g.fillStyle = TEAM_HEX[c.team]; g.fillText(`${c.name} (radio): `, 16, cy);
    g.fillStyle = '#eee'; g.fillText(c.msg, 16 + g.measureText(`${c.name} (radio): `).width, cy);
    cy -= 18;
  }

  // ---- bottom panels
  const sp = vp && vp.alive ? vp : null;
  if (sp) {
    panel(g, 12, SH - 62, 250, 50);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = 'bold 30px "Trebuchet MS", sans-serif'; g.fillStyle = sp.hp <= 25 ? '#ff5a4a' : '#f2f2f2';
    g.fillText('✚ ' + sp.hp, 24, SH - 36);
    g.fillStyle = '#9fc6ff'; g.fillText((sp.helmet ? '⛨ ' : '◈ ') + sp.armor, 140, SH - 36);
    if (sp === h || sp.team === h.team) {
      g.font = 'bold 22px "Trebuchet MS", sans-serif'; g.fillStyle = '#7dea7d';
      panel(g, 12, SH - 102, 140, 34); g.fillStyle = '#7dea7d'; g.fillText('$ ' + sp.money, 24, SH - 85);
    }
    if (sp === h && canBuy(h)) { panel(g, 160, SH - 102, 102, 34); g.font = 'bold 13px "Trebuchet MS", sans-serif'; g.fillStyle = '#ffd27a'; g.fillText('BUY  [B]', 176, SH - 85); }
    // equipment icons
    let ix = 270; g.font = 'bold 13px "Trebuchet MS", sans-serif';
    const tag = (t, col) => { const w = g.measureText(t).width + 14; panel(g, ix, SH - 44, w, 26); g.fillStyle = col; g.fillText(t, ix + 7, SH - 31); ix += w + 6; };
    if (sp.hasBomb) tag('💣 BOMB', '#ff7766');
    if (sp.kit) tag('✂ KIT', '#9fc6ff');
    if (sp.nades.he) tag('HE', '#a6c27a'); if (sp.nades.flash) tag('FL×' + sp.nades.flash, '#ddd'); if (sp.nades.smoke) tag('SM', '#bbb'); if (sp.nades.fire) tag('INC', '#ff9a50');
    // ammo
    const w = curW(sp);
    panel(g, SW - 232, SH - 62, 220, 50);
    g.textAlign = 'right';
    if (w && w.def.mag) {
      g.font = 'bold 30px "Trebuchet MS", sans-serif'; g.fillStyle = w.mag <= Math.ceil(w.def.mag * 0.2) ? '#ff6a5a' : '#f2f2f2';
      g.fillText(w.mag, SW - 110, SH - 36);
      g.font = 'bold 18px "Trebuchet MS", sans-serif'; g.fillStyle = '#aaa'; g.fillText('/ ' + w.reserve, SW - 30, SH - 34);
    } else { g.font = 'bold 20px "Trebuchet MS", sans-serif'; g.fillStyle = '#ddd'; g.fillText(sp.cur === 4 ? ({ he: 'HE Grenade', flash: 'Flashbang', smoke: 'Smoke', fire: 'Incendiary' }[sp.nadeSel] + ' ×' + sp.nades[sp.nadeSel]) : sp.cur === 5 ? 'Bomb' : 'Knife', SW - 28, SH - 36); }
    g.font = '11px "Trebuchet MS", sans-serif'; g.fillStyle = '#bbb';
    g.fillText(w ? w.def.name.toUpperCase() + (w.reloadT > 0 ? '  ·  RELOADING' : '') : '', SW - 28, SH - 72);
  }
  // ---- plant / defuse progress
  let prog = 0, label = '';
  if (sp && sp.plantProg > 0) { prog = sp.plantProg / CFG.PLANT_TIME; label = 'PLANTING BOMB'; }
  if (sp && B.defuser === sp) { prog = B.defuseProg / (sp.kit ? CFG.DEFUSE_KIT : CFG.DEFUSE); label = 'DEFUSING'; }
  if (prog > 0) {
    const bw = 300, bx = SW / 2 - bw / 2, by = SH * 0.68;
    panel(g, bx - 6, by - 26, bw + 12, 46, 0.65);
    g.fillStyle = '#333'; g.fillRect(bx, by, bw, 10); g.fillStyle = label === 'DEFUSING' ? '#7fb6ff' : '#ff8a5a'; g.fillRect(bx, by, bw * clamp(prog, 0, 1), 10);
    g.textAlign = 'center'; g.font = 'bold 13px "Trebuchet MS", sans-serif'; g.fillStyle = '#fff'; g.fillText(label, SW / 2, by - 12);
  }
  // hints
  if (sp === h && h.alive) {
    let hint = '';
    if (h.hasBomb && siteAt(h.x, h.y) && G.phase === 'live' && h.cur !== 5) hint = 'You are in a bomb site — press 5, then hold FIRE to plant';
    else if (h.hasBomb && h.cur === 5 && !siteAt(h.x, h.y)) hint = 'Get to bomb site A or B to plant';
    else if (h.team === 'W' && B.state === 'planted' && Math.hypot(B.x - h.x, B.y - h.y) < 1.15 && B.defuser !== h) hint = 'Hold E to defuse';
    if (hint) { g.textAlign = 'center'; g.font = 'bold 15px "Trebuchet MS", sans-serif'; const tw = g.measureText(hint).width + 24; panel(g, SW / 2 - tw / 2, SH * 0.74, tw, 28); g.fillStyle = '#ffd27a'; g.fillText(hint, SW / 2, SH * 0.74 + 14); }
  }
  // ---- spectator banner
  if (!h.alive && G.state === 'play') {
    g.textAlign = 'center'; g.font = 'bold 16px "Trebuchet MS", sans-serif';
    const t = vp ? `Spectating ${vp.name}  ·  SPACE / wheel to switch` : (G.killer ? `Killed by ${G.killer.name}` : 'You died');
    panel(g, SW / 2 - 230, SH - 52, 460, 34); g.fillStyle = vp ? TEAM_HEX[vp.team] : '#ff7a6a'; g.fillText(t, SW / 2, SH - 35);
  }
  // ---- center message
  const C = G.center;
  if (C && G.time - C.t < C.dur) {
    const a = clamp((C.dur - (G.time - C.t)) / 0.6, 0, 1);
    g.globalAlpha = a; g.textAlign = 'center';
    g.font = 'bold 40px "Trebuchet MS", sans-serif'; g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(C.text, SW / 2 + 2, SH * 0.28 + 2); g.fillStyle = C.color; g.fillText(C.text, SW / 2, SH * 0.28);
    if (C.sub) { g.font = '18px "Trebuchet MS", sans-serif'; g.fillStyle = '#eee'; g.fillText(C.sub, SW / 2, SH * 0.28 + 36); }
    g.globalAlpha = 1;
  }
  if (G.toast && G.time - G.toast.t < 2.5) {
    g.textAlign = 'center'; g.font = 'bold 15px "Trebuchet MS", sans-serif'; const tw = g.measureText(G.toast.text).width + 26;
    panel(g, SW / 2 - tw / 2, SH * 0.36, tw, 30, 0.7); g.fillStyle = '#ffd27a'; g.fillText(G.toast.text, SW / 2, SH * 0.36 + 15);
  }
  if (G.showScores || G.phase === 'end' && G.phaseT < 2.5) drawScoreboard(g, SW, SH);
  if (G.state === 'play' && !G.paused && !G.buyOpen && !document.pointerLockElement && !G.test) {
    g.textAlign = 'center'; g.font = 'bold 16px "Trebuchet MS", sans-serif';
    const t = 'Click to capture the mouse for full 360° aim', tw = g.measureText(t).width + 30;
    panel(g, SW / 2 - tw / 2, SH * 0.42, tw, 34, 0.75); g.fillStyle = '#ffd27a'; g.fillText(t, SW / 2, SH * 0.42 + 17);
  }
}
function drawRadar(g, me) {
  const R = HUD.radar, s = HUD.rs, ox = 12, oy = 12;
  g.drawImage(R, ox, oy);
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.strokeRect(ox + 0.5, oy + 0.5, R.width, R.height);
  const B = G.bomb, h = G.human;
  for (const p of G.players) {
    if (!p.alive) continue;
    const mate = p.team === h.team;
    if (!mate && G.time - p.spottedT > 1.2) continue;
    const x = ox + p.x * s, y = oy + p.y * s;
    g.fillStyle = mate ? TEAM_HEX[p.team] : '#ff3b30';
    g.beginPath(); g.arc(x, y, p === me ? s * 0.9 : s * 0.7, 0, TAU); g.fill();
    if (p === me) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(p.yaw) * s * 2.6, y + Math.sin(p.yaw) * s * 2.6); g.stroke(); }
    if (p.hasBomb && h.team === 'R') { g.fillStyle = '#ff3b30'; g.fillRect(x - 2, y - s * 1.8, 4, 4); }
  }
  if ((B.state === 'dropped' && h.team === 'R') || B.state === 'planted') {
    const blink = B.state === 'planted' ? (B.led > 0) : (Math.floor(G.time * 3) % 2 === 0);
    g.fillStyle = blink ? '#ff3b30' : '#a01010'; g.fillRect(ox + B.x * s - 3, oy + B.y * s - 3, 6, 6);
  }
}
function drawScoreboard(g, SW, SH) {
  const w = Math.min(760, SW - 40), x = SW / 2 - w / 2, y = 80, rowH = 26;
  const teams = ['R', 'W'];
  const rows = Math.max(...teams.map(t => G.players.filter(p => p.team === t).length));
  const h = 70 + (rows * rowH + 40) * 2;
  panel(g, x, y, w, h, 0.82);
  g.textBaseline = 'middle';
  let yy = y + 26;
  g.textAlign = 'center'; g.font = 'bold 18px "Trebuchet MS", sans-serif'; g.fillStyle = '#fff';
  g.fillText(`${MAP ? MAP.name : ''}  ·  Round ${G.round}  ·  ${G.score.R} : ${G.score.W}`, SW / 2, yy); yy += 30;
  for (const t of teams) {
    g.textAlign = 'left'; g.font = 'bold 15px "Trebuchet MS", sans-serif'; g.fillStyle = TEAM_HEX[t];
    g.fillText(`${TEAM_NAME[t].toUpperCase()}  ${G.score[t]}`, x + 20, yy);
    g.font = '11px "Trebuchet MS", sans-serif'; g.fillStyle = '#999'; g.textAlign = 'right';
    g.fillText('MONEY', x + w - 230, yy); g.fillText('KILLS', x + w - 140, yy); g.fillText('DEATHS', x + w - 70, yy); g.fillText('HS', x + w - 20, yy);
    yy += 22;
    const list = G.players.filter(p => p.team === t).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    for (const p of list) {
      if (p === G.human) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 10, yy - rowH / 2, w - 20, rowH); }
      g.textAlign = 'left'; g.font = '14px "Trebuchet MS", sans-serif'; g.fillStyle = p.alive ? '#eee' : '#777';
      g.fillText((p.alive ? '' : '✝ ') + p.name + (p.isBot && p !== G.human ? '  [BOT]' : '') + (p.hasBomb && G.human.team === t ? '  💣' : '') + (p.kit && G.human.team === t ? '  ✂' : ''), x + 24, yy);
      g.textAlign = 'right';
      g.fillText(t === G.human.team ? '$' + p.money : '—', x + w - 230, yy);
      g.fillText(p.kills, x + w - 140, yy); g.fillText(p.deaths, x + w - 70, yy); g.fillText(p.hs, x + w - 20, yy);
      yy += rowH;
    }
    yy += 18;
  }
}

// ------------------------------------------------------------ world sprites
function gatherSprites(cam, vp) {
  const L = [];
  const crx = -Math.sin(cam.yaw), cry = Math.cos(cam.yaw);
  for (const p of G.players) {
    if (p === vp && p.alive) continue;
    const dark = !!(flagsAt(p.x, p.y) & FL_IN);
    if (!p.alive) { L.push({ x: p.x, y: p.y, z: 0, w: 1.0, h: 0.29, tex: SPR['dead' + p.team], flip: p.id % 2 === 1, dark }); continue; }
    const toCam = Math.atan2(cam.y - p.y, cam.x - p.x), rel = Math.abs(angDiff(p.yaw, toCam));
    let view = rel < Math.PI / 4 ? 0 : rel > 3 * Math.PI / 4 ? 1 : 2;
    const flip = view === 2 && (Math.cos(p.yaw) * crx + Math.sin(p.yaw) * cry) < 0;
    const frame = p.speed > 0.4 ? (Math.floor(p.walkPhase * 0.9) % 2) : 0;
    const hh = bodyH(p) - p.z;
    L.push({ x: p.x, y: p.y, z: p.z, w: 0.5, h: hh, tex: SPR[p.team][view][frame], flip, dark });
    if (p.fireFlashT > 0) {
      const fx = Math.cos(p.yaw), fy = Math.sin(p.yaw);
      L.push({ x: p.x + fx * 0.34 - fy * 0.04, y: p.y + fy * 0.34 + fx * 0.04, z: p.z + hh * 0.5, w: 0.3, h: 0.3, tex: SPR.flash, mode: 2, alpha: 1 });
    }
  }
  for (const it of G.items) L.push({ x: it.x, y: it.y, z: 0, w: 0.55, h: 0.16, tex: SPR.gun, dark: !!(flagsAt(it.x, it.y) & FL_IN) });
  const B = G.bomb;
  if (B.state === 'dropped' || B.state === 'planted' || B.state === 'defused') L.push({ x: B.x, y: B.y, z: 0, w: 0.36, h: 0.18, tex: (B.state === 'planted' && B.led > 0) ? SPR.bomb1 : SPR.bomb0 });
  for (const n of G.nades) L.push({ x: n.x, y: n.y, z: n.z - 0.06, w: 0.13, h: 0.15, tex: SPR.nade });
  for (const s of G.smokes) { const a = smokeAlpha(s) * 0.9; if (a <= 0.01) continue; for (const q of s.puffs) L.push({ x: q.x, y: q.y, z: q.z, w: q.s, h: q.s, tex: SPR.smoke, mode: 1, alpha: a }); }
  for (const f of G.fires) {
    const fade = clamp((f.life - f.t) / 1.5, 0, 1) * clamp(f.t / 0.3, 0, 1);
    for (const q of f.flames) { const fl = 0.75 + 0.25 * Math.sin(G.time * 11 + q.ph); const s = q.s * fl * (0.6 + 0.4 * fade); L.push({ x: q.x, y: q.y, z: 0, w: s * 0.8, h: s, tex: SPR.fire, mode: 2, alpha: 0.9 * fade }); }
  }
  for (const f of G.fx) {
    const k = f.t / f.life;
    if (f.type === 'puff') L.push({ x: f.x, y: f.y, z: f.z - f.size / 2, w: f.size * (1 + k), h: f.size * (1 + k), tex: SPR.puff, mode: 1, alpha: 0.8 * (1 - k) });
    else if (f.type === 'spark') L.push({ x: f.x, y: f.y, z: f.z - f.size / 2, w: f.size, h: f.size, tex: SPR.spark, mode: 2, alpha: 1 - k });
    else if (f.type === 'blood') L.push({ x: f.x, y: f.y, z: f.z - f.size / 2 - k * 0.2, w: f.size * (1 + k), h: f.size * (1 + k), tex: SPR.blood, mode: 1, alpha: 1 - k });
    else if (f.type === 'boom') { const s = f.size * (0.4 + k); L.push({ x: f.x, y: f.y, z: f.z - s / 2, w: s, h: s, tex: SPR.boom, mode: 2, alpha: 1 - k }); }
  }
  return L;
}

// ------------------------------------------------------------ render frame
let menuT = 0;
function renderFrame(dt) {
  const cam = G.cam;
  if (G.state === 'menu' || G.state === 'lobby' || !G.human) {
    menuT += dt;
    if (!G.flyPt || G.flyMap !== (MAP && MAP.id)) { G.flyMap = MAP && MAP.id; G.flyPt = snapWalk((SITES.A.cx + SPAWNS.wc[0]) / 2, (SITES.A.cy + SPAWNS.wc[1]) / 2); G.flyAim = Math.atan2(SPAWNS.rc[1] - G.flyPt[1], SPAWNS.rc[0] - G.flyPt[0]); }
    cam.x = G.flyPt[0]; cam.y = G.flyPt[1]; cam.z = STAND_EYE; cam.yaw = G.flyAim + Math.sin(menuT * 0.11) * 1.4; cam.pitch = 0.05; cam.fov = camFovFor(null);
    renderScene(cam, []);
    drawHUD(); return;
  }
  const vp = G.viewP;
  if (vp) {
    const vd = curWeaponDef(vp), tgt = (vp.alive && vp.zoom > 0 && vd && vd.ads) ? 1 : 0;
    vp.adsT = (vp.adsT || 0) + (tgt - (vp.adsT || 0)) * Math.min(1, dt * 14);
    cam.x = vp.x; cam.y = vp.y; cam.z = eyeZ(vp); cam.yaw = vp.yaw + vp.punchY; cam.pitch = vp.pitch + vp.punchP; cam.fov = camFovFor(vp);
  } else { const h = G.human; cam.x = h.x; cam.y = h.y; cam.z = 0.25; cam.yaw = h.yaw; cam.pitch = 0.2; cam.fov = camFovFor(null); }
  if (G.shakeT > 0) { cam.yaw += rand(-1, 1) * 0.015 * G.shakeT; cam.pitch += rand(-1, 1) * 0.015 * G.shakeT; }
  renderScene(cam, gatherSprites(cam, vp));
  drawHUD();
}

// ------------------------------------------------------------ UI glue
const UI = {
  renderBuy() {
    const h = G.human, el = document.getElementById('buy-cats');
    document.getElementById('buy-money').textContent = '$' + h.money;
    document.getElementById('buy-time').textContent = Math.ceil(buyTimeLeft()) + 's left';
    el.innerHTML = '';
    BUY_MENU.forEach((cat, ci) => {
      const col = document.createElement('div'); col.className = 'buy-col' + (G.buyCat === ci ? ' sel' : '');
      col.innerHTML = `<h4><span class="k">${ci + 1}</span>${cat.name}</h4>`;
      cat.items.filter(k => itemAllowed(h, k)).forEach((k, ii) => {
        const d = WEAPONS[k] || GEAR[k], price = itemPrice(h, k), owned = itemOwned(h, k);
        const b = document.createElement('button');
        b.className = 'buy-item' + (owned ? ' owned' : '') + (price > h.money ? ' poor' : '');
        b.innerHTML = `<span class="k">${ii + 1}</span><span class="n">${d.name}</span><span class="p">${owned ? 'owned' : '$' + price}</span>`;
        b.title = WEAPONS[k] ? weaponBlurb(WEAPONS[k]) : '';
        b.onclick = () => { tryBuy(h, k); UI.renderBuy(); };
        col.appendChild(b);
      });
      el.appendChild(col);
    });
  },
  showEnd() {
    const h = G.human, won = G.matchWinner === h.team;
    document.getElementById('end-title').textContent = won ? 'VICTORY' : 'DEFEAT';
    document.getElementById('end-title').style.color = won ? '#7dea7d' : '#ff6a5a';
    document.getElementById('end-sub').textContent = `${TEAM_NAME[G.matchWinner]} win the match ${G.score[G.matchWinner]} – ${G.score[enemyOf(G.matchWinner)]}`;
    const best = G.players.slice().sort((a, b) => b.kills - a.kills)[0];
    document.getElementById('end-stats').innerHTML = `Your score: <b>${h.kills}</b> kills · <b>${h.deaths}</b> deaths · <b>${h.hs}</b> headshots<br>Top fragger: <b style="color:${TEAM_HEX[best.team]}">${best.name}</b> (${best.kills} kills)`;
    document.getElementById('end').classList.remove('hidden');
  },
};
function weaponBlurb(d) { return `${d.dmg}${d.pellets ? '×' + d.pellets : ''} dmg · ${Math.round(60 / d.rate)} rpm · ${d.mag || '-'} mag · armor pen ${Math.round(d.pen * 100)}%`; }
