# Last Fuse

An original tactical bomb-defusal shooter that runs in the browser. Everything — walls, characters, weapons, effects and sound — is generated in code with the Canvas 2D API and WebAudio. No 3D models, images or audio files.

## Play

- **Single player:** open the site, pick a team and bot skill, press **Deploy vs bots**.
- **Online multiplayer:** one player presses **Create online room** and shares the 5-letter code or invite link; friends press **Join room**. Browser-to-browser (WebRTC via PeerJS); the host's browser runs the match.
- **LAN multiplayer:** on one computer run `node server.js` (Node 16+, no install) and everyone opens the address it prints.

## Maps

| Map | Setting |
|---|---|
| Sandline | Desert town: long lane, mid zigzag, tunnels |
| Frostbite | Arctic research station: labs, courtyard, hangar site |
| Saltyard | Container port: stacked lanes, warehouse site |
| Foundry | Steelworks at dusk: indoor halls, furnace room |
| Overgrowth | Jungle temple ruins: pillared hall, long flanks |
| Lantern Row | City at night: alleys, plaza, arcade |

Pick a map (or Random) in the menu; in multiplayer the host picks it in the lobby. Bots derive their routes and defensive spots from each layout.

## Weapons

Pistols: P9 Compact, K45 Tactical, Viper Machine Pistol, Hawk .50, Duke Revolver ·
Heavy: Breacher-8, Hailstorm Auto-12, Bulwark LMG ·
SMGs: Ratchet, Vespa, Kestrel PDW ·
Rifles: Hyena Carbine, Gallant AR, AVK-7, M-Lance, Strix Bullpup (scoped) ·
Snipers: Sparrow Scout, Ridgeline DMR, Longshot .338 ·
Gear: Kevlar, helmet, HE, flashbang, smoke, incendiary (smoke puts fires out), defuse kit

## Controls

WASD move · mouse aim · LMB fire · RMB scope / knife stab · C/Ctrl crouch · Shift walk · Space jump ·
1–5 weapon slots · R reload · Q last weapon · G drop · E use / defuse · B buy · Tab scores · Esc pause

## Rules

Raiders plant the bomb at site A or B; Wardens defend and defuse. Start money $800, win $3250 ($3500 for bomb/defuse), loss $1400 +$500 per consecutive loss, kill $300.

## Code

| File | What it does |
|---|---|
| `js/core.js` | constants, map loader, ray tracing, procedural texture painters and sprites |
| `js/maps.js` | the six map layouts and their visual themes |
| `js/render.js` | software raycaster (walls, low crates, floor/ceiling/sky, sprites) |
| `js/weapons.js` | weapon data and first-person viewmodels |
| `js/game.js` | players, combat, grenades, bomb, economy, rounds, HUD, input |
| `js/ai.js` | bots: A* navigation, perception, aim, objectives, buying |
| `js/net.js` | multiplayer: LAN (WebSocket) and online (WebRTC) |
| `js/sfx.js` | synthesized audio |
| `server.js` | zero-dependency LAN server and relay |

Deployed as a static site (no build step).
