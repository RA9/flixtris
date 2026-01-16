// Tournament Test
const fs = require("fs");
const path = require("path");

// Mock browser environment
global.window = { Flixtris: { api: {} } };
global.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ 
    className: "", 
    innerHTML: "", 
    appendChild: () => {},
    addEventListener: () => {}
  }),
  body: { appendChild: () => {} }
};

// Mock db API
window.Flixtris.api.db = {
  saveTournament: (t) => Promise.resolve(),
  getTournament: (id) => Promise.resolve(null),
  getAllTournaments: () => Promise.resolve([])
};

// Mock screens API
window.Flixtris.api.screens = {
  show: () => {}
};

// Load tournament.js
const tournamentCode = fs.readFileSync(
  path.join(__dirname, "../js/tournament.js"),
  "utf8"
);
eval(tournamentCode);

const api = window.Flixtris.api;

// Test 1: Create tournament
console.log("Test 1: Create tournament...");
const tournament = api.tournament.create("Test Tournament", "single_elimination", 4);
console.assert(tournament.name === "Test Tournament", "Tournament name should match");
console.assert(tournament.playerCount === 4, "Player count should be 4");
console.assert(tournament.status === "waiting", "Status should be waiting");
console.log("✔ Tournament created successfully");

// Test 2: Add players
console.log("Test 2: Add players...");
api.tournament.addPlayer("Alice");
api.tournament.addPlayer("Bob");
api.tournament.addPlayer("Charlie");

let current = api.tournament.getCurrent();
console.assert(current.players.length === 3, "Should have 3 players");
console.assert(current.status === "waiting", "Status should still be waiting");
console.log("✔ Players added, waiting for more");

// Test 3: Add final player (should auto-start)
console.log("Test 3: Add final player and auto-start...");
api.tournament.addPlayer("Diana");

current = api.tournament.getCurrent();
console.assert(current.players.length === 4, "Should have 4 players");
console.assert(current.status === "in_progress", "Status should be in_progress");
console.assert(current.currentRound === 1, "Should be round 1");
console.assert(current.matches.length === 2, "Should have 2 matches in first round");
console.log("✔ Tournament auto-started with 2 matches");

// Test 4: Get next match
console.log("Test 4: Get next match...");
const nextMatch = api.tournament.getNextMatch();
console.assert(nextMatch !== null, "Should have a next match");
console.assert(nextMatch.status === "pending", "Match should be pending");
console.log("✔ Next match retrieved:", nextMatch.player1.name, "vs", nextMatch.player2.name);

// Test 5: Record match result
console.log("Test 5: Record match result...");
const winnerId = nextMatch.player1.id;
api.tournament.recordMatch(nextMatch.id, winnerId, 10000, 5000);

current = api.tournament.getCurrent();
const completedMatch = current.matches.find(m => m.id === nextMatch.id);
console.assert(completedMatch.status === "completed", "Match should be completed");
console.assert(completedMatch.winner === winnerId, "Winner should be recorded");
console.log("✔ Match result recorded");

// Test 6: Complete tournament
console.log("Test 6: Complete tournament...");
const match2 = api.tournament.getNextMatch();
api.tournament.recordMatch(match2.id, match2.player1.id, 12000, 8000);

current = api.tournament.getCurrent();
console.assert(current.currentRound === 2, "Should advance to round 2");
console.assert(current.matches.filter(m => m.round === 2).length === 1, "Should have 1 final match");
console.log("✔ Advanced to finals");

// Final match
const finalMatch = api.tournament.getNextMatch();
api.tournament.recordMatch(finalMatch.id, finalMatch.player2.id, 15000, 20000);

current = api.tournament.getCurrent();
console.assert(current.status === "completed", "Tournament should be completed");
console.assert(current.winner !== null, "Should have a winner");
console.log("✔ Tournament completed! Winner:", current.winner.name);

console.log("\n=== All Tournament Tests Passed ===");
