// ui.js
(() => {
  const api = window.Flixtris.api;
  // Access state via getter to always get current values
  const getState = () => window.Flixtris.state;

  // Screen management
  const screens = {
    splash: document.getElementById("screen-splash"),
    menu: document.getElementById("screen-menu"),
    game: document.getElementById("screen-game"),
  };

  let lastMode = "classic";

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  function showOverlay(show) {
    const overlay = document.getElementById("overlay");
    if (show) {
      overlay.classList.add("active");
    } else {
      overlay.classList.remove("active");
    }
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
  }

  function shareScore() {
    const state = getState();
    const text = `Flixtris Daily Challenge\n${state.seed}\nScore: ${state.score} | Level: ${state.level} | Lines: ${state.lines}\n\nCan you beat my score?`;

    if (navigator.share) {
      navigator
        .share({
          title: "Flixtris Score",
          text: text,
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

  // Splash screen - any key or click advances
  function handleSplashInteraction() {
    // Resume audio context on first user interaction
    if (api.sound && api.sound.resumeContext) {
      api.sound.resumeContext();
    }
    showScreen("menu");
  }

  screens.splash.addEventListener("click", handleSplashInteraction);
  screens.splash.addEventListener("touchstart", handleSplashInteraction);

  document.addEventListener("keydown", (e) => {
    if (screens.splash.classList.contains("active")) {
      handleSplashInteraction();
    }
  });

  // Mode selection
  document.querySelectorAll(".mode-card").forEach((card) => {
    card.addEventListener("click", () => {
      if (api.sound) api.sound.menuSelect();
      const mode = card.dataset.mode;
      lastMode = mode;
      showScreen("game");
      api.game.startGame(mode);
    });
  });

  // Theme buttons
  document.querySelectorAll("[data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const theme = btn.dataset.theme;
      // Theme implementation can be added later
      console.log("Theme selected:", theme);
    });
  });

  // Help overlay
  document
    .getElementById("helpBtn")
    .addEventListener("click", () => showOverlay(true));
  document
    .getElementById("closeHelp")
    .addEventListener("click", () => showOverlay(false));

  // Sound toggle
  const soundBtn = document.getElementById("soundBtn");
  soundBtn.addEventListener("click", () => {
    if (api.sound) {
      const enabled = !api.sound.isEnabled();
      api.sound.setEnabled(enabled);
      soundBtn.textContent = enabled ? "Sound: On" : "Sound: Off";
    }
  });

  // Main menu button during game
  document.getElementById("mainMenuBtn").addEventListener("click", () => {
    if (api.game.stop) api.game.stop();
    closePanel();
    showScreen("menu");
  });

  // Game over overlay buttons
  document.getElementById("playAgainBtn").addEventListener("click", () => {
    showGameOverOverlay(false);
    api.game.startGame(lastMode);
  });

  document.getElementById("menuBtn").addEventListener("click", () => {
    showGameOverOverlay(false);
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
      api.game.startGameWithSeed(seedInput);
    }
  });

  document.getElementById("seed-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      document.getElementById("startSeedBtn").click();
    }
  });

  // Close overlay on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      showOverlay(false);
      showGameOverOverlay(false);
      showSeedOverlay(false);
    }
    if (e.key === "h" || e.key === "H") {
      if (screens.game.classList.contains("active")) {
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
  }

  setupMobileControls();

  // Expose UI API
  api.ui = {
    showGameOver,
    updateStats,
    showScreen,
    showOverlay,
  };
})();
