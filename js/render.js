'use strict';
// ============================================================
//  Software raycaster: textured floor/ceiling/sky, full walls,
//  waist-high crates (with visible tops), billboard sprites.
// ============================================================
const RND = { W: 0, H: 0, canvas: null, ctx: null, img: null, buf: null, zbuf: null, occD: null, occY: null, occN: null, colAng: null, skyU: null, ps: 1, horizon: 0, fovKey: '' };

function rendererInit(canvas) { RND.canvas = canvas; RND.ctx = canvas.getContext('2d', { alpha: false }); }
function rendererResize(H) {
  const aspect = clamp(window.innerWidth / Math.max(1, window.innerHeight), 1, 2.4);
  RND.H = H; RND.W = Math.round(H * aspect) & ~1;
  RND.canvas.width = RND.W; RND.canvas.height = RND.H;
  RND.img = RND.ctx.createImageData(RND.W, RND.H);
  RND.buf = new Uint32Array(RND.img.data.buffer);
  RND.zbuf = new Float32Array(RND.W);
  RND.occD = new Float32Array(RND.W * 3); RND.occY = new Float32Array(RND.W * 3); RND.occN = new Uint8Array(RND.W);
  RND.colAng = new Float32Array(RND.W); RND.skyU = new Int32Array(RND.W); RND.fovKey = '';
}

function renderScene(cam, sprites) {
  const W = RND.W, H = RND.H, buf = RND.buf, zbuf = RND.zbuf, occD = RND.occD, occY = RND.occY, occN = RND.occN;
  const dirX = Math.cos(cam.yaw), dirY = Math.sin(cam.yaw);
  const tf = Math.tan(cam.fov / 2), plX = -dirY * tf, plY = dirX * tf;
  const ps = (W / 2) / tf; RND.ps = ps;
  const horizon = H / 2 + Math.tan(clamp(cam.pitch, -1.2, 1.2)) * ps; RND.horizon = horizon;
  const ez = cam.z, camX = cam.x, camY = cam.y;
  const key = W + ':' + cam.fov;
  if (RND.fovKey !== key) { for (let x = 0; x < W; x++) RND.colAng[x] = Math.atan((2 * (x + 0.5) / W - 1) * tf); RND.fovKey = key; }
  for (let x = 0; x < W; x++) { let a = (cam.yaw + RND.colAng[x]) / TAU; a -= Math.floor(a); RND.skyU[x] = (a * SKY.w) | 0; }
  const skyU = RND.skyU, skyD = SKY.data, skyW = SKY.w, skyH = SKY.h;

  // ---------- floor / ceiling / sky ----------
  const lx = dirX - plX, ly = dirY - plY, rxs = 2 * plX / W, rys = 2 * plY / W;
  for (let y = 0; y < H; y++) {
    let o = y * W;
    const yc = y + 0.5;
    const isFloor = yc > horizon;
    let rd = isFloor ? ez * ps / (yc - horizon) : (WALLH - ez) * ps / (horizon - yc);
    if (!(rd > 0) || rd > 90) rd = 90;
    const fogI = Math.min(15, (rd * 0.55) | 0);
    let fx = camX + rd * lx, fy = camY + rd * ly;
    const sx = rd * rxs, sy = rd * rys;
    if (isFloor) {
      for (let x = 0; x < W; x++, fx += sx, fy += sy) {
        const cx = fx | 0, cy = fy | 0;
        if (fx < 0 || fy < 0 || cx >= MW || cy >= MH) { buf[o++] = 0xff6a8aa8; continue; }
        const ci = cy * MW + cx;
        const tab = FLOOR_SH[mapFloor[ci]][((mapFlags[ci] & 1) << 4) | fogI];
        buf[o++] = tab[((((fy - cy) * 64) & 63) << 6) | (((fx - cx) * 64) & 63)];
      }
    } else {
      const sv = clamp(skyH - 1 - (((horizon - yc) * skyH / (H * 0.8)) | 0), 0, skyH - 1) * skyW;
      const ctab = CEIL_SH[fogI];
      for (let x = 0; x < W; x++, fx += sx, fy += sy) {
        const cx = fx | 0, cy = fy | 0;
        if (fx >= 0 && fy >= 0 && cx < MW && cy < MH && (mapFlags[cy * MW + cx] & 1)) {
          buf[o++] = ctab[((((fy - cy) * 64) & 63) << 6) | (((fx - cx) * 64) & 63)];
        } else buf[o++] = skyD[sv + skyU[x]];
      }
    }
  }

  // ---------- walls & crates ----------
  const mx0 = Math.floor(camX), my0 = Math.floor(camY);
  const startIn = mapFlags[my0 * MW + mx0] & 1;
  for (let x = 0; x < W; x++) {
    const cxn = 2 * (x + 0.5) / W - 1;
    const rdx = dirX + plX * cxn, rdy = dirY + plY * cxn;
    let mx = mx0, my = my0;
    const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx), ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
    let stx, sty, sdx, sdy;
    if (rdx < 0) { stx = -1; sdx = (camX - mx) * ddx; } else { stx = 1; sdx = (mx + 1 - camX) * ddx; }
    if (rdy < 0) { sty = -1; sdy = (camY - my) * ddy; } else { sty = 1; sdy = (my + 1 - camY) * ddy; }
    let yLim = H, on = 0, prevIn = startIn;
    zbuf[x] = 1e9;
    for (let s = 0; s < 160; s++) {
      let side, perp;
      if (sdx < sdy) { perp = sdx; sdx += ddx; mx += stx; side = 0; } else { perp = sdy; sdy += ddy; my += sty; side = 1; }
      if (mx < 0 || my < 0 || mx >= MW || my >= MH) { zbuf[x] = perp; break; }
      const ci = my * MW + mx, w = mapWall[ci];
      if (w === 0) { prevIn = mapFlags[ci] & 1; continue; }
      if (perp < 0.01) perp = 0.01;
      let wallX = side === 0 ? camY + perp * rdy : camX + perp * rdx; wallX -= Math.floor(wallX);
      let tx = (wallX * 64) | 0; if ((side === 0 && rdx < 0) || (side === 1 && rdy > 0)) tx = 63 - tx;
      const fogI = Math.min(15, (perp * 0.55) | 0);
      const li = side + (prevIn ? 2 : 0);
      if (w === W_LOW) {
        const top = horizon - (CRATE_H - ez) * ps / perp, bot = horizon + ez * ps / perp;
        const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(yLim, Math.ceil(bot));
        const tab = WALL_SH[w][li * 16 + fogI], vs = 64 / CRATE_H, dz = perp / ps;
        let z = ez + (horizon - y0 - 0.5) * dz;
        for (let y = y0; y < y1; y++, z -= dz) { let v = ((CRATE_H - z) * vs) | 0; v = v < 0 ? 0 : v > 63 ? 63 : v; buf[y * W + x] = tab[(v << 6) | tx]; }
        let newLim = Math.min(yLim, Math.max(0, top));
        if (ez > CRATE_H) {
          const tEx = Math.min(sdx, sdy);
          const top2 = horizon + (ez - CRATE_H) * ps / tEx;
          const ya = Math.max(0, Math.floor(top2)), yb = Math.min(yLim, y0);
          const ctab = CTOP_SH[fogI], hz = (ez - CRATE_H) * ps;
          for (let y = ya; y < yb; y++) {
            const d = hz / (y + 0.5 - horizon);
            const wx = camX + d * rdx, wy = camY + d * rdy;
            buf[y * W + x] = ctab[((((wy - Math.floor(wy)) * 64) & 63) << 6) | (((wx - Math.floor(wx)) * 64) & 63)];
          }
          newLim = Math.min(yLim, Math.max(0, top2));
        }
        yLim = newLim;
        if (on < 3) { occD[x * 3 + on] = perp; occY[x * 3 + on] = yLim; on++; } else occY[x * 3 + 2] = yLim;
        prevIn = 0;
        if (yLim <= 0) { zbuf[x] = perp; break; }
        continue;
      }
      const top = horizon - (WALLH - ez) * ps / perp, bot = horizon + ez * ps / perp;
      const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(yLim, Math.ceil(bot));
      const tab = WALL_SH[w][li * 16 + fogI], vs = WALL_VS[w], dz = perp / ps;
      let z = ez + (horizon - y0 - 0.5) * dz;
      for (let y = y0; y < y1; y++, z -= dz) buf[y * W + x] = tab[((((WALLH - z) * vs) | 0) & 63) << 6 | tx];
      zbuf[x] = perp;
      break;
    }
    occN[x] = on;
  }

  // ---------- sprites ----------
  for (const s of sprites) { const dx = s.x - camX, dy = s.y - camY; s._d = dx * dirX + dy * dirY; s._l = -dx * dirY + dy * dirX; }
  sprites.sort((a, b) => b._d - a._d);
  for (const s of sprites) {
    const depth = s._d; if (depth < 0.06) continue;
    const scx = W / 2 + s._l / depth * ps;
    const sw = s.w * ps / depth;
    const yTop = horizon - (s.z + s.h - ez) * ps / depth, yBot = horizon - (s.z - ez) * ps / depth;
    const left = scx - sw / 2;
    const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(W, Math.ceil(scx + sw / 2));
    if (x0 >= x1) continue;
    const y0 = Math.max(0, Math.floor(yTop)), y1 = Math.min(H, Math.ceil(yBot));
    if (y0 >= y1) continue;
    const tex = s.tex, tw = tex.w, th = tex.h, data = tex.data;
    const vstep = th / (yBot - yTop);
    const mode = s.mode || 0, alpha = s.alpha === undefined ? 1 : s.alpha, dark = s.dark;
    for (let x = x0; x < x1; x++) {
      if (depth >= zbuf[x]) continue;
      let u = (((x + 0.5 - left) / sw) * tw) | 0; if (u < 0) u = 0; if (u >= tw) u = tw - 1; if (s.flip) u = tw - 1 - u;
      let lim = y1; const n = occN[x];
      for (let i = 0; i < n; i++) if (occD[x * 3 + i] < depth && occY[x * 3 + i] < lim) lim = occY[x * 3 + i];
      let v = (y0 + 0.5 - yTop) * vstep;
      for (let y = y0; y < lim; y++, v += vstep) {
        const vi = v | 0; if (vi >= th) break;
        const c = data[vi * tw + u], a = c >>> 24;
        if (a < 20) continue;
        const o = y * W + x;
        if (mode === 0) {
          buf[o] = dark ? (0xff000000 | (((c >> 1) & 0x7f7f7f) + ((c >> 3) & 0x1f1f1f))) : c;
        } else if (mode === 1) { // alpha blend
          const k = a * alpha / 255, d = buf[o];
          const r = (d & 255) + ((c & 255) - (d & 255)) * k, g = ((d >> 8) & 255) + (((c >> 8) & 255) - ((d >> 8) & 255)) * k, b = ((d >> 16) & 255) + (((c >> 16) & 255) - ((d >> 16) & 255)) * k;
          buf[o] = 0xff000000 | (b << 16) | (g << 8) | r;
        } else { // additive
          const k = a * alpha / 255, d = buf[o];
          let r = (d & 255) + (c & 255) * k, g = ((d >> 8) & 255) + ((c >> 8) & 255) * k, b = ((d >> 16) & 255) + ((c >> 16) & 255) * k;
          if (r > 255) r = 255; if (g > 255) g = 255; if (b > 255) b = 255;
          buf[o] = 0xff000000 | (b << 16) | (g << 8) | r;
        }
      }
    }
  }
  RND.ctx.putImageData(RND.img, 0, 0);
}

// project world point to screen (HUD canvas space) for name tags etc.
function projectPoint(cam, x, y, z, SW, SH) {
  const dirX = Math.cos(cam.yaw), dirY = Math.sin(cam.yaw);
  const dx = x - cam.x, dy = y - cam.y;
  const depth = dx * dirX + dy * dirY; if (depth < 0.1) return null;
  const lat = -dx * dirY + dy * dirX;
  const sx = RND.W / 2 + lat / depth * RND.ps, sy = RND.horizon - (z - cam.z) * RND.ps / depth;
  return { x: sx * SW / RND.W, y: sy * SH / RND.H, d: depth };
}

// Render the current map from `cam` into a fresh offscreen canvas (used for menu previews).
function renderToCanvas(cam, W, H, sprites) {
  const saved = Object.assign({}, RND);
  const c = makeCanvas(W, H);
  RND.canvas = c; RND.ctx = c.getContext('2d'); RND.W = W; RND.H = H;
  RND.img = RND.ctx.createImageData(W, H); RND.buf = new Uint32Array(RND.img.data.buffer);
  RND.zbuf = new Float32Array(W); RND.occD = new Float32Array(W * 3); RND.occY = new Float32Array(W * 3); RND.occN = new Uint8Array(W);
  RND.colAng = new Float32Array(W); RND.skyU = new Int32Array(W); RND.fovKey = '';
  try { renderScene(cam, sprites || []); } finally { Object.assign(RND, saved); }
  return c;
}
