// tournament.js - Tournament feature implementation
(() => {
  const api = window.Flixtris.api;

  // Tournament state
  let currentTournament = null;
  let tournamentPlayers = [];
  let tournamentMatches = [];
  let tournamentRound = 0;

  // Tournament types
  const TOURNAMENT_TYPES = {
    SINGLE_ELIMINATION: "single_elimination",
    DOUBLE_ELIMINATION: "double_elimination",
    ROUND_ROBIN: "round_robin",
  };

  function createTournament(name, type, playerCount) {
    const tournament = {
      id: Date.now().toString(),
      name,
      type,
      playerCount,
      createdAt: new Date().toISOString(),
      status: "waiting", // waiting, in_progress, completed
      currentRound: 0,
      players: [],
      matches: [],
      winner: null,
    };

    currentTournament = tournament;
    return tournament;
  }

  function addPlayer(playerName) {
    if (!currentTournament) return false;

    if (currentTournament.players.length >= currentTournament.playerCount) {
      return false;
    }

    const player = {
      id: Date.now().toString() + Math.random(),
      name: playerName,
      wins: 0,
      losses: 0,
      score: 0,
      eliminated: false,
    };

    currentTournament.players.push(player);
    tournamentPlayers.push(player);

    // Start tournament if we have enough players
    if (currentTournament.players.length === currentTournament.playerCount) {
      startTournament();
    }

    return true;
  }

  function startTournament() {
    if (!currentTournament) return;

    currentTournament.status = "in_progress";
    currentTournament.currentRound = 1;

    // Generate first round matches based on tournament type
    if (currentTournament.type === TOURNAMENT_TYPES.SINGLE_ELIMINATION) {
      generateSingleEliminationMatches();
    } else if (currentTournament.type === TOURNAMENT_TYPES.ROUND_ROBIN) {
      generateRoundRobinMatches();
    }

    // Save tournament to database
    saveTournament();
  }

  function generateSingleEliminationMatches() {
    const players = [...currentTournament.players];
    const matches = [];

    // Shuffle players for random seeding
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [players[i], players[j]] = [players[j], players[i]];
    }

    // Create matches
    for (let i = 0; i < players.length; i += 2) {
      if (i + 1 < players.length) {
        matches.push({
          id: Date.now().toString() + i,
          round: currentTournament.currentRound,
          player1: players[i],
          player2: players[i + 1],
          winner: null,
          player1Score: 0,
          player2Score: 0,
          status: "pending", // pending, in_progress, completed
        });
      }
    }

    currentTournament.matches.push(...matches);
    tournamentMatches = matches;
  }

  function generateRoundRobinMatches() {
    const players = [...currentTournament.players];
    const matches = [];
    let matchId = 0;

    // Each player plays against every other player
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        matches.push({
          id: Date.now().toString() + matchId++,
          round: 1, // All matches are in one round for round robin
          player1: players[i],
          player2: players[j],
          winner: null,
          player1Score: 0,
          player2Score: 0,
          status: "pending",
        });
      }
    }

    currentTournament.matches.push(...matches);
    tournamentMatches = matches;
  }

  function recordMatchResult(matchId, winnerId, player1Score, player2Score) {
    const match = currentTournament.matches.find((m) => m.id === matchId);
    if (!match) return;

    match.player1Score = player1Score;
    match.player2Score = player2Score;
    match.winner = winnerId;
    match.status = "completed";

    // Update player stats
    const winner = currentTournament.players.find((p) => p.id === winnerId);
    const loser = currentTournament.players.find(
      (p) => p.id !== winnerId && (p.id === match.player1.id || p.id === match.player2.id)
    );

    if (winner) {
      winner.wins++;
      winner.score += (winnerId === match.player1.id ? player1Score : player2Score);
    }

    if (loser) {
      loser.losses++;
      loser.score += (loser.id === match.player1.id ? player1Score : player2Score);

      // Eliminate loser in single elimination
      if (currentTournament.type === TOURNAMENT_TYPES.SINGLE_ELIMINATION) {
        loser.eliminated = true;
      }
    }

    // Check if round is complete
    const roundMatches = currentTournament.matches.filter(
      (m) => m.round === currentTournament.currentRound
    );
    const allComplete = roundMatches.every((m) => m.status === "completed");

    if (allComplete) {
      advanceRound();
    }

    saveTournament();
  }

  function advanceRound() {
    if (currentTournament.type === TOURNAMENT_TYPES.SINGLE_ELIMINATION) {
      const activePlayers = currentTournament.players.filter((p) => !p.eliminated);

      if (activePlayers.length === 1) {
        // Tournament complete
        currentTournament.status = "completed";
        currentTournament.winner = activePlayers[0];
        saveTournament();
        return;
      }

      // Generate next round
      currentTournament.currentRound++;
      const matches = [];

      for (let i = 0; i < activePlayers.length; i += 2) {
        if (i + 1 < activePlayers.length) {
          matches.push({
            id: Date.now().toString() + i,
            round: currentTournament.currentRound,
            player1: activePlayers[i],
            player2: activePlayers[i + 1],
            winner: null,
            player1Score: 0,
            player2Score: 0,
            status: "pending",
          });
        }
      }

      currentTournament.matches.push(...matches);
    } else if (currentTournament.type === TOURNAMENT_TYPES.ROUND_ROBIN) {
      // All matches complete, determine winner
      currentTournament.status = "completed";

      // Sort by wins, then by score
      const sortedPlayers = [...currentTournament.players].sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return b.score - a.score;
      });

      currentTournament.winner = sortedPlayers[0];
    }

    saveTournament();
  }

  async function saveTournament() {
    if (!currentTournament) return;
    await api.db.saveTournament(currentTournament);
  }

  async function loadTournament(tournamentId) {
    const tournament = await api.db.getTournament(tournamentId);
    if (tournament) {
      currentTournament = tournament;
      tournamentPlayers = tournament.players;
      tournamentMatches = tournament.matches;
      tournamentRound = tournament.currentRound;
    }
    return tournament;
  }

  async function getAllTournaments() {
    return await api.db.getAllTournaments();
  }

  function getCurrentTournament() {
    return currentTournament;
  }

  function getNextMatch() {
    if (!currentTournament) return null;

    return currentTournament.matches.find(
      (m) => m.status === "pending" && m.round === currentTournament.currentRound
    );
  }

  // Export API
  window.Flixtris.api.tournament = {
    create: createTournament,
    addPlayer,
    start: startTournament,
    recordMatch: recordMatchResult,
    load: loadTournament,
    getAll: getAllTournaments,
    getCurrent: getCurrentTournament,
    getNextMatch,
    TYPES: TOURNAMENT_TYPES,
  };
})();
