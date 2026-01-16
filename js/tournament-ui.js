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
    const tournament = api.tournament.create(name, selectedTournamentType, count);

    // Generate AI players for demo (in real app, you'd have a player registration flow)
    const playerNames = [
      "Alpha", "Bravo", "Charlie", "Delta",
      "Echo", "Foxtrot", "Golf", "Hotel",
      "India", "Juliet", "Kilo", "Lima",
      "Mike", "November", "Oscar", "Papa"
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

    // Get current round matches
    const roundMatches = tournament.matches.filter(
      (m) => m.round === tournament.currentRound
    );

    matchesContainer.innerHTML = "";

    if (roundMatches.length === 0) {
      matchesContainer.innerHTML =
        '<p style="text-align: center; color: var(--text-secondary);">No matches in current round</p>';
      return;
    }

    roundMatches.forEach((match, index) => {
      const matchEl = document.createElement("div");
      matchEl.className = `tournament-match ${match.status}`;

      matchEl.innerHTML = `
        <div class="tournament-match-header">
          <span class="tournament-match-number">Match ${index + 1}</span>
          <span class="tournament-match-status">${match.status}</span>
        </div>
        <div class="tournament-match-players">
          <div class="tournament-player ${match.winner === match.player1.id ? "winner" : ""}">
            <span class="tournament-player-name">${match.player1.name}</span>
            <span class="tournament-player-score">${match.player1Score}</span>
          </div>
          <div class="tournament-player ${match.winner === match.player2.id ? "winner" : ""}">
            <span class="tournament-player-name">${match.player2.name}</span>
            <span class="tournament-player-score">${match.player2Score}</span>
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
        playNextMatchBtn.textContent = `🏆 Winner: ${tournament.winner.name}`;
      } else {
        playNextMatchBtn.disabled = true;
        playNextMatchBtn.textContent = "No Matches Available";
      }
    }
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
      `Starting match: ${nextMatch.player1.name} vs ${nextMatch.player2.name}\n\nThis would start a game. For demo purposes, we'll simulate results.`
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
      player2Score
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

    let standingsText = "Tournament Standings:\n\n";
    players.forEach((player, index) => {
      standingsText += `${index + 1}. ${player.name} - ${player.wins}W/${player.losses}L - ${player.score} pts${player.eliminated ? " (Eliminated)" : ""}\n`;
    });

    alert(standingsText);
  }

  // Export API
  window.Flixtris.api.tournamentUI = {
    init: initTournamentUI,
    loadList: loadTournamentList,
    loadTournament,
  };
})();
