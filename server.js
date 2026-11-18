#!/usr/bin/env node
'use strict';
// ============================================================
//  Last Fuse — LAN server. Zero dependencies (Node 16+).
//    node server.js            (port 27015)
//    PORT=8080 node server.js
//  Serves the game and relays multiplayer messages over WebSocket.
//  The hosting player's browser runs the simulation; this is a relay.
// ============================================================
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const PORT = +process.env.PORT || 27015;
const ROOT = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.ico': 'image/x-icon' };

function lanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if ((a.family === 'IPv4' || a.family === 4) && !a.internal) out.push(a.address);
  return out;
}

// ---------- static files (only the game's own files) ----------
const server = http.createServer((req, res) => {
  let u;
  try { u = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
  if (u === '/lan-info') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ lan: true, ips: lanIps(), port: PORT, players: clients.size, inGame }));
  }
  if (u === '/') u = '/index.html';
  const ok = u === '/index.html' || u === '/style.css' || /^\/js\/[a-z0-9_-]+\.js$/i.test(u);
  if (!ok) { res.writeHead(404); return res.end('not found'); }
  const file = path.join(ROOT, u);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

// ---------- minimal WebSocket (RFC 6455) ----------
function wsSend(c, str) {
  if (!c.sock.writable) return;
  if (c.sock.writableLength > 2 * 1024 * 1024) return; // slow client: drop instead of buffering forever
  const p = Buffer.from(str);
  let h;
  if (p.length < 126) h = Buffer.from([0x81, p.length]);
  else if (p.length < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(p.length, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(p.length), 2); }
  c.sock.write(Buffer.concat([h, p]));
}
function parseFrame(b) {
  if (b.length < 2) return null;
  const fin = (b[0] & 0x80) !== 0, op = b[0] & 15, masked = (b[1] & 0x80) !== 0;
  let len = b[1] & 127, off = 2;
  if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (b.length < 10) return null; len = Number(b.readBigUInt64BE(2)); off = 10; }
  if (len > 16 * 1024 * 1024) return { op: -1, total: b.length };
  let mask = null;
  if (masked) { if (b.length < off + 4) return null; mask = b.subarray(off, off + 4); off += 4; }
  if (b.length < off + len) return null;
  const payload = Buffer.from(b.subarray(off, off + len));
  if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
  return { fin, op, payload, total: off + len };
}

// ---------- lobby + relay ----------
const clients = new Map();
let nextId = 1, hostId = 0, inGame = false;
let settings = { mode: 'team', bots: 4, rounds: 8, diff: 'normal' };
function lobbyMsg() {
  return JSON.stringify({ t: 'lobby', hostId, inGame, settings, players: [...clients.values()].filter(c => c.name).map(c => ({ id: c.id, name: c.name, team: c.team })) });
}
function broadcastLobby() { const s = lobbyMsg(); for (const c of clients.values()) if (c.name) wsSend(c, s); }
function sendTo(id, obj) { const c = clients.get(id); if (c) wsSend(c, typeof obj === 'string' ? obj : JSON.stringify(obj)); }
function cleanName(n) { return String(n || 'Player').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16) || 'Player'; }
function cleanTeam(t) { return t === 'R' || t === 'W' ? t : 'A'; }

function onMessage(c, text) {
  // hot path: relay snapshots without re-parsing large payloads
  if (c.id === hostId && text.startsWith('{"t":"snap"')) {
    for (const o of clients.values()) if (o.id !== hostId && o.name) wsSend(o, text);
    return;
  }
  let m; try { m = JSON.parse(text); } catch (e) { return; }
  switch (m.t) {
    case 'hello':
      c.name = cleanName(m.name); c.team = cleanTeam(m.team);
      wsSend(c, JSON.stringify({ t: 'welcome', id: c.id }));
      if (inGame && hostId && c.id !== hostId) sendTo(hostId, { t: 'joined', id: c.id, name: c.name, team: c.team });
      log(`${c.name} connected (${c.addr})`);
      broadcastLobby(); break;
    case 'host':
      if (!hostId || !clients.has(hostId)) { hostId = c.id; inGame = false; if (m.settings) settings = m.settings; log(`${c.name} is hosting`); }
      broadcastLobby(); break;
    case 'team': c.team = cleanTeam(m.team); broadcastLobby(); break;
    case 'settings': if (c.id === hostId && m.settings) { settings = m.settings; broadcastLobby(); } break;
    case 'start':
      if (c.id !== hostId) break;
      inGame = true; if (m.settings) settings = Object.assign({}, settings, m.settings);
      { const s = JSON.stringify({ t: 'start', roster: m.roster, settings: m.settings }); for (const o of clients.values()) if (o.name) wsSend(o, s); }
      log(`match started (${(m.roster || []).length} players)`);
      broadcastLobby(); break;
    case 'lobby':
      if (c.id !== hostId) break;
      inGame = false;
      for (const o of clients.values()) if (o.name) wsSend(o, '{"t":"tolobby"}');
      broadcastLobby(); break;
    case 'in':
      if (hostId && c.id !== hostId) sendTo(hostId, '{"t":"in","from":' + c.id + ',"d":' + JSON.stringify(m.d) + '}');
      break;
    case 'to':
      if (c.id === hostId) sendTo(m.id, { t: 'ev', d: m.d });
      break;
  }
}
function onClose(c) {
  if (!clients.has(c.id)) return;
  clients.delete(c.id);
  log(`${c.name || 'client'} disconnected`);
  if (c.id === hostId) {
    hostId = 0; inGame = false;
    for (const o of clients.values()) if (o.name) wsSend(o, '{"t":"hostleft"}');
  } else if (hostId) sendTo(hostId, { t: 'left', id: c.id });
  broadcastLobby();
}

server.on('upgrade', (req, sock) => {
  if (req.url !== '/ws' || !req.headers['sec-websocket-key']) { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  const c = { id: nextId++, sock, name: '', team: 'A', addr: sock.remoteAddress };
  clients.set(c.id, c);
  let buf = Buffer.alloc(0), frag = null;
  sock.on('data', (d) => {
    buf = buf.length ? Buffer.concat([buf, d]) : d;
    for (;;) {
      const f = parseFrame(buf);
      if (!f) break;
      if (f.op === -1) { sock.destroy(); return; }
      buf = buf.subarray(f.total);
      if (f.op === 8) { try { sock.end(Buffer.from([0x88, 0])); } catch (e) { } onClose(c); return; }
      if (f.op === 9) { sock.write(Buffer.concat([Buffer.from([0x8a, f.payload.length]), f.payload])); continue; }
      if (f.op === 1 || f.op === 0) {
        if (f.op === 1) frag = [f.payload]; else if (frag) frag.push(f.payload);
        if (f.fin && frag) { const text = Buffer.concat(frag).toString('utf8'); frag = null; try { onMessage(c, text); } catch (e) { console.error(e); } }
      }
    }
  });
  sock.on('close', () => onClose(c));
  sock.on('error', () => onClose(c));
});

function log(s) { console.log(new Date().toLocaleTimeString() + '  ' + s); }
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  LAST FUSE — LAN server running\n');
  console.log('  On this computer:   http://localhost:' + PORT);
  for (const ip of lanIps()) console.log('  On your network:    http://' + ip + ':' + PORT);
  console.log('\n  Everyone opens one of those addresses. One player clicks "Host LAN game",');
  console.log('  the others click "Join LAN game". Press Ctrl+C to stop.\n');
});
