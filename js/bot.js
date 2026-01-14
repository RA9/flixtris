// bot.js - AI Bot for Flixtris
(() => {
  const api = window.Flixtris.api;
  const getState = () => window.Flixtris.state;

  // Bot difficulty configurations
  const BOT_CONFIGS = {
    beginner: {
      name: "Beginner Bot",
      level: 1,
      thinkDelay: 800, // ms between moves
      mistakeRate: 0.3, // 30% chance of suboptimal move
      lookahead: false, // doesn't consider next piece
      description: "A slow, learning bot. Makes frequent mistakes.",
    },
    easy: {
      name: "Easy Bot",
      level: 3,
      thinkDelay: 500,
      mistakeRate: 0.2,
      lookahead: false,
      description: "Takes its time. Occasionally makes poor choices.",
    },
    medium: {
      name: "Medium Bot",
      level: 5,
      thinkDelay: 300,
      mistakeRate: 0.1,
      lookahead: true,
      description: "Balanced difficulty. Good for practice.",
    },
    hard: {
      name: "Hard Bot",
      level: 8,
      thinkDelay: 150,
      mistakeRate: 0.05,
      lookahead: true,
      description: "Fast and strategic. A worthy opponent.",
    },
    expert: {
      name: "Expert Bot",
      level: 12,
      thinkDelay: 80,
      mistakeRate: 0.02,
      lookahead: true,
      description: "Near-perfect play. Only for the brave.",
    },
    master: {
      name: "Master Bot",
      level: 15,
      thinkDelay: 50,
      mistakeRate: 0,
      lookahead: true,
      description: "Optimal play. Can you keep up?",
    },
  };

  const COLS = 10;
  const ROWS = 20;

  // Piece definitions (same as game.js)
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
    difficulty: "medium",
    config: null,
    board: [],
    current: null,
    next: null,
    hold: null,
    canHold: true,
    score: 0,
    level: 1,
    lines: 0,
    gameOver: false,
    thinkTimeout: null,
    dropInterval: null,
    bag: [],
    rng: Math.random,
    pendingGarbage: 0,
    // Callbacks
    onUpdate: null,
    onGameOver: null,
    onGarbage: null,
  };

  // Seeded RNG (same as game.js)
  function seededRandom(seed) {
    let s = seed;
    return function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  // Initialize bot game
  function initBot(difficulty = "medium", seed = null) {
    const config = BOT_CONFIGS[difficulty] || BOT_CONFIGS.medium;

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
      level: config.level,
      lines: 0,
      gameOver: false,
      thinkTimeout: null,
      dropInterval: null,
      bag: [],
      rng: seed ? seededRandom(seed) : Math.random,
      pendingGarbage: 0,
      posX: 0,
      posY: 0,
      onUpdate: botState.onUpdate,
      onGameOver: botState.onGameOver,
      onGarbage: botState.onGarbage,
    };

    return botState;
  }

  // Start bot game loop
  function startBot() {
    if (!botState.active) return;

    // Spawn first pieces
    botState.next = getNextPiece();
    spawnPiece();

    // Start the game loop
    scheduleThink();
    startDropLoop();

    emitUpdate();
  }

  // Stop bot
  function stopBot() {
    botState.active = false;
    if (botState.thinkTimeout) {
      clearTimeout(botState.thinkTimeout);
      botState.thinkTimeout = null;
    }
    if (botState.dropInterval) {
      clearInterval(botState.dropInterval);
      botState.dropInterval = null;
    }
  }

  // Get next piece from 7-bag
  function getNextPiece() {
    if (botState.bag.length === 0) {
      botState.bag = [...PIECE_NAMES];
      // Shuffle
      for (let i = botState.bag.length - 1; i > 0; i--) {
        const j = Math.floor(botState.rng() * (i + 1));
        [botState.bag[i], botState.bag[j]] = [botState.bag[j], botState.bag[i]];
      }
    }
    const name = botState.bag.pop();
    return {
      name,
      shape: PIECES[name].shape.map((row) => [...row]),
      color: PIECES[name].color,
    };
  }

  // Spawn a new piece
  function spawnPiece() {
    botState.current = botState.next;
    botState.next = getNextPiece();
    botState.canHold = true;

    // Center the piece
    const pieceWidth = botState.current.shape[0].length;
    botState.posX = Math.floor((COLS - pieceWidth) / 2);
    botState.posY = 0;

    // Check for game over
    if (collides(botState.current.shape, botState.posX, botState.posY)) {
      botGameOver();
    }
  }

  // Collision detection
  function collides(shape, x, y) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const newX = x + c;
          const newY = y + r;
          if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
          if (newY >= 0 && botState.board[newY][newX]) return true;
        }
      }
    }
    return false;
  }

  // Rotate shape
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

  // Get all rotations of a piece
  function getAllRotations(piece) {
    const rotations = [piece.shape];
    let current = piece.shape;
    for (let i = 0; i < 3; i++) {
      current = rotate(current);
      rotations.push(current);
    }
    return rotations;
  }

  // Lock piece to board
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

    // Clear lines
    const linesCleared = clearLines();

    // Calculate score
    const lineScores = [0, 100, 300, 500, 800];
    botState.score += lineScores[linesCleared] * botState.level;
    botState.lines += linesCleared;

    // Update level (every 10 lines)
    const newLevel = Math.floor(botState.lines / 10) + botState.config.level;
    if (newLevel > botState.level) {
      botState.level = newLevel;
      updateDropSpeed();
    }

    // Send garbage if lines cleared
    if (linesCleared > 1 && botState.onGarbage) {
      const garbage = calculateGarbage(linesCleared);
      botState.onGarbage(garbage);
    }

    // Spawn next piece
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

  // Calculate garbage to send
  function calculateGarbage(lines) {
    const garbageTable = [0, 0, 1, 2, 4];
    return garbageTable[Math.min(lines, 4)];
  }

  // Receive garbage
  function receiveGarbage(lines) {
    if (lines <= 0) return;

    // Add garbage lines from bottom
    for (let i = 0; i < lines; i++) {
      // Remove top row
      botState.board.shift();
      // Add garbage row at bottom with one random hole
      const holePos = Math.floor(botState.rng() * COLS);
      const garbageRow = Array(COLS).fill("#64748b");
      garbageRow[holePos] = null;
      botState.board.push(garbageRow);
    }

    emitUpdate();
  }

  // Bot AI: Find best placement
  function findBestPlacement() {
    if (!botState.current || botState.gameOver) return null;

    const rotations = getAllRotations(botState.current);
    let bestMove = null;
    let bestScore = -Infinity;

    // Consider hold piece
    const piecesToConsider = [
      { piece: botState.current, useHold: false },
    ];

    if (botState.canHold && botState.config.lookahead) {
      const holdPiece = botState.hold || botState.next;
      if (holdPiece) {
        piecesToConsider.push({
          piece: {
            name: holdPiece.name,
            shape: PIECES[holdPiece.name].shape.map((row) => [...row]),
            color: holdPiece.color,
          },
          useHold: true,
        });
      }
    }

    for (const { piece, useHold } of piecesToConsider) {
      const pieceRotations = getAllRotations(piece);

      for (let rot = 0; rot < pieceRotations.length; rot++) {
        const shape = pieceRotations[rot];
        const pieceWidth = shape[0].length;

        for (let x = -2; x <= COLS - pieceWidth + 2; x++) {
          // Find landing position
          let y = 0;
          while (!collidesAt(shape, x, y + 1)) {
            y++;
            if (y > ROWS) break;
          }

          if (collidesAt(shape, x, y)) continue;

          // Evaluate this placement
          const score = evaluatePlacement(shape, x, y);

          // Add small randomness based on mistake rate
          const noise = botState.config.mistakeRate > 0
            ? (botState.rng() - 0.5) * botState.config.mistakeRate * 100
            : 0;

          if (score + noise > bestScore) {
            bestScore = score + noise;
            bestMove = { x, y, rotation: rot, useHold };
          }
        }
      }
    }

    return bestMove;
  }

  // Check collision at position
  function collidesAt(shape, x, y) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const newX = x + c;
          const newY = y + r;
          if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
          if (newY >= 0 && botState.board[newY][newX]) return true;
        }
      }
    }
    return false;
  }

  // Evaluate a placement (higher is better)
  function evaluatePlacement(shape, x, y) {
    // Simulate placing the piece
    const testBoard = botState.board.map((row) => [...row]);

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const boardY = y + r;
          const boardX = x + c;
          if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) {
            testBoard[boardY][boardX] = "test";
          }
        }
      }
    }

    // Calculate metrics
    let score = 0;

    // 1. Lines cleared (big bonus)
    let linesCleared = 0;
    for (let r = 0; r < ROWS; r++) {
      if (testBoard[r].every((cell) => cell !== null)) {
        linesCleared++;
      }
    }
    score += linesCleared * 100;

    // Tetris bonus
    if (linesCleared === 4) {
      score += 200;
    }

    // 2. Aggregate height (lower is better)
    let aggregateHeight = 0;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (testBoard[r][c]) {
          aggregateHeight += ROWS - r;
          break;
        }
      }
    }
    score -= aggregateHeight * 0.5;

    // 3. Holes (fewer is better)
    let holes = 0;
    for (let c = 0; c < COLS; c++) {
      let foundBlock = false;
      for (let r = 0; r < ROWS; r++) {
        if (testBoard[r][c]) {
          foundBlock = true;
        } else if (foundBlock) {
          holes++;
        }
      }
    }
    score -= holes * 10;

    // 4. Bumpiness (smoother is better)
    let bumpiness = 0;
    const heights = [];
    for (let c = 0; c < COLS; c++) {
      let height = 0;
      for (let r = 0; r < ROWS; r++) {
        if (testBoard[r][c]) {
          height = ROWS - r;
          break;
        }
      }
      heights.push(height);
    }
    for (let i = 0; i < heights.length - 1; i++) {
      bumpiness += Math.abs(heights[i] - heights[i + 1]);
    }
    score -= bumpiness * 0.5;

    // 5. Well depth for tetrises (good to keep right column low)
    const rightHeight = heights[COLS - 1];
    const leftOfRightHeight = heights[COLS - 2];
    if (rightHeight === 0 && leftOfRightHeight > 0) {
      score += 20; // Encourage keeping a well for I pieces
    }

    // 6. Placement height (lower is safer)
    score -= y * 0.1;

    return score;
  }

  // Schedule next think cycle
  function scheduleThink() {
    if (!botState.active || botState.gameOver) return;

    botState.thinkTimeout = setTimeout(() => {
      thinkAndMove();
      scheduleThink();
    }, botState.config.thinkDelay);
  }

  // Think and make a move
  function thinkAndMove() {
    if (!botState.active || botState.gameOver || !botState.current) return;

    const bestMove = findBestPlacement();
    if (!bestMove) return;

    // Execute move
    if (bestMove.useHold) {
      doHold();
      return; // Will continue on next think cycle
    }

    // Rotate to target rotation
    let currentRotation = 0;
    while (currentRotation < bestMove.rotation) {
      const rotated = rotate(botState.current.shape);
      if (!collides(rotated, botState.posX, botState.posY)) {
        botState.current.shape = rotated;
      }
      currentRotation++;
    }

    // Move horizontally
    const targetX = bestMove.x;
    if (botState.posX < targetX) {
      if (!collides(botState.current.shape, botState.posX + 1, botState.posY)) {
        botState.posX++;
      }
    } else if (botState.posX > targetX) {
      if (!collides(botState.current.shape, botState.posX - 1, botState.posY)) {
        botState.posX--;
      }
    } else {
      // At target X, hard drop
      while (!collides(botState.current.shape, botState.posX, botState.posY + 1)) {
        botState.posY++;
      }
      lockPiece();
    }

    emitUpdate();
  }

  // Hold piece
  function doHold() {
    if (!botState.canHold || !botState.current) return;

    const temp = botState.hold;
    botState.hold = {
      name: botState.current.name,
      shape: PIECES[botState.current.name].shape.map((row) => [...row]),
      color: botState.current.color,
    };

    if (temp) {
      botState.current = {
        name: temp.name,
        shape: PIECES[temp.name].shape.map((row) => [...row]),
        color: temp.color,
      };
    } else {
      botState.current = botState.next;
      botState.next = getNextPiece();
    }

    // Reset position
    const pieceWidth = botState.current.shape[0].length;
    botState.posX = Math.floor((COLS - pieceWidth) / 2);
    botState.posY = 0;
    botState.canHold = false;

    emitUpdate();
  }

  // Start drop loop
  function startDropLoop() {
    updateDropSpeed();
  }

  // Update drop speed based on level
  function updateDropSpeed() {
    if (botState.dropInterval) {
      clearInterval(botState.dropInterval);
    }

    // Speed formula (similar to game.js)
    const baseSpeed = 1000;
    const speedFactor = Math.pow(0.85, botState.level - 1);
    const dropDelay = Math.max(50, baseSpeed * speedFactor);

    botState.dropInterval = setInterval(() => {
      if (!botState.active || botState.gameOver) return;

      // Move down or lock
      if (!collides(botState.current.shape, botState.posX, botState.posY + 1)) {
        botState.posY++;
        emitUpdate();
      }
    }, dropDelay);
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
