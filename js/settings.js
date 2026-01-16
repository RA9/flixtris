// settings.js - Settings management and UI
(() => {
  const api = window.Flixtris.api;

  // Settings state
  let settings = {
    sfx: true,
    music: true,
    theme: "dark",
    ghost: true,
    haptic: true,
  };

  async function loadSettings() {
    const savedSfx = await api.db.getSetting("sfx");
    const savedMusic = await api.db.getSetting("music");
    const savedTheme = await api.db.getSetting("theme");
    const savedGhost = await api.db.getSetting("ghost");
    const savedHaptic = await api.db.getSetting("haptic");

    if (savedSfx !== undefined) settings.sfx = savedSfx;
    if (savedMusic !== undefined) settings.music = savedMusic;
    if (savedTheme) settings.theme = savedTheme;
    if (savedGhost !== undefined) settings.ghost = savedGhost;
    if (savedHaptic !== undefined) settings.haptic = savedHaptic;

    updateSettingsUI();
    applyTheme(settings.theme);
  }

  function updateSettingsUI() {
    // Update toggles
    const sfxToggle = document.getElementById("sfxToggle");
    const musicToggle = document.getElementById("musicToggle");
    const ghostToggle = document.getElementById("ghostToggle");
    const hapticToggle = document.getElementById("hapticToggle");

    if (sfxToggle) sfxToggle.setAttribute("data-enabled", settings.sfx);
    if (musicToggle) musicToggle.setAttribute("data-enabled", settings.music);
    if (ghostToggle) ghostToggle.setAttribute("data-enabled", settings.ghost);
    if (hapticToggle) hapticToggle.setAttribute("data-enabled", settings.haptic);

    // Update theme buttons
    document.querySelectorAll(".theme-btn").forEach((btn) => {
      const theme = btn.getAttribute("data-theme");
      if (theme === settings.theme) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    settings.theme = theme;
    api.db.saveSetting("theme", theme);
  }

  function toggleSetting(settingName) {
    settings[settingName] = !settings[settingName];
    api.db.saveSetting(settingName, settings[settingName]);
    updateSettingsUI();
    return settings[settingName];
  }

  function getSetting(settingName) {
    return settings[settingName];
  }

  function initSettingsUI() {
    // Toggle buttons
    const sfxToggle = document.getElementById("sfxToggle");
    const musicToggle = document.getElementById("musicToggle");
    const ghostToggle = document.getElementById("ghostToggle");
    const hapticToggle = document.getElementById("hapticToggle");

    if (sfxToggle) {
      sfxToggle.addEventListener("click", () => {
        const newState = toggleSetting("sfx");
        if (newState && api.sound) api.sound.play("move");
      });
    }

    if (musicToggle) {
      musicToggle.addEventListener("click", () => {
        toggleSetting("music");
        // TODO: Implement background music
      });
    }

    if (ghostToggle) {
      ghostToggle.addEventListener("click", () => {
        toggleSetting("ghost");
      });
    }

    if (hapticToggle) {
      hapticToggle.addEventListener("click", () => {
        const newState = toggleSetting("haptic");
        if (newState && navigator.vibrate) {
          navigator.vibrate(50);
        }
      });
    }

    // Theme buttons
    document.querySelectorAll(".theme-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const theme = btn.getAttribute("data-theme");
        applyTheme(theme);
        updateSettingsUI();
      });
    });

    // Change name button
    const changeNameBtn = document.getElementById("changeNameBtn");
    if (changeNameBtn) {
      changeNameBtn.addEventListener("click", () => {
        const nameOverlay = document.getElementById("name-overlay");
        if (nameOverlay) nameOverlay.classList.add("active");
      });
    }

    // Reset tutorial button
    const resetTutorialBtn = document.getElementById("resetTutorialBtn");
    if (resetTutorialBtn) {
      resetTutorialBtn.addEventListener("click", async () => {
        await api.db.saveSetting("tutorialComplete", false);
        alert("Tutorial has been reset. It will show next time you play.");
      });
    }

    // Settings back button
    const settingsBackBtn = document.getElementById("settingsBackBtn");
    if (settingsBackBtn) {
      settingsBackBtn.addEventListener("click", () => {
        api.screens.show("menu");
      });
    }
  }

  // Export API
  window.Flixtris.api.settings = {
    load: loadSettings,
    get: getSetting,
    toggle: toggleSetting,
    applyTheme,
    init: initSettingsUI,
  };
})();
