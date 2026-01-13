// ui.js
(() => {
  const api = window.Flixtris.api;
  const IS_PROD =
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";
  const log = (...args) => {
    if (!IS_PROD) console.log(...args);
  };
  // Access state via getter to always get current values
  const getState = () => window.Flixtris.state;

  // Screen management
  const screens = {
    audio: document.getElementById("screen-audio"),
    splash: document.getElementById("screen-splash"),
    menu: document.getElementById("screen-menu"),
    settings: document.getElementById("screen-settings"),
    singleplayer: document.getElementById("screen-singleplayer"),
    multiplayerSelect: document.getElementById("screen-multiplayer-select"),
    leaderboard: document.getElementById("screen-leaderboard"),
    multiplayer: document.getElementById("screen-multiplayer"),
    waiting: document.getElementById("screen-waiting"),
    game: document.getElementById("screen-game"),
  };

  let lastMode = "classic";
  let isMultiplayerGame = false;
  let opponentCanvas = null;
  let opponentCtx = null;
  let myPlayerName = null;
  let myReadyState = false;
  let opponentReadyState = false;
  let opponentName = null;
  let pendingGarbage = 0;
  let rematchRequested = false;
  let opponentWantsRematch = false;

  // Royale mode state
  let isRoyaleMode = false;
  let royalePlayers = new Map();
  let aliveCount = 0;
  let totalPlayersInGame = 0;

  // Royale spectating state
  let royaleBoards = new Map(); // playerId -> { board, score, name }
  let currentSpectateId = null;
  let spectateInterval = null;
  const SPECTATE_SWITCH_MS = 3000;

  // Opponent board constants (half size of main board)
  const OPPONENT_COLS = 10;
  const OPPONENT_ROWS = 20;
  const OPPONENT_CELL_SIZE = 12;

  function showScreen(name) {
    Object.values(screens).forEach((s) => {
      if (s) s.classList.remove("active");
    });
    if (screens[name]) {
      screens[name].classList.add("active");
    }
  }

  function showOverlay(show) {
    const overlay = document.getElementById("overlay");
    if (show) {
      overlay.classList.add("active");
    } else {
      overlay.classList.remove("active");
    }
  }

  // ========================
  // PAUSE OVERLAY
  // ========================

  function showPauseOverlay(show) {
    const overlay = document.getElementById("pause-overlay");
    if (overlay) {
      if (show) {
        overlay.classList.add("active");
      } else {
        overlay.classList.remove("active");
      }
    }
  }

  function resumeGame() {
    const state = getState();
    if (state.paused) {
      state.paused = false;
      showPauseOverlay(false);
      if (api.game.render) api.game.render();
    }
  }

  // ========================
  // COUNTDOWN OVERLAY
  // ========================

  function showCountdownOverlay(show) {
    const overlay = document.getElementById("countdown-overlay");
    if (overlay) {
      if (show) {
        overlay.classList.add("active");
      } else {
        overlay.classList.remove("active");
      }
    }
  }

  function runCountdown(seconds, callback) {
    const numberEl = document.getElementById("countdownNumber");
    let count = seconds;

    showCountdownOverlay(true);

    function tick() {
      if (numberEl) {
        numberEl.textContent = count > 0 ? count : "GO!";
        numberEl.style.animation = "none";
        // Trigger reflow to restart animation
        numberEl.offsetHeight;
        numberEl.style.animation = "countdownPulse 1s ease-in-out infinite";
      }

      if (count > 0) {
        if (api.sound) api.sound.move(); // tick sound
        count--;
        setTimeout(tick, 1000);
      } else {
        setTimeout(() => {
          showCountdownOverlay(false);
          if (callback) callback();
        }, 500);
      }
    }

    tick();
  }

  // ========================
  // CONFIRM LEAVE DIALOG
  // ========================

  let confirmLeaveCallback = null;

  function showConfirmLeave(show, onConfirm = null) {
    const overlay = document.getElementById("confirm-leave-overlay");
    if (overlay) {
      if (show) {
        confirmLeaveCallback = onConfirm;
        overlay.classList.add("active");
      } else {
        overlay.classList.remove("active");
        confirmLeaveCallback = null;
      }
    }
  }

  // ========================
  // HIGH SCORE DISPLAY
  // ========================

  let currentHighScore = 0;

  async function loadHighScore() {
    const player = await api.db.getPlayer();
    currentHighScore = player.bestScore || 0;
    updateHighScoreDisplay();
  }

  function updateHighScoreDisplay() {
    const desktopEl = document.getElementById("high-score-display");
    const mobileEl = document.getElementById("mobile-high-score");

    if (currentHighScore > 0) {
      if (desktopEl) {
        desktopEl.innerHTML = `<span class="best-label">Best: </span><span class="best-value">${currentHighScore.toLocaleString()}</span>`;
      }
      if (mobileEl) {
        mobileEl.textContent = `Best: ${currentHighScore.toLocaleString()}`;
      }
    } else {
      if (desktopEl) desktopEl.innerHTML = "";
      if (mobileEl) mobileEl.textContent = "";
    }
  }

  // ========================
  // ACTION INDICATOR (Combo/T-Spin)
  // ========================

  let actionIndicatorTimeout = null;

  function showActionIndicator(actions) {
    const indicator = document.getElementById("action-indicator");
    if (!indicator) return;

    // Clear any existing timeout
    if (actionIndicatorTimeout) {
      clearTimeout(actionIndicatorTimeout);
    }

    // Build HTML for actions
    indicator.innerHTML = actions
      .map((a) => `<div class="action-text ${a.class}">${a.text}</div>`)
      .join("");

    // Trigger animation
    indicator.classList.remove("show");
    void indicator.offsetWidth; // Force reflow
    indicator.classList.add("show");

    // Remove after animation
    actionIndicatorTimeout = setTimeout(() => {
      indicator.classList.remove("show");
    }, 1500);
  }

  // ========================
  // SETTINGS
  // ========================

  const settings = {
    sfxEnabled: true,
    musicEnabled: true,
    theme: "dark",
    ghostEnabled: true,
    hapticEnabled: true,
    tutorialComplete: false,
  };

  // Function to apply theme
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  async function loadSettings() {
    const saved = await api.db.getSetting("gameSettings");
    if (saved) {
      Object.assign(settings, saved);
    }
    applySettings();
  }

  async function saveSettings() {
    await api.db.saveSetting("gameSettings", settings);
  }

  function applySettings() {
    // Apply to UI toggles
    const sfxToggle = document.getElementById("sfxToggle");
    const musicToggle = document.getElementById("musicToggle");
    const ghostToggle = document.getElementById("ghostToggle");
    const hapticToggle = document.getElementById("hapticToggle");

    if (sfxToggle) sfxToggle.dataset.enabled = settings.sfxEnabled;
    if (musicToggle) musicToggle.dataset.enabled = settings.musicEnabled;
    if (ghostToggle) ghostToggle.dataset.enabled = settings.ghostEnabled;
    if (hapticToggle) hapticToggle.dataset.enabled = settings.hapticEnabled;

    // Apply theme buttons
    document.querySelectorAll(".theme-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.theme === settings.theme);
    });

    // Apply current theme
    applyTheme(settings.theme);

    // Apply to game
    if (api.game) {
      if (api.game.setGhostEnabled)
        api.game.setGhostEnabled(settings.ghostEnabled);
      if (api.game.setHapticEnabled)
        api.game.setHapticEnabled(settings.hapticEnabled);
    }

    // Apply to sound
    if (api.sound) {
      if (api.sound.setEnabled) api.sound.setEnabled(settings.sfxEnabled);
    }
  }

  function setupSettingsListeners() {
    // Toggle buttons
    document.querySelectorAll(".toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const enabled = btn.dataset.enabled === "true";
        btn.dataset.enabled = !enabled;

        // Update settings
        if (btn.id === "sfxToggle") {
          settings.sfxEnabled = !enabled;
          if (api.sound) api.sound.setEnabled(!enabled);
        } else if (btn.id === "musicToggle") {
          settings.musicEnabled = !enabled;
        } else if (btn.id === "ghostToggle") {
          settings.ghostEnabled = !enabled;
          if (api.game && api.game.setGhostEnabled) {
            api.game.setGhostEnabled(!enabled);
          }
        } else if (btn.id === "hapticToggle") {
          settings.hapticEnabled = !enabled;
          if (api.game && api.game.setHapticEnabled) {
            api.game.setHapticEnabled(!enabled);
          }
        }

        saveSettings();
      });
    });

    // Theme buttons
    document.querySelectorAll(".theme-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".theme-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        settings.theme = btn.dataset.theme;
        saveSettings();
        applyTheme(settings.theme);
      });
    });

    // Settings button
    const settingsBtn = document.getElementById("settingsBtn");
    if (settingsBtn) {
      settingsBtn.addEventListener("click", () => {
        showScreen("settings");
      });
    }

    // Settings back button
    const settingsBackBtn = document.getElementById("settingsBackBtn");
    if (settingsBackBtn) {
      settingsBackBtn.addEventListener("click", () => {
        showScreen("menu");
      });
    }

    // Change name button
    const changeNameBtn = document.getElementById("changeNameBtn");
    if (changeNameBtn) {
      changeNameBtn.addEventListener("click", () => {
        showNameOverlay(true, () => {
          // Name changed, stay on settings
        });
      });
    }

    // Reset tutorial button
    const resetTutorialBtn = document.getElementById("resetTutorialBtn");
    if (resetTutorialBtn) {
      resetTutorialBtn.addEventListener("click", () => {
        settings.tutorialComplete = false;
        saveSettings();
        resetTutorialBtn.textContent = "Reset!";
        setTimeout(() => {
          resetTutorialBtn.textContent = "Reset";
        }, 1500);
      });
    }
  }

  // ========================
  // TUTORIAL
  // ========================

  const tutorialSteps = [
    {
      icon: "🎮",
      title: "Welcome to Flixtris!",
      text: "Stack falling blocks to clear lines. Don't let them reach the top!",
    },
    {
      icon: "⬅️➡️",
      title: "Move & Rotate",
      text: "Use arrow keys to move. Up arrow or tap the rotate button to spin pieces.",
    },
    {
      icon: "⬇️",
      title: "Drop Pieces",
      text: "Down arrow for soft drop. Space bar or the big button for instant hard drop!",
    },
    {
      icon: "📦",
      title: "Hold Piece",
      text: "Press C or tap Hold to save a piece for later. Swap it back when you need it!",
    },
    {
      icon: "🔥",
      title: "Combos & Tetrises",
      text: "Clear 4 lines at once for a Tetris! Chain clears for combos and bonus points.",
    },
  ];

  let currentTutorialStep = 0;

  function showTutorial() {
    const overlay = document.getElementById("tutorial-overlay");
    if (overlay) {
      overlay.classList.add("active");
      currentTutorialStep = 0;
      renderTutorialStep();
    }
  }

  function hideTutorial() {
    const overlay = document.getElementById("tutorial-overlay");
    if (overlay) {
      overlay.classList.remove("active");
    }
    settings.tutorialComplete = true;
    saveSettings();
  }

  function renderTutorialStep() {
    const step = tutorialSteps[currentTutorialStep];
    const stepEl = document.getElementById("tutorialStep");
    const iconEl = document.getElementById("tutorialIcon");
    const titleEl = document.getElementById("tutorialTitle");
    const textEl = document.getElementById("tutorialText");
    const prevBtn = document.getElementById("tutorialPrev");
    const nextBtn = document.getElementById("tutorialNext");

    if (stepEl)
      stepEl.textContent = `${currentTutorialStep + 1}/${tutorialSteps.length}`;
    if (iconEl) iconEl.textContent = step.icon;
    if (titleEl) titleEl.textContent = step.title;
    if (textEl) textEl.textContent = step.text;

    if (prevBtn) {
      prevBtn.style.visibility =
        currentTutorialStep === 0 ? "hidden" : "visible";
    }

    if (nextBtn) {
      nextBtn.textContent =
        currentTutorialStep === tutorialSteps.length - 1
          ? "Let's Play!"
          : "Next";
    }
  }

  function setupTutorialListeners() {
    const skipBtn = document.getElementById("tutorialSkip");
    const prevBtn = document.getElementById("tutorialPrev");
    const nextBtn = document.getElementById("tutorialNext");

    if (skipBtn) {
      skipBtn.addEventListener("click", hideTutorial);
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        if (currentTutorialStep > 0) {
          currentTutorialStep--;
          renderTutorialStep();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        if (currentTutorialStep < tutorialSteps.length - 1) {
          currentTutorialStep++;
          renderTutorialStep();
        } else {
          hideTutorial();
        }
      });
    }
  }

  async function checkShowTutorial() {
    await loadSettings();
    if (!settings.tutorialComplete) {
      showTutorial();
    }
  }

  function showMpResultsOverlay(show) {
    const overlay = document.getElementById("mp-results-overlay");
    if (show) {
      overlay.classList.add("active");
    } else {
      overlay.classList.remove("active");
    }
  }

  function showRoyaleResultsOverlay(show) {
    const overlay = document.getElementById("royale-results-overlay");
    if (overlay) {
      if (show) {
        overlay.classList.add("active");
      } else {
        overlay.classList.remove("active");
      }
    }
  }

  function showRoyaleResults(data) {
    const { winner, standings, myPlacement, didWin } = data;
    const myId = api.multiplayer.getPlayerId();
    const state = getState();

    // Submit score to leaderboard for royale games
    submitScoreToServer(state.score, state.mode, state.seed);

    // Update local player stats
    api.db.updatePlayerStats(state.score, didWin);

    // Update banner
    const banner = document.getElementById("royaleResultBanner");
    const icon = document.getElementById("royaleResultIcon");
    const title = document.getElementById("royaleResultTitle");

    if (banner) {
      banner.className = "mp-result-banner";
      if (didWin) {
        banner.classList.add("win");
        icon.textContent = "🏆";
        title.textContent = "Victory Royale!";
      } else if (myPlacement <= 3) {
        banner.classList.add("win");
        icon.textContent = "🥈";
        title.textContent = `${getOrdinal(myPlacement)} Place!`;
      } else {
        banner.classList.add("lose");
        icon.textContent = "💀";
        title.textContent = `${getOrdinal(myPlacement)} Place`;
      }
    }

    // Build standings list
    const standingsEl = document.getElementById("royaleStandings");
    if (standingsEl && standings) {
      standingsEl.innerHTML = standings
        .map((p) => {
          const isMe = p.id === myId;
          const isWinner = p.placement === 1;
          const classes = [
            "royale-standing-row",
            isWinner ? "winner" : "",
            isMe ? "you" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return `
          <div class="${classes}">
            <span class="standing-rank">${getOrdinal(p.placement)}</span>
            <span class="standing-name">${escapeHtml(p.name)}${isMe ? " (You)" : ""}</span>
            <span class="standing-score">${p.score.toLocaleString()}</span>
          </div>
        `;
        })
        .join("");
    }

    // Hide spectator indicator
    hideSpectatorIndicator();
    hideAliveCounter();

    showRoyaleResultsOverlay(true);
  }

  function getOrdinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function showSpectatorIndicator() {
    const el = document.getElementById("spectatorIndicator");
    if (el) el.style.display = "block";
  }

  function hideSpectatorIndicator() {
    const el = document.getElementById("spectatorIndicator");
    if (el) el.style.display = "none";
  }

  function showAliveCounter(alive, total) {
    const counter = document.getElementById("aliveCounter");
    const aliveEl = document.getElementById("aliveCount");
    const totalEl = document.getElementById("totalPlayersCount");

    if (counter && aliveEl && totalEl) {
      counter.style.display = "block";
      aliveEl.textContent = alive;
      totalEl.textContent = total;
    }
  }

  function hideAliveCounter() {
    const counter = document.getElementById("aliveCounter");
    if (counter) counter.style.display = "none";
  }

  function showEliminationBanner(playerName, placement, total, isMe) {
    // Create and show a temporary banner
    const banner = document.createElement("div");
    banner.className = "elimination-banner";
    banner.innerHTML = `
      <h2>${isMe ? "You were eliminated!" : `${escapeHtml(playerName)} eliminated!`}</h2>
      <p>${getOrdinal(placement)} / ${total}</p>
    `;
    document.body.appendChild(banner);

    setTimeout(() => {
      banner.remove();
    }, 2000);
  }

  function showWaitingForOpponent() {
    // Show a simple waiting overlay on the game canvas
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");

    // Semi-transparent overlay
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Game over text
    ctx.fillStyle = "#f43f5e";
    ctx.font = "bold 32px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 40);

    // Waiting text
    ctx.fillStyle = "#22d3ee";
    ctx.font = "18px system-ui";
    ctx.fillText(
      "Waiting for opponent...",
      canvas.width / 2,
      canvas.height / 2 + 20,
    );
  }

  function showMultiplayerResults(myId, winner, results, forfeit = false) {
    const state = getState();
    const isWinner = winner === myId;
    const isTie =
      !forfeit && results.length === 2 && results[0].score === results[1].score;
    const opponentForfeited =
      forfeit && results.some((r) => r.forfeited && r.id !== myId);

    // Submit score to leaderboard for multiplayer games
    submitScoreToServer(state.score, state.mode, state.seed);

    // Update local player stats
    api.db.updatePlayerStats(state.score, isWinner);

    // Sort results by score descending
    const sortedResults = [...results].sort((a, b) => b.score - a.score);

    // Update banner
    const banner = document.getElementById("mpResultBanner");
    const icon = document.getElementById("mpResultIcon");
    const title = document.getElementById("mpResultTitle");

    banner.className = "mp-result-banner";
    if (isTie) {
      banner.classList.add("tie");
      icon.textContent = "🤝";
      title.textContent = "It's a Tie!";
    } else if (isWinner) {
      banner.classList.add("win");
      icon.textContent = "🏆";
      title.textContent = opponentForfeited ? "You Win! (Forfeit)" : "You Win!";
    } else {
      banner.classList.add("lose");
      icon.textContent = "😔";
      title.textContent = "You Lose!";
    }

    // Update player results
    const player1 = sortedResults[0];
    const player2 = sortedResults[1];

    const player1Suffix = player1.id === myId ? " (You)" : "";
    const player1Forfeit = player1.forfeited ? " [Forfeit]" : "";
    document.getElementById("mpPlayer1Name").textContent =
      player1.name + player1Suffix + player1Forfeit;
    document.getElementById("mpPlayer1Score").textContent = player1.score;

    if (player2) {
      const player2Suffix = player2.id === myId ? " (You)" : "";
      const player2Forfeit = player2.forfeited ? " [Forfeit]" : "";
      document.getElementById("mpPlayer2Name").textContent =
        player2.name + player2Suffix + player2Forfeit;
      document.getElementById("mpPlayer2Score").textContent = player2.score;
    }

    // Update your stats
    document.getElementById("mpFinalScore").textContent = state.score;
    document.getElementById("mpFinalLevel").textContent = state.level;
    document.getElementById("mpFinalLines").textContent = state.lines;

    showMpResultsOverlay(true);
  }

  function showGameOverOverlay(show) {
    const overlay = document.getElementById("gameover-overlay");
    if (show) {
      overlay.classList.add("active");
    } else {
      overlay.classList.remove("active");
    }
  }

  function showSeedOverlay(show) {
    const overlay = document.getElementById("seed-overlay");
    if (show) {
      overlay.classList.add("active");
      document.getElementById("seed-input").value = "";
      document.getElementById("seed-input").focus();
    } else {
      overlay.classList.remove("active");
    }
  }

  // ========================
  // NAME PROMPT
  // ========================

  let namePromptCallback = null;

  async function showNameOverlay(show, callback = null) {
    const overlay = document.getElementById("name-overlay");
    if (show) {
      namePromptCallback = callback;
      overlay.classList.add("active");
      const input = document.getElementById("name-input");
      const preview = document.getElementById("name-preview-text");

      // Load current player info
      const displayName = await api.db.getDisplayName();
      preview.textContent = displayName;
      myPlayerName = displayName;

      input.value = "";
      input.focus();

      // Update preview as user types
      input.oninput = () => {
        const val = input.value.trim();
        preview.textContent = val || displayName;
      };
    } else {
      overlay.classList.remove("active");
      namePromptCallback = null;
    }
  }

  async function handleSaveName() {
    const input = document.getElementById("name-input");
    const name = input.value.trim();

    // Validate: 2-16 chars, alphanumeric + underscore
    if (name && (name.length < 2 || name.length > 16)) {
      alert("Name must be 2-16 characters");
      return;
    }
    if (name && !/^[a-zA-Z0-9_]+$/.test(name)) {
      alert("Name can only contain letters, numbers, and underscores");
      return;
    }

    if (name) {
      await api.db.setPlayerName(name);
      myPlayerName = name;
    } else {
      myPlayerName = await api.db.getDisplayName();
    }

    showNameOverlay(false);
    if (namePromptCallback) {
      namePromptCallback();
    }
  }

  async function handleSkipName() {
    myPlayerName = await api.db.getDisplayName();
    showNameOverlay(false);
    if (namePromptCallback) {
      namePromptCallback();
    }
  }

  // Check if we should show name prompt (first visit)
  async function checkFirstVisit() {
    const hasName = await api.db.hasCustomName();
    return !hasName;
  }

  // Initialize player name on load
  async function initPlayerName() {
    myPlayerName = await api.db.getDisplayName();
  }

  // ========================
  // LEADERBOARD
  // ========================

  let currentLeaderboardTab = "global";

  async function loadLeaderboard(type = "global") {
    const listEl = document.getElementById("leaderboardList");
    if (!listEl) return;

    listEl.innerHTML = '<div class="leaderboard-loading">Loading...</div>';

    try {
      const response = await fetch(`/api/leaderboard/${type}`);
      const data = await response.json();

      if (!data.leaderboard || data.leaderboard.length === 0) {
        listEl.innerHTML =
          '<div class="leaderboard-empty">No scores yet. Be the first!</div>';
        return;
      }

      const playerName = await api.db.getDisplayName();

      listEl.innerHTML = data.leaderboard
        .map((entry) => {
          const rankClass =
            entry.rank === 1
              ? "gold"
              : entry.rank === 2
                ? "silver"
                : entry.rank === 3
                  ? "bronze"
                  : "";
          const isPlayer = entry.playerName === playerName;
          return `
          <div class="leaderboard-row ${isPlayer ? "highlight" : ""}">
            <span class="leaderboard-rank ${rankClass}">${entry.rank}</span>
            <span class="leaderboard-name">${escapeHtml(entry.playerName)}</span>
            <span class="leaderboard-score">${entry.score.toLocaleString()}</span>
          </div>
        `;
        })
        .join("");
    } catch (err) {
      listEl.innerHTML =
        '<div class="leaderboard-empty">Failed to load leaderboard</div>';
    }
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  async function submitScoreToServer(score, mode, seed) {
    const playerName = await api.db.getDisplayName();
    try {
      await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName, score, mode, seed }),
      });
    } catch (err) {
      log("Failed to submit score:", err);
    }
  }

  function updateStats() {
    const state = getState();
    const statsEl = document.getElementById("stats");
    statsEl.textContent = `Score: ${state.score}\nLevel: ${state.level}\nLines: ${state.lines}`;

    // Update mobile score
    const mobileScore = document.getElementById("mobile-score");
    if (mobileScore) {
      mobileScore.textContent = state.score;
    }
  }

  function showGameOver() {
    const state = getState();

    // Send game over to multiplayer if in multiplayer mode
    if (isMultiplayerGame && api.multiplayer && api.multiplayer.isConnected()) {
      api.multiplayer.sendGameOver(state.score, state.level, state.lines);
      // Don't show regular game over - wait for multiplayer results
      showWaitingForOpponent();
      return;
    }

    // Update final stats
    document.getElementById("final-score").textContent = state.score;
    document.getElementById("final-level").textContent = state.level;
    document.getElementById("final-lines").textContent = state.lines;
    document.getElementById("final-singles").textContent = state.singles;
    document.getElementById("final-doubles").textContent = state.doubles;
    document.getElementById("final-triples").textContent = state.triples;
    document.getElementById("final-tetrises").textContent = state.tetrises;

    // Show daily seed if applicable
    const seedContainer = document.getElementById("daily-seed-container");
    if (state.mode === "daily" && state.seed) {
      seedContainer.style.display = "block";
      document.getElementById("seed-display").textContent = state.seed;
    } else {
      seedContainer.style.display = "none";
    }

    lastMode = state.mode;
    showGameOverOverlay(true);

    // Submit score to leaderboard
    submitScoreToServer(state.score, state.mode, state.seed);

    // Update local player stats
    api.db.updatePlayerStats(state.score);
  }

  function shareScore() {
    const state = getState();
    const shareUrl = `${window.location.origin}${window.location.pathname}?seed=${encodeURIComponent(state.seed)}`;
    const text = `Flixtris Challenge\n${state.seed}\nScore: ${state.score} | Level: ${state.level} | Lines: ${state.lines}\n\nCan you beat my score?\n${shareUrl}`;

    if (navigator.share) {
      navigator
        .share({
          title: "Flixtris Challenge",
          text: `I scored ${state.score} on ${state.seed}. Can you beat me?`,
          url: shareUrl,
        })
        .catch(() => {
          copyToClipboard(text);
        });
    } else {
      copyToClipboard(text);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById("shareBtn");
      const originalText = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    });
  }

  // Audio enable screen - first interaction enables audio
  function handleAudioEnable() {
    if (api.sound && api.sound.resumeContext) {
      api.sound.resumeContext();
    }
    showScreen("splash");
    // Start splash music after showing splash screen
    if (api.sound && api.sound.playSplashMusic) {
      api.sound.playSplashMusic();
    }
  }

  screens.audio.addEventListener("click", handleAudioEnable);
  screens.audio.addEventListener("touchstart", (e) => {
    e.preventDefault();
    handleAudioEnable();
  });

  // Check if any overlay is currently active
  function isOverlayActive() {
    const overlays = [
      "overlay",
      "gameover-overlay",
      "seed-overlay",
      "name-overlay",
      "mp-results-overlay",
      "royale-results-overlay",
      "pause-overlay",
      "countdown-overlay",
      "confirm-leave-overlay",
      "tutorial-overlay",
    ];
    return overlays.some((id) => {
      const el = document.getElementById(id);
      return el && el.classList.contains("active");
    });
  }

  document.addEventListener("keydown", (e) => {
    if (screens.audio.classList.contains("active") && !isOverlayActive()) {
      handleAudioEnable();
    }
  });

  // Splash screen - any key or click advances to menu
  async function handleSplashInteraction() {
    if (api.sound && api.sound.stopSplashMusic) {
      api.sound.stopSplashMusic();
    }

    // Check if first visit - show name prompt then tutorial
    const isFirstVisit = await checkFirstVisit();
    if (isFirstVisit) {
      showNameOverlay(true, async () => {
        showScreen("menu");
        // Show tutorial for first-time users
        await checkShowTutorial();
      });
    } else {
      showScreen("menu");
    }
  }

  screens.splash.addEventListener("click", handleSplashInteraction);
  screens.splash.addEventListener("touchstart", (e) => {
    e.preventDefault();
    handleSplashInteraction();
  });

  document.addEventListener("keydown", (e) => {
    if (screens.splash.classList.contains("active") && !isOverlayActive()) {
      handleSplashInteraction();
    }
  });

  // Main menu category buttons
  document.getElementById("singlePlayerBtn").addEventListener("click", () => {
    if (api.sound) api.sound.menuSelect();
    showScreen("singleplayer");
  });

  document.getElementById("multiplayerBtn").addEventListener("click", () => {
    if (api.sound) api.sound.menuSelect();
    showScreen("multiplayerSelect");
  });

  // Back buttons for submenu screens
  document
    .getElementById("singlePlayerBackBtn")
    .addEventListener("click", () => {
      showScreen("menu");
    });

  document
    .getElementById("multiplayerBackBtn")
    .addEventListener("click", () => {
      showScreen("menu");
    });

  // Mode selection
  document.querySelectorAll(".mode-card").forEach((card) => {
    card.addEventListener("click", () => {
      // Skip category cards - they have their own handlers
      if (card.id === "singlePlayerBtn" || card.id === "multiplayerBtn") {
        return;
      }

      if (api.sound) api.sound.menuSelect();
      const mode = card.dataset.mode;

      if (mode === "multiplayer") {
        // Show multiplayer lobby for 1v1
        isRoyaleMode = false;
        showScreen("multiplayer");
        return;
      }

      if (mode === "royale") {
        // Show multiplayer lobby for royale
        isRoyaleMode = true;
        showScreen("multiplayer");
        return;
      }

      lastMode = mode;
      isMultiplayerGame = false;
      isRoyaleMode = false;
      hideOpponentBoard();
      showScreen("game");
      loadHighScore();
      // Start with countdown for single player
      runCountdown(3, () => {
        api.game.startGame(mode);
      });
    });
  });

  // Theme buttons
  document.querySelectorAll("[data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const theme = btn.dataset.theme;
      settings.theme = theme;
      saveSettings();
      applyTheme(theme);
      log("Theme selected:", theme);
    });
  });

  // Help overlay
  document
    .getElementById("helpBtn")
    .addEventListener("click", () => showOverlay(true));
  document
    .getElementById("closeHelp")
    .addEventListener("click", () => showOverlay(false));

  // Pause overlay buttons
  const resumeBtn = document.getElementById("resumeBtn");
  const pauseHelpBtn = document.getElementById("pauseHelpBtn");
  const pauseMenuBtn = document.getElementById("pauseMenuBtn");

  if (resumeBtn) {
    resumeBtn.addEventListener("click", () => {
      resumeGame();
    });
  }

  if (pauseHelpBtn) {
    pauseHelpBtn.addEventListener("click", () => {
      showPauseOverlay(false);
      showOverlay(true);
    });
  }

  if (pauseMenuBtn) {
    pauseMenuBtn.addEventListener("click", () => {
      showPauseOverlay(false);
      showConfirmLeave(true, () => {
        if (api.game.stop) api.game.stop();
        const state = getState();
        state.paused = false;

        if (isMultiplayerGame && api.multiplayer) {
          api.multiplayer.disconnect();
          isMultiplayerGame = false;
        }

        hideOpponentBoard();
        showScreen("menu");
      });
    });
  }

  // Sound toggle
  const soundBtn = document.getElementById("soundBtn");
  soundBtn.addEventListener("click", () => {
    if (api.sound) {
      const enabled = !api.sound.isEnabled();
      api.sound.setEnabled(enabled);
      soundBtn.textContent = enabled ? "Sound: On" : "Sound: Off";
    }
  });

  // Main menu button during game - show confirmation
  document.getElementById("mainMenuBtn").addEventListener("click", () => {
    const state = getState();
    // Pause the game while showing confirmation
    if (state.running && !state.paused) {
      state.paused = true;
    }
    closePanel();
    showConfirmLeave(true, () => {
      if (api.game.stop) api.game.stop();

      // Disconnect from multiplayer if connected
      if (isMultiplayerGame && api.multiplayer) {
        api.multiplayer.disconnect();
        isMultiplayerGame = false;
      }

      hideOpponentBoard();
      showScreen("menu");
    });
  });

  // Confirm leave dialog buttons
  const confirmLeaveBtn = document.getElementById("confirmLeaveBtn");
  const cancelLeaveBtn = document.getElementById("cancelLeaveBtn");

  if (confirmLeaveBtn) {
    confirmLeaveBtn.addEventListener("click", () => {
      const callback = confirmLeaveCallback;
      showConfirmLeave(false);
      if (callback) callback();
    });
  }

  if (cancelLeaveBtn) {
    cancelLeaveBtn.addEventListener("click", () => {
      showConfirmLeave(false);
      // Resume game if it was paused
      const state = getState();
      if (state.paused && state.running) {
        state.paused = false;
        if (api.game.render) api.game.render();
      }
    });
  }

  // Game over overlay buttons
  document.getElementById("playAgainBtn").addEventListener("click", () => {
    showGameOverOverlay(false);

    // Can't play again in multiplayer mode - go back to lobby
    if (isMultiplayerGame) {
      if (api.multiplayer) {
        api.multiplayer.disconnect();
      }
      isMultiplayerGame = false;
      hideOpponentBoard();
      showScreen("multiplayerSelect");
      return;
    }

    loadHighScore();
    runCountdown(3, () => {
      api.game.startGame(lastMode);
    });
  });

  document.getElementById("menuBtn").addEventListener("click", () => {
    showGameOverOverlay(false);

    // Disconnect from multiplayer if connected
    if (isMultiplayerGame && api.multiplayer) {
      api.multiplayer.disconnect();
      isMultiplayerGame = false;
    }

    hideOpponentBoard();
    showScreen("menu");
  });

  document.getElementById("shareBtn").addEventListener("click", shareScore);

  // Seed input overlay
  document.getElementById("playSeedBtn").addEventListener("click", () => {
    showSeedOverlay(true);
  });

  document.getElementById("cancelSeedBtn").addEventListener("click", () => {
    showSeedOverlay(false);
  });

  document.getElementById("startSeedBtn").addEventListener("click", () => {
    const seedInput = document.getElementById("seed-input").value.trim();
    if (seedInput) {
      showSeedOverlay(false);
      showScreen("game");
      loadHighScore();
      runCountdown(3, () => {
        api.game.startGameWithSeed(seedInput);
      });
    }
  });

  document.getElementById("seed-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      document.getElementById("startSeedBtn").click();
    }
  });

  // Name prompt overlay
  document
    .getElementById("saveNameBtn")
    .addEventListener("click", handleSaveName);
  document
    .getElementById("skipNameBtn")
    .addEventListener("click", handleSkipName);

  document.getElementById("name-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleSaveName();
    }
  });

  // Leaderboard
  document.getElementById("leaderboardBtn").addEventListener("click", () => {
    showScreen("leaderboard");
    loadLeaderboard(currentLeaderboardTab);
  });

  document
    .getElementById("leaderboardBackBtn")
    .addEventListener("click", () => {
      showScreen("menu");
    });

  document.querySelectorAll(".leaderboard-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".leaderboard-tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentLeaderboardTab = tab.dataset.tab;
      loadLeaderboard(currentLeaderboardTab);
    });
  });

  // Close overlay on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      // Handle pause overlay - resume game
      const pauseOverlay = document.getElementById("pause-overlay");
      if (pauseOverlay && pauseOverlay.classList.contains("active")) {
        resumeGame();
        return;
      }
      // Handle confirm leave - cancel and resume
      const confirmLeave = document.getElementById("confirm-leave-overlay");
      if (confirmLeave && confirmLeave.classList.contains("active")) {
        showConfirmLeave(false);
        const state = getState();
        if (state.paused && state.running) {
          state.paused = false;
          if (api.game.render) api.game.render();
        }
        return;
      }
      // Handle help overlay when coming from pause
      const helpOverlay = document.getElementById("overlay");
      if (helpOverlay && helpOverlay.classList.contains("active")) {
        showOverlay(false);
        // If game is paused, show pause overlay again
        const state = getState();
        if (state.paused && state.running) {
          showPauseOverlay(true);
        }
        return;
      }
      showGameOverOverlay(false);
      showSeedOverlay(false);
      showMpResultsOverlay(false);
      showRoyaleResultsOverlay(false);
    }
    if (e.key === "h" || e.key === "H") {
      if (screens.game.classList.contains("active") && !isOverlayActive()) {
        const state = getState();
        // Pause the game when opening help
        if (state.running && !state.paused && state.mode !== "hardcore") {
          state.paused = true;
          showPauseOverlay(false); // Don't show pause overlay, show help directly
        }
        showOverlay(true);
      }
    }
  });

  // Responsive canvas sizing
  function resizeCanvas() {
    const gameCanvas = document.getElementById("game");
    const style = getComputedStyle(document.documentElement);
    const width = parseInt(style.getPropertyValue("--canvas-width"));
    const height = parseInt(style.getPropertyValue("--canvas-height"));

    if (width && height) {
      gameCanvas.style.width = width + "px";
      gameCanvas.style.height = height + "px";
    }
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // Mobile hamburger menu
  const panel = document.getElementById("sidePanel");
  const panelOverlay = document.getElementById("panelOverlay");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const panelCloseBtn = document.getElementById("panelCloseBtn");

  function openPanel() {
    panel.classList.add("open");
    panelOverlay.classList.add("open");
  }

  function closePanel() {
    panel.classList.remove("open");
    panelOverlay.classList.remove("open");
  }

  if (hamburgerBtn) {
    hamburgerBtn.addEventListener("click", openPanel);
  }
  if (panelCloseBtn) {
    panelCloseBtn.addEventListener("click", closePanel);
  }
  if (panelOverlay) {
    panelOverlay.addEventListener("click", closePanel);
  }

  // Mobile touch controls
  function setupMobileControls() {
    const leftBtn = document.getElementById("leftBtn");
    const rightBtn = document.getElementById("rightBtn");
    const downBtn = document.getElementById("downBtn");
    const rotateBtn = document.getElementById("rotateBtn");
    const dropBtn = document.getElementById("dropBtn");
    const holdBtn = document.getElementById("holdBtn");

    function handleControl(action) {
      return (e) => {
        e.preventDefault();
        if (api.game[action]) {
          api.game[action]();
          api.game.render && api.game.render();
        }
      };
    }

    if (leftBtn) {
      leftBtn.addEventListener("touchstart", handleControl("moveLeft"));
    }
    if (rightBtn) {
      rightBtn.addEventListener("touchstart", handleControl("moveRight"));
    }
    if (downBtn) {
      downBtn.addEventListener("touchstart", handleControl("moveDown"));
    }
    if (rotateBtn) {
      rotateBtn.addEventListener("touchstart", handleControl("rotate"));
    }
    if (dropBtn) {
      dropBtn.addEventListener("touchstart", handleControl("hardDrop"));
    }
    if (holdBtn) {
      holdBtn.addEventListener("touchstart", handleControl("holdPiece"));
    }
  }

  setupMobileControls();
  setupSettingsListeners();
  setupTutorialListeners();

  // ========================
  // GARBAGE INDICATOR
  // ========================

  const garbageIndicator = document.getElementById("garbageIndicator");
  const garbageBar = document.getElementById("garbageBar");
  const garbageCount = document.getElementById("garbageCount");

  function showGarbageIndicator(show) {
    if (garbageIndicator) {
      if (show) {
        garbageIndicator.classList.add("active");
      } else {
        garbageIndicator.classList.remove("active");
      }
    }
  }

  function updateGarbageIndicator(lines) {
    pendingGarbage = lines;
    if (garbageBar) {
      // Max height is 100%, each line is 5%
      const height = Math.min(lines * 5, 100);
      garbageBar.style.height = height + "%";
    }
    if (garbageCount) {
      garbageCount.textContent = lines > 0 ? lines : "";
    }
    showGarbageIndicator(lines > 0);
  }

  function addPendingGarbage(lines) {
    updateGarbageIndicator(pendingGarbage + lines);
  }

  function applyPendingGarbage() {
    if (pendingGarbage > 0 && api.game && api.game.addGarbageLines) {
      api.game.addGarbageLines(pendingGarbage);
      updateGarbageIndicator(0);
    }
  }

  // ========================
  // EMOJI PANEL
  // ========================

  const emojiPanel = document.getElementById("emojiPanel");

  function setupEmojiPanel() {
    if (!emojiPanel) return;

    const emojiButtons = emojiPanel.querySelectorAll(".emoji-btn");
    emojiButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const emoji = btn.dataset.emoji;
        if (api.multiplayer && api.multiplayer.isConnected()) {
          api.multiplayer.sendEmoji(emoji);
          showFloatingEmoji(emoji, btn);
        }
      });
    });
  }

  function showFloatingEmoji(emoji, sourceElement) {
    const floater = document.createElement("div");
    floater.className = "floating-emoji";
    floater.textContent = emoji;

    // Position near the source or center of screen
    if (sourceElement) {
      const rect = sourceElement.getBoundingClientRect();
      floater.style.left = rect.left + rect.width / 2 + "px";
      floater.style.top = rect.top + "px";
    } else {
      floater.style.left = "50%";
      floater.style.top = "50%";
    }

    document.body.appendChild(floater);

    // Remove after animation
    setTimeout(() => {
      floater.remove();
    }, 1500);
  }

  function showOpponentEmoji(emoji) {
    // Show emoji floating from opponent's board
    const opponentBoard = document.getElementById("opponent-board");
    if (opponentBoard) {
      const rect = opponentBoard.getBoundingClientRect();
      const floater = document.createElement("div");
      floater.className = "floating-emoji";
      floater.textContent = emoji;
      floater.style.left = rect.left + rect.width / 2 + "px";
      floater.style.top = rect.top + rect.height / 2 + "px";
      document.body.appendChild(floater);
      setTimeout(() => {
        floater.remove();
      }, 1500);
    }
  }

  // Auto-switching spectate of opponent boards in royale
  function startAutoSpectate() {
    stopAutoSpectate();

    // Choose an initial player to spectate
    selectNextSpectate();

    spectateInterval = setInterval(() => {
      selectNextSpectate();
    }, SPECTATE_SWITCH_MS);
  }

  function stopAutoSpectate() {
    if (spectateInterval) {
      clearInterval(spectateInterval);
      spectateInterval = null;
    }
  }

  function selectNextSpectate() {
    // Build a list of candidate playerIds with known boards and not eliminated
    const candidates = [];
    royaleBoards.forEach((_val, pid) => {
      const player = royalePlayers.get(pid);
      if (!player || !player.eliminated) {
        candidates.push(pid);
      }
    });

    if (candidates.length === 0) {
      // No boards available - clear display
      if (opponentNameEl) opponentNameEl.textContent = "Players";
      clearOpponentBoard();
      updateOpponentScore(0);
      return;
    }

    // Pick next index
    let nextIdx = 0;
    if (currentSpectateId) {
      const curIdx = candidates.indexOf(currentSpectateId);
      nextIdx = curIdx >= 0 ? (curIdx + 1) % candidates.length : 0;
    }
    currentSpectateId = candidates[nextIdx];

    const data = royaleBoards.get(currentSpectateId);
    if (data) {
      if (opponentNameEl) opponentNameEl.textContent = data.name || "Player";
      updateOpponentScore(data.score || 0);
      renderOpponentBoard(data.board);
    }
  }
    }
  }

  setupEmojiPanel();

  // ========================
  // REMATCH FUNCTIONALITY
  // ========================

  const mpRematchBtn = document.getElementById("mpRematchBtn");
  const rematchStatus = document.getElementById("rematchStatus");

  function resetRematchState() {
    rematchRequested = false;
    opponentWantsRematch = false;
    if (rematchStatus) {
      rematchStatus.textContent = "";
      rematchStatus.className = "rematch-status";
    }
    if (mpRematchBtn) {
      mpRematchBtn.disabled = false;
      mpRematchBtn.textContent = "🔄 Rematch";
    }
  }

  function updateRematchStatus() {
    if (!rematchStatus) return;

    if (rematchRequested && opponentWantsRematch) {
      rematchStatus.textContent = "Starting rematch...";
      rematchStatus.className = "rematch-status";
    } else if (rematchRequested) {
      rematchStatus.textContent = "Waiting for opponent...";
      rematchStatus.className = "rematch-status waiting";
    } else if (opponentWantsRematch) {
      rematchStatus.textContent = "Opponent wants a rematch!";
      rematchStatus.className = "rematch-status waiting";
    }
  }

  if (mpRematchBtn) {
    mpRematchBtn.addEventListener("click", () => {
      if (api.multiplayer && api.multiplayer.isConnected()) {
        api.multiplayer.requestRematch();
        rematchRequested = true;
        mpRematchBtn.disabled = true;
        mpRematchBtn.textContent = "Rematch Requested";
        updateRematchStatus();
      }
    });
  }

  // Multiplayer results overlay buttons
  const mpPlayAgainBtn = document.getElementById("mpPlayAgainBtn");
  const mpMenuBtn = document.getElementById("mpMenuBtn");

  if (mpPlayAgainBtn) {
    mpPlayAgainBtn.addEventListener("click", () => {
      showMpResultsOverlay(false);
      resetRematchState();
      if (api.multiplayer) {
        api.multiplayer.disconnect();
      }
      isMultiplayerGame = false;
      hideOpponentBoard();
      updateGarbageIndicator(0);
      showScreen("multiplayerSelect");
    });
  }

  if (mpMenuBtn) {
    mpMenuBtn.addEventListener("click", () => {
      showMpResultsOverlay(false);
      resetRematchState();
      if (api.multiplayer) {
        api.multiplayer.disconnect();
      }
      isMultiplayerGame = false;
      hideOpponentBoard();
      updateGarbageIndicator(0);
      showScreen("menu");
    });
  }

  // Royale results overlay buttons
  const royaleRematchBtn = document.getElementById("royaleRematchBtn");
  const royaleMenuBtn = document.getElementById("royaleMenuBtn");

  if (royaleRematchBtn) {
    royaleRematchBtn.addEventListener("click", () => {
      if (api.multiplayer && api.multiplayer.isConnected()) {
        api.multiplayer.requestRematch();
        royaleRematchBtn.disabled = true;
        royaleRematchBtn.textContent = "Waiting for others...";
        const status = document.getElementById("royaleRematchStatus");
        if (status) {
          status.textContent = "Waiting for other players...";
          status.className = "rematch-status waiting";
        }
      }
    });
  }

  if (royaleMenuBtn) {
    royaleMenuBtn.addEventListener("click", () => {
      showRoyaleResultsOverlay(false);
      hideSpectatorIndicator();
      hideAliveCounter();
      if (api.multiplayer) {
        api.multiplayer.disconnect();
      }
      isMultiplayerGame = false;
      isRoyaleMode = false;
      royalePlayers.clear();
      updateGarbageIndicator(0);
      showScreen("menu");
    });
  }

  // ========================
  // MULTIPLAYER UI HANDLING
  // ========================

  // Multiplayer lobby buttons
  const createRoomBtn = document.getElementById("createRoomBtn");
  const joinRoomBtn = document.getElementById("joinRoomBtn");
  const roomCodeInput = document.getElementById("roomCodeInput");
  const mpBackBtn = document.getElementById("mpBackBtn");

  // Waiting room elements
  const roomCodeDisplay = document.getElementById("roomCodeDisplay");
  const waitingText = document.getElementById("waitingText");
  const playersList = document.getElementById("playersList");
  const readyBtn = document.getElementById("readyBtn");
  const leaveRoomBtn = document.getElementById("leaveRoomBtn");

  // Opponent board elements
  const opponentContainer = document.getElementById("opponentContainer");
  const opponentNameEl = document.getElementById("opponentName");
  const opponentScoreEl = document.getElementById("opponentScore");

  // Player name (could be customized later)
  function getPlayerName() {
    // Return cached name (initialized on load via initPlayerName)
    return myPlayerName || "Player";
  }

  // Show/hide opponent board
  function showOpponentBoard(opponentName) {
    if (opponentContainer) {
      opponentContainer.classList.add("active");
    }
    if (opponentNameEl) {
      opponentNameEl.textContent = opponentName || "Opponent";
    }
    if (opponentScoreEl) {
      opponentScoreEl.textContent = "0";
    }

    // Initialize opponent canvas
    opponentCanvas = document.getElementById("opponent-board");
    if (opponentCanvas) {
      opponentCtx = opponentCanvas.getContext("2d");
      clearOpponentBoard();
    }
  }

  function hideOpponentBoard() {
    if (opponentContainer) {
      opponentContainer.classList.remove("active");
    }
    opponentCanvas = null;
    opponentCtx = null;
  }

  function clearOpponentBoard() {
    if (!opponentCtx || !opponentCanvas) return;
    opponentCtx.fillStyle = "#0f172a";
    opponentCtx.fillRect(0, 0, opponentCanvas.width, opponentCanvas.height);
  }

  function renderOpponentBoard(board) {
    if (!opponentCtx || !opponentCanvas || !board) return;

    const cell = OPPONENT_CELL_SIZE;
    const offsetX = (opponentCanvas.width - OPPONENT_COLS * cell) / 2;
    const offsetY = (opponentCanvas.height - OPPONENT_ROWS * cell) / 2;

    // Clear canvas
    opponentCtx.fillStyle = "#0f172a";
    opponentCtx.fillRect(0, 0, opponentCanvas.width, opponentCanvas.height);

    // Draw grid
    opponentCtx.strokeStyle = "#1e293b";
    opponentCtx.lineWidth = 0.5;
    for (let r = 0; r <= OPPONENT_ROWS; r++) {
      opponentCtx.beginPath();
      opponentCtx.moveTo(offsetX, offsetY + r * cell);
      opponentCtx.lineTo(offsetX + OPPONENT_COLS * cell, offsetY + r * cell);
      opponentCtx.stroke();
    }
    for (let c = 0; c <= OPPONENT_COLS; c++) {
      opponentCtx.beginPath();
      opponentCtx.moveTo(offsetX + c * cell, offsetY);
      opponentCtx.lineTo(offsetX + c * cell, offsetY + OPPONENT_ROWS * cell);
      opponentCtx.stroke();
    }

    // Draw board cells
    for (let r = 0; r < Math.min(board.length, OPPONENT_ROWS); r++) {
      for (let c = 0; c < Math.min(board[r].length, OPPONENT_COLS); c++) {
        if (board[r][c]) {
          drawOpponentCell(
            offsetX + c * cell,
            offsetY + r * cell,
            cell,
            board[r][c],
          );
        }
      }
    }
  }

  function drawOpponentCell(x, y, size, color) {
    const padding = 1;
    opponentCtx.fillStyle = color;
    opponentCtx.fillRect(
      x + padding,
      y + padding,
      size - padding * 2,
      size - padding * 2,
    );
  }

  function updateOpponentScore(score) {
    if (opponentScoreEl) {
      opponentScoreEl.textContent = score;
    }
  }

  // Update players list in waiting room
  function updatePlayersList(players) {
    if (!playersList) return;

    playersList.innerHTML = "";

    if (isRoyaleMode && players.length > 2) {
      // Use grid layout for royale with many players
      playersList.className = "royale-player-grid";
      players.forEach((player) => {
        const div = document.createElement("div");
        const classes = ["royale-player-card"];
        if (player.ready) classes.push("ready");
        if (player.isYou) classes.push("you");
        div.className = classes.join(" ");
        div.innerHTML = `
          <div class="player-name">${escapeHtml(player.name.replace(" (You)", ""))}</div>
          <div class="player-status">${player.isYou ? "(You)" : player.ready ? "Ready" : "..."}</div>
        `;
        playersList.appendChild(div);
      });
    } else {
      // Standard list layout for 1v1 or small royale
      playersList.className = "players-list";
      players.forEach((player) => {
        const div = document.createElement("div");
        div.className = "player-item" + (player.ready ? " ready" : "");
        div.innerHTML = `
          <span class="player-name">${escapeHtml(player.name)}</span>
          <span class="player-status">${player.ready ? "Ready!" : "Waiting..."}</span>
        `;
        playersList.appendChild(div);
      });
    }
  }

  // Create room button
  if (createRoomBtn) {
    createRoomBtn.addEventListener("click", async () => {
      if (!api.multiplayer) {
        alert("Multiplayer not available");
        return;
      }

      createRoomBtn.disabled = true;
      createRoomBtn.textContent = "Creating...";

      try {
        const roomType = isRoyaleMode ? "royale" : "1v1";
        await api.multiplayer.createRoom(getPlayerName(), roomType);
        // Room created callback will handle the rest
      } catch (err) {
        console.error("Failed to create room:", err);
        alert("Failed to connect to server. Please try again.");
        createRoomBtn.disabled = false;
        createRoomBtn.textContent = "Create Room";
      }
    });
  }

  // Join room button
  if (joinRoomBtn) {
    joinRoomBtn.addEventListener("click", async () => {
      if (!api.multiplayer) {
        alert("Multiplayer not available");
        return;
      }

      const code = roomCodeInput.value.trim().toUpperCase();
      if (!code || code.length !== 4) {
        alert("Please enter a valid 4-character room code");
        return;
      }

      joinRoomBtn.disabled = true;
      joinRoomBtn.textContent = "Joining...";

      try {
        await api.multiplayer.joinRoom(code, getPlayerName());
        // Room joined callback will handle the rest
      } catch (err) {
        console.error("Failed to join room:", err);
        alert("Failed to connect to server. Please try again.");
        joinRoomBtn.disabled = false;
        joinRoomBtn.textContent = "Join Room";
      }
    });
  }

  // Room code input - auto uppercase
  if (roomCodeInput) {
    roomCodeInput.addEventListener("input", () => {
      roomCodeInput.value = roomCodeInput.value.toUpperCase();
    });

    roomCodeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        joinRoomBtn.click();
      }
    });
  }

  // Back to menu from multiplayer lobby
  if (mpBackBtn) {
    mpBackBtn.addEventListener("click", () => {
      showScreen("multiplayerSelect");
    });
  }

  // Ready button
  if (readyBtn) {
    readyBtn.addEventListener("click", () => {
      if (api.multiplayer) {
        api.multiplayer.setReady();
        myReadyState = true;
        readyBtn.disabled = true;
        readyBtn.textContent = "Ready!";
        refreshPlayersList();
      }
    });
  }

  // Leave room button
  if (leaveRoomBtn) {
    leaveRoomBtn.addEventListener("click", () => {
      if (api.multiplayer) {
        api.multiplayer.disconnect();
      }
      resetMultiplayerUI();
      showScreen("multiplayerSelect");
    });
  }

  // Reset multiplayer UI state
  function resetMultiplayerUI() {
    myReadyState = false;
    opponentReadyState = false;
    opponentName = null;
    royalePlayers.clear();
    aliveCount = 0;
    totalPlayersInGame = 0;

    if (createRoomBtn) {
      createRoomBtn.disabled = false;
      createRoomBtn.textContent = "Create Room";
    }
    if (joinRoomBtn) {
      joinRoomBtn.disabled = false;
      joinRoomBtn.textContent = "Join Room";
    }
    if (roomCodeInput) {
      roomCodeInput.value = "";
    }
    if (roomCodeDisplay) {
      roomCodeDisplay.textContent = "----";
    }
    if (waitingText) {
      waitingText.textContent = "Waiting for opponent...";
    }
    if (playersList) {
      playersList.innerHTML = "";
      playersList.className = "players-list";
    }
    if (readyBtn) {
      readyBtn.style.display = "none";
      readyBtn.disabled = false;
      readyBtn.textContent = "Ready!";
    }

    // Reset royale UI elements
    hideSpectatorIndicator();
    hideAliveCounter();

    const royaleRematchBtn = document.getElementById("royaleRematchBtn");
    if (royaleRematchBtn) {
      royaleRematchBtn.disabled = false;
      royaleRematchBtn.textContent = "🔄 Play Again";
    }
    const royaleRematchStatus = document.getElementById("royaleRematchStatus");
    if (royaleRematchStatus) {
      royaleRematchStatus.textContent = "";
    }
  }

  // Refresh the players list display with current ready states
  function refreshPlayersList() {
    const players = [];

    // Add self
    players.push({
      name: getPlayerName() + " (You)",
      ready: myReadyState,
      isYou: true,
    });

    if (isRoyaleMode) {
      // Add all other players from royale map
      royalePlayers.forEach((p) => {
        players.push({
          name: p.name,
          ready: p.ready || false,
          isYou: false,
        });
      });
    } else {
      // Add opponent if present (1v1 mode)
      if (opponentName) {
        players.push({ name: opponentName, ready: opponentReadyState });
      }
    }

    updatePlayersList(players);
  }

  // Setup multiplayer callbacks
  function setupMultiplayerCallbacks() {
    if (!api.multiplayer) return;

    const mp = api.multiplayer;

    // Room created - show waiting room
    mp.on("onRoomCreated", (roomCode, seed, options) => {
      log("Room created:", roomCode, options);
      resetMultiplayerUI();

      isRoyaleMode = options?.roomType === "royale";

      if (roomCodeDisplay) {
        roomCodeDisplay.textContent = roomCode;
      }
      if (waitingText) {
        if (isRoyaleMode) {
          waitingText.textContent = `Waiting for players... (1/${options?.maxPlayers || 16})`;
        } else {
          waitingText.textContent = "Waiting for opponent...";
        }
      }

      refreshPlayersList();
      showScreen("waiting");
    });

    // Room joined - show waiting room with opponent
    mp.on("onRoomJoined", (roomCode, seed, opponent, options) => {
      log("Joined room:", roomCode, "Opponent:", opponent, "Options:", options);
      resetMultiplayerUI();

      isRoyaleMode = options?.roomType === "royale";
      opponentName = opponent?.name;

      // Store all existing players for royale
      if (options?.players) {
        royalePlayers.clear();
        options.players.forEach((p) => royalePlayers.set(p.id, p));
      }

      if (roomCodeDisplay) {
        roomCodeDisplay.textContent = roomCode;
      }
      if (waitingText) {
        if (isRoyaleMode) {
          const count = (options?.players?.length || 0) + 1;
          waitingText.textContent = `${count} players in lobby`;
        } else {
          waitingText.textContent = "Opponent found!";
        }
      }
      if (readyBtn) {
        readyBtn.style.display = "block";
      }

      refreshPlayersList();
      showScreen("waiting");
    });

    // Player joined our room
    mp.on("onPlayerJoined", (player, options) => {
      log("Player joined:", player, options);
      opponentName = player.name;
      royalePlayers.set(player.id, player);

      if (waitingText) {
        if (isRoyaleMode) {
          waitingText.textContent = `${options?.playerCount || royalePlayers.size + 1} players in lobby`;
        } else {
          waitingText.textContent = "Opponent found!";
        }
      }
      if (readyBtn) {
        readyBtn.style.display = "block";
      }

      refreshPlayersList();
    });

    // Player ready
    mp.on("onPlayerReady", (playerId, options) => {
      log("Player ready:", playerId, options);
      // This is triggered when the OTHER player becomes ready
      opponentReadyState = true;

      // Update player ready state in royale map
      if (royalePlayers.has(playerId)) {
        royalePlayers.get(playerId).ready = true;
      }

      refreshPlayersList();
    });

    // Game start - begin the game with countdown
    mp.on("onGameStart", (seed, countdown, options) => {
      log(
        "Game starting with seed:",
        seed,
        "countdown:",
        countdown,
        "options:",
        options,
      );
      isMultiplayerGame = true;
      lastMode = isRoyaleMode ? "royale" : "multiplayer";

      // Store players for royale
      if (options?.players) {
        royalePlayers.clear();
        options.players.forEach((p) => royalePlayers.set(p.id, p));
        totalPlayersInGame = options.players.length;
        aliveCount = totalPlayersInGame;
      }

      if (isRoyaleMode) {
        // Show alive counter for royale
        showAliveCounter(aliveCount, totalPlayersInGame);
        // Start auto spectating opponents' boards during royale
        showOpponentBoard("Players");
        startAutoSpectate();
      } else {
        const opponent = mp.getOpponent();
        showOpponentBoard(opponent ? opponent.name : "Opponent");
      }

      showScreen("game");

      // Start countdown then begin game
      startCountdown(countdown, () => {
        api.game.startGameWithSeed(seed);
      });
    });

    // Opponent update - render their board
    mp.on("onOpponentUpdate", (data) => {
      // In royale, track boards by playerId to enable rotating spectate
      if (isRoyaleMode && data.playerId) {
        const name = data.playerName || (royalePlayers.get(data.playerId)?.name) || "Player";
        royaleBoards.set(data.playerId, {
          board: data.board,
          score: data.score,
          name,
        });
        // If currently spectating this player, update immediately
        if (currentSpectateId === data.playerId) {
          updateOpponentScore(data.score);
          renderOpponentBoard(data.board);
          if (opponentNameEl) opponentNameEl.textContent = name;
        }
      } else {
        // 1v1 or generic case
        updateOpponentScore(data.score);
        renderOpponentBoard(data.board);
      }
    });

    // Incoming garbage lines
    mp.on("onIncomingGarbage", (data) => {
      log("Incoming garbage:", data.lines);
      addPendingGarbage(data.lines);

      // Apply garbage after a short delay (on next piece lock)
      // For now, apply immediately with visual warning
      setTimeout(() => {
        applyPendingGarbage();
      }, 500);
    });

    // Garbage sent confirmation
    mp.on("onGarbageSent", (data) => {
      log("Garbage sent:", data.lines);
      // Could show a visual indicator here
    });

    // Emoji received
    mp.on("onEmojiReceived", (data) => {
      showOpponentEmoji(data.emoji);
    });

    // ========================
    // ROYALE MODE EVENTS
    // ========================

    // Player eliminated in royale
    mp.on("onPlayerEliminated", (data) => {
      log("Player eliminated:", data);
      aliveCount = data.aliveCount;
      showAliveCounter(aliveCount, data.totalPlayers);

      // Mark eliminated in local state and remove their board from rotation
      if (royalePlayers.has(data.playerId)) {
        const p = royalePlayers.get(data.playerId);
        p.eliminated = true;
        royalePlayers.set(data.playerId, p);
      }
      royaleBoards.delete(data.playerId);

      // If we were spectating this player, switch immediately
      if (currentSpectateId === data.playerId) {
        selectNextSpectate();
      }

      // Show elimination banner
      showEliminationBanner(
        data.playerName,
        data.placement,
        data.totalPlayers,
        data.isMe,
      );

      if (data.isMe) {
        // We were eliminated - show spectator indicator
        showSpectatorIndicator();
        // Ensure auto-spectate is running
        startAutoSpectate();
      }
    });

    // Entered spectator mode
    mp.on("onSpectating", (data) => {
      log("Now spectating:", data);
      showSpectatorIndicator();
      // Begin auto-switching between remaining players' boards
      startAutoSpectate();
    });

    // Royale game ended
    mp.on("onRoyaleResults", (data) => {
      log("Royale results:", data);
      showRoyaleResults(data);
    });

    // Rematch requested by opponent
    mp.on("onRematchRequested", (playerId) => {
      log("Opponent requested rematch");
      opponentWantsRematch = true;
      updateRematchStatus();
    });

    // Rematch declined
    mp.on("onRematchDeclined", (playerId) => {
      log("Opponent declined rematch");
      if (rematchStatus) {
        rematchStatus.textContent = "Opponent declined";
        rematchStatus.className = "rematch-status";
      }
    });

    // Rematch starting
    mp.on("onRematchStarting", (seed) => {
      log("Rematch starting with seed:", seed);
      showMpResultsOverlay(false);
      resetRematchState();
      updateGarbageIndicator(0);

      showScreen("game");
      startCountdown(3, () => {
        api.game.startGameWithSeed(seed);
      });
    });

    // Player disconnected (can reconnect)
    mp.on("onPlayerDisconnected", (data) => {
      log("Player disconnected:", data);
      if (isMultiplayerGame && data.canReconnect) {
        // Show reconnecting message instead of immediately ending
        if (waitingText) {
          waitingText.textContent =
            "Opponent disconnected. Waiting for reconnect...";
        }
      }
    });

    // Player reconnected
    mp.on("onPlayerReconnected", (playerId) => {
      log("Player reconnected:", playerId);
      if (waitingText) {
        waitingText.textContent = "Opponent reconnected!";
      }
    });

    // We successfully reconnected to an existing game
    mp.on("onReconnected", (data) => {
      log("Reconnected to game:", data);
      isMultiplayerGame = true;

      if (data.opponent) {
        opponentName = data.opponent.name;
      }

      if (data.gameStarted) {
        // Game was in progress - resume it
        showScreen("game");
        showOpponentBoard();
        if (opponentName) {
          const nameEl = document.getElementById("opponent-name");
          if (nameEl) nameEl.textContent = opponentName;
        }
        // Start game with the same seed
        api.game.startMultiplayerGame(data.seed || mp.getSeed());
      } else {
        // Game hadn't started yet - go to waiting room
        if (roomCodeDisplay) {
          roomCodeDisplay.textContent = data.roomCode;
        }
        showScreen("waiting");
        if (waitingText) {
          waitingText.textContent = data.opponent
            ? "Opponent found!"
            : "Waiting for opponent...";
        }
      }
    });

    // Server shutdown warning
    mp.on("onServerShutdown", (message) => {
      alert("Server notice: " + message);
    });

    // Player game over
    mp.on("onPlayerGameOver", (data) => {
      log("Player game over:", data);

      if (data.allDone && data.results) {
        // Both players done - show final results
        const myId = mp.getPlayerId();

        // If opponent forfeited, stop our game immediately
        if (data.forfeit && data.winner === myId) {
          if (api.game.stop) api.game.stop();
        }

        // Show multiplayer results overlay
        setTimeout(() => {
          showMultiplayerResults(myId, data.winner, data.results, data.forfeit);
        }, 500);
      }
    });

    // Player left (only fires when game hasn't started - forfeit is handled by player_game_over)
    mp.on("onPlayerLeft", (playerId) => {
      log("Player left:", playerId);
      if (isMultiplayerGame) {
        // During active game, forfeit should be handled by onPlayerGameOver
        // This is a fallback in case something goes wrong
        log("Player left during active game - waiting for forfeit result");
        return;
      } else {
        // In waiting room
        opponentName = null;
        opponentReadyState = false;

        if (waitingText) {
          waitingText.textContent = "Opponent left. Waiting for new player...";
        }
        if (readyBtn) {
          readyBtn.style.display = "none";
          readyBtn.disabled = false;
          readyBtn.textContent = "Ready!";
        }

        refreshPlayersList();
      }
    });

    // Disconnected
    mp.on("onDisconnect", () => {
      log("Disconnected from server");
      if (isMultiplayerGame) {
        alert("Disconnected from server!");
        if (api.game.stop) api.game.stop();
        isMultiplayerGame = false;
        hideOpponentBoard();
        showScreen("menu");
      }
      resetMultiplayerUI();
    });

    // Error
    mp.on("onError", (message) => {
      console.error("Multiplayer error:", message);
      alert("Error: " + message);
      resetMultiplayerUI();
      showScreen("multiplayerSelect");
    });

    // Room expired
    mp.on("onRoomExpired", () => {
      log("Room expired");
      alert("Room expired due to inactivity");
      if (api.game.stop) api.game.stop();
      isMultiplayerGame = false;
      hideOpponentBoard();
      resetMultiplayerUI();
      showScreen("menu");
    });
  }

  // Countdown before game starts
  function startCountdown(seconds, callback) {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    let count = seconds;

    function drawCountdown() {
      // Clear with game background
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw countdown number
      ctx.fillStyle = "#22d3ee";
      ctx.font = "bold 72px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        count > 0 ? count : "GO!",
        canvas.width / 2,
        canvas.height / 2,
      );

      if (count > 0) {
        count--;
        setTimeout(drawCountdown, 1000);
      } else {
        setTimeout(callback, 500);
      }
    }

    drawCountdown();
  }

  // Initialize multiplayer callbacks when multiplayer module is ready
  function initMultiplayer() {
    if (api.multiplayer) {
      setupMultiplayerCallbacks();
      // Try to reconnect to an existing game session
      tryReconnectToGame();
    } else {
      // Wait for multiplayer module to load
      setTimeout(initMultiplayer, 100);
    }
  }

  // Try to reconnect to an existing multiplayer game on page load
  async function tryReconnectToGame() {
    const mp = api.multiplayer;
    if (!mp || !mp.tryReconnect) return;

    try {
      const reconnected = await mp.tryReconnect();
      if (reconnected) {
        log("Reconnecting to existing game session...");
        isMultiplayerGame = true;
        // The server will send game state via callbacks
      }
    } catch (err) {
      log("Failed to reconnect:", err);
    }
  }

  // Check for seed in URL parameters
  function checkUrlSeed() {
    const params = new URLSearchParams(window.location.search);
    const seed = params.get("seed");
    if (seed) {
      // Clear the URL params without reload
      window.history.replaceState({}, "", window.location.pathname);
      return seed;
    }
    return null;
  }

  const urlSeed = checkUrlSeed();

  // If URL has seed, show challenge mode after audio enable
  if (urlSeed) {
    const originalAudioHandler = handleAudioEnable;
    handleAudioEnable = function () {
      if (api.sound && api.sound.resumeContext) {
        api.sound.resumeContext();
      }
      // Skip splash, go straight to game with seed
      showScreen("game");
      api.game.startGameWithSeed(urlSeed);
    };

    // Update the audio screen prompt
    const audioPrompt = screens.audio.querySelector(".splash-prompt");
    if (audioPrompt) {
      audioPrompt.textContent = `Challenge: ${urlSeed} - Tap to play!`;
    }
  }

  // Initialize multiplayer when ready
  initMultiplayer();

  // Initialize player name from db
  initPlayerName();

  // Load settings on initialization
  loadSettings();

  // Expose UI API
  api.ui = {
    showGameOver,
    updateStats,
    showScreen,
    showOverlay,
    showMpResultsOverlay,
    showMultiplayerResults,
    showOpponentBoard,
    hideOpponentBoard,
    renderOpponentBoard,
    updateOpponentScore,
    // Garbage lines
    updateGarbageIndicator,
    addPendingGarbage,
    applyPendingGarbage,
    // Emojis
    showFloatingEmoji,
    showOpponentEmoji,
    // Player name
    showNameOverlay,
    getPlayerName,
    // Royale mode
    showRoyaleResultsOverlay,
    showRoyaleResults,
    showSpectatorIndicator,
    hideSpectatorIndicator,
    showAliveCounter,
    hideAliveCounter,
    showEliminationBanner,
    // Pause overlay
    showPauseOverlay,
    resumeGame,
    // Countdown
    runCountdown,
    // Confirm leave
    showConfirmLeave,
    // High score
    loadHighScore,
    updateHighScoreDisplay,
    // Action indicator
    showActionIndicator,
    // Settings
    loadSettings,
    saveSettings,
    // Tutorial
    showTutorial,
    hideTutorial,
  };
})();
