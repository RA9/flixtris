# Contributing to Flixtris

Thank you for your interest in Flixtris!

## Rules
- No frameworks or build tools
- Keep logic readable
- One responsibility per file

## Setup

### Client (Frontend)

```bash
pnpm install -g serve
serve .
```

Open http://localhost:3000 in your browser.

### Multiplayer Server

```bash
cd server
pnpm install
pnpm start
```

The server runs on port 3001 by default. Optional: Start Redis for persistence (`redis-server`).

### Docker (Production)

Run the full stack with Docker Compose:

```bash
docker compose up -d
```

This starts:
- **Frontend** on http://localhost (port 80)
- **Server** on ws://localhost:3001
- **Redis** for persistence

To build and run individual services:

```bash
# Frontend only
docker build -t flixtris-frontend .
docker run -p 80:80 flixtris-frontend

# Server only
cd server
docker build -t flixtris-server .
docker run -p 3001:3001 -e REDIS_URL=redis://host:6379 flixtris-server
```

To stop all services:

```bash
docker compose down
```

## Code Style

### General
- Prefer functions over classes
- Avoid global variables
- Use IIFE pattern to encapsulate modules (see `js/*.js`)
- Use `const` by default, `let` when reassignment is needed
- Use descriptive variable names

### Formatting
- 2-space indentation
- Double quotes for strings
- Semicolons required
- Trailing commas in multi-line arrays/objects

### Naming Conventions
- `camelCase` for variables and functions
- `UPPER_SNAKE_CASE` for constants
- Descriptive function names (e.g., `generateDailySeed`, `seededRandom`)

### Comments
- Comment complex logic only
- Use `// Section Name` comments to separate logical blocks
- Server code uses `// ===== SECTION =====` style headers

## Testing

Currently, Flixtris does not have an automated test suite. Manual testing is expected:

1. **Client Testing**: Open the game in a browser and verify gameplay works correctly
2. **Multiplayer Testing**: Run the server and test with two browser windows
3. **Cross-browser Testing**: Test in Chrome, Firefox, and Safari

When contributing:
- Test your changes locally before submitting a PR
- Include steps to reproduce any bugs you're fixing
- Document how to test new features in your PR description

## Ideas Welcome
- New modes
- Visual themes
- Accessibility improvements
- Automated testing setup

Open a PR or issue anytime.
