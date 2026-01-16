# Flixtris

**Stack blocks. Send garbage. Crush your friends.**

The classic puzzle game reimagined for the modern web. Play solo, compete in daily challenges, battle friends in real-time multiplayer, or organize tournaments — all in your browser, no downloads required. Pure JavaScript, modular architecture, instant fun.

**Created by [Carlos S. Nah](https://github.com/ra9)**

## Version 1.1.0 - Latest Updates

- **Mobile Optimized** - Fixed game board display issues on mobile devices
- **Modular Architecture** - Refactored codebase into focused, maintainable modules
- **Tournament Mode** - Create and manage tournaments with single elimination or round-robin formats
- **Auto-Update System** - PWA users receive notifications when updates are available
- **Enhanced Leaderboards** - Global, daily, and weekly leaderboards with improved UI

## Features

- **Five Game Modes**
  - **Classic** - Endless mode with increasing difficulty
  - **Daily Challenge** - Same piece sequence for everyone, compare scores
  - **Hardcore** - No pause, no ghost piece, no mercy
  - **Multiplayer** - Real-time 1v1 battles with live opponent board view
  - **Battle Royale** - 2-16 players, last one standing wins!

- **Tournament System** 🆕
  - Single Elimination and Round Robin formats
  - Support for 4, 8, or 16 players
  - Track match results and standings
  - Persistent tournament data

- **Play Custom Seeds** - Enter a shared seed code to challenge friends

- **NES-Style Scoring**
  - Single: 40 pts
  - Double: 100 pts
  - Triple: 300 pts
  - Tetris: 1200 pts
  - All multiplied by (Level + 1)

- **Retro Sound Effects** - 8-bit style sounds generated with Web Audio API

- **Fully Mobile Responsive** - Optimized touch controls and layout for all screen sizes

- **PWA Support** - Install as an app, works offline, auto-updates when online

- **Leaderboards** - Global, daily, and weekly leaderboards with persistent storage

## Controls

### Keyboard
| Key | Action |
|-----|--------|
| ← → | Move left/right |
| ↑ | Rotate |
| ↓ | Soft drop |
| Space | Hard drop |
| P | Pause (not in Hardcore) |
| H | Help |

### Mobile
Touch control buttons appear below the game canvas on mobile devices.

## Game Modes

### Daily Seed Sharing

In Daily mode, everyone gets the same piece sequence based on the date.

**Seed format:** `FLX-YYYY-MM-DD`

Share your score with friends:
```
Flixtris Daily Challenge
FLX-2026-1-3
Score: 12430 | Level: 8 | Lines: 72

Can you beat my score?
```

Friends can enter the seed via "Play Seed" to get the exact same game.

### Multiplayer Mode

Challenge friends to real-time 1v1 battles!

**How it works:**
1. Select "Multiplayer" from the main menu
2. Create a room or join with a 4-character room code
3. Wait for your opponent to join
4. Both players click "Ready!"
5. Game starts with a countdown - both players get the same piece sequence
6. See your opponent's board in real-time as you play
7. Highest score wins!

**Multiplayer Features:**

- 🎯 **Garbage Lines** - Clear multiple lines to send garbage to your opponent!
  - Double: 1 garbage line
  - Triple: 2 garbage lines
  - Tetris: 4 garbage lines

- 😀 **Quick Emojis** - Send reactions during the game (👍 🔥 😀 💀 and more)

- 🔄 **Rematch** - Quick rematch button to play again with the same opponent

- 🔌 **Reconnection** - Disconnect? No problem! Auto-reconnect keeps your game alive

- 💾 **Server Persistence** - Server saves state, survives restarts

## Installation

### Client (Static Files)

Serve with any static server:

```bash
npx serve .
# or
python -m http.server 8000
```

Open in browser and optionally install as a PWA.

## Premium Roadmap Progress (Phase 1–3)

The premium roadmap is being implemented incrementally. Current status:
- Completed
  - Phase 1 Foundations
    - Cosmetics Store scaffolding (themes, piece skins, premium emojis)
    - Entitlements stored locally in IndexedDB (`purchases` store)
    - Basic local balance support (for testing; can be extended to server-backed profiles)
    - Premium emoji gating in multiplayer (owned emojis become usable)
  - Phase 2 Foundations
    - Replay recording (input timeline, seed, mode, scores)
    - Replay viewer (overlay with timeline, play/pause/stop, seek, progress indicator)
    - Advanced analytics:
      - APM/LPM, holes, average column height, comboMax
      - Misdrop detection, drought tracking, T-spin counting
- In progress
  - Phase 3 Ranked Mode (scaffolding added)
    - Ranked queue join/leave from client
    - Server-authoritative RNG seed broadcast at match start
    - Basic ELO update endpoint and storage (Redis-backed)
    - Client snapshot sending for anti-cheat validation (soft enforcement)
  - Deterministic replay seek refinements and richer playback UI (step controls, speed selector)
  - Cloud sync for entitlements/replays/analytics (planned)

## Using the Cosmetics Store (Phase 1)

The store is designed to be local-first and data-attribute driven:
- Themes:
  - Buttons with `data-store-theme="light|neon|retro"` will purchase/apply themes.
- Piece Skins:
  - Buttons with `data-store-skin="outline|pixel"` will purchase skins.
- Premium Emojis:
  - Buttons with `data-store-emoji="fire|grin|skull"` purchase emojis.
  - Emoji panel buttons should include `data-emoji="🔥"` and optionally `data-emoji-id="fire"` so entitlement checks map correctly.

Testing tips:
- Grant test balance in DevTools to try purchases:
  - `window.Flixtris.api.db.saveSetting("balance", 500)`
- Owned items display as “Owned” and buttons disable accordingly.

## Replays & Analytics (Phase 2)

What’s recorded:
- Replay inputs (keys + timestamps), mode, seed, duration, score/lines/level, and line clear metadata.
- Analytics metrics:
  - APM/LPM
  - Board holes and average height (computed at game end)
  - ComboMax (max combo streak)
  - Misdrops (locks that increase holes)
  - DroughtMax (max pieces between I tetromino)
  - T-Spins (counted when T clears occur post-rotation)

Viewer usage:
- “Your Replays” list shows recorded replays with Play/Delete buttons.
- Replay Viewer overlay provides:
  - Play/Pause/Stop controls
  - Seek slider that deterministically fast-forwards inputs to a timestamp
  - Progress label reflecting elapsed vs recorded duration
  - Event timeline listing inputs with relative timestamps

## Running Tests

Basic tests are provided to validate analytics and replay playback:
- Test runner: `npm run test` (executes analytics and replay tests sequentially)
- Individual tests:
  - `npm run test:analytics`
  - `npm run test:replay`

Notes:
- Tests run in Node with minimal DOM shims and requestAnimationFrame polyfills.
- Analytics test validates the presence and sanity of computed metrics.
- Replay test runs a short input stream and checks board state changes.

## Next Steps

- Tighten deterministic replay seeking and add richer playback controls (step, speed, progress bar sync with exact input timing).
- Visual analytics dashboards (charts for height/holes over time, combo streak distribution).
- Cloud sync layer for profiles, purchases, settings, replays, and analytics.
- Phase 3 ranked mode with server-authoritative RNG and anti-cheat primitives.

### Multiplayer Server

The multiplayer feature requires running the WebSocket server with Redis:

**Prerequisites:**
- Node.js 16+
- Redis server (local or cloud-hosted like Redis Cloud, Upstash, etc.)

```bash
# Start Redis (if running locally)
redis-server

# Navigate to server directory
cd server

# Install dependencies
npm install

# Start the server
npm start
```

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | WebSocket server port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |

```bash
# Example with custom configuration
PORT=8080 REDIS_URL=redis://user:pass@host:6379 npm start
```

**Health Check:**
```bash
curl http://localhost:3001/health
# Returns: {"status":"ok","redis":"connected","rooms":0,"uptime":123.45}
```

**Server Features:**
- 🗄️ **Redis persistence** - Rooms survive server restarts
- ⚡ **Automatic TTL** - Rooms expire after 30 minutes in Redis
- 🔌 **Graceful degradation** - Works in memory-only mode if Redis unavailable
- 🔄 **Reconnection tokens** - Valid for 30 minutes, stored in Redis
- 📡 **Health endpoint** - Monitor server and Redis status
- 🛡️ **Graceful shutdown** - Notifies players, closes connections cleanly

**Production Deployment:**

```bash
# Using Docker with Redis
docker run -d --name redis redis:alpine
docker run -d --name flixtris-server \
  -e REDIS_URL=redis://redis:6379 \
  -e PORT=3001 \
  -p 3001:3001 \
  --link redis \
  node:18-alpine sh -c "cd /app && npm start"
```

- Deploy behind a reverse proxy (nginx, Caddy) with SSL for `wss://`
- Use Redis Cloud, Upstash, or AWS ElastiCache for managed Redis
- Scale horizontally - multiple server instances can share the same Redis

## Tournament Mode

Create and manage competitive tournaments:

1. **Create Tournament** - Choose between Single Elimination or Round Robin
2. **Add Players** - Support for 4, 8, or 16 players
3. **Track Matches** - View bracket, match results, and player standings
4. **Play Matches** - Each match uses the game engine with score tracking
5. **Determine Winner** - Automatic advancement and winner declaration

**Tournament Types:**
- **Single Elimination** - Lose once and you're out
- **Round Robin** - Everyone plays everyone, highest score wins

## Auto-Update System

Flixtris includes an intelligent update system for PWA users:

- **Automatic Checks** - Checks for updates every minute when online
- **User-Friendly Notifications** - Update banner at bottom of screen
- **One-Click Updates** - Click "Update Now" to refresh with latest version
- **Offline Support** - Skips checks when offline, resumes when back online
- **Service Worker Integration** - Seamless PWA cache updates

The update system ensures you always have the latest features and bug fixes without manual intervention.

## Project Structure

```
flixtris/
├── index.html          # Main HTML
├── manifest.json       # PWA manifest
├── version.json        # Version info for update system
├── sw.js              # Service Worker for PWA and caching
├── css/
│   └── styles.css     # All application styles
├── js/
│   ├── db.js          # IndexedDB storage and data management
│   ├── sound.js       # Web Audio sound effects
│   ├── screens.js     # Screen navigation and state 🆕
│   ├── settings.js    # Settings management 🆕
│   ├── leaderboard.js # Leaderboard display and management 🆕
│   ├── tournament.js  # Tournament system 🆕
│   ├── updates.js     # Auto-update system 🆕
│   ├── game.js        # Core game logic and rendering
│   ├── bot.js         # AI bot implementation
│   ├── multiplayer.js # WebSocket multiplayer client
│   └── ui.js          # UI coordination and event handling
├── server/
│   ├── index.js       # WebSocket multiplayer server (Redis-backed)
│   ├── package.json   # Server dependencies (ws, redis)
│   └── .gitignore     # Ignore node_modules and env files
└── icons/
    ├── icon.svg
    ├── icon-192.png
    └── icon-512.png
```

## Tech Stack

- Vanilla JavaScript (ES6+) with modular architecture
- HTML5 Canvas for game rendering
- Web Audio API for sound effects
- IndexedDB for persistent storage
- CSS Variables & Flexbox for responsive design
- Service Workers for PWA functionality
- WebSocket for real-time multiplayer
- Node.js (server)
- Redis (server persistence)

**Philosophy:** No frameworks. No build tools. Minimal dependencies. Maximum performance and maintainability through clean, modular code.

## Multiplayer Protocol

The multiplayer system uses a simple JSON message protocol:

**Room Management:**
- `create_room` / `room_created`
- `join_room` / `room_joined`
- `ready` / `player_ready`
- `leave_room` / `player_left`

**Game Updates:**
- `game_update` / `opponent_update`
- `game_over` / `player_game_over`

**Battle Features:**
- `send_garbage` / `incoming_garbage`
- `send_emoji` / `emoji_received`
- `request_rematch` / `rematch_starting`

**Connection:**
- `reconnect` / `reconnected`
- `server_shutdown`

## Redis Data Structure

The server uses the following Redis keys:

| Key Pattern | Type | Description |
|-------------|------|-------------|
| `flixtris:room:{code}` | String (JSON) | Room metadata (code, seed, started, createdAt) |
| `flixtris:room:{code}:players` | String (JSON) | Player data array |
| `flixtris:reconnect:{token}` | String (JSON) | Reconnection token data |
| `flixtris:rooms:active` | Set | Set of active room codes |

All keys have a 30-minute TTL for automatic cleanup.

## License

MIT