'use strict';
// ============================================================
//  Bot AI — A* navigation, perception (FOV + LOS + smoke + hearing),
//  reaction time, aim error, burst control, objective play, buying.
// ============================================================
const DIFF = {
  easy: { react: 0.75, err: 0.075, turn: 5.0, head: 0.08, crouch: 0.15, burstFar: 3, comp: 0.3, fov: 1.0 },
  normal: { react: 0.45, err: 0.042, turn: 8.0, head: 0.22, crouch: 0.3, burstFar: 4, comp: 0.55, fov: 1.1 },
  hard: { react: 0.3, err: 0.024, turn: 11.0, head: 0.38, crouch: 0.4, burstFar: 5, comp: 0.75, fov: 1.2 },
  expert: { react: 0.19, err: 0.013, turn: 15.0, head: 0.55, crouch: 0.45, burstFar: 6, comp: 0.9, fov: 1.3 },
};
// Routes, defender posts and entry points are per-map. Hand-tuned when the map
// provides them, otherwise derived from the layout with A* (see aiPrepareMap).
let ROUTES = { A: [], B: [] }, POSTS = {}, ENTRY_LOOK = { A: [], B: [] };
let AS = { g: null, f: null, from: null, stamp: null, closed: null, pen: null, run: 0 };
function aiPrepareMap() {
  const N = MW * MH;
  AS = { g: new Float32Array(N), f: new Float32Array(N), from: new Int32Array(N), stamp: new Int32Array(N), closed: new Int32Array(N), pen: new Float32Array(N), run: 0 };
  const def = MAP, snap = (p) => snapWalk(p[0], p[1]);
  ROUTES = { A: [], B: [] }; POSTS = {}; ENTRY_LOOK = { A: [], B: [] };
  for (const k of ['A', 'B']) {
    const tgt = [SITES[k].cx, SITES[k].cy];
    if (def.routes) ROUTES[k] = def.routes[k].map((pts, i) => ({ name: k + i, pts: pts.map(snap) }));
    const entries = [];
    const entryOf = (path) => { if (!path) return null; for (let i = 0; i < path.length; i++) if (siteAt(path[i][0], path[i][1]) === k) return path[Math.max(0, i - 1)]; return null; };
    const sample = (path, fr) => fr.map(f => path[Math.min(path.length - 1, Math.floor(path.length * f))]);
    const p0 = astar(SPAWNS.rc[0], SPAWNS.rc[1], tgt[0], tgt[1]);
    let p1 = null;
    if (p0) {
      AS.pen.fill(0);
      for (let i = Math.floor(p0.length * 0.2); i < Math.floor(p0.length * 0.92); i++) {
        const cx = Math.floor(p0[i][0]), cy = Math.floor(p0[i][1]);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < MW && y < MH) AS.pen[y * MW + x] = 8; }
      }
      p1 = astar(SPAWNS.rc[0], SPAWNS.rc[1], tgt[0], tgt[1]);
      AS.pen.fill(0);
      if (!def.routes) {
        ROUTES[k].push({ name: k + 'main', pts: sample(p0, [0.4, 0.75]) });
        if (p1 && p1.length < p0.length * 1.9) ROUTES[k].push({ name: k + 'alt', pts: sample(p1, [0.4, 0.75]) });
      }
      entries.push(entryOf(p0)); if (p1) entries.push(entryOf(p1));
    }
    const pc = astar(SPAWNS.wc[0], SPAWNS.wc[1], tgt[0], tgt[1]);
    entries.push(entryOf(pc));
    const ent = entries.filter(Boolean).filter((e, i, l) => l.findIndex(o => Math.hypot(o[0] - e[0], o[1] - e[1]) < 2) === i);
    ENTRY_LOOK[k] = def.entry ? def.entry[k] : ent.map(e => [e[0], e[1]]);
    if (!ROUTES[k].length) ROUTES[k].push({ name: k + 'direct', pts: [] });
    if (def.posts && def.posts[k]) POSTS[k] = { spots: def.posts[k].spots.map(snap), look: def.posts[k].look };
    else {
      // defender spots: inside the site, near cover, a few cells back from where attackers arrive
      const scored = SITES[k].cells.map(([x, y]) => {
        let cover = 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (solidCell(x + dx, y + dy)) cover++;
        const dEnt = ent.length ? Math.min(...ent.map(e => Math.hypot(e[0] - x - 0.5, e[1] - y - 0.5))) : 6;
        const sc = (dEnt > 2.5 && dEnt < 9 ? 4 : 0) + Math.min(cover, 3) + Math.random() * 2;
        return { p: [x + 0.5, y + 0.5], sc };
      }).filter(o => !solidAt(o.p[0], o.p[1])).sort((a, b) => b.sc - a.sc);
      const spots = [];
      for (const o of scored) { if (spots.length >= 5) break; if (spots.every(q => Math.hypot(q[0] - o.p[0], q[1] - o.p[1]) > 2)) spots.push(o.p); }
      POSTS[k] = { spots: spots.length ? spots : [tgt], look: ENTRY_LOOK[k].length ? ENTRY_LOOK[k] : [tgt] };
    }
  }
  if (def.posts && def.posts.mid) POSTS.mid = { spots: def.posts.mid.spots.map(snap), look: def.posts.mid.look };
}

// ---------------- A* on the grid ----------------
function walkableCell(x, y) { return x >= 0 && y >= 0 && x < MW && y < MH && mapWall[y * MW + x] === 0; }
function astar(sx, sy, tx, ty) {
  sx = Math.floor(sx); sy = Math.floor(sy); tx = Math.floor(tx); ty = Math.floor(ty);
  if (!walkableCell(tx, ty)) { const s = snapWalk(tx + 0.5, ty + 0.5); tx = Math.floor(s[0]); ty = Math.floor(s[1]); }
  if (!walkableCell(sx, sy)) { const s = snapWalk(sx + 0.5, sy + 0.5); sx = Math.floor(s[0]); sy = Math.floor(s[1]); }
  const run = ++AS.run, start = sy * MW + sx, goal = ty * MW + tx;
  const heap = [start];
  AS.g[start] = 0; AS.f[start] = Math.hypot(tx - sx, ty - sy); AS.from[start] = -1; AS.stamp[start] = run;
  const push = (i) => { heap.push(i); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (AS.f[heap[p]] <= AS.f[heap[c]]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (; ;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && AS.f[heap[l]] < AS.f[heap[m]]) m = l; if (r < heap.length && AS.f[heap[r]] < AS.f[heap[m]]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  let found = false, iter = 0;
  while (heap.length && iter++ < 4000) {
    const cur = pop();
    if (AS.closed[cur] === run) continue;
    AS.closed[cur] = run;
    if (cur === goal) { found = true; break; }
    const cx = cur % MW, cy = (cur / MW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (!walkableCell(nx, ny)) continue;
      if (dx && dy && (!walkableCell(cx + dx, cy) || !walkableCell(cx, cy + dy))) continue;
      const ni = ny * MW + nx;
      if (AS.closed[ni] === run) continue;
      // wall-hugging penalty keeps bots off corners
      let pen = 0; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!walkableCell(nx + ox, ny + oy)) pen += 0.18;
      const ng = AS.g[cur] + (dx && dy ? 1.414 : 1) + pen + AS.pen[ni];
      if (AS.stamp[ni] !== run || ng < AS.g[ni]) {
        AS.stamp[ni] = run; AS.g[ni] = ng; AS.from[ni] = cur; AS.f[ni] = ng + Math.hypot(tx - nx, ty - ny); push(ni);
      }
    }
  }
  if (!found) return null;
  const path = []; let c = goal;
  while (c !== -1) { path.push([(c % MW) + 0.5, ((c / MW) | 0) + 0.5]); c = AS.from[c]; }
  return path.reverse();
}

// ---------------- lifecycle ----------------
function aiInit(b) {
  b.ai = { path: null, pi: 0, wps: [], wi: 0, goal: null, goalDirty: true, mode: 'route', target: null, visible: false, lastSeenT: -9, reactAt: 0, lastKnown: null, lastKnownT: -9,
    errY: 0, errP: 0, errT: 0, aimPart: 'chest', percT: 0, strafeT: 0, strafeDir: 1, burst: 0, burstPause: 0, crouchFight: false, lookAt: null, lookUntil: 0, holdYaw: 0, scanT: 0,
    stuckT: 0, lastX: 0, lastY: 0, jitterT: 0, skipT: 0, buyAt: 0, bought: false, role: '', site: 'A', post: null, rotateT: 0, nadeDone: false, radioT: 0, wantReload: false };
}
function aiRoundStart(b) {
  const ai = b.ai; aiInit(b); const a = b.ai;
  a.buyAt = rand(0.3, 2.2);
  if (b.team === 'R') {
    // team plan: shared per round
    if (!G.tPlan || G.tPlan.round !== G.round) {
      const site = Math.random() < 0.5 ? 'A' : 'B';
      G.tPlan = { round: G.round, site, route: pick(ROUTES[site]), alt: pick(ROUTES[site]) };
    }
    a.site = G.tPlan.site;
    const route = (Math.random() < 0.25 && !b.hasBomb) ? G.tPlan.alt : G.tPlan.route;
    a.wps = route.pts.slice(); a.wps.push(sitePoint(a.site, b.hasBomb));
    a.mode = 'route';
  } else {
    if (!G.ctPlan || G.ctPlan.round !== G.round) G.ctPlan = { round: G.round, n: 0, order: shuffle(['A', 'B', 'A', 'B', POSTS.mid ? 'mid' : pick(['A', 'B'])]) };
    let role = G.ctPlan.order[G.ctPlan.n++ % G.ctPlan.order.length];
    if (!POSTS[role]) role = pick(['A', 'B']);
    a.role = role; a.site = role === 'mid' ? 'A' : role;
    a.post = pick(POSTS[role].spots);
    a.wps = [a.post]; a.mode = 'route';
  }
  a.wi = 0; a.goalDirty = true;
}
function sitePoint(site, plant) {
  const cells = SITES[site].cells;
  for (let i = 0; i < 30; i++) {
    const c = pick(cells);
    let open = 0; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (walkableCell(c[0] + ox, c[1] + oy)) open++;
    if (open >= 3 || i > 20) return [c[0] + 0.5, c[1] + 0.5];
  }
  return [SITES[site].cx, SITES[site].cy];
}
function aiOnDamaged(b, a) {
  const ai = b.ai; if (!ai || !b.alive) return;
  if (!ai.visible) { ai.lookAt = { x: a.x, y: a.y }; ai.lookUntil = G.time + 1.5; ai.lastKnown = { x: a.x, y: a.y }; ai.lastKnownT = G.time; }
  if (G.time - ai.radioT > 6 && Math.random() < 0.3) { ai.radioT = G.time; radio(b, 'Taking fire, need assistance!'); }
}

// ---------------- buying ----------------
function botBuy(b) {
  const m = () => b.money;
  const rifle = b.team === 'R' ? 'avk' : 'mlance', cheap = b.team === 'R' ? 'hyena' : 'gallant';
  const pistolRound = G.round === 1;
  if (!b.slots[1]) {
    if (m() >= 4750 + 1000 && Math.random() < 0.18) tryBuy(b, 'longshot', true);
    else if (m() >= 5200 + 1000 && Math.random() < 0.08) tryBuy(b, 'bulwark', true);
    else if (m() >= 4200 + 1000 && Math.random() < 0.1) tryBuy(b, 'ridgeline', true);
    else if (m() >= 3300 + 1000 && Math.random() < 0.2) tryBuy(b, 'strix', true);
    else if (m() >= WEAPONS[rifle].price + 1000) tryBuy(b, rifle, true);
    else if (m() >= WEAPONS[cheap].price + 650 && Math.random() < 0.8) tryBuy(b, cheap, true);
    else if (!pistolRound && m() >= 2300 && Math.random() < 0.5) tryBuy(b, pick(['vespa', 'breacher', 'ratchet', 'kestrel', 'ratchet']), true);
  }
  if (m() >= 1000 && !(b.armor >= 100 && b.helmet)) tryBuy(b, 'vesthelm', true);
  else if (m() >= 650 && b.armor < 100) tryBuy(b, 'vest', true);
  if (!b.slots[1] && m() >= 700 && Math.random() < 0.5) tryBuy(b, pick(['hawk', 'duke', 'viper']), true);
  if (b.team === 'W' && m() >= 400 && Math.random() < 0.6) tryBuy(b, 'kit', true);
  if (m() >= 600 && Math.random() < 0.6) tryBuy(b, 'he', true);
  if (m() >= 500 && Math.random() < 0.5) tryBuy(b, 'flash', true);
  if (m() >= 700 && Math.random() < 0.45) tryBuy(b, 'smoke', true);
  if (m() >= 900 && Math.random() < 0.35) tryBuy(b, 'fire', true);
  if (b.slots[1]) switchSlot(b, 1);
}

// ---------------- perception ----------------
function perceive(b, D) {
  const ai = b.ai, ez = eyeZ(b);
  let best = null, bd = 1e9;
  const blind = b.flash > 0.6;
  if (!blind) for (const e of G.players) {
    if (!e.alive || e.team === b.team) continue;
    const dx = e.x - b.x, dy = e.y - b.y, d = Math.hypot(dx, dy);
    if (d > 45) continue;
    const ang = Math.abs(angDiff(b.yaw, Math.atan2(dy, dx)));
    if (ang > D.fov && d > 1.8) continue;
    if (smokeBlocks(b.x, b.y, e.x, e.y)) continue;
    const top = bodyH(e);
    if (!losClear(b.x, b.y, ez, e.x, e.y, top - 0.08) && !losClear(b.x, b.y, ez, e.x, e.y, e.z + (top - e.z) * 0.55)) continue;
    // far, crouched, still targets are harder to notice
    if (d > 22 && e.speed < 0.3 && Math.random() < 0.5) continue;
    if (d < bd) { bd = d; best = e; }
  }
  if (best) {
    if (ai.target !== best || !ai.visible) {
      if (ai.target !== best || G.time - ai.lastSeenT > 1.2) {
        ai.reactAt = G.time + D.react * rand(0.8, 1.35) * (G.time - ai.lastSeenT < 3 ? 0.6 : 1);
        ai.errT = 0; ai.aimPart = Math.random() < D.head ? 'head' : 'chest';
        ai.errY = rand(-1, 1) * D.err * 2.5; ai.errP = rand(-1, 1) * D.err * 1.5;
        ai.crouchFight = Math.random() < D.crouch;
      }
      if (G.time - ai.radioT > 8 && Math.random() < 0.4) { ai.radioT = G.time; radio(b, pick(['Enemy spotted!', 'Contact!', 'I see one!'])); }
    }
    ai.target = best; ai.visible = true; ai.lastSeenT = G.time; ai.lastKnown = { x: best.x, y: best.y }; ai.lastKnownT = G.time;
    best.spottedT = G.time;
    // share intel: teammates near-by turn their heads
    for (const m of G.players) if (m !== b && m.alive && m.isBot && m.team === b.team && m.ai && Math.hypot(m.x - b.x, m.y - b.y) < 12 && !m.ai.visible) { m.ai.lastKnown = { x: best.x, y: best.y }; m.ai.lastKnownT = G.time; }
    // wardens rotate to where raiders are seen
    if (b.team === 'W' && G.bomb.state !== 'planted' && G.time > (G.ctRotateT || 0)) {
      const sA = Math.hypot(best.x - SITES.A.cx, best.y - SITES.A.cy), sB = Math.hypot(best.x - SITES.B.cx, best.y - SITES.B.cy);
      const s = sA < 9 ? 'A' : sB < 9 ? 'B' : null;
      if (s) G.ctRotateT = G.time + 10;
      if (s) for (const m of G.players) if (m.isBot && m.alive && m.team === 'W' && m.ai && m.ai.site !== s && Math.random() < 0.5) { m.ai.site = s; m.ai.post = pick(POSTS[s].spots); m.ai.wps = [m.ai.post]; m.ai.wi = 0; m.ai.goalDirty = true; m.ai.role = s; }
    }
  } else {
    ai.visible = false;
    if (ai.target && (!ai.target.alive || G.time - ai.lastSeenT > 5)) ai.target = null;
    // hearing
    for (const n of G.noises) {
      if (n.team === b.team || G.time - n.t > 0.5) continue;
      const d = Math.hypot(n.x - b.x, n.y - b.y);
      if (d < n.r && d > 0.5) {
        if (G.time > ai.lookUntil || Math.random() < 0.2) { ai.lookAt = { x: n.x, y: n.y }; ai.lookUntil = G.time + rand(1.0, 2.0); }
        if (d < 18 && (!ai.lastKnown || G.time - ai.lastKnownT > 2)) { ai.lastKnown = { x: n.x, y: n.y }; ai.lastKnownT = G.time - 1.5; }
      }
    }
  }
}

// ---------------- navigation helpers ----------------
function setGoal(b, x, y) {
  const ai = b.ai;
  if (ai.goal && Math.hypot(ai.goal[0] - x, ai.goal[1] - y) < 0.5 && ai.path && !ai.goalDirty) return;
  ai.goal = [x, y]; ai.path = astar(b.x, b.y, x, y); ai.pi = 0; ai.goalDirty = false;
}
function followPath(b, dt) {
  const ai = b.ai;
  if (!ai.path || ai.pi >= ai.path.length) return null;
  ai.skipT -= dt;
  if (ai.skipT <= 0) {
    ai.skipT = 0.2;
    for (let k = 0; k < 3 && ai.pi + 1 < ai.path.length; k++) {
      const n = ai.path[ai.pi + 1];
      if (walkLine(b.x, b.y, n[0], n[1], P_RADIUS + 0.03)) ai.pi++; else break;
    }
  }
  let p = ai.path[ai.pi];
  if (Math.hypot(p[0] - b.x, p[1] - b.y) < 0.3) { ai.pi++; if (ai.pi >= ai.path.length) return null; p = ai.path[ai.pi]; }
  return p;
}
function steer(b, tx, ty, mag) {
  let dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
  if (d < 1e-3) { b.in.mag = 0; return; }
  dx /= d; dy /= d;
  // separation from teammates
  for (const o of G.players) {
    if (o === b || !o.alive) continue;
    const ox = b.x - o.x, oy = b.y - o.y, od = Math.hypot(ox, oy);
    if (od < 0.75 && od > 1e-3) { dx += ox / od * (0.75 - od) * 1.5; dy += oy / od * (0.75 - od) * 1.5; }
  }
  const m = Math.hypot(dx, dy) || 1;
  b.in.mx = dx / m; b.in.my = dy / m; b.in.mag = mag;
}
function turnTo(b, yaw, pitch, rate, dt) {
  const dy = angDiff(b.yaw, yaw), mx = rate * dt;
  b.yaw = angNorm(b.yaw + clamp(dy, -mx, mx));
  b.pitch += clamp(pitch - b.pitch, -mx, mx);
}

// ---------------- main think ----------------
function aiUpdate(b, dt) {
  const ai = b.ai, D = DIFF[G.settings.diff] || DIFF.normal, I = b.in;
  I.fire = false; I.fireP = false; I.use = false; I.mag = 0; I.altP = false; I.walk = false;
  if (G.phase === 'freeze') {
    if (!ai.bought && G.liveT === 0 && G.phaseT < CFG.FREEZE - ai.buyAt) { ai.bought = true; botBuy(b); }
    return;
  }
  if (!ai.bought) { ai.bought = true; botBuy(b); }
  ai.percT -= dt;
  if (ai.percT <= 0) { ai.percT = 0.09 + Math.random() * 0.05; perceive(b, D); }
  const B = G.bomb, ez = eyeZ(b);
  const w = curW(b), d = w ? w.def : null;
  let lookYaw = null, lookPitch = 0, moving = false;
  I.crouch = false;

  // stuck detection
  ai.stuckT += dt;
  if (ai.stuckT > 1.0) {
    const moved = Math.hypot(b.x - ai.lastX, b.y - ai.lastY);
    if (moved < 0.15 && ai.wantMove) { ai.jitterT = 0.5; ai.jitterA = Math.random() * TAU; ai.goalDirty = true; }
    ai.stuckT = 0; ai.lastX = b.x; ai.lastY = b.y;
  }
  ai.wantMove = false;

  // weapon housekeeping
  if (b.cur === 4 && b.throwT === 0 && !ai.visible) switchSlot(b, bestSlot(b));
  if (b.cur === 5 && !(b.hasBomb && siteAt(b.x, b.y))) switchSlot(b, bestSlot(b));
  if (b.cur !== 5 && b.cur !== 4 && !ai.visible) {
    const best = bestSlot(b);
    if (b.cur !== best && !(b.cur === 3 && !b.slots[1] && !b.slots[2])) switchSlot(b, best);
    const cw = curW(b);
    if (cw && cw.def.mag && cw.mag < cw.def.mag * 0.4 && cw.reserve > 0 && cw.reloadT <= 0 && G.time - ai.lastSeenT > 1.5) I.reload = true;
  }
  if (b.cur === 2 && b.slots[1] && b.slots[1].mag === 0 && b.slots[1].reloadT <= 0 && b.slots[1].reserve > 0 && !ai.visible) switchSlot(b, 1);

  const tgt = ai.target;
  const burning = fireAt(b.x, b.y);
  if (burning && !I.use) { const a = Math.atan2(b.y - burning.y, b.x - burning.x); steer(b, b.x + Math.cos(a) * 2, b.y + Math.sin(a) * 2, 1); }
  if (b.flash > 0.6) {
    // blinded: back off and spray if recently saw someone
    if (ai.lastKnown) { const a = Math.atan2(b.y - ai.lastKnown.y, b.x - ai.lastKnown.x); steer(b, b.x + Math.cos(a), b.y + Math.sin(a), 0.6); }
    b.yaw = angNorm(b.yaw + rand(-1, 1) * dt * 2);
    if (tgt && G.time - ai.lastSeenT < 1 && d && d.auto && Math.random() < 0.3) { I.fire = true; }
  } else if (tgt && tgt.alive && ai.visible) {
    // ---------------- combat ----------------
    const dx = tgt.x - b.x, dy = tgt.y - b.y, dist = Math.hypot(dx, dy);
    if (b.cur === 5 || b.cur === 4 || b.cur === 3) { if (b.slots[1] || b.slots[2]) switchSlot(b, bestSlot(b)); }
    const cw = curW(b), cd = cw ? cw.def : null;
    if (cw && cw.def.mag && cw.mag === 0) {
      if (cw.reserve > 0) I.reload = true;
      if (b.cur === 1 && b.slots[2] && b.slots[2].mag > 0 && dist < 15) switchSlot(b, 2);
    }
    ai.errT += dt;
    const decay = Math.exp(-ai.errT * 2.2);
    const tspd = tgt.speed / RUN_SPEED;
    const errMag = D.err * (0.35 + 1.6 * decay + tspd * 0.8 + (b.lastHitT > G.time - 0.4 ? 0.8 : 0));
    ai.errY += (rand(-1, 1) * errMag - ai.errY) * Math.min(1, dt * 4);
    ai.errP += (rand(-1, 1) * errMag * 0.6 - ai.errP) * Math.min(1, dt * 4);
    const top = bodyH(tgt), base = tgt.z;
    const tz = ai.aimPart === 'head' ? top - 0.07 : base + (top - base) * 0.66;
    const desY = Math.atan2(dy, dx) + ai.errY;
    const desP = Math.atan2(tz - ez, dist) + ai.errP - b.punchP * D.comp;
    const desYaw = desY - b.punchY * D.comp;
    if (G.time < ai.reactAt) turnTo(b, desYaw, desP, D.turn * 0.35, dt);
    else {
      turnTo(b, desYaw, desP, D.turn, dt);
      const yawErr = Math.abs(angDiff(b.yaw + b.punchY, Math.atan2(dy, dx)));
      const tol = Math.max(0.018, Math.atan2(0.22, dist)) * (cd && cd.type === 'sniper' ? 0.8 : 1.6);
      // movement style
      const close = dist < 7, type = cd ? cd.type : 'knife';
      if (type === 'knife') { steer(b, tgt.x, tgt.y, 1); moving = true; }
      else if ((type === 'pistol' || type === 'smg' || type === 'shotgun') && close) {
        ai.strafeT -= dt; if (ai.strafeT <= 0) { ai.strafeT = rand(0.35, 0.9); ai.strafeDir = -ai.strafeDir; }
        const sx = -Math.sin(b.yaw) * ai.strafeDir, sy = Math.cos(b.yaw) * ai.strafeDir;
        const fw = type === 'shotgun' ? 0.6 : 0;
        if (!solidAt(b.x + sx * 0.5, b.y + sy * 0.5)) steer(b, b.x + sx + Math.cos(b.yaw) * fw, b.y + sy + Math.sin(b.yaw) * fw, 0.9);
        moving = true;
      } else {
        I.crouch = ai.crouchFight && dist > 9;
        if (type === 'sniper' && b.zoom === 0 && !b.rezoomT && cw.reloadT <= 0) I.altP = true;
      }
      // fire control
      if (yawErr < tol && cw && (cw.mag > 0 || type === 'knife')) {
        if (type === 'knife') { if (dist < 1.2) I.fireP = true; }
        else if (cd.auto) {
          if (ai.burstPause > 0) ai.burstPause -= dt;
          else {
            I.fire = true; I.fireP = true;
            const limit = dist > 14 ? D.burstFar : dist > 7 ? D.burstFar + 3 : 99;
            if (b.shotsFired >= limit) { ai.burstPause = rand(0.2, 0.4); }
          }
        } else if (type === 'sniper') { if (b.zoom > 0 || dist < 4) { if (G.time >= b.nextFire && b.speed < 0.6) I.fireP = true; } }
        else if (G.time >= b.nextFire + rand(0, 0.08)) I.fireP = true;
      }
    }
    lookYaw = null;
  } else {
    // ---------------- objectives ----------------
    let goal = null, look = null, walk = false, hold = false;
    if (b.team === 'R') {
      if (B.state === 'planted') {
        if (!ai.guard || ai.guardFor !== G.round) { const a = Math.random() * TAU, r = rand(1.5, 4.5); ai.guard = snapWalk(B.x + Math.cos(a) * r, B.y + Math.sin(a) * r); ai.guardFor = G.round; ai.goalDirty = true; }
        goal = ai.guard; hold = true; look = pick(ENTRY_LOOK[B.site]);
        if (!ai.holdLook || G.time > ai.scanT) { ai.holdLook = pick(ENTRY_LOOK[B.site]); ai.scanT = G.time + rand(2, 5); }
        look = ai.holdLook;
      } else if (B.state === 'dropped' && nearestTo(B.x, B.y, 'R') === b) { goal = [B.x, B.y]; }
      else if (b.hasBomb) {
        if (ai.wi >= ai.wps.length - 1) {
          const sp = ai.wps[ai.wps.length - 1];
          if (siteAt(b.x, b.y) && (Math.hypot(sp[0] - b.x, sp[1] - b.y) < 0.8 || ai.atSiteT > 2.5)) {
            if (b.cur !== 5) switchSlot(b, 5);
            I.fire = true; goal = null; hold = true;
            if (b.plantProg > 0.2 && G.time - ai.radioT > 5) { ai.radioT = G.time; radio(b, 'Planting the bomb, cover me!'); }
          }
          if (siteAt(b.x, b.y)) ai.atSiteT = (ai.atSiteT || 0) + dt;
        }
        if (!hold) goal = ai.wps[ai.wi];
      } else {
        goal = ai.wps[ai.wi];
        if (ai.wi >= ai.wps.length - 1 && Math.hypot(goal[0] - b.x, goal[1] - b.y) < 1.2) {
          // reached site with no bomb: hold
          hold = true; if (!ai.holdLook || G.time > ai.scanT) { ai.holdLook = pick(ENTRY_LOOK[ai.site]); ai.scanT = G.time + rand(2, 5); } look = ai.holdLook;
        }
      }
      // pre-aim common defender spots on the approach
      if (!hold && !b.hasBomb && B.state !== 'planted' && ai.wi >= ai.wps.length - 2 && Math.hypot(SITES[ai.site].cx - b.x, SITES[ai.site].cy - b.y) < 15) {
        if (!ai.preAim || G.time > ai.preAimT) { ai.preAim = pick(POSTS[ai.site].spots); ai.preAimT = G.time + rand(0.8, 1.6); }
        look = ai.preAim;
      }
      // last waypoint before site: utility usage
      if (!ai.nadeDone && ai.wi === ai.wps.length - 1 && totalNades(b) > 0 && Math.hypot(SITES[ai.site].cx - b.x, SITES[ai.site].cy - b.y) < 12 && !siteAt(b.x, b.y)) {
        ai.nadeDone = true; aiThrow(b, SITES[ai.site].cx, SITES[ai.site].cy);
      }
    } else {
      if (B.state === 'planted') {
        const nearest = nearestTo(B.x, B.y, 'W', true);
        if (nearest === b || Math.hypot(B.x - b.x, B.y - b.y) < 1.1) {
          goal = [B.x, B.y];
          if (Math.hypot(B.x - b.x, B.y - b.y) < 0.9 && (!B.defuser || B.defuser === b)) { I.use = true; I.crouch = true; goal = null; hold = true; }
        } else {
          if (!ai.guard || ai.guardFor !== G.round) { const a = Math.random() * TAU, r = rand(2, 4); ai.guard = snapWalk(B.x + Math.cos(a) * r, B.y + Math.sin(a) * r); ai.guardFor = G.round; }
          goal = ai.guard;
          if (Math.hypot(goal[0] - b.x, goal[1] - b.y) < 1) { hold = true; if (!ai.holdLook || G.time > ai.scanT) { ai.holdLook = pick(ENTRY_LOOK[B.site]); ai.scanT = G.time + rand(2, 4); } look = ai.holdLook; }
        }
      } else {
        goal = ai.wps[ai.wi];
        if (Math.hypot(goal[0] - b.x, goal[1] - b.y) < 0.9) {
          hold = true;
          const P = POSTS[ai.role] || POSTS[ai.site];
          if (!ai.holdLook || G.time > ai.scanT) { ai.holdLook = pick(P.look); ai.scanT = G.time + rand(2.5, 6); }
          look = ai.holdLook;
          // late-round push if no contact
          if (G.liveT > 55 && G.roundT > 20 && Math.random() < dt * 0.02) { ai.wps = [ROUTES[ai.site][0].pts.length ? pick(ROUTES[ai.site][0].pts) : [SITES[ai.site].cx, SITES[ai.site].cy]]; ai.wi = 0; ai.goalDirty = true; }
        }
      }
    }
    // chase last known position briefly (not while holding a defuse/plant)
    if (!I.use && !I.fire && !b.hasBomb && ai.lastKnown && G.time - ai.lastKnownT < 3.5) {
      const lk = ai.lastKnown;
      if (b.team === 'R' || G.bomb.state === 'planted' || Math.hypot(lk.x - b.x, lk.y - b.y) < 10) {
        if (!hold || Math.random() < 0.0) goal = [lk.x, lk.y];
        look = [lk.x, lk.y]; walk = true;
      } else look = [lk.x, lk.y];
    }
    if (ai.lookAt && G.time < ai.lookUntil) look = [ai.lookAt.x, ai.lookAt.y];

    if (goal && !(hold && Math.hypot(goal[0] - b.x, goal[1] - b.y) < 0.9)) {
      if (ai.goalDirty || !ai.goal || Math.hypot(ai.goal[0] - goal[0], ai.goal[1] - goal[1]) > 0.5) setGoal(b, goal[0], goal[1]);
      const p = followPath(b, dt);
      if (p) {
        if (ai.jitterT > 0) { ai.jitterT -= dt; steer(b, b.x + Math.cos(ai.jitterA), b.y + Math.sin(ai.jitterA), 1); }
        else steer(b, p[0], p[1], 1);
        moving = true; ai.wantMove = true; I.walk = walk && G.liveT > 10;
      } else {
        // reached this waypoint
        if (ai.wi < ai.wps.length - 1 && Math.hypot(goal[0] - b.x, goal[1] - b.y) < 1.5) { ai.wi++; ai.goalDirty = true; }
        else if (!hold) ai.goalDirty = true;
      }
      if (ai.wps.length && ai.wi < ai.wps.length - 1) { const wp = ai.wps[ai.wi]; if (Math.hypot(wp[0] - b.x, wp[1] - b.y) < 1.3) { ai.wi++; ai.goalDirty = true; } }
    }
    // look direction
    if (look) lookYaw = Math.atan2(look[1] - b.y, look[0] - b.x);
    else if (moving) lookYaw = Math.atan2(b.in.my, b.in.mx);
    if (lookYaw !== null) {
      if (hold && !ai.lookAt) lookYaw += Math.sin(G.time * 0.9 + b.id) * 0.35;
      turnTo(b, lookYaw, lookPitch, D.turn * 0.55, dt);
    }
  }
}
function nearestTo(x, y, team, botsOnly) {
  let best = null, bd = 1e9;
  for (const p of G.players) { if (!p.alive || p.team !== team || (botsOnly && !p.isBot)) continue; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
  return best;
}
function aiThrow(b, tx, ty) {
  const type = b.nades.flash ? 'flash' : b.nades.smoke ? 'smoke' : b.nades.fire ? 'fire' : b.nades.he ? 'he' : null;
  if (!type) return;
  const dist = Math.hypot(tx - b.x, ty - b.y);
  b.cur = 0; switchSlot(b, 4); b.nadeSel = type; b.drawT = 0;
  b.yaw = Math.atan2(ty - b.y, tx - b.x);
  const v = 10.5; b.pitch = clamp(0.5 * Math.asin(clamp(GRAVITY * dist / (v * v), 0, 1)) - 0.12, -0.2, 0.75);
  b.throwT = 0.0001; b.thrown = false;
}
