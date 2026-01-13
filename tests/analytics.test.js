/**
 * analytics.test.js
 *
 * Test runner that loads a minimal DOM, executes game.js in a VM context,
 * and exercises analytics computations at game over.
 *
 * Usage: node tests/analytics.test.js
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Minimal test utilities
function assert(condition, message) {
  if (!condition) {
    console.error("Assertion failed:", message);
    process.exit(1);
  }
}

function logPass(message) {
  console.log("✔", message);
}

// Create a minimal DOM and browser-like globals
global.performance = {
  now: () => Date.now(),
};

global.requestAnimationFrame = (cb) => {
  return setTimeout(() => cb(performance.now()), 16);
};
global.cancelAnimationFrame = (id) => {
  clearTimeout(id);
};

function createMockCanvas() {
  return {
    width: 0,
    height: 0,
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false,
    },
    getContext: () => ({
      fillStyle: "#000",
      strokeStyle: "#000",
      lineWidth: 1,
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fillText: () => {},
      font: "",
      textAlign: "left",
    }),
  };
}

global.document = {
  documentElement: {
    setAttribute: () => {},
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  getElementById: (id) => {
    // Provide canvases that game.js expects (including mobile variants)
    if (
      id === "game" ||
      id === "next" ||
      id === "hold" ||
      id === "next-mobile" ||
      id === "hold-mobile"
    ) {
      return createMockCanvas();
    }
    // Provide overlays and other optional elements if queried
    return {
      classList: { add: () => {}, remove: () => {}, contains: () => false },
      querySelectorAll: () => [],
      querySelector: () => null,
      innerHTML: "",
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dataset: {},
      textContent: "",
    };
  },
};

global.getComputedStyle = () => ({
  getPropertyValue: (prop) => {
    if (prop === "--canvas-width") return "300";
    if (prop === "--canvas-height") return "500";
    return "0";
  },
});

// Global game namespace
global.window = global;
window.addEventListener = () => {};
window.removeEventListener = () => {};
window.Flixtris = {
  state: {},
  api: {
    ui: {
      updateStats: () => {},
      showGameOver: () => {},
      showPauseOverlay: () => {},
    },
    sound: {
      tetris: () => {},
      lineClear: () => {},
      gameOver: () => {},
      pause: () => {},
      hold: () => {},
      setEnabled: () => {},
    },
    db: {
      // Capture analytics rows and games for assertions
      __analytics: [],
      __games: [],
      addGameAnalytics: (row) => {
        window.Flixtris.api.db.__analytics.push(row);
      },
      addReplay: () => {},
      addGame: (rec) => {
        window.Flixtris.api.db.__games.push(rec);
      },
      saveSetting: () => {},
      getSetting: async () => null,
    },
    multiplayer: {
      isConnected: () => false,
      sendGameUpdate: () => {},
      sendGarbage: () => {},
    },
  },
};

// Load and execute game.js in a VM with the current global context
const gameJsPath = path.resolve(__dirname, "../js/game.js");
const gameJsCode = fs.readFileSync(gameJsPath, "utf8");
vm.runInThisContext(gameJsCode, { filename: gameJsPath });

// Convenience references
const gameApi = window.Flixtris.api.game;

// Start a game (classic mode)
gameApi.startGame("classic");

// Manipulate state to create a deterministic board configuration to exercise analytics
const state = window.Flixtris.state;

// Helper to fill a cell with a color
function fillCell(r, c, color = "#fff") {
  if (r >= 0 && r < 20 && c >= 0 && c < 10) {
    state.board[r][c] = color;
  }
}

// Create varying column heights and holes:
// - Column 0: height ~5, with holes below
fillCell(15, 0);
fillCell(16, 0);
fillCell(17, 0);
fillCell(18, 0);
fillCell(19, 0); // top-most fill in our coordinate system (r=19 is bottom visually; but scanning logic uses r=0 as top)
fillCell(18, 0, null); // introduce a hole

// - Column 1: height ~8, no holes
for (let r = 12; r <= 19; r++) fillCell(r, 1);

// - Column 2: height ~3, holes below
fillCell(17, 2);
fillCell(18, 2);
fillCell(19, 2);
fillCell(18, 2, null); // hole

// - Column 3: empty (height 0)
// - Column 4: fully filled to bottom (max height)
for (let r = 0; r <= 19; r++) fillCell(r, 4);

// Increment lines/level minimally for stats, combo tracking
state.lines = 12;
state.level = Math.floor(state.lines / 10) + 1;

// Simulate some combo and t-spin/misdrops counters
state.combo = 3;
state.comboMax = 4;
state.tSpins = 2;
state.misdrops = 1;

// Drought tracking (simulate some counts)
state.droughtCount = 7;
state.droughtMax = 9;

// Score a bit
state.score = 4200;

// Invoke game over to persist analytics and a game record
gameApi.gameOver();

// Assertions
const analytics = window.Flixtris.api.db.__analytics;
const games = window.Flixtris.api.db.__games;

assert(analytics.length > 0, "Expected at least one analytics record");
const last = analytics[analytics.length - 1];

assert(typeof last.apm === "number", "APM should be a number");
assert(typeof last.lpm === "number", "LPM should be a number");
assert(typeof last.holes === "number", "holes should be computed as a number");
assert(last.avgHeight >= 0, "avgHeight should be non-negative");

assert(last.comboMax === 4, "comboMax should reflect tracked maximum");
assert(last.tSpins === 2, "tSpins should reflect tracked t-spin clears");
assert(last.misdrops === 1, "misdrops should reflect tracked misdrops");
assert(last.droughtMax === 9, "droughtMax should reflect tracked drought");

assert(games.length > 0, "Expected a game record on game over");

// Log results
logPass(`Analytics rows: ${analytics.length}`);
logPass(`Games recorded: ${games.length}`);
logPass(
  `Analytics summary: holes=${last.holes}, avgHeight=${last.avgHeight}, comboMax=${last.comboMax}, tSpins=${last.tSpins}, misdrops=${last.misdrops}, droughtMax=${last.droughtMax}`,
);

console.log("All analytics tests passed.");
process.exit(0);
