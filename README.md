# Flixtris

A modern, offline-first Tetris game built with pure JavaScript. No frameworks, no build tools.

**Created by [Carlos S. Nah](https://github.com/ra9)**

## Features

- **Three Game Modes**
  - **Classic** - Endless mode with increasing difficulty
  - **Daily Challenge** - Same piece sequence for everyone, compare scores
  - **Hardcore** - No pause, no ghost piece, no mercy

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

## Daily Seed Sharing

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

## Installation

Serve with any static server:

```bash
npx serve .
# or
python -m http.server 8000
```

Open in browser and optionally install as a PWA.

## Project Structure

```
flixtris/
├── index.html      # Main HTML with embedded CSS
├── manifest.json   # PWA manifest
├── js/
│   ├── db.js       # IndexedDB storage
│   ├── sound.js    # Web Audio sound effects
│   ├── game.js     # Game logic and rendering
│   └── ui.js       # UI and screen management
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

No frameworks. No build tools. No dependencies.

## License

MIT
