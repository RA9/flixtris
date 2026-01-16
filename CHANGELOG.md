# Changelog

All notable changes to Flixtris will be documented in this file.

## [1.1.0] - 2026-01-16

### Added

#### Tournament System
- **Tournament Mode** - Create and manage competitive tournaments
  - Single Elimination format (lose once and you're out)
  - Round Robin format (everyone plays everyone)
  - Support for 4, 8, or 16 players
  - Match tracking with automatic bracket advancement
  - Persistent tournament data in IndexedDB
  - Tournament screens: list, create form, and bracket view
  - Player standings and winner declaration

#### Auto-Update System
- **PWA Update Notifications** - Intelligent update management
  - Automatic update checks every minute when online
  - Visual update banner at bottom of screen
  - One-click updates with service worker integration
  - Offline-aware (skips checks when offline)
  - Version tracking via version.json
  - Service worker cache management

#### Modular Architecture
- **Code Refactoring** - Broke monolithic files into focused modules
  - `screens.js` - Screen navigation and state management
  - `settings.js` - Settings UI and persistence
  - `leaderboard.js` - Leaderboard display and data management
  - `tournament.js` - Tournament system logic
  - `updates.js` - Auto-update system
  - Cleaner separation of concerns
  - Easier maintenance and testing
  - Better code reusability

#### Enhanced Database
- **Tournament Storage** - New IndexedDB object store
  - `tournaments` store with tournament data persistence
  - Tournament CRUD operations (create, read, update, delete)
  - Helper methods for leaderboard filtering (daily, weekly, global)
  - Upgraded DB version to 5

### Fixed

#### Mobile Layout
- **Game Board Display** - Fixed mobile rendering issues
  - Corrected canvas aspect ratio (2:1 instead of 5:3)
  - Fixed flexbox layout to prevent bottom cutoff
  - Added `min-height: 0` and `overflow: hidden` to game-center
  - Proper centering with `align-items: center`
  - Added `object-fit: contain` and `max-height: 100%` to canvas
  - Mobile controls now use `margin-top: auto` for better spacing
  - Consistent display across Classic, Daily Challenge, and Hard Core modes

### Changed

#### UI Improvements
- **Tournament Screens** - New UI components
  - Tournament list with status badges (waiting, in_progress, completed)
  - Tournament creation form with type selector
  - Tournament bracket view with match cards
  - Player cards with winner highlighting
  - Responsive design for mobile devices

- **Update Banner** - New notification system
  - Animated slide-up entrance
  - Rotating refresh icon
  - Update and dismiss buttons
  - Responsive layout for mobile
  - Auto-dismissal with re-show after 5 minutes

#### Documentation
- **README Updates** - Comprehensive documentation
  - Added version 1.1.0 changelog section
  - Tournament mode usage guide
  - Auto-update system explanation
  - Updated project structure with new modules
  - Enhanced tech stack description
  - Added modular architecture philosophy

### Technical Details

#### New Files
- `js/screens.js` (81 lines) - Screen management API
- `js/settings.js` (146 lines) - Settings system
- `js/leaderboard.js` (116 lines) - Leaderboard management
- `js/tournament.js` (218 lines) - Tournament engine
- `js/updates.js` (174 lines) - Update system
- `sw.js` (95 lines) - Service worker for PWA
- `version.json` - Version tracking
- `CHANGELOG.md` - This file

#### Modified Files
- `index.html` - Added tournament screens and new module includes
- `css/styles.css` - Added 397 lines for tournament and update UI
- `js/db.js` - Added tournament methods and leaderboard helpers
- `README.md` - Comprehensive updates reflecting all changes

#### Database Schema
```javascript
// New in v5
tournaments: {
  id: string (primary key),
  name: string,
  type: "single_elimination" | "round_robin",
  playerCount: number,
  status: "waiting" | "in_progress" | "completed",
  currentRound: number,
  players: Array<Player>,
  matches: Array<Match>,
  winner: Player | null
}
```

### Performance
- No performance regression
- Modular architecture improves maintainability
- Service worker enables faster subsequent loads
- IndexedDB operations remain efficient

### Compatibility
- Maintains backward compatibility with existing saved games
- Database migration from v4 to v5 is automatic
- All existing features continue to work

---

## [1.0.0] - Previous Release

Initial release with core features:
- Classic, Daily Challenge, Hardcore, and Multiplayer modes
- Battle Royale support
- Bot battles with difficulty levels
- Replay system and analytics
- Ranked mode foundations
- Premium features scaffolding
- Mobile responsive design
- PWA support
