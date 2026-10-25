// bot.js - AI Bot for Flixtris
//
// The bot plays in real time like a person would: it waits a reaction
// delay after each spawn, then rotates and shifts one input at a time,
// and drops. Gravity and lock delay apply to it exactly as they do to
// the player, it pauses when the player pauses, and it draws pieces from
// the same seeded generator as the player so both get the same sequence.
(() => {
  const api = window.Flixtris.api;
  const getState = () => window.Flixtris.state;

  // Bot difficulty configurations.
  //   thinkDelay  reaction time after a piece spawns (ms, ±25% jitter)
  //   moveDelay   time between individual inputs (ms)
  //   hardDrop    false = soft-drops the piece down instead
  //   mistakeRate how noisy its placement judgement is
  //   lookahead   whether it considers using hold
  const BOT_CONFIGS = {
    beginner: {
      name: "Beginner Bot",
      level: 1,
      thinkDelay: 900,
      moveDelay: 170,
      hardDrop: false,
      mistakeRate: 0.3,
      lookahead: false,
      description: "A slow, learning bot. Makes frequent mistakes.",
    },
    easy: {
      name: "Easy Bot",
      level: 3,
      thinkDelay: 750,
      moveDelay: 130,
      hardDrop: false,
      mistakeRate: 0.2,
      lookahead: false,
      description: "Takes its time. Occasionally makes poor choices.",
    },
    medium: {
      name: "Medium Bot",
      level: 5,
      thinkDelay: 450,
      moveDelay: 90,
      hardDrop: true,
      mistakeRate: 0.1,
      lookahead: true,
      description: "Balanced difficulty. Good for practice.",
    },
    hard: {
      name: "Hard Bot",
      level: 8,
      thinkDelay: 260,
      moveDelay: 60,
      hardDrop: true,
      mistakeRate: 0.05,
      lookahead: true,
      description: "Fast and strategic. A worthy opponent.",
    },
    expert: {
      name: "Expert Bot",
      level: 12,
      thinkDelay: 200,
      moveDelay: 45,
      hardDrop: true,
      mistakeRate: 0.02,
      lookahead: true,
      description: "Near-perfect play. Only for the brave.",
    },
    master: {
      name: "Master Bot",
      level: 15,
      thinkDelay: 140,
      moveDelay: 32,
      hardDrop: true,
      mistakeRate: 0,
      lookahead: true,
      description: "Optimal play. Can you keep up?",
    },
  };

  const COLS = 10;
  const ROWS = 20;
  const TICK_MS = 16;
  const LOCK_DELAY = 500;
  const SOFT_DROP_MS = 45;
  const MAX_REPLANS = 2;

  // Must match game.js: scoring, garbage and gravity are shared rules.
  const LINE_POINTS = [0, 40, 100, 300, 1200];
  const GARBAGE_TABLE = [0, 0, 1, 2, 4];
  const DROP_SPEEDS = [800, 700, 600, 450, 300, 200, 150, 100, 80, 60];

  // Piece definitions (same as game.js, same order)
  const PIECES = {
    I: { shape: [[1, 1, 1, 1]], color: "#22d3ee" },
    O: {
      shape: [
        [1, 1],
        [1, 1],
      ],
      color: "#facc15",
    },
    T: {
      shape: [
        [0, 1, 0],
        [1, 1, 1],
      ],
      color: "#a78bfa",
    },
    S: {
      shape: [
        [0, 1, 1],
        [1, 1, 0],
      ],
      color: "#4ade80",
    },
    Z: {
      shape: [
        [1, 1, 0],
        [0, 1, 1],
      ],
      color: "#f43f5e",
    },
    J: {
      shape: [
        [1, 0, 0],
        [1, 1, 1],
      ],
      color: "#3b82f6",
    },
    L: {
      shape: [
        [0, 0, 1],
        [1, 1, 1],
      ],
      color: "#fb923c",
    },
  };
  const PIECE_NAMES = Object.keys(PIECES);

  // Bot state
  let botState = {
    active: false,
    gameOver: false,
    onUpdate: null,
    onGameOver: null,
    onGarbage: null,
  };

  // Initialize bot game
  function initBot(difficulty = "medium", seed = null) {
    const config = BOT_CONFIGS[difficulty] || BOT_CONFIGS.medium;
    const createRng = api.game && api.game.createRng;

    botState = {
      active: true,
      difficulty,
      config,
      board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
      current: null,
      next: null,
      hold: null,
      canHold: true,
      score: 0,
      startLevel: config.level,
      level: config.level,
      lines: 0,
      gameOver: false,
      posX: 0,
      posY: 0,
      // Pieces come from the player's generator; everything else (judgement
      // noise, garbage holes) uses Math.random so it can't desync the two.
      rng:
        seed !== null && createRng ? createRng(String(seed)) : Math.random,
      timer: null,
      lastTick: 0,
      gravityAcc: 0,
      restMs: 0,
      phase: "think",
      thinkLeft: 0,
      actionAcc: 0,
      actions: [],
      replans: 0,
      softDropping: false,
      onUpdate: botState.onUpdate,
      onGameOver: botState.onGameOver,
      onGarbage: botState.onGarbage,
    };

    return botState;
  }

  // Start bot game loop
  function startBot() {
    if (!botState.active) return;

    botState.next = randomPiece();
    spawnPiece();
    if (botState.gameOver) return;

    botState.lastTick = performance.now();
    botState.timer = setTimeout(tick, TICK_MS);
    emitUpdate();
  }

  // Stop bot
  function stopBot() {
    botState.active = false;
    if (botState.timer) {
      clearTimeout(botState.timer);
      botState.timer = null;
    }
  }

  function isPlayerPaused() {
    const state = getState();
    return !!(state && state.paused);
  }

  // ---------- Main loop ----------
  function tick() {
    if (!botState.active || botState.gameOver) return;

    const now = performance.now();
    // Clamp so a backgrounded tab doesn't replay seconds of moves at once.
    const dt = Math.min(now - botState.lastTick, 100);
    botState.lastTick = now;

    if (!isPlayerPaused()) update(dt);

    if (botState.active && !botState.gameOver) {
      botState.timer = setTimeout(tick, TICK_MS);
    }
  }

  function update(dt) {
    if (!botState.current) return;

    // Gravity (soft drop is just faster gravity)
    const gravity = botState.softDropping
      ? Math.min(SOFT_DROP_MS, gravityDelay())
      : gravityDelay();
    botState.gravityAcc += dt;
    while (botState.gravityAcc >= gravity) {
      botState.gravityAcc -= gravity;
      if (!collides(botState.current.shape, botState.posX, botState.posY + 1)) {
        botState.posY++;
        botState.restMs = 0;
        emitUpdate();
      }
    }

    // Thinking, then one input per moveDelay
    if (botState.phase === "think") {
      botState.thinkLeft -= dt;
      if (botState.thinkLeft <= 0) {
        planMove();
      }
    } else if (botState.phase === "act") {
      botState.actionAcc += dt;
      while (
        botState.phase === "act" &&
        botState.actionAcc >= botState.config.moveDelay
      ) {
        botState.actionAcc -= botState.config.moveDelay;
        doNextAction();
        if (!botState.current || botState.gameOver) return;
      }
    }

    if (!botState.active || botState.gameOver) return;

    // Lock delay once the piece is resting
    if (collides(botState.current.shape, botState.posX, botState.posY + 1)) {
      botState.restMs += dt;
      if (botState.restMs >= LOCK_DELAY) {
        lockPiece();
      }
    }
  }

  function gravityDelay() {
    return DROP_SPEEDS[Math.min(botState.level - 1, DROP_SPEEDS.length - 1)];
  }

  // ---------- Pieces ----------
  function randomPiece() {
    const name = PIECE_NAMES[Math.floor(botState.rng() * PIECE_NAMES.length)];
    return {
      name,
      shape: PIECES[name].shape.map((row) => [...row]),
      color: PIECES[name].color,
    };
  }

  function freshPiece(name) {
    return {
      name,
      shape: PIECES[name].shape.map((row) => [...row]),
      color: PIECES[name].color,
    };
  }

  function placeAtSpawn() {
    const pieceWidth = botState.current.shape[0].length;
    botState.posX = Math.floor((COLS - pieceWidth) / 2);
    botState.posY = 0;
    botState.gravityAcc = 0;
    botState.restMs = 0;
  }

  // Spawn a new piece and start the reaction delay
  function spawnPiece() {
    botState.current = botState.next;
    botState.next = randomPiece();
    botState.canHold = true;
    botState.softDropping = false;
    botState.replans = 0;
    placeAtSpawn();

    if (collides(botState.current.shape, botState.posX, botState.posY)) {
      botGameOver();
      return;
    }

    const jitter = 0.75 + Math.random() * 0.5;
    botState.phase = "think";
    botState.thinkLeft = botState.config.thinkDelay * jitter;
  }

  // Collision detection
  function collides(shape, x, y, board = botState.board) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const newX = x + c;
          const newY = y + r;
          if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
          if (newY >= 0 && board[newY][newX]) return true;
        }
      }
    }
    return false;
  }

  // Rotate shape clockwise (same as game.js)
  function rotate(shape) {
    const rows = shape.length;
    const cols = shape[0].length;
    const rotated = [];
    for (let c = 0; c < cols; c++) {
      rotated.push([]);
      for (let r = rows - 1; r >= 0; r--) {
        rotated[c].push(shape[r][c]);
      }
    }
    return rotated;
  }

  // ---------- Planning ----------
  function planMove() {
    const move = findBestPlacement();
    if (!move) {
      // Nowhere sensible to go: just let it fall.
      botState.actions = [botState.config.hardDrop ? "hardDrop" : "softDrop"];
    } else {
      const actions = [];
      if (move.useHold) actions.push("hold");
      for (let i = 0; i < move.rotation; i++) actions.push("rotate");
      // The shift is resolved against the live position when it runs.
      actions.push({ shiftTo: move.x });
      actions.push(botState.config.hardDrop ? "hardDrop" : "softDrop");
      botState.actions = actions;
    }
    botState.phase = "act";
    botState.actionAcc = 0;
  }

  function replan() {
    botState.replans++;
    if (botState.replans > MAX_REPLANS) {
      botState.actions = [botState.config.hardDrop ? "hardDrop" : "softDrop"];
      return;
    }
    planMove();
  }

  function doNextAction() {
    const action = botState.actions[0];
    if (action === undefined) {
      botState.phase = "idle";
      return;
    }

    if (action === "hold") {
      botState.actions.shift();
      doHold();
      return;
    }

    if (action === "rotate") {
      botState.actions.shift();
      if (!tryRotate()) replan();
      emitUpdate();
      return;
    }

    if (action === "hardDrop") {
      while (
        !collides(botState.current.shape, botState.posX, botState.posY + 1)
      ) {
        botState.posY++;
      }
      lockPiece();
      return;
    }

    if (action === "softDrop") {
      botState.actions.shift();
      botState.softDropping = true;
      botState.phase = "idle";
      return;
    }

    // { shiftTo }: one column per input until there
    if (botState.posX === action.shiftTo) {
      botState.actions.shift();
      doNextAction();
      return;
    }
    const dx = Math.sign(action.shiftTo - botState.posX);
    if (collides(botState.current.shape, botState.posX + dx, botState.posY)) {
      replan();
    } else {
      botState.posX += dx;
      botState.restMs = 0;
    }
    emitUpdate();
  }

  // Rotation with simple wall kicks (same offsets as the old bot)
  function tryRotate() {
    const rotated = rotate(botState.current.shape);
    for (const dx of [0, -1, 1, -2, 2]) {
      if (!collides(rotated, botState.posX + dx, botState.posY)) {
        botState.current.shape = rotated;
        botState.posX += dx;
        botState.restMs = 0;
        return true;
      }
    }
    return false;
  }

  // Bot AI: find the best reachable placement from where the piece is now
  function findBestPlacement() {
    if (!botState.current || botState.gameOver) return null;

    let bestMove = null;
    let bestScore = -Infinity;

    const candidates = [{ piece: botState.current, useHold: false }];
    if (botState.canHold && botState.config.lookahead) {
      const holdName = (botState.hold || botState.next || {}).name;
      if (holdName) {
        candidates.push({ piece: freshPiece(holdName), useHold: true });
      }
    }

    for (const { piece, useHold } of candidates) {
      // Holding resets the new piece to the top.
      const startY = useHold ? 0 : botState.posY;
      let shape = piece.shape;

      for (let rot = 0; rot < 4; rot++) {
        if (rot > 0) shape = rotate(shape);
        const pieceWidth = shape[0].length;

        for (let x = 0; x <= COLS - pieceWidth; x++) {
          if (collides(shape, x, startY)) continue;
          let y = startY;
          while (!collides(shape, x, y + 1)) y++;

          const score = evaluatePlacement(shape, x, y);
          const noise =
            botState.config.mistakeRate > 0
              ? (Math.random() - 0.5) * botState.config.mistakeRate * 100
              : 0;

          if (score + noise > bestScore) {
            bestScore = score + noise;
            bestMove = { x, rotation: rot, useHold };
          }
        }
      }
    }

    return bestMove;
  }

  // Evaluate a placement (higher is better)
  function evaluatePlacement(shape, x, y) {
    const testBoard = botState.board.map((row) => [...row]);
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] && y + r >= 0) testBoard[y + r][x + c] = "test";
      }
    }

    let linesCleared = 0;
    for (let r = 0; r < ROWS; r++) {
      if (testBoard[r].every((cell) => cell !== null)) linesCleared++;
    }

    const heights = [];
    let holes = 0;
    for (let c = 0; c < COLS; c++) {
      let height = 0;
      let seen = false;
      for (let r = 0; r < ROWS; r++) {
        if (testBoard[r][c]) {
          if (!seen) height = ROWS - r;
          seen = true;
        } else if (seen) {
          holes++;
        }
      }
      heights.push(height);
    }

    const aggregateHeight = heights.reduce((a, b) => a + b, 0);
    let bumpiness = 0;
    for (let i = 0; i < COLS - 1; i++) {
      bumpiness += Math.abs(heights[i] - heights[i + 1]);
    }

    let score = linesCleared * 100;
    if (linesCleared === 4) score += 200;
    score -= aggregateHeight * 0.5;
    score -= holes * 10;
    score -= bumpiness * 0.5;
    // Keep a well on the right for I pieces
    if (heights[COLS - 1] === 0 && heights[COLS - 2] > 0) score += 20;
    // Placement height (lower is safer)
    score -= (ROWS - y) * 0.1;

    return score;
  }

  // ---------- Hold / lock ----------
  function doHold() {
    if (!botState.canHold || !botState.current) return;

    const heldName = botState.hold && botState.hold.name;
    botState.hold = freshPiece(botState.current.name);

    if (heldName) {
      botState.current = freshPiece(heldName);
    } else {
      botState.current = botState.next;
      botState.next = randomPiece();
    }

    placeAtSpawn();
    botState.canHold = false;

    if (collides(botState.current.shape, botState.posX, botState.posY)) {
      botGameOver();
      return;
    }
    emitUpdate();
  }

  function lockPiece() {
    if (!botState.current) return;

    const shape = botState.current.shape;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const boardY = botState.posY + r;
          const boardX = botState.posX + c;
          if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) {
            botState.board[boardY][boardX] = botState.current.color;
          }
        }
      }
    }
    botState.current = null;

    const linesCleared = clearLines();
    if (linesCleared > 0) {
      botState.score += LINE_POINTS[linesCleared] * (botState.level + 1);
      botState.lines += linesCleared;
      botState.level =
        botState.startLevel + Math.floor(botState.lines / 10);

      const garbage = GARBAGE_TABLE[Math.min(linesCleared, 4)];
      if (garbage > 0 && botState.onGarbage) {
        botState.onGarbage(garbage);
      }
    }

    spawnPiece();
    emitUpdate();
  }

  // Clear completed lines
  function clearLines() {
    let linesCleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (botState.board[r].every((cell) => cell !== null)) {
        botState.board.splice(r, 1);
        botState.board.unshift(Array(COLS).fill(null));
        linesCleared++;
        r++; // Re-check this row
      }
    }
    return linesCleared;
  }

  // Receive garbage from the player
  function receiveGarbage(lines) {
    if (lines <= 0 || !botState.active || botState.gameOver) return;

    for (let i = 0; i < lines; i++) {
      botState.board.shift();
      const garbageRow = Array(COLS).fill("#6b7280");
      garbageRow[Math.floor(Math.random() * COLS)] = null;
      botState.board.push(garbageRow);
    }

    // Push the falling piece up out of the new rows, as game.js does.
    if (botState.current) {
      while (
        botState.posY > 0 &&
        collides(botState.current.shape, botState.posX, botState.posY)
      ) {
        botState.posY--;
      }
      if (collides(botState.current.shape, botState.posX, botState.posY)) {
        botGameOver();
        return;
      }
      // Its plan was made for the old board.
      if (botState.phase === "act") replan();
    }

    emitUpdate();
  }

  // Bot game over
  function botGameOver() {
    botState.gameOver = true;
    stopBot();
    if (botState.onGameOver) {
      botState.onGameOver({
        score: botState.score,
        level: botState.level,
        lines: botState.lines,
      });
    }
  }

  // Emit update to UI
  function emitUpdate() {
    if (botState.onUpdate) {
      botState.onUpdate({
        board: botState.board,
        current: botState.current,
        next: botState.next,
        hold: botState.hold,
        posX: botState.posX,
        posY: botState.posY,
        score: botState.score,
        level: botState.level,
        lines: botState.lines,
        gameOver: botState.gameOver,
      });
    }
  }

  // Get bot configurations
  function getBotConfigs() {
    return BOT_CONFIGS;
  }

  // Get current bot state
  function getBotState() {
    return {
      active: botState.active,
      score: botState.score,
      level: botState.level,
      lines: botState.lines,
      gameOver: botState.gameOver,
      board: botState.board,
    };
  }

  // Set callbacks
  function onUpdate(callback) {
    botState.onUpdate = callback;
  }

  function onGameOver(callback) {
    botState.onGameOver = callback;
  }

  function onGarbage(callback) {
    botState.onGarbage = callback;
  }

  // Expose API
  api.bot = {
    BOT_CONFIGS,
    getBotConfigs,
    initBot,
    startBot,
    stopBot,
    receiveGarbage,
    getBotState,
    onUpdate,
    onGameOver,
    onGarbage,
  };
})();
