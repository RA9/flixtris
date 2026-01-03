// db.js
(() => {
  const DB_NAME = "flixtris";
  const DB_VERSION = 1;
  let db;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains("games")) {
          db.createObjectStore("games", { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "id" });
        }
      };

      req.onsuccess = (e) => {
        db = e.target.result;
        resolve();
      };

      req.onerror = () => reject(req.error);
    });
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

  openDB();

  window.Flixtris.api.db = {
    addGame,
    getGames,
    saveSetting,
    getSetting,
  };
})();
