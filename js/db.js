// db.js
(() => {
  const DB_NAME = "flixtris";
  const DB_VERSION = 5;
  let db;
  let playerCache = null;
  let dbAvailable = false;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB not supported"));
        return;
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains("games")) {
          db.createObjectStore("games", { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("player")) {
          db.createObjectStore("player", { keyPath: "id" });
        }
        // Premium foundations: purchases, replays, analytics
        if (!db.objectStoreNames.contains("purchases")) {
          db.createObjectStore("purchases", { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("replays")) {
          db.createObjectStore("replays", { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("analytics")) {
          db.createObjectStore("analytics", { autoIncrement: true });
        }
        // Tournaments
        if (!db.objectStoreNames.contains("tournaments")) {
          db.createObjectStore("tournaments", { keyPath: "id" });
        }
      };

      req.onsuccess = (e) => {
        db = e.target.result;
        dbAvailable = true;
        resolve();
      };

      req.onerror = () => reject(req.error);
    });
  }

  // Fallback storage using localStorage
  function getLocalStorageKey(key) {
    return `flixtris_${key}`;
  }

  function getFromLocalStorage(key) {
    try {
      const item = localStorage.getItem(getLocalStorageKey(key));
      return item ? JSON.parse(item) : null;
    } catch (e) {
      return null;
    }
  }

  function setToLocalStorage(key, value) {
    try {
      localStorage.setItem(getLocalStorageKey(key), JSON.stringify(value));
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  // Generate anonymous player name
  function generatePlayerName() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let suffix = "";
    for (let i = 0; i < 4; i++) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    return `Player_${suffix}`;
  }

  // Get player profile (creates one if doesn't exist)
  async function getPlayer() {
    if (playerCache) return playerCache;

    if (dbAvailable) {
      return new Promise((resolve) => {
        const tx = db.transaction("player", "readonly");
        const req = tx.objectStore("player").get("profile");
        req.onsuccess = () => {
          if (req.result) {
            playerCache = req.result;
            resolve(req.result);
          } else {
            // Create new player profile
            const newPlayer = {
              id: "profile",
              name: null,
              generatedName: generatePlayerName(),
              createdAt: Date.now(),
              totalGames: 0,
              totalScore: 0,
              bestScore: 0,
              highestLevel: 0,
              wallOfFameSubmitted: false,
              wallOfFameMessage: null,
            };
            savePlayer(newPlayer).then(() => {
              playerCache = newPlayer;
              resolve(newPlayer);
            });
          }
        };
      });
    } else {
      // Fallback to localStorage
      let player = getFromLocalStorage("player");
      if (!player) {
        player = {
          id: "profile",
          name: null,
          generatedName: generatePlayerName(),
          createdAt: Date.now(),
          totalGames: 0,
          totalScore: 0,
          bestScore: 0,
          highestLevel: 0,
          wallOfFameSubmitted: false,
          wallOfFameMessage: null,
        };
        setToLocalStorage("player", player);
      }
      // Ensure existing players have the new fields
      if (player.highestLevel === undefined) {
        player.highestLevel = 0;
        player.wallOfFameSubmitted = false;
        player.wallOfFameMessage = null;
        setToLocalStorage("player", player);
      }
      playerCache = player;
      return player;
    }
  }

  // Save player profile
  function savePlayer(player) {
    return new Promise((resolve) => {
      if (dbAvailable) {
        const tx = db.transaction("player", "readwrite");
        tx.objectStore("player").put(player);
        tx.oncomplete = () => {
          playerCache = player;
          resolve();
        };
      } else {
        // Fallback to localStorage
        setToLocalStorage("player", player);
        playerCache = player;
        resolve();
      }
    });
  }

  // Set player name
  async function setPlayerName(name) {
    const player = await getPlayer();
    player.name = name;
    await savePlayer(player);
    return player;
  }

  // Get display name (custom name or generated)
  async function getDisplayName() {
    const player = await getPlayer();
    return player.name || player.generatedName;
  }

  // Update player stats after a game
  async function updatePlayerStats(score, isWin = null, level = null) {
    const player = await getPlayer();
    player.totalGames++;
    player.totalScore += score;
    if (score > player.bestScore) {
      player.bestScore = score;
    }
    if (isWin !== null) {
      player.wins = (player.wins || 0) + (isWin ? 1 : 0);
      player.losses = (player.losses || 0) + (isWin ? 0 : 1);
    }
    // Track highest level reached
    if (level !== null && level > (player.highestLevel || 0)) {
      player.highestLevel = level;
    }
    await savePlayer(player);
    return player;
  }

  // Check if player is eligible for Wall of Fame (reached level 10+ and hasn't submitted)
  async function isEligibleForWallOfFame(currentLevel) {
    const player = await getPlayer();
    return currentLevel >= 10 && !player.wallOfFameSubmitted;
  }

  // Submit Wall of Fame entry
  async function submitWallOfFame(message) {
    const player = await getPlayer();
    player.wallOfFameSubmitted = true;
    player.wallOfFameMessage = message;
    await savePlayer(player);
    return player;
  }

  // Check if player has already submitted to Wall of Fame
  async function hasSubmittedWallOfFame() {
    const player = await getPlayer();
    return player.wallOfFameSubmitted === true;
  }

  // Check if player has set a custom name
  async function hasCustomName() {
    const player = await getPlayer();
    return player.name !== null;
  }

  // Sync player data from server
  async function syncPlayer(name) {
    if (!name) return;
    try {
      const response = await fetch(`/api/player/${encodeURIComponent(name)}`);
      if (response.ok) {
        const serverPlayer = await response.json();
        const local = await getPlayer();
        // Merge server data into local, preferring higher values for stats
        if (serverPlayer.totalGames > local.totalGames) {
          local.totalGames = serverPlayer.totalGames;
        }
        if (serverPlayer.totalScore > local.totalScore) {
          local.totalScore = serverPlayer.totalScore;
        }
        if (serverPlayer.bestScore > local.bestScore) {
          local.bestScore = serverPlayer.bestScore;
        }
        if (serverPlayer.highestLevel > local.highestLevel) {
          local.highestLevel = serverPlayer.highestLevel;
        }
        await savePlayer(local);
      }
    } catch (e) {
      console.log("Sync failed:", e);
    }
  }

  // Upload player data to server
  async function uploadPlayer() {
    const player = await getPlayer();
    try {
      await fetch("/api/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(player),
      });
    } catch (e) {
      console.log("Upload failed:", e);
    }
  }

  // Sync settings from server
  async function syncSettings() {
    const playerName = await getDisplayName();
    if (!playerName) return;
    try {
      const response = await fetch(
        `/api/settings/${encodeURIComponent(playerName)}`,
      );
      if (response.ok) {
        const serverSettings = await response.json();
        // Update local settings
        for (const key in serverSettings) {
          await saveSetting(key, serverSettings[key]);
        }
      }
    } catch (e) {
      console.log("Settings sync failed:", e);
    }
  }

  // Fallback implementations for other functions
  function addGame(record) {
    if (dbAvailable) {
      const tx = db.transaction("games", "readwrite");
      tx.objectStore("games").add(record);
    }
    // No fallback for games
  }

  function getGames(limit = 20) {
    if (dbAvailable) {
      return new Promise((resolve) => {
        const tx = db.transaction("games", "readonly");
        const store = tx.objectStore("games");
        const req = store.openCursor(null, "prev");
        const res = [];

        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor && res.length < limit) {
            res.push(cursor.value);
            cursor.continue();
          } else {
            resolve(res);
          }
        };
      });
    } else {
      return Promise.resolve([]);
    }
  }

  function saveSetting(key, value) {
    if (dbAvailable) {
      const tx = db.transaction("settings", "readwrite");
      tx.objectStore("settings").put({ id: key, value });
    } else {
      setToLocalStorage(`setting_${key}`, value);
    }
  }

  function getSetting(key) {
    if (dbAvailable) {
      return new Promise((resolve) => {
        const tx = db.transaction("settings", "readonly");
        const req = tx.objectStore("settings").get(key);
        req.onsuccess = () => resolve(req.result?.value);
      });
    } else {
      return Promise.resolve(getFromLocalStorage(`setting_${key}`));
    }
  }

  function addGame(record) {
    const tx = db.transaction("games", "readwrite");
    tx.objectStore("games").add(record);
  }

  function getGames(limit = 20) {
    return new Promise((resolve) => {
      const tx = db.transaction("games", "readonly");
      const store = tx.objectStore("games");
      const req = store.openCursor(null, "prev");
      const res = [];

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && res.length < limit) {
          res.push(cursor.value);
          cursor.continue();
        } else {
          resolve(res);
        }
      };
    });
  }

  function saveSetting(key, value) {
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put({ id: key, value });
  }

  function getSetting(key) {
    return new Promise((resolve) => {
      const tx = db.transaction("settings", "readonly");
      const req = tx.objectStore("settings").get(key);
      req.onsuccess = () => resolve(req.result?.value);
    });
  }

  // Premium helper APIs (Phase 1–2)

  // Purchases
  function recordPurchase(purchase) {
    // purchase: { type: "theme|skin|emoji|pass", id: string, price?: number, currency?: string, source?: "store|pass|bundle" }
    const tx = db.transaction("purchases", "readwrite");
    tx.objectStore("purchases").add({
      ...purchase,
      createdAt: Date.now(),
    });
  }

  function getPurchases(limit = 50) {
    return new Promise((resolve) => {
      const tx = db.transaction("purchases", "readonly");
      const store = tx.objectStore("purchases");
      const req = store.openCursor(null, "prev");
      const res = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && res.length < limit) {
          res.push(cursor.value);
          cursor.continue();
        } else {
          resolve(res);
        }
      };
    });
  }

  // Replays
  function addReplay(replay) {
    // replay: { mode, seed, inputs: Array, durationMs, score, level, lines, metadata?: {} }
    const tx = db.transaction("replays", "readwrite");
    tx.objectStore("replays").add({
      ...replay,
      createdAt: Date.now(),
    });
  }

  function getReplays(limit = 50) {
    return new Promise((resolve) => {
      const tx = db.transaction("replays", "readonly");
      const store = tx.objectStore("replays");
      const req = store.openCursor(null, "prev");
      const res = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && res.length < limit) {
          res.push(cursor.value);
          cursor.continue();
        } else {
          resolve(res);
        }
      };
    });
  }

  function deleteReplay(id) {
    return new Promise((resolve) => {
      const tx = db.transaction("replays", "readwrite");
      tx.objectStore("replays").delete(id);
      tx.oncomplete = () => resolve();
    });
  }

  // Analytics
  function addGameAnalytics(analytics) {
    // analytics: { mode, seed, apm, lpm, misdrops, droughtMax, tSpins, tetrises, holes, avgHeight, comboMax, backToBack, actions?: {} }
    const tx = db.transaction("analytics", "readwrite");
    tx.objectStore("analytics").add({
      ...analytics,
      createdAt: Date.now(),
    });
  }

  function getGameAnalytics(limit = 50) {
    return new Promise((resolve) => {
      const tx = db.transaction("analytics", "readonly");
      const store = tx.objectStore("analytics");
      const req = store.openCursor(null, "prev");
      const res = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && res.length < limit) {
          res.push(cursor.value);
          cursor.continue();
        } else {
          resolve(res);
        }
      };
    });
  }

  window.Flixtris.api.dbReady = (async () => {
    try {
      await openDB();
    } catch (error) {
      console.error("DB init error:", error);
      dbAvailable = false;
    }

    // Tournament methods
    function saveTournament(tournament) {
      if (!dbAvailable) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("tournaments", "readwrite");
        const req = tx.objectStore("tournaments").put(tournament);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    function getTournament(tournamentId) {
      if (!dbAvailable) return Promise.resolve(null);
      return new Promise((resolve) => {
        const tx = db.transaction("tournaments", "readonly");
        const req = tx.objectStore("tournaments").get(tournamentId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    }

    function getAllTournaments() {
      if (!dbAvailable) return Promise.resolve([]);
      return new Promise((resolve) => {
        const tx = db.transaction("tournaments", "readonly");
        const req = tx.objectStore("tournaments").getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    }

    function deleteTournament(tournamentId) {
      if (!dbAvailable) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("tournaments", "readwrite");
        const req = tx.objectStore("tournaments").delete(tournamentId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    // Helper methods for leaderboard
    function getAllScores() {
      return getGames();
    }

    function getDailyScores() {
      return getGames().then((games) => {
        const today = new Date().toISOString().split("T")[0];
        return games.filter((game) => {
          const gameDate = new Date(game.timestamp).toISOString().split("T")[0];
          return gameDate === today;
        });
      });
    }

    function getWeeklyScores() {
      return getGames().then((games) => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return games.filter((game) => new Date(game.timestamp) >= weekAgo);
      });
    }

    function getPlayerName() {
      return getDisplayName();
    }

    window.Flixtris.api.db = {
      // Existing
      addGame,
      getGames,
      saveSetting,
      getSetting,
      getPlayer,
      setPlayerName,
      getDisplayName,
      updatePlayerStats,
      hasCustomName,
      // Wall of Fame
      isEligibleForWallOfFame,
      submitWallOfFame,
      hasSubmittedWallOfFame,
      // Syncing
      syncPlayer,
      uploadPlayer,
      syncSettings,
      // Premium foundations (Phase 1–2)
      recordPurchase: dbAvailable ? recordPurchase : () => {},
      getPurchases: dbAvailable ? getPurchases : () => Promise.resolve([]),
      addReplay: dbAvailable ? addReplay : () => {},
      getReplays: dbAvailable ? getReplays : () => Promise.resolve([]),
      deleteReplay: dbAvailable ? deleteReplay : () => Promise.resolve(),
      addGameAnalytics: dbAvailable ? addGameAnalytics : () => {},
      getGameAnalytics: dbAvailable
        ? getGameAnalytics
        : () => Promise.resolve([]),
      // Tournaments
      saveTournament: dbAvailable ? saveTournament : () => Promise.resolve(),
      getTournament: dbAvailable ? getTournament : () => Promise.resolve(null),
      getAllTournaments: dbAvailable
        ? getAllTournaments
        : () => Promise.resolve([]),
      deleteTournament: dbAvailable
        ? deleteTournament
        : () => Promise.resolve(),
      // Leaderboard helpers
      getAllScores,
      getDailyScores,
      getWeeklyScores,
      getPlayerName,
    };
  })();
})();
