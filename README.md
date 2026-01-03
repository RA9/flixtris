# Flixtris

A modern, offline-first Tetris game built with pure JavaScript. No frameworks, no build tools.

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

The multiplayer feature requires running the WebSocket server:

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Start the server
npm start
```

The server runs on port 3001 by default. Set the `PORT` environment variable to change it.

**Production deployment:**
- The server uses `ws` (WebSocket) library
- For production, deploy behind a reverse proxy with SSL (wss://)
- Rooms automatically expire after 30 minutes of inactivity

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
│   ├── index.js        # WebSocket multiplayer server
│   └── package.json    # Server dependencies
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

No frameworks. No build tools. Minimal dependencies (only `ws` for the server).

## License

MIT