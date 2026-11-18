'use strict';
// ============================================================
//  Synthesized audio (WebAudio) — no sound files
// ============================================================
const SFX = (() => {
  let ac = null, master = null, noise = null, vol = 0.6;
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const comp = ac.createDynamicsCompressor();
    master = ac.createGain(); master.gain.value = vol;
    master.connect(comp); comp.connect(ac.destination);
    const len = ac.sampleRate * 2;
    noise = ac.createBuffer(1, len, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  function setVolume(v) { vol = v; if (master) master.gain.value = v; }
  function out(v, pan) {
    const g = ac.createGain(); g.gain.value = v;
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = clamp(pan || 0, -1, 1); g.connect(p); p.connect(master); }
    else g.connect(master);
    return g;
  }
  function nz(dest, t0, dur, type, freq, q, peak, attack) {
    const s = ac.createBufferSource(); s.buffer = noise;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + (attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
  }
  function tone(dest, t0, dur, f0, f1, type, peak) {
    const o = ac.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t0); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(peak, t0); g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function spatial(x, y) {
    const cam = G.cam;
    if (!cam || x === undefined) return { v: 1, p: 0, d: 0 };
    const dx = x - cam.x, dy = y - cam.y, d = Math.hypot(dx, dy);
    const v = 1 / (1 + d * 0.22);
    const a = angDiff(cam.yaw, Math.atan2(dy, dx));
    return { v, p: Math.sin(a) * 0.85, d };
  }
  const SHOT = {
    pistol: { f: 3200, d: 0.13, b: 170, bd: 0.07, g: 0.8 },
    hpistol: { f: 2400, d: 0.25, b: 120, bd: 0.14, g: 1.0 },
    smg: { f: 3800, d: 0.09, b: 160, bd: 0.05, g: 0.6 },
    rifle: { f: 2600, d: 0.17, b: 120, bd: 0.1, g: 0.85, crack: 1 },
    shotgun: { f: 1600, d: 0.32, b: 85, bd: 0.2, g: 1.0 },
    sniper: { f: 2000, d: 0.55, b: 80, bd: 0.35, g: 1.15, crack: 1 },
  };
  function shot(kind, x, y, own) {
    if (!ac) return;
    const s = spatial(x, y), P = SHOT[kind] || SHOT.rifle, t = ac.currentTime;
    const v = own ? 0.55 : s.v * 0.75;
    if (v < 0.02) return;
    const o = out(v, own ? 0 : s.p);
    const muffle = own ? 1 : clamp(1.2 - s.d / 30, 0.25, 1);
    nz(o, t, P.d, 'lowpass', P.f * muffle, 0.8, P.g);
    tone(o, t, P.bd, P.b, P.b * 0.35, 'triangle', P.g * 0.9);
    if (P.crack && muffle > 0.5) nz(o, t, 0.04, 'highpass', 5000, 0.7, 0.4);
  }
  function step(x, y, loud) {
    if (!ac) return; const s = spatial(x, y), t = ac.currentTime;
    const v = s.v * (loud || 0.35); if (v < 0.015) return;
    const o = out(v, s.p); nz(o, t, 0.06, 'bandpass', 500 + Math.random() * 300, 1.2, 0.9);
  }
  function play(name, x, y) {
    if (!ac) return; const t = ac.currentTime; const s = spatial(x, y);
    let o;
    switch (name) {
      case 'click': o = out(0.4, 0); tone(o, t, 0.03, 1800, 0, 'square', 0.25); break;
      case 'reload': o = out(0.45, 0); nz(o, t, 0.05, 'bandpass', 2500, 3, 0.8); nz(o, t + 0.35, 0.06, 'bandpass', 1800, 3, 0.9); break;
      case 'reload_end': o = out(0.45, 0); nz(o, t, 0.07, 'bandpass', 1400, 2, 1); break;
      case 'shell': o = out(0.4, 0); nz(o, t, 0.08, 'bandpass', 900, 2, 0.8); break;
      case 'deploy': o = out(0.3, 0); nz(o, t, 0.08, 'bandpass', 3000, 2, 0.6); break;
      case 'knife': o = out(s.v * 0.6, s.p); nz(o, t, 0.15, 'bandpass', 4000, 1.5, 0.6, 0.05); break;
      case 'knifehit': o = out(s.v * 0.7, s.p); nz(o, t, 0.1, 'lowpass', 900, 1, 1); break;
      case 'hit': o = out(s.v * 0.7, s.p); nz(o, t, 0.08, 'lowpass', 700, 1, 1); break;
      case 'hitmark': o = out(0.35, 0); tone(o, t, 0.05, 1400, 900, 'sine', 0.5); break;
      case 'head': o = out(0.5, 0); tone(o, t, 0.25, 3200, 2800, 'sine', 0.5); tone(o, t, 0.18, 4700, 0, 'sine', 0.25); break;
      case 'wall': o = out(s.v * 0.35, s.p); nz(o, t, 0.05, 'highpass', 2500, 1, 0.6); break;
      case 'beep': o = out(Math.max(0.12, s.v * 0.8), s.p); tone(o, t, 0.09, 2300, 0, 'sine', 0.6); break;
      case 'key': o = out(0.35, 0); tone(o, t, 0.05, 1200 + Math.random() * 600, 0, 'square', 0.15); break;
      case 'defuse': o = out(0.35, s.p); nz(o, t, 0.04, 'bandpass', 4000, 4, 0.5); break;
      case 'explode': o = out(Math.max(0.3, s.v * 1.4), s.p); nz(o, t, 1.6, 'lowpass', 900, 0.6, 1.4, 0.01); tone(o, t, 1.0, 70, 25, 'sine', 1.2); break;
      case 'bigboom': o = out(1.2, s.p); nz(o, t, 3.0, 'lowpass', 700, 0.6, 1.6, 0.01); tone(o, t, 2.2, 55, 18, 'sine', 1.4); break;
      case 'flashbang': o = out(Math.max(0.2, s.v), s.p); nz(o, t, 0.4, 'highpass', 1500, 0.7, 1.2); break;
      case 'ring': o = out(0.25, 0); tone(o, t, 2.5, 3600, 3500, 'sine', 0.3); break;
      case 'smoke': o = out(s.v * 0.6, s.p); nz(o, t, 2.5, 'highpass', 3000, 0.5, 0.35, 0.3); break;
      case 'bounce': o = out(s.v * 0.4, s.p); tone(o, t, 0.05, 900, 600, 'triangle', 0.5); break;
      case 'buy': o = out(0.4, 0); nz(o, t, 0.06, 'bandpass', 1500, 2, 0.7); tone(o, t + 0.05, 0.05, 900, 0, 'square', 0.12); break;
      case 'deny': o = out(0.3, 0); tone(o, t, 0.15, 220, 0, 'square', 0.2); break;
      case 'pickup': o = out(0.4, 0); nz(o, t, 0.08, 'bandpass', 2000, 2, 0.8); break;
      case 'throw': o = out(0.35, 0); nz(o, t, 0.15, 'bandpass', 1200, 1, 0.5, 0.05); break;
      case 'pin': o = out(0.3, 0); tone(o, t, 0.04, 2600, 0, 'square', 0.15); break;
      case 'roundstart': o = out(0.25, 0); tone(o, t, 0.12, 660, 0, 'square', 0.2); tone(o, t + 0.14, 0.18, 880, 0, 'square', 0.2); break;
      case 'win': o = out(0.25, 0); [523, 659, 784].forEach((f, i) => tone(o, t + i * 0.12, 0.25, f, 0, 'triangle', 0.35)); break;
      case 'lose': o = out(0.25, 0); [392, 330, 262].forEach((f, i) => tone(o, t + i * 0.14, 0.3, f, 0, 'triangle', 0.35)); break;
      case 'hurt': o = out(0.4, 0); nz(o, t, 0.12, 'lowpass', 500, 1, 1); break;
    }
  }
  let voiceOn = true;
  function say(text) {
    if (!voiceOn || !window.speechSynthesis) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; u.pitch = 0.8; u.volume = Math.min(1, vol * 1.2); speechSynthesis.speak(u); } catch (e) { }
  }
  return { init, setVolume, shot, step, play, say, setVoice(v) { voiceOn = v; }, get ready() { return !!ac; } };
})();
