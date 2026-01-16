// updates.js - Update management and PWA refresh
(() => {
  const CURRENT_VERSION = "1.1.0";
  const UPDATE_CHECK_INTERVAL = 60000; // Check every minute
  const VERSION_ENDPOINT = "/version.json";

  let updateAvailable = false;
  let newVersion = null;
  let checkInterval = null;
  let serviceWorkerRegistration = null;

  async function checkForUpdates() {
    // Skip if offline
    if (!navigator.onLine) {
      console.log("Offline - skipping update check");
      return;
    }

    try {
      // Check version from server
      const response = await fetch(VERSION_ENDPOINT + "?_=" + Date.now(), {
        cache: "no-cache",
      });

      if (!response.ok) {
        console.warn("Failed to check for updates");
        return;
      }

      const data = await response.json();
      newVersion = data.version;

      // Compare versions
      if (newVersion !== CURRENT_VERSION) {
        console.log(`Update available: ${CURRENT_VERSION} → ${newVersion}`);
        updateAvailable = true;
        showUpdateNotification(data);
      }
    } catch (error) {
      console.error("Error checking for updates:", error);
    }
  }

  function showUpdateNotification(versionData) {
    // Create update banner
    let banner = document.getElementById("update-banner");

    if (!banner) {
      banner = document.createElement("div");
      banner.id = "update-banner";
      banner.className = "update-banner";
      banner.innerHTML = `
        <div class="update-content">
          <span class="update-icon">🔄</span>
          <div class="update-text">
            <strong>Update Available!</strong>
            <p>Version ${newVersion} is ready. ${versionData.message || "Click to refresh."}</p>
          </div>
          <button class="update-btn" id="update-btn">Update Now</button>
          <button class="update-dismiss" id="update-dismiss">Later</button>
        </div>
      `;
      document.body.appendChild(banner);

      // Add event listeners
      document.getElementById("update-btn").addEventListener("click", () => {
        applyUpdate();
      });

      document.getElementById("update-dismiss").addEventListener("click", () => {
        banner.style.display = "none";
        // Check again in 5 minutes
        setTimeout(() => {
          banner.style.display = "flex";
        }, 300000);
      });
    }

    banner.style.display = "flex";
  }

  async function applyUpdate() {
    console.log("Applying update...");

    // If service worker is registered, skip waiting and reload
    if (serviceWorkerRegistration && serviceWorkerRegistration.waiting) {
      serviceWorkerRegistration.waiting.postMessage({ type: "SKIP_WAITING" });

      // Listen for controlling change
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      });
    } else {
      // Force reload with cache bypass
      window.location.reload(true);
    }
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      console.log("Service Worker not supported");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      serviceWorkerRegistration = registration;

      console.log("Service Worker registered:", registration);

      // Check for updates on registration
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // New service worker available
            updateAvailable = true;
            showUpdateNotification({
              version: "latest",
              message: "New content available. Refresh to update.",
            });
          }
        });
      });

      // Check for updates periodically
      setInterval(() => {
        registration.update();
      }, UPDATE_CHECK_INTERVAL);
    } catch (error) {
      console.error("Service Worker registration failed:", error);
    }
  }

  function startUpdateCheck() {
    // Initial check
    checkForUpdates();

    // Periodic checks
    checkInterval = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);

    // Check when coming back online
    window.addEventListener("online", () => {
      console.log("Back online - checking for updates");
      checkForUpdates();
    });
  }

  function stopUpdateCheck() {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
  }

  function getVersion() {
    return CURRENT_VERSION;
  }

  function isUpdateAvailable() {
    return updateAvailable;
  }

  function getNewVersion() {
    return newVersion;
  }

  // Initialize update system
  async function init() {
    await registerServiceWorker();
    startUpdateCheck();
  }

  // Export API
  window.Flixtris = window.Flixtris || { api: {}, state: {} };
  window.Flixtris.api.updates = {
    init,
    check: checkForUpdates,
    apply: applyUpdate,
    getVersion,
    isAvailable: isUpdateAvailable,
    getNewVersion,
    start: startUpdateCheck,
    stop: stopUpdateCheck,
  };
})();
