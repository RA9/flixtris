// screens.js - Screen navigation and state management
(() => {
  const screens = {
    audio: document.getElementById("screen-audio"),
    splash: document.getElementById("screen-splash"),
    menu: document.getElementById("screen-menu"),
    settings: document.getElementById("screen-settings"),
    analytics: document.getElementById("screen-analytics"),
    singleplayer: document.getElementById("screen-singleplayer"),
    botSelect: document.getElementById("screen-bot-select"),
    multiplayerSelect: document.getElementById("screen-multiplayer-select"),
    leaderboard: document.getElementById("screen-leaderboard"),
    multiplayer: document.getElementById("screen-multiplayer"),
    waiting: document.getElementById("screen-waiting"),
    game: document.getElementById("screen-game"),
  };

  let currentScreen = null;

  function showScreen(screenName) {
    // Hide all screens
    Object.values(screens).forEach((screen) => {
      if (screen) screen.classList.remove("active");
    });

    // Show requested screen
    const screen = screens[screenName];
    if (screen) {
      screen.classList.add("active");
      currentScreen = screenName;
    }
  }

  function getCurrentScreen() {
    return currentScreen;
  }

  function hideAllOverlays() {
    const overlays = [
      "overlay",
      "gameover-overlay",
      "pause-overlay",
      "countdown-overlay",
      "confirm-leave-overlay",
      "tutorial-overlay",
      "seed-overlay",
      "name-overlay",
      "wall-of-fame-overlay",
      "mp-results-overlay",
      "royale-results-overlay",
      "ranked-overlay",
      "pro-overlay",
    ];

    overlays.forEach((id) => {
      const overlay = document.getElementById(id);
      if (overlay) overlay.classList.remove("active");
    });
  }

  function showOverlay(overlayId) {
    hideAllOverlays();
    const overlay = document.getElementById(overlayId);
    if (overlay) overlay.classList.add("active");
  }

  function hideOverlay(overlayId) {
    const overlay = document.getElementById(overlayId);
    if (overlay) overlay.classList.remove("active");
  }

  // Export API
  window.Flixtris = window.Flixtris || { api: {}, state: {} };
  window.Flixtris.api.screens = {
    show: showScreen,
    getCurrent: getCurrentScreen,
    showOverlay,
    hideOverlay,
    hideAllOverlays,
    all: screens,
  };
})();
