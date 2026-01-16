// leaderboard.js - Leaderboard management and display
(() => {
  const api = window.Flixtris.api;

  let currentTab = "global";

  async function loadLeaderboard(tab = "global") {
    currentTab = tab;
    const leaderboardList = document.getElementById("leaderboardList");
    if (!leaderboardList) return;

    leaderboardList.innerHTML = '<div class="leaderboard-loading">Loading...</div>';

    try {
      let scores = [];

      if (tab === "global") {
        scores = await api.db.getAllScores();
      } else if (tab === "daily") {
        scores = await api.db.getDailyScores();
      } else if (tab === "weekly") {
        scores = await api.db.getWeeklyScores();
      }

      // Sort by score descending
      scores.sort((a, b) => b.score - a.score);

      // Limit to top 100
      scores = scores.slice(0, 100);

      if (scores.length === 0) {
        leaderboardList.innerHTML =
          '<div class="leaderboard-empty">No scores yet. Play some games!</div>';
        return;
      }

      // Get current player name
      const playerName = await api.db.getPlayerName();

      leaderboardList.innerHTML = "";
      scores.forEach((score, index) => {
        const row = document.createElement("div");
        row.className = "leaderboard-row";

        if (score.playerName === playerName) {
          row.classList.add("highlight");
        }

        const rank = document.createElement("div");
        rank.className = "leaderboard-rank";
        if (index === 0) rank.classList.add("gold");
        else if (index === 1) rank.classList.add("silver");
        else if (index === 2) rank.classList.add("bronze");
        rank.textContent = `#${index + 1}`;

        const name = document.createElement("div");
        name.className = "leaderboard-name";
        name.textContent = score.playerName || "Anonymous";

        const scoreEl = document.createElement("div");
        scoreEl.className = "leaderboard-score";
        scoreEl.textContent = score.score.toLocaleString();

        row.appendChild(rank);
        row.appendChild(name);
        row.appendChild(scoreEl);
        leaderboardList.appendChild(row);
      });
    } catch (error) {
      console.error("Error loading leaderboard:", error);
      leaderboardList.innerHTML =
        '<div class="leaderboard-empty">Error loading leaderboard</div>';
    }
  }

  function initLeaderboard() {
    // Tab buttons
    document.querySelectorAll(".leaderboard-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabName = tab.getAttribute("data-tab");

        // Update active tab
        document.querySelectorAll(".leaderboard-tab").forEach((t) => {
          t.classList.remove("active");
        });
        tab.classList.add("active");

        // Load leaderboard for selected tab
        loadLeaderboard(tabName);
      });
    });

    // Back button
    const leaderboardBackBtn = document.getElementById("leaderboardBackBtn");
    if (leaderboardBackBtn) {
      leaderboardBackBtn.addEventListener("click", () => {
        api.screens.show("menu");
      });
    }

    // Load button in menu
    const leaderboardBtn = document.getElementById("leaderboardBtn");
    if (leaderboardBtn) {
      leaderboardBtn.addEventListener("click", () => {
        api.screens.show("leaderboard");
        loadLeaderboard("global");
      });
    }
  }

  // Export API
  window.Flixtris.api.leaderboard = {
    load: loadLeaderboard,
    init: initLeaderboard,
  };
})();
