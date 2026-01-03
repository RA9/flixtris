# Flixtris

**Stack blocks. Send garbage. Crush your friends.**

The classic puzzle game reimagined for the modern web. Play solo, compete in daily challenges, or battle friends in real-time multiplayer — all in your browser, no downloads required. Pure JavaScript, zero dependencies, instant fun.

**Created by [Carlos S. Nah](https://github.com/ra9)**

## Features

- **Four Game Modes**
  - **Classic** - Endless mode with increasing difficulty
  - **Daily Challenge** - Same piece sequence for everyone, compare scores
  - **Hardcore** - No pause, no ghost piece, no mercy
  - **Multiplayer** - Real-time 1v1 battles with live opponent board view

- **Play Custom Seeds** - Enter a shared seed code to challenge friends

- **NES-Style Scoring**
  - Single: 40 pts
  - Double: 100 pts
  - Triple: 300 pts
  - Tetris: 1200 pts
  - All multiplied by (Level + 1)

- **Retro Sound Effects** - 8-bit style sounds generated with Web Audio API

- **Mobile Responsive** - Touch controls, hamburger menu, works on any device

- **PWA Support** - Install as an app, works offline

- **Local Leaderboard** - Game history stored in IndexedDB

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

## Project Structure

```
flixtris/
├── index.html          # Main HTML with embedded CSS
├── manifest.json       # PWA manifest
├── js/
│   ├── db.js           # IndexedDB storage
│   ├── sound.js        # Web Audio sound effects
│   ├── game.js         # Game logic and rendering
│   ├── multiplayer.js  # WebSocket multiplayer client
│   └── ui.js           # UI and screen management
├── server/
│   ├── index.js        # WebSocket multiplayer server (Redis-backed)
│   ├── package.json    # Server dependencies (ws, redis)
│   └── .gitignore      # Ignore node_modules and env files
└── icons/
    ├── icon.svg
    ├── icon-192.png
    └── icon-512.png
```

## Tech Stack

- Vanilla JavaScript (ES6+)
- HTML5 Canvas
- Web Audio API
- IndexedDB
- CSS Variables & Flexbox
- PWA (manifest + icons)
- WebSocket (multiplayer)
- Node.js (server)
- Redis (persistence)

No frameworks. No build tools. Minimal dependencies (`ws` and `redis` for the server).

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