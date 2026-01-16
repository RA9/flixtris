// tournament-ui.js - Tournament UI integration
(() => {
  const api = window.Flixtris.api;

  let selectedTournamentType = "single_elimination";

  function initTournamentUI() {
    // Tournament button in main menu
    const tournamentBtn = document.getElementById("tournamentBtn");
    if (tournamentBtn) {
      tournamentBtn.addEventListener("click", () => {
        api.screens.show("tournament");
        loadTournamentList();
      });
    }

    // Back button
    const tournamentBackBtn = document.getElementById("tournamentBackBtn");
    if (tournamentBackBtn) {
      tournamentBackBtn.addEventListener("click", () => {
        api.screens.show("menu");
      });
    }

    // Create tournament button
    const createTournamentBtn = document.getElementById("createTournamentBtn");
    if (createTournamentBtn) {
      createTournamentBtn.addEventListener("click", () => {
        api.screens.show("create-tournament");
        resetTournamentForm();
      });
    }

    // Tournament type selector
    document.querySelectorAll(".tournament-type-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tournament-type-btn").forEach((b) => {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        selectedTournamentType = btn.getAttribute("data-type");
      });
    });

    // Start tournament button
    const startTournamentBtn = document.getElementById("startTournamentBtn");
    if (startTournamentBtn) {
      startTournamentBtn.addEventListener("click", async () => {
        await createTournament();
      });
    }

    // Cancel tournament button
    const cancelTournamentBtn = document.getElementById("cancelTournamentBtn");
    if (cancelTournamentBtn) {
      cancelTournamentBtn.addEventListener("click", () => {
        api.screens.show("tournament");
      });
    }

    // Exit tournament button
    const exitTournamentBtn = document.getElementById("exitTournamentBtn");
    if (exitTournamentBtn) {
      exitTournamentBtn.addEventListener("click", () => {
        api.screens.show("tournament");
      });
    }

    // Play next match button
    const playNextMatchBtn = document.getElementById("playNextMatchBtn");
    if (playNextMatchBtn) {
      playNextMatchBtn.addEventListener("click", () => {
        playNextMatch();
      });
    }

    // View standings button
    const viewStandingsBtn = document.getElementById("viewStandingsBtn");
    if (viewStandingsBtn) {
      viewStandingsBtn.addEventListener("click", () => {
        showStandings();
      });
    }
  }

  async function loadTournamentList() {
    const tournamentList = document.getElementById("tournamentList");
    if (!tournamentList) return;

    const tournaments = await api.tournament.getAll();

    if (tournaments.length === 0) {
      tournamentList.innerHTML =
        '<p class="tournament-empty">No tournaments yet. Create one to get started!</p>';
      return;
    }

    tournamentList.innerHTML = "";

    tournaments.forEach((tournament) => {
      const item = document.createElement("div");
      item.className = "tournament-item";
      item.addEventListener("click", () => {
        loadTournament(tournament.id);
      });

      const typeLabel =
        tournament.type === "single_elimination"
          ? "Single Elimination"
          : "Round Robin";

      item.innerHTML = `
        <div class="tournament-item-header">
          <span class="tournament-name">${tournament.name}</span>
          <span class="tournament-status-badge ${tournament.status}">
            ${tournament.status.replace("_", " ")}
          </span>
        </div>
        <div class="tournament-item-details">
          <span>📋 ${typeLabel}</span>
          <span>👥 ${tournament.players.length}/${tournament.playerCount} players</span>
          ${tournament.winner ? `<span>🏆 Winner: ${tournament.winner.name}</span>` : ""}
        </div>
      `;

      tournamentList.appendChild(item);
    });
  }

  function resetTournamentForm() {
    const tournamentName = document.getElementById("tournamentName");
    const playerCount = document.getElementById("playerCount");

    if (tournamentName) tournamentName.value = "";
    if (playerCount) playerCount.value = "8";

    selectedTournamentType = "single_elimination";
    document.querySelectorAll(".tournament-type-btn").forEach((btn) => {
      btn.classList.remove("active");
      if (btn.getAttribute("data-type") === "single_elimination") {
        btn.classList.add("active");
      }
    });
  }

  async function createTournament() {
    const tournamentName = document.getElementById("tournamentName");
    const playerCount = document.getElementById("playerCount");

    if (!tournamentName || !playerCount) return;

    const name = tournamentName.value.trim();
    if (!name) {
      alert("Please enter a tournament name");
      return;
    }

    const count = parseInt(playerCount.value);

    // Create tournament
    const tournament = api.tournament.create(
      name,
      selectedTournamentType,
      count,
    );

    // Generate AI players for demo (in real app, you'd have a player registration flow)
    const playerNames = [
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
      "Echo",
      "Foxtrot",
      "Golf",
      "Hotel",
      "India",
      "Juliet",
      "Kilo",
      "Lima",
      "Mike",
      "November",
      "Oscar",
      "Papa",
    ];

    for (let i = 0; i < count; i++) {
      api.tournament.addPlayer(playerNames[i] || `Player ${i + 1}`);
    }

    // Save and load tournament
    await api.tournament.getCurrent(); // This triggers the save
    loadTournament(tournament.id);
  }

  async function loadTournament(tournamentId) {
    const tournament = await api.tournament.load(tournamentId);
    if (!tournament) return;

    api.screens.show("tournament-bracket");
    displayTournamentBracket(tournament);
  }

  function displayTournamentBracket(tournament) {
    const title = document.getElementById("tournamentBracketTitle");
    const currentRound = document.getElementById("currentRound");
    const playersRemaining = document.getElementById("playersRemaining");
    const matchesContainer = document.getElementById("tournamentMatches");

    if (title) title.textContent = tournament.name;
    if (currentRound) currentRound.textContent = tournament.currentRound;

    const activePlayers = tournament.players.filter((p) => !p.eliminated);
    if (playersRemaining) playersRemaining.textContent = activePlayers.length;

    if (!matchesContainer) return;

    matchesContainer.innerHTML = "";

    // Show winner banner if tournament is completed
    if (tournament.status === "completed" && tournament.winner) {
      const winnerBanner = document.createElement("div");
      winnerBanner.className = "tournament-winner-banner";
      winnerBanner.innerHTML = `
        <span class="trophy-icon">🏆</span>
        <h3>Tournament Champion</h3>
        <span class="winner-name">${tournament.winner.name}</span>
      `;
      matchesContainer.appendChild(winnerBanner);
    }

    // Get current round matches
    const roundMatches = tournament.matches.filter(
      (m) => m.round === tournament.currentRound,
    );

    if (roundMatches.length === 0 && tournament.status !== "completed") {
      matchesContainer.innerHTML +=
        '<p style="text-align: center; color: var(--text-secondary);">No matches in current round</p>';
      return;
    }

    // Add round header
    if (roundMatches.length > 0) {
      const totalRounds = Math.ceil(Math.log2(tournament.playerCount));
      const roundName = getRoundName(tournament.currentRound, totalRounds);

      const roundHeader = document.createElement("div");
      roundHeader.className = "tournament-round-header";
      roundHeader.innerHTML = `
        <h4>${roundName}</h4>
        <span class="round-badge">${roundMatches.length} match${roundMatches.length > 1 ? "es" : ""}</span>
      `;
      matchesContainer.appendChild(roundHeader);
    }

    roundMatches.forEach((match, index) => {
      const matchEl = document.createElement("div");
      const isFinal = roundMatches.length === 1 && activePlayers.length <= 2;
      matchEl.className = `tournament-match ${match.status}${isFinal ? " final" : ""}`;

      const player1Class =
        match.winner === match.player1.id
          ? "winner"
          : match.winner && match.winner !== match.player1.id
            ? "eliminated"
            : "";
      const player2Class =
        match.winner === match.player2.id
          ? "winner"
          : match.winner && match.winner !== match.player2.id
            ? "eliminated"
            : "";

      matchEl.innerHTML = `
        <div class="tournament-match-header">
          <span class="tournament-match-number">Match ${index + 1}</span>
          <span class="tournament-match-status">${formatMatchStatus(match.status)}</span>
        </div>
        <div class="tournament-match-players">
          <div class="tournament-player ${player1Class}">
            <span class="tournament-player-name">${match.player1.name}</span>
            <span class="tournament-player-score">${match.player1Score || 0}</span>
          </div>
          <span class="tournament-vs">VS</span>
          <div class="tournament-player ${player2Class}">
            <span class="tournament-player-name">${match.player2.name}</span>
            <span class="tournament-player-score">${match.player2Score || 0}</span>
          </div>
        </div>
      `;

      matchesContainer.appendChild(matchEl);
    });

    // Update play button state
    const playNextMatchBtn = document.getElementById("playNextMatchBtn");
    if (playNextMatchBtn) {
      const nextMatch = api.tournament.getNextMatch();
      if (nextMatch) {
        playNextMatchBtn.disabled = false;
        playNextMatchBtn.textContent = "Play Next Match";
      } else if (tournament.status === "completed") {
        playNextMatchBtn.disabled = true;
        playNextMatchBtn.textContent = "Tournament Complete";
      } else {
        playNextMatchBtn.disabled = true;
        playNextMatchBtn.textContent = "No Matches Available";
      }
    }
  }

  function getRoundName(round, totalRounds) {
    const roundsFromEnd = totalRounds - round + 1;
    if (roundsFromEnd === 1) return "Finals";
    if (roundsFromEnd === 2) return "Semi-Finals";
    if (roundsFromEnd === 3) return "Quarter-Finals";
    return `Round ${round}`;
  }

  function formatMatchStatus(status) {
    const statusMap = {
      pending: "Upcoming",
      in_progress: "In Progress",
      completed: "Completed",
    };
    return statusMap[status] || status;
  }

  function playNextMatch() {
    const tournament = api.tournament.getCurrent();
    if (!tournament) return;

    const nextMatch = api.tournament.getNextMatch();
    if (!nextMatch) {
      alert("No matches available to play");
      return;
    }

    alert(
      `Starting match: ${nextMatch.player1.name} vs ${nextMatch.player2.name}\n\nThis would start a game. For demo purposes, we'll simulate results.`,
    );

    // Simulate match results (in real app, this would start an actual game)
    const player1Score = Math.floor(Math.random() * 100000);
    const player2Score = Math.floor(Math.random() * 100000);
    const winnerId =
      player1Score > player2Score ? nextMatch.player1.id : nextMatch.player2.id;

    api.tournament.recordMatch(
      nextMatch.id,
      winnerId,
      player1Score,
      player2Score,
    );

    // Reload bracket
    loadTournament(tournament.id);
  }

  function showStandings() {
    const tournament = api.tournament.getCurrent();
    if (!tournament) return;

    const players = [...tournament.players].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.score - a.score;
    });

    // Create standings overlay
    let overlay = document.getElementById("standings-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "standings-overlay";
      overlay.className = "overlay";
      overlay.innerHTML = `
        <div class="overlay-content" style="max-width: 500px;">
          <h2 style="color: var(--accent); margin-bottom: 1rem;">Tournament Standings</h2>
          <div class="tournament-standings" id="standings-table"></div>
          <button class="btn secondary" id="closeStandingsBtn" style="margin-top: 1rem;">Close</button>
        </div>
      `;
      document.body.appendChild(overlay);

      document
        .getElementById("closeStandingsBtn")
        .addEventListener("click", () => {
          overlay.classList.remove("active");
        });

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.remove("active");
      });
    }

    const table = document.getElementById("standings-table");
    table.innerHTML = `
      <div class="standings-header">
        <span>#</span>
        <span>Player</span>
        <span>W</span>
        <span>L</span>
        <span>Score</span>
      </div>
    `;

    players.forEach((player, index) => {
      const rankClass =
        index === 0
          ? "gold"
          : index === 1
            ? "silver"
            : index === 2
              ? "bronze"
              : "";
      const row = document.createElement("div");
      row.className = "standings-row";
      row.innerHTML = `
        <span class="standings-rank ${rankClass}">${index + 1}</span>
        <span class="standings-name ${player.eliminated ? "eliminated" : ""}">${player.name}</span>
        <span class="standings-wins">${player.wins}</span>
        <span class="standings-losses">${player.losses}</span>
        <span class="standings-score">${player.score}</span>
      `;
      table.appendChild(row);
    });

    overlay.classList.add("active");
  }

  // Export API
  window.Flixtris.api.tournamentUI = {
    init: initTournamentUI,
    loadList: loadTournamentList,
    loadTournament,
  };
})();
