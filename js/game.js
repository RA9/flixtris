// game.js
(() => {
  const COLS = 10;
  const ROWS = 20;

  // Tetromino shapes and colors
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

  // Use the global state directly so ui.js can read updated values
  Object.assign(window.Flixtris.state, {
    score: 0,
    lines: 0,
    level: 1,
    mode: "classic",
    seed: null,
    rng: Math.random,
    running: false,
    paused: false,
    canvas: null,
    ctx: null,
    nextCanvas: null,
    nextCtx: null,
    holdCanvas: null,
    holdCtx: null,
    cellSize: 25,
    board: [],
    current: null,
    next: null,
    hold: null,
    canHold: true,
    posX: 0,
    posY: 0,
    dropInterval: null,
    lastDrop: 0,
    lastMultiplayerUpdate: 0,
    // Multiplayer garbage
    pendingGarbage: 0,
    // Line clear stats
    singles: 0,
    doubles: 0,
    triples: 0,
    tetrises: 0,
    // Combo tracking
    combo: 0,
    lastClearWasTetris: false,
    backToBack: false,
    // T-spin detection
    lastMoveWasRotation: false,
    // Settings
    ghostEnabled: true,
    hapticEnabled: true,
  });
  const state = window.Flixtris.state;

  function generateDailySeed() {
    const d = new Date();
    return `FLX-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function seededRandom(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return () => {
      h += 0x6d2b79f5;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function initCanvas() {
    state.canvas = document.getElementById("game");
    state.ctx = state.canvas.getContext("2d");
    state.nextCanvas = document.getElementById("next");
    state.nextCtx = state.nextCanvas.getContext("2d");
    state.holdCanvas = document.getElementById("hold");
    state.holdCtx = state.holdCanvas ? state.holdCanvas.getContext("2d") : null;
    resizeCanvas();
  }

  function resizeCanvas() {
    if (!state.canvas) return;

    const style = getComputedStyle(document.documentElement);
    const width = parseInt(style.getPropertyValue("--canvas-width")) || 300;
    const height = parseInt(style.getPropertyValue("--canvas-height")) || 500;

    state.canvas.width = width;
    state.canvas.height = height;
    state.cellSize = Math.floor(Math.min(width / COLS, height / ROWS));

    if (state.running && state.current) {
      render();
    }
  }

  function initBoard() {
    state.board = [];
    for (let r = 0; r < ROWS; r++) {
      state.board.push(new Array(COLS).fill(null));
    }
  }

  function randomPiece() {
    const name = PIECE_NAMES[Math.floor(state.rng() * PIECE_NAMES.length)];
    return {
      name,
      shape: PIECES[name].shape.map((row) => [...row]),
      color: PIECES[name].color,
    };
  }

  function spawnPiece() {
    state.current = state.next || randomPiece();
    state.next = randomPiece();
    state.posX = Math.floor((COLS - state.current.shape[0].length) / 2);
    state.posY = 0;
    state.canHold = true;
    state.lastMoveWasRotation = false;

    if (collides(state.current.shape, state.posX, state.posY)) {
      gameOver();
    }

    renderNext();
    renderHold();
  }

  function holdPiece() {
    if (!state.current || !state.canHold) return false;
    if (state.mode === "hardcore") return false; // No hold in hardcore

    state.canHold = false;
    window.Flixtris.api.sound.hold && window.Flixtris.api.sound.hold();

    // Trigger haptic feedback
    triggerHaptic("light");

    if (state.hold) {
      // Swap current and hold
      const temp = state.hold;
      state.hold = {
        name: state.current.name,
        shape: PIECES[state.current.name].shape.map((row) => [...row]),
        color: state.current.color,
      };
      state.current = temp;
    } else {
      // First hold - store current and spawn next
      state.hold = {
        name: state.current.name,
        shape: PIECES[state.current.name].shape.map((row) => [...row]),
        color: state.current.color,
      };
      state.current = state.next;
      state.next = randomPiece();
    }

    // Reset position
    state.posX = Math.floor((COLS - state.current.shape[0].length) / 2);
    state.posY = 0;
    state.lastMoveWasRotation = false;

    renderNext();
    renderHold();
    return true;
  }

  function triggerHaptic(style = "light") {
    if (!state.hapticEnabled) return;
    if (!navigator.vibrate) return;

    switch (style) {
      case "light":
        navigator.vibrate(10);
        break;
      case "medium":
        navigator.vibrate(25);
        break;
      case "heavy":
        navigator.vibrate(50);
        break;
    }
  }

  function collides(shape, offX, offY) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const newX = offX + c;
          const newY = offY + r;
          if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
          if (newY >= 0 && state.board[newY][newX]) return true;
        }
      }
    }
    return false;
  }

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

  function tryRotate() {
    if (!state.current) return false;
    const rotated = rotate(state.current.shape);
    // Wall kick attempts
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      if (!collides(rotated, state.posX + kick, state.posY)) {
        state.current.shape = rotated;
        state.posX += kick;
        state.lastMoveWasRotation = true;
        window.Flixtris.api.sound.rotate();
        triggerHaptic("light");
        return true;
      }
    }
    return false;
  }

  function moveLeft() {
    if (!state.current) return false;
    if (!collides(state.current.shape, state.posX - 1, state.posY)) {
      state.posX--;
      state.lastMoveWasRotation = false;
      window.Flixtris.api.sound.move();
      return true;
    }
    return false;
  }

  function moveRight() {
    if (!state.current) return false;
    if (!collides(state.current.shape, state.posX + 1, state.posY)) {
      state.posX++;
      state.lastMoveWasRotation = false;
      window.Flixtris.api.sound.move();
      return true;
    }
    return false;
  }

  function moveDown() {
    if (!state.current) return false;
    if (!collides(state.current.shape, state.posX, state.posY + 1)) {
      state.posY++;
      state.lastMoveWasRotation = false;
      window.Flixtris.api.sound.softDrop();
      return true;
    }
    return false;
  }

  function hardDrop() {
    if (!state.current) return;
    while (!collides(state.current.shape, state.posX, state.posY + 1)) {
      state.posY++;
    }
    state.lastMoveWasRotation = false;
    window.Flixtris.api.sound.hardDrop();
    triggerHaptic("medium");
    lockPiece();
  }

  function lockPiece() {
    if (!state.current) return;
    const shape = state.current.shape;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const boardY = state.posY + r;
          const boardX = state.posX + c;
          if (boardY >= 0) {
            state.board[boardY][boardX] = state.current.color;
          }
        }
      }
    }
    clearLines();
    spawnPiece();

    // Send board update for multiplayer
    sendMultiplayerUpdate();
  }

  // Get board snapshot including current piece for multiplayer sync
  function getBoardSnapshot() {
    // Create a copy of the board
    const snapshot = state.board.map((row) => [...row]);

    // Add current piece to snapshot
    if (state.current) {
      const shape = state.current.shape;
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            const boardY = state.posY + r;
            const boardX = state.posX + c;
            if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) {
              snapshot[boardY][boardX] = state.current.color;
            }
          }
        }
      }
    }

    return snapshot;
  }

  // Send update to multiplayer server
  function sendMultiplayerUpdate() {
    const mp = window.Flixtris.api.multiplayer;
    if (mp && mp.isConnected()) {
      mp.sendGameUpdate(
        state.score,
        state.level,
        state.lines,
        getBoardSnapshot(),
      );
    }
  }

  function isTSpin() {
    // T-spin detection: T piece, last move was rotation, and 3+ corners filled
    if (!state.current || state.current.name !== "T") return false;
    if (!state.lastMoveWasRotation) return false;

    // Check 4 corners around T piece center
    const centerX = state.posX + 1;
    const centerY = state.posY + 1;
    let filledCorners = 0;

    const corners = [
      [centerY - 1, centerX - 1],
      [centerY - 1, centerX + 1],
      [centerY + 1, centerX - 1],
      [centerY + 1, centerX + 1],
    ];

    for (const [r, c] of corners) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) {
        filledCorners++;
      } else if (state.board[r] && state.board[r][c]) {
        filledCorners++;
      }
    }

    return filledCorners >= 3;
  }

  function clearLines() {
    let linesCleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (state.board[r].every((cell) => cell !== null)) {
        state.board.splice(r, 1);
        state.board.unshift(new Array(COLS).fill(null));
        linesCleared++;
        r++; // Check same row again
      }
    }

    if (linesCleared > 0) {
      // Increment combo
      state.combo++;

      // Check for T-spin (detected before piece lock but we track it)
      const wasTSpin =
        state.current &&
        state.current.name === "T" &&
        state.lastMoveWasRotation;

      // Track line clear types
      if (linesCleared === 1) state.singles++;
      else if (linesCleared === 2) state.doubles++;
      else if (linesCleared === 3) state.triples++;
      else if (linesCleared === 4) state.tetrises++;

      // Check for back-to-back (consecutive tetrises or T-spins)
      const isTetris = linesCleared === 4;
      const isBackToBack = state.lastClearWasTetris && (isTetris || wasTSpin);
      state.lastClearWasTetris = isTetris || wasTSpin;

      // Play sound
      if (linesCleared === 4) {
        window.Flixtris.api.sound.tetris();
        triggerHaptic("heavy");
      } else {
        window.Flixtris.api.sound.lineClear();
        triggerHaptic("medium");
      }

      // NES-style scoring: base points * (level + 1)
      // Single: 40, Double: 100, Triple: 300, Tetris: 1200
      let basePoints = [0, 40, 100, 300, 1200][linesCleared];

      // T-spin bonus
      if (wasTSpin) {
        basePoints *= 2;
      }

      // Back-to-back bonus
      if (isBackToBack) {
        basePoints = Math.floor(basePoints * 1.5);
      }

      // Combo bonus
      if (state.combo > 1) {
        basePoints += 50 * (state.combo - 1) * (state.level + 1);
      }

      state.score += basePoints * (state.level + 1);
      state.lines += linesCleared;
      // Level advances every 10 lines
      state.level = Math.floor(state.lines / 10) + 1;
      window.Flixtris.api.ui.updateStats();

      // Show action indicator
      showActionIndicator(linesCleared, state.combo, wasTSpin, isBackToBack);

      // Send garbage to opponent in multiplayer
      const mp = window.Flixtris.api.multiplayer;
      if (mp && mp.isConnected()) {
        mp.sendGarbage(linesCleared);
      }
    } else {
      // No lines cleared - reset combo
      state.combo = 0;
    }
  }

  function showActionIndicator(lines, combo, isTSpin, isBackToBack) {
    const ui = window.Flixtris.api.ui;
    if (!ui || !ui.showActionIndicator) return;

    const actions = [];

    if (lines === 4) {
      actions.push({ text: "TETRIS!", class: "tetris" });
    } else if (isTSpin) {
      const spinText =
        lines === 1
          ? "T-SPIN SINGLE"
          : lines === 2
            ? "T-SPIN DOUBLE"
            : "T-SPIN TRIPLE";
      actions.push({ text: spinText, class: "tspin" });
    }

    if (isBackToBack && (lines === 4 || isTSpin)) {
      actions.push({ text: "BACK-TO-BACK", class: "back-to-back" });
    }

    if (combo > 1) {
      actions.push({ text: `${combo} COMBO`, class: "combo" });
    }

    if (actions.length > 0) {
      ui.showActionIndicator(actions);
    }
  }

  function getDropSpeed() {
    // Speed increases with level, gets brutal after level 3
    const speeds = [800, 700, 600, 450, 300, 200, 150, 100, 80, 60];
    return speeds[Math.min(state.level - 1, speeds.length - 1)];
  }

  function getGhostY() {
    if (!state.current) return state.posY;
    let ghostY = state.posY;
    while (!collides(state.current.shape, state.posX, ghostY + 1)) {
      ghostY++;
    }
    return ghostY;
  }

  function render() {
    const ctx = state.ctx;
    const cell = state.cellSize;
    const offsetX = (state.canvas.width - COLS * cell) / 2;
    const offsetY = (state.canvas.height - ROWS * cell) / 2;

    // Clear canvas
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);

    // Draw grid
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + r * cell);
      ctx.lineTo(offsetX + COLS * cell, offsetY + r * cell);
      ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(offsetX + c * cell, offsetY);
      ctx.lineTo(offsetX + c * cell, offsetY + ROWS * cell);
      ctx.stroke();
    }

    // Draw board
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (state.board[r][c]) {
          drawCell(
            ctx,
            offsetX + c * cell,
            offsetY + r * cell,
            cell,
            state.board[r][c],
          );
        }
      }
    }

    if (state.current) {
      // Draw ghost piece (not in hardcore mode and if enabled)
      if (state.mode !== "hardcore" && state.ghostEnabled) {
        const ghostY = getGhostY();
        const shape = state.current.shape;
        ctx.globalAlpha = 0.3;
        for (let r = 0; r < shape.length; r++) {
          for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c]) {
              drawCell(
                ctx,
                offsetX + (state.posX + c) * cell,
                offsetY + (ghostY + r) * cell,
                cell,
                state.current.color,
              );
            }
          }
        }
        ctx.globalAlpha = 1;
      }

      // Draw current piece
      const shape = state.current.shape;
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            drawCell(
              ctx,
              offsetX + (state.posX + c) * cell,
              offsetY + (state.posY + r) * cell,
              cell,
              state.current.color,
            );
          }
        }
      }
    }

    // Draw pause overlay
    if (state.paused) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);
      ctx.fillStyle = "#22d3ee";
      ctx.font = "bold 24px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", state.canvas.width / 2, state.canvas.height / 2);
    }
  }

  function drawCell(ctx, x, y, size, color) {
    const padding = 2;
    ctx.fillStyle = color;
    ctx.fillRect(
      x + padding,
      y + padding,
      size - padding * 2,
      size - padding * 2,
    );

    // Highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fillRect(x + padding, y + padding, size - padding * 2, 3);
    ctx.fillRect(x + padding, y + padding, 3, size - padding * 2);

    // Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(x + padding, y + size - padding - 3, size - padding * 2, 3);
    ctx.fillRect(x + size - padding - 3, y + padding, 3, size - padding * 2);
  }

  function renderNext() {
    // Render on desktop next canvas
    renderNextOnCanvas(state.nextCanvas, state.nextCtx, 18);

    // Render on mobile next canvas
    const mobileCanvas = document.getElementById("next-mobile");
    if (mobileCanvas) {
      const mobileCtx = mobileCanvas.getContext("2d");
      renderNextOnCanvas(mobileCanvas, mobileCtx, 9);
    }
  }

  function renderHold() {
    // Render on desktop hold canvas
    renderHoldOnCanvas(state.holdCanvas, state.holdCtx, 18);

    // Render on mobile hold canvas
    const mobileCanvas = document.getElementById("hold-mobile");
    if (mobileCanvas) {
      const mobileCtx = mobileCanvas.getContext("2d");
      renderHoldOnCanvas(mobileCanvas, mobileCtx, 9);
    }

    // Update visual state for "used" indicator
    if (state.holdCanvas) {
      if (state.canHold) {
        state.holdCanvas.classList.remove("used");
      } else {
        state.holdCanvas.classList.add("used");
      }
    }
    const mobileHold = document.getElementById("hold-mobile");
    if (mobileHold) {
      if (state.canHold) {
        mobileHold.classList.remove("used");
      } else {
        mobileHold.classList.add("used");
      }
    }
  }

  function renderHoldOnCanvas(canvas, ctx, cellSize) {
    if (!canvas || !ctx) return;

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!state.hold) return;

    const shape = state.hold.shape;
    const offsetX = (canvas.width - shape[0].length * cellSize) / 2;
    const offsetY = (canvas.height - shape.length * cellSize) / 2;

    // Draw slightly dimmed if can't hold
    ctx.globalAlpha = state.canHold ? 1 : 0.5;

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          drawCell(
            ctx,
            offsetX + c * cellSize,
            offsetY + r * cellSize,
            cellSize,
            state.hold.color,
          );
        }
      }
    }

    ctx.globalAlpha = 1;
  }

  function renderNextOnCanvas(canvas, ctx, cellSize) {
    if (!canvas || !ctx) return;

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!state.next) return;

    const shape = state.next.shape;
    const offsetX = (canvas.width - shape[0].length * cellSize) / 2;
    const offsetY = (canvas.height - shape.length * cellSize) / 2;

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          drawCell(
            ctx,
            offsetX + c * cellSize,
            offsetY + r * cellSize,
            cellSize,
            state.next.color,
          );
        }
      }
    }
  }

  function gameLoop(timestamp) {
    if (!state.running) return;

    if (!state.paused) {
      if (timestamp - state.lastDrop > getDropSpeed()) {
        if (!moveDown()) {
          lockPiece();
        }
        state.lastDrop = timestamp;
      }
      render();

      // Send multiplayer updates every 100ms for smooth opponent view
      if (timestamp - state.lastMultiplayerUpdate > 100) {
        sendMultiplayerUpdate();
        state.lastMultiplayerUpdate = timestamp;
      }
    }

    requestAnimationFrame(gameLoop);
  }

  function handleKeyDown(e) {
    if (!state.running) return;

    // Pause toggle (not allowed in hardcore or multiplayer)
    if (e.key === "p" || e.key === "P") {
      if (
        state.mode !== "hardcore" &&
        state.mode !== "multiplayer" &&
        state.mode !== "royale"
      ) {
        state.paused = !state.paused;
        window.Flixtris.api.sound.pause();
        // Show/hide pause overlay
        if (window.Flixtris.api.ui && window.Flixtris.api.ui.showPauseOverlay) {
          window.Flixtris.api.ui.showPauseOverlay(state.paused);
        }
        render();
      }
      return;
    }

    if (state.paused) return;

    switch (e.key) {
      case "ArrowLeft":
        moveLeft();
        break;
      case "ArrowRight":
        moveRight();
        break;
      case "ArrowDown":
        moveDown();
        break;
      case "ArrowUp":
        tryRotate();
        break;
      case " ":
        hardDrop();
        break;
      case "c":
      case "C":
        holdPiece();
        break;
    }
    render();
  }

  function startGame(mode = "classic") {
    state.mode = mode;
    state.score = 0;
    state.lines = 0;
    state.level = 1;
    state.running = true;
    state.paused = false;
    state.lastDrop = 0;
    state.lastMultiplayerUpdate = 0;
    state.pendingGarbage = 0;
    state.singles = 0;
    state.doubles = 0;
    state.triples = 0;
    state.tetrises = 0;
    // Reset hold and combo
    state.hold = null;
    state.canHold = true;
    state.combo = 0;
    state.lastClearWasTetris = false;
    state.backToBack = false;
    state.lastMoveWasRotation = false;

    if (mode === "daily") {
      state.seed = generateDailySeed();
      state.rng = seededRandom(state.seed);
    } else {
      state.seed = null;
      state.rng = Math.random;
    }

    initCanvas();
    initBoard();
    state.next = null;
    spawnPiece();
    window.Flixtris.api.ui.updateStats();

    requestAnimationFrame(gameLoop);
  }

  function startGameWithSeed(customSeed) {
    state.mode = "daily";
    state.score = 0;
    state.lines = 0;
    state.level = 1;
    state.running = true;
    state.paused = false;
    state.lastDrop = 0;
    state.lastMultiplayerUpdate = 0;
    state.pendingGarbage = 0;
    state.singles = 0;
    state.doubles = 0;
    state.triples = 0;
    state.tetrises = 0;
    // Reset hold and combo
    state.hold = null;
    state.canHold = true;
    state.combo = 0;
    state.lastClearWasTetris = false;
    state.backToBack = false;
    state.lastMoveWasRotation = false;
    state.seed = customSeed;
    state.rng = seededRandom(customSeed);

    initCanvas();
    initBoard();
    state.next = null;
    spawnPiece();
    window.Flixtris.api.ui.updateStats();

    requestAnimationFrame(gameLoop);
  }

  function stop() {
    state.running = false;
  }

  function gameOver() {
    state.running = false;
    window.Flixtris.api.sound.gameOver();

    window.Flixtris.api.db.addGame({
      score: state.score,
      level: state.level,
      lines: state.lines,
      mode: state.mode,
      seed: state.seed,
      singles: state.singles,
      doubles: state.doubles,
      triples: state.triples,
      tetrises: state.tetrises,
      date: Date.now(),
    });

    window.Flixtris.api.ui.showGameOver();
  }

  // Event listeners
  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", resizeCanvas);

  window.Flixtris.api.game = {
    startGame,
    startGameWithSeed,
    gameOver,
    stop,
    resizeCanvas,
    moveLeft,
    moveRight,
    moveDown,
    rotate: tryRotate,
    hardDrop,
    holdPiece,
    render,
    getBoardSnapshot,
    sendMultiplayerUpdate,
    addGarbageLines,
    triggerHaptic,
    getPendingGarbage: () => state.pendingGarbage,
    setPendingGarbage: (n) => {
      state.pendingGarbage = n;
    },
    setGhostEnabled: (enabled) => {
      state.ghostEnabled = enabled;
    },
    setHapticEnabled: (enabled) => {
      state.hapticEnabled = enabled;
    },
  };

  // Add garbage lines to the bottom of the board
  function addGarbageLines(count) {
    if (count <= 0 || !state.running) return;

    const garbageColor = "#6b7280"; // Gray color for garbage

    for (let i = 0; i < count; i++) {
      // Remove top row
      state.board.shift();

      // Create garbage row with one random gap
      const garbageRow = new Array(COLS).fill(garbageColor);
      const gapIndex = Math.floor(state.rng() * COLS);
      garbageRow[gapIndex] = null;

      // Add to bottom
      state.board.push(garbageRow);
    }

    // Check if current piece now collides
    if (
      state.current &&
      collides(state.current.shape, state.posX, state.posY)
    ) {
      // Try to push piece up
      while (
        state.posY > 0 &&
        collides(state.current.shape, state.posX, state.posY)
      ) {
        state.posY--;
      }
      // If still colliding, game over
      if (collides(state.current.shape, state.posX, state.posY)) {
        gameOver();
      }
    }

    // Play warning sound
    if (window.Flixtris.api.sound && window.Flixtris.api.sound.move) {
      window.Flixtris.api.sound.move();
    }

    render();
  }
})();
