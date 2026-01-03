# Flixtris

Flixtris is fully responsive across **mobile, tablet, and desktop**:

- Uses **CSS Grid + Flexbox**
- Canvas scales proportionally (no stretching)
- Touch controls auto-enable on mobile
- Side panel collapses into bottom drawer on small screens

### Responsive Rules
- `max-width: 480px` → Mobile layout
- `481px–900px` → Tablet layout
- `>900px` → Desktop layout

No JS media queries required — layout handled purely in CSS.

---

## 🌍 Daily Seed Sharing (Implemented)

### What is Daily Seed Sharing?

A **Daily Seed** ensures:
- Every player gets the **same piece order** on the same day
- Scores are directly comparable
- Works **offline**

### How It Works
- Seed format: `FLX-YYYY-MM-DD`
- Deterministic RNG guarantees identical gameplay
- Saved with score in IndexedDB

### Share Flow
- Daily results display the seed
- Players can share:
  > "I scored 12,430 on FLX-2026-01-02"

Future upgrade-ready for URL sharing.

---

## 👻 Ghost Piece & Speed Curve

- Ghost piece enabled in **Classic & Daily**
- Disabled in **Hardcore**

### Speed Formula
```js
speed = Math.max(80, 800 - (level - 1) * 70)
```

- Level 1–3: forgiving
- Level 4+: aggressively faster
- Infinite scaling

---

## 🏆 Local Leaderboard

- Stored in IndexedDB
- Sorted by score
- Includes:
  - Mode
  - Level
  - Daily Seed (if applicable)

Offline-first, zero sync required.

---

## 📖 README.md

```md
# 🎮 Flixtris

Flixtris is a **pure JavaScript, offline-first PWA Tetris-style game** with infinite levels, daily challenges, and hardcore modes.

## Features
- Offline-first PWA
- Infinite difficulty scaling
- Daily seed challenge
- Hardcore mode
- Touch + keyboard support
- Local leaderboard

## Controls
- ← → : Move
- ↑ : Rotate
- ↓ : Soft drop
- Space : Hard drop
- P : Pause
- H : Help

## Install
Serve with any static server:

```bash
npx serve .
```

Then install from your browser.

## Tech
- Vanilla JS
- IndexedDB
- Canvas
- Service Workers

No frameworks. No build tools.
```
