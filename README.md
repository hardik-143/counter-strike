# Last Fuse

An original tactical bomb-defusal shooter that runs in the browser. Everything — walls, characters, weapons, effects and sound — is generated in code with the Canvas 2D API and WebAudio. No 3D models, images or audio files.

## Play

- **Single player:** open the site, pick a team and bot skill, press **Deploy vs bots**.
- **Online multiplayer:** one player presses **Create online room** and shares the 5-letter code or invite link; friends press **Join room**. Browser-to-browser (WebRTC via PeerJS); the host's browser runs the match.
- **LAN multiplayer:** on one computer run `node server.js` (Node 16+, no install) and everyone opens the address it prints.

## Controls

WASD move · mouse aim · LMB fire · RMB scope / knife stab · C/Ctrl crouch · Shift walk · Space jump ·
1–5 weapon slots · R reload · Q last weapon · G drop · E use / defuse · B buy · Tab scores · Esc pause

## Rules

Raiders plant the bomb at site A or B; Wardens defend and defuse. Start money $800, win $3250 ($3500 for bomb/defuse), loss $1400 +$500 per consecutive loss, kill $300.

## Code

| File | What it does |
|---|---|
| `js/core.js` | constants, map, ray tracing, procedural textures and sprites |
| `js/render.js` | software raycaster (walls, low crates, floor/ceiling/sky, sprites) |
| `js/weapons.js` | weapon data and first-person viewmodels |
| `js/game.js` | players, combat, grenades, bomb, economy, rounds, HUD, input |
| `js/ai.js` | bots: A* navigation, perception, aim, objectives, buying |
| `js/net.js` | multiplayer: LAN (WebSocket) and online (WebRTC) |
| `js/sfx.js` | synthesized audio |
| `server.js` | zero-dependency LAN server and relay |

Deployed as a static site (no build step).
