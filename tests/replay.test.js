/**
 * replay.test.js
 *
 * Add replay playback test that starts a game and runs a short recorded input sequence.
 * This test initializes a minimal DOM and browser-like environment, loads game.js,
 * and uses the exported replay playback API to run a recorded input stream.
 *
 * Usage: node tests/replay.test.js
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// --------- Minimal test utilities ----------
function assert(condition, message) {
  if (!condition) {
    console.error("Assertion failed:", message);
    process.exit(1);
  }
}

function logPass(message) {
  console.log("✔", message);
}

// --------- Minimal DOM / browser shims ----------
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
    style: {},
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
      setTransform: () => {},
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
    // Provide canvases needed by game.js (including mobile variants)
    if (
      id === "game" ||
      id === "next" ||
      id === "hold" ||
      id === "next-mobile" ||
      id === "hold-mobile"
    ) {
      return createMockCanvas();
    }
    // Generic element fallback
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

// --------- Global window / Flixtris shims ----------
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
      // Added missing stubs used during gameplay/replay
      softDrop: () => {},
      move: () => {},
      rotate: () => {},
      hardDrop: () => {},
      lock: () => {},
    },
    db: {
      addGameAnalytics: () => {},
      addReplay: () => {},
      addGame: () => {},
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

// --------- Load game.js into this context ----------
const gameJsPath = path.resolve(__dirname, "../js/game.js");
const gameJsCode = fs.readFileSync(gameJsPath, "utf8");
vm.runInThisContext(gameJsCode, { filename: gameJsPath });

const gameApi = window.Flixtris.api.game;
const state = window.Flixtris.state;

// --------- Record a game, then replay it ----------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boardKey() {
  return JSON.stringify(state.board);
}

let saved = null;
window.Flixtris.api.db.addReplay = (r) => {
  saved = r;
};
window.Flixtris.api.db.getDisplayName = async () => "tester";

(async () => {
  // Old replays (key presses only) must be refused, not played.
  const legacy = {
    mode: "classic",
    inputs: [{ key: " ", timestamp: 1 }],
  };
  assert(!gameApi.canPlayReplay(legacy), "Legacy replay should be unplayable");
  assert(
    gameApi.startReplayPlayback(legacy) === false,
    "Legacy replay should not start",
  );
  logPass("Legacy replays are refused");

  // Play a classic (unseeded) game with moves, gravity and garbage.
  gameApi.startGame("classic");
  const moves = ["moveRight", "rotate", "hardDrop", "moveLeft", "moveLeft",
    "hardDrop", "holdPiece", "moveRight", "moveDown", "hardDrop"];
  for (const m of moves) {
    gameApi[m]();
    await sleep(120);
  }
  gameApi.addGarbageLines(2);
  await sleep(900); // let gravity act
  gameApi.rotate();
  gameApi.hardDrop();
  await sleep(50);

  await gameApi.gameOver();
  assert(saved && saved.version === 2, "Replay should be saved in v2 format");
  assert(gameApi.canPlayReplay(saved), "New replay should be playable");
  assert(
    saved.events.some((e) => e.a === "G") &&
      saved.events.some((e) => e.a === "X"),
    "Replay should record gravity and garbage",
  );
  const recordedBoard = boardKey();
  const recordedScore = state.score;
  logPass(`Recorded ${saved.events.length} events`);

  let ended = false;
  assert(
    gameApi.startReplayPlayback(saved, { onEnd: () => (ended = true) }),
    "Replay should start",
  );
  // Real keys are ignored while it plays.
  const before = saved.events.length;
  gameApi.hardDrop();
  assert(saved.events.length === before, "Replay must not record new events");

  await sleep(saved.durationMs + 400);
  assert(boardKey() === recordedBoard, "Replay should rebuild the same board");
  assert(state.score === recordedScore, "Replay should reach the same score");
  logPass("Replay rebuilt the recorded board and score");

  await sleep(1700);
  assert(ended, "Replay should end and call onEnd");
  logPass("Replay ended cleanly");

  console.log("All replay tests passed.");
  process.exit(0);
})();
