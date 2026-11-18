'use strict';
// ============================================================
//  Bootstrap: menus, settings, events, main loop, test hooks
// ============================================================
(function main() {
  const $ = (id) => document.getElementById(id);
  const RES = { low: 200, fast: 270, high: 360 };
  buildSprites();
  rendererInit($('world'));
  HUD.canvas = $('hud'); HUD.ctx = HUD.canvas.getContext('2d');
  const resize = () => { rendererResize(RES[G.settings.quality] || 270); hudResize(); };
  resize(); window.addEventListener('resize', resize);
  // map pickers
  const mapOpts = MAP_DEFS.map(m => `<option value="${m.id}">${m.name} — ${m.blurb}</option>`).join('') + '<option value="random">Random map</option>';
  $('opt-map').innerHTML = mapOpts; $('lob-map').innerHTML = mapOpts;
  const previewMap = (id) => { if (id !== 'random' && (!MAP || MAP.id !== id)) loadMap(id); };
  previewMap(MAP_DEFS.some(m => m.id === G.settings.map) ? G.settings.map : 'sandline');

  // ---------- settings form ----------
  const S = G.settings;
  const bind = (id, key, conv, out, fmt) => {
    const el = $(id);
    if (el.type === 'checkbox') el.checked = !!S[key]; else el.value = S[key];
    const upd = () => { S[key] = el.type === 'checkbox' ? el.checked : conv(el.value); if (out) $(out).textContent = fmt(S[key]); saveSettings(); onSetting(key); };
    el.addEventListener('input', upd); el.addEventListener('change', upd);
    if (out) $(out).textContent = fmt(S[key]);
  };
  const onSetting = (k) => { if (k === 'vol') SFX.setVolume(S.vol); if (k === 'voice') SFX.setVoice(S.voice); if (k === 'quality') resize(); };
  bind('opt-map', 'map', String); $('opt-map').addEventListener('change', () => previewMap($('opt-map').value));
  bind('opt-team', 'team', String); bind('opt-diff', 'diff', String); bind('opt-size', 'size', Number); bind('opt-rounds', 'rounds', Number);
  bind('opt-sens', 'sens', Number, 'out-sens', v => v.toFixed(2)); bind('opt-vol', 'vol', Number, 'out-vol', v => Math.round(v * 100) + '%');
  bind('opt-fov', 'fov', Number, 'out-fov', v => v + '°'); bind('opt-quality', 'quality', String);
  bind('opt-voice', 'voice', Boolean); bind('opt-fs', 'fullscreen', Boolean);
  SFX.setVolume(S.vol); SFX.setVoice(S.voice);

  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !matchMedia('(pointer:fine)').matches) $('mobile').classList.remove('hidden');

  // ---------- fullscreen + pointer lock ----------
  function goFullscreen() {
    if (!S.fullscreen || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    document.documentElement.requestFullscreen().then(() => {
      try { navigator.keyboard && navigator.keyboard.lock && navigator.keyboard.lock(['KeyW', 'Escape', 'Tab']).catch(() => { }); } catch (e) { }
    }).catch(() => { });
  }
  document.addEventListener('fullscreenchange', () => {
    // entering fullscreen can drop pointer lock in some browsers: re-acquire
    if (document.fullscreenElement && G.state === 'play' && !G.paused && !G.buyOpen && !document.pointerLockElement) setTimeout(lockPointer, 60);
  });

  // ---------- game start / stop ----------
  function beginPlay(roster) {
    SFX.init();
    for (const id of ['menu', 'end', 'pause', 'lobby']) $(id).classList.add('hidden');
    G.state = 'play'; G.paused = false;
    if (NET.mode !== 'client') setupMatch(roster || undefined);
    lockPointer(); goFullscreen();
  }
  UI.beginPlay = beginPlay;
  function startGame() { NET.mode = 'off'; beginPlay(null); }
  function toMenu() {
    if (NET.ws) { const ws = NET.ws; NET.ws = null; NET.mode = 'off'; try { ws.close(); } catch (e) { } }
    onlineCleanup();
    NET.mode = 'off';
    G.state = 'menu'; G.paused = false; closeBuy();
    for (const id of ['pause', 'end', 'lobby']) $(id).classList.add('hidden');
    $('menu').classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  }
  UI.toMenu = toMenu;
  function pause() { if (G.state !== 'play' || G.paused) return; G.paused = true; for (const k in KEYS) KEYS[k] = false; INP.lmb = INP.rmb = false; $('pause').classList.remove('hidden'); }
  function resume() { G.paused = false; $('pause').classList.add('hidden'); lockPointer(); }
  $('btn-start').onclick = startGame;
  $('btn-again').onclick = () => {
    if (NET.mode === 'host') { netSend({ t: 'lobby' }); NET.mode = 'off'; LOBBY.show(); }
    else if (NET.mode === 'client') { $('end-sub').textContent = 'Waiting for the host to start the next match…'; }
    else startGame();
  };
  $('btn-menu').onclick = toMenu; $('btn-quit').onclick = toMenu; $('btn-resume').onclick = resume;

  // ---------- LAN ----------
  try { $('lan-name').value = localStorage.getItem('lastfuse.name') || ''; } catch (e) { }
  const lanName = () => { const n = $('lan-name').value.trim() || 'Player' + Math.floor(Math.random() * 90 + 10); try { localStorage.setItem('lastfuse.name', n); } catch (e) { } return n; };
  netProbe().then((ok) => {
    if (!ok) return;
    $('lan').classList.remove('hidden');
    const ips = NET.info.ips || [];
    $('lan-addr').innerHTML = ips.length ? 'Other players on your network open: ' + ips.map(ip => `<code>http://${ip}:${NET.info.port}</code>`).join(' or ') : 'Server running on this machine.';
  });
  const qRoom = new URLSearchParams(location.search).get('room');
  if (qRoom) { $('room-code').value = qRoom.toUpperCase().slice(0, 5); $('lan-msg').textContent = 'You were invited to room ' + $('room-code').value + ' — enter a name and press JOIN ROOM.'; }
  $('lob-map').value = $('opt-map').value;
  $('btn-online-host').onclick = () => { SFX.init(); $('lan-msg').textContent = ''; NET.lobby = null; LOBBY.show(); onlineHost(lanName(), $('lan-team').value); };
  $('btn-online-join').onclick = () => {
    const code = $('room-code').value.trim().toUpperCase();
    if (code.length !== 5) { $('lan-msg').textContent = 'Enter the 5-character room code from the host.'; return; }
    SFX.init(); $('lan-msg').textContent = ''; NET.lobby = null; LOBBY.show(); onlineJoin(code, lanName(), $('lan-team').value);
  };
  $('room-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-online-join').click(); });
  $('btn-host').onclick = () => { SFX.init(); $('lan-msg').textContent = ''; NET.lobby = null; LOBBY.show(); netConnect(true, lanName(), $('lan-team').value); };
  $('btn-join').onclick = () => { SFX.init(); $('lan-msg').textContent = ''; NET.lobby = null; LOBBY.show(); netConnect(false, lanName(), $('lan-team').value); };
  $('lob-leave').onclick = toMenu;
  $('lob-start').onclick = () => { LOBBY.note(''); netHostStart(); };
  for (const id of ['lob-map', 'lob-mode', 'lob-bots', 'lob-rounds', 'lob-diff']) $(id).addEventListener('change', () => { if (NET.id && NET.id === NET.hostId) netSend({ t: 'settings', settings: lobbySettings() }); LOBBY.render(); });

  // ---------- input events ----------
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && G.state === 'play' && !G.buyOpen && G.paused) { resume(); return; }
    onKeyDown(e);
  });
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { for (const k in KEYS) KEYS[k] = false; INP.lmb = INP.rmb = false; });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) { G.hadLock = true; INP.dx = INP.dy = 0; return; }
    if (G.hadLock && G.state === 'play' && !G.buyOpen && !G.test) pause();
  });
  document.addEventListener('mousemove', (e) => {
    INP.cx = e.clientX; INP.cy = e.clientY;
    if (G.state !== 'play' || G.paused || G.buyOpen) return;
    if (!document.pointerLockElement) return;
    // some browsers report a huge spurious jump right after locking — ignore it
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    INP.dx += e.movementX; INP.dy += e.movementY;
  });
  document.addEventListener('mouseleave', () => { INP.cx = INP.cy = -1; });
  $('hud').addEventListener('mousedown', (e) => {
    if (G.state !== 'play') return;
    if (G.paused) { resume(); return; }
    if (G.buyOpen) return;
    if (!document.pointerLockElement) { lockPointer(); return; }
    if (!G.human || !G.human.alive) { cycleSpectator(e.button === 2 ? -1 : 1); return; }
    if (e.button === 0) { INP.lmb = true; INP.lmbP = true; }
    if (e.button === 2) { INP.rmb = true; INP.rmbP = true; }
  });
  document.addEventListener('mouseup', (e) => { if (e.button === 0) INP.lmb = false; if (e.button === 2) INP.rmb = false; });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('wheel', onWheel, { passive: true });

  // ---------- main loop ----------
  let last = performance.now(), fpsAcc = 0, fpsN = 0;
  G.fps = 60;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05;
    if (G.state === 'play') {
      if (NET.mode === 'client') netClientStep(dt);
      else if (!G.paused || NET.mode === 'host') {
        const n = dt > 0.025 ? 2 : 1;
        for (let i = 0; i < n; i++) step(dt / n);
      }
      if (NET.mode === 'host') netHostTick(dt);
      if (G.buyOpen && G.human && !canBuy(G.human)) closeBuy();
      if (G.buyOpen && Math.floor(G.time * 4) !== Math.floor((G.time - dt) * 4)) UI.renderBuy();
    }
    fpsAcc += dt; fpsN++; if (fpsAcc > 1) { G.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    try { if (G.state !== 'play' || G.human) renderFrame(dt); } catch (err) { console.error(err); }
  }
  requestAnimationFrame(frame);

  // ---------- test hooks (headless verification) ----------
  window.__LF = {
    G, NET,
    startTest(opts) {
      G.test = true; Object.assign(G.settings, opts || {});
      SFX.setVoice(false);
      $('menu').classList.add('hidden'); G.state = 'play'; G.paused = false; setupMatch();
    },
    startHuman(opts) { G.test = false; Object.assign(G.settings, opts || {}); SFX.setVoice(false); $('menu').classList.add('hidden'); G.state = 'play'; G.paused = false; setupMatch(); },
    sim(seconds, dt) { dt = dt || 1 / 60; const n = Math.round(seconds / dt); for (let i = 0; i < n && G.state === 'play'; i++) step(dt); return { round: G.round, score: G.score, phase: G.phase, state: G.state }; },
    render() { renderFrame(0.016); },
  };
})();
