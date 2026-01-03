// Flixtris Multiplayer Server
// Run with: node server/index.js

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3001;
const STATE_FILE = path.join(__dirname, "rooms-state.json");
const SAVE_INTERVAL = 10000; // Save state every 10 seconds

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Flixtris Multiplayer Server v2.0");
});

const wss = new WebSocketServer({ server });

// Game rooms storage
let rooms = new Map();

// Player reconnection tokens
const reconnectTokens = new Map();

// ========================
// STATE PERSISTENCE
// ========================

function saveState() {
  try {
    const state = {
      rooms: [],
      reconnectTokens: [],
      savedAt: Date.now(),
    };

    rooms.forEach((room, code) => {
      // Don't save rooms with no players or expired rooms
      if (room.players.length === 0) return;

      state.rooms.push({
        code: room.code,
        seed: room.seed,
        started: room.started,
        createdAt: room.createdAt,
        players: room.players.map((p) => ({
          id: p.id,
          name: p.name,
          score: p.score,
          level: p.level,
          lines: p.lines,
          ready: p.ready,
          gameOver: p.gameOver,
          reconnectToken: p.reconnectToken,
          // Don't save ws or board (too large)
        })),
      });
    });

    reconnectTokens.forEach((data, token) => {
      state.reconnectTokens.push({
        token,
        roomCode: data.roomCode,
        playerId: data.playerId,
        playerName: data.playerName,
        expiresAt: data.expiresAt,
      });
    });

    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`State saved: ${state.rooms.length} rooms`);
  } catch (err) {
    console.error("Failed to save state:", err);
  }
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      console.log("No saved state found");
      return;
    }

    const data = fs.readFileSync(STATE_FILE, "utf8");
    const state = JSON.parse(data);

    // Check if state is too old (more than 1 hour)
    if (Date.now() - state.savedAt > 60 * 60 * 1000) {
      console.log("Saved state is too old, ignoring");
      fs.unlinkSync(STATE_FILE);
      return;
    }

    // Restore rooms
    state.rooms.forEach((roomData) => {
      rooms.set(roomData.code, {
        code: roomData.code,
        seed: roomData.seed,
        started: roomData.started,
        createdAt: roomData.createdAt,
        players: roomData.players.map((p) => ({
          ...p,
          ws: null, // No WebSocket connection yet
          board: null,
          disconnectedAt: Date.now(), // Mark as disconnected
        })),
        pendingGarbage: new Map(), // Reset garbage queues
      });
    });

    // Restore reconnect tokens
    state.reconnectTokens.forEach((tokenData) => {
      if (tokenData.expiresAt > Date.now()) {
        reconnectTokens.set(tokenData.token, {
          roomCode: tokenData.roomCode,
          playerId: tokenData.playerId,
          playerName: tokenData.playerName,
          expiresAt: tokenData.expiresAt,
        });
      }
    });

    console.log(
      `State restored: ${rooms.size} rooms, ${reconnectTokens.size} reconnect tokens`,
    );
  } catch (err) {
    console.error("Failed to load state:", err);
  }
}

// ========================
// UTILITY FUNCTIONS
// ========================

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  // Ensure unique
  if (rooms.has(code)) {
    return generateRoomCode();
  }
  return code;
}

function generateGameSeed() {
  return `MP-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

function generateReconnectToken() {
  return `RT-${Date.now()}-${Math.random().toString(36).substr(2, 12)}`;
}

// Calculate garbage lines to send based on lines cleared
function calculateGarbage(linesCleared) {
  // Standard garbage rules:
  // 1 line = 0 garbage (single)
  // 2 lines = 1 garbage (double)
  // 3 lines = 2 garbage (triple)
  // 4 lines = 4 garbage (tetris)
  const garbageTable = [0, 0, 1, 2, 4];
  return garbageTable[Math.min(linesCleared, 4)];
}

function broadcastToRoom(roomCode, message, excludeWs = null) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const data = JSON.stringify(message);
  room.players.forEach((player) => {
    if (player.ws && player.ws !== excludeWs && player.ws.readyState === 1) {
      player.ws.send(data);
    }
  });
}

function sendToPlayer(player, message) {
  if (player.ws && player.ws.readyState === 1) {
    player.ws.send(JSON.stringify(message));
  }
}

// ========================
// WEBSOCKET HANDLING
// ========================

wss.on("connection", (ws) => {
  let currentRoom = null;
  let playerId = null;

  ws.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch (e) {
      return;
    }

    switch (message.type) {
      // ========================
      // RECONNECTION
      // ========================
      case "reconnect": {
        const tokenData = reconnectTokens.get(message.token);
        if (!tokenData || tokenData.expiresAt < Date.now()) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Invalid or expired reconnect token",
            }),
          );
          return;
        }

        const room = rooms.get(tokenData.roomCode);
        if (!room) {
          ws.send(
            JSON.stringify({ type: "error", message: "Room no longer exists" }),
          );
          reconnectTokens.delete(message.token);
          return;
        }

        const player = room.players.find((p) => p.id === tokenData.playerId);
        if (!player) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Player not found in room",
            }),
          );
          reconnectTokens.delete(message.token);
          return;
        }

        // Reconnect the player
        player.ws = ws;
        delete player.disconnectedAt;
        currentRoom = tokenData.roomCode;
        playerId = tokenData.playerId;

        // Send reconnection success with current game state
        const opponent = room.players.find((p) => p.id !== playerId);
        ws.send(
          JSON.stringify({
            type: "reconnected",
            roomCode: currentRoom,
            playerId: playerId,
            seed: room.seed,
            gameStarted: room.started,
            opponent: opponent
              ? {
                  id: opponent.id,
                  name: opponent.name,
                  score: opponent.score,
                  ready: opponent.ready,
                  gameOver: opponent.gameOver,
                }
              : null,
          }),
        );

        // Notify opponent
        broadcastToRoom(
          currentRoom,
          {
            type: "player_reconnected",
            playerId: playerId,
          },
          ws,
        );

        console.log(`Player ${playerId} reconnected to room ${currentRoom}`);
        break;
      }

      // ========================
      // ROOM CREATION
      // ========================
      case "create_room": {
        const roomCode = generateRoomCode();
        const seed = generateGameSeed();
        const reconnectToken = generateReconnectToken();
        playerId = "player1";

        rooms.set(roomCode, {
          code: roomCode,
          seed: seed,
          players: [
            {
              id: playerId,
              name: message.name || "Player 1",
              ws: ws,
              score: 0,
              level: 1,
              lines: 0,
              board: null,
              ready: false,
              gameOver: false,
              reconnectToken: reconnectToken,
            },
          ],
          started: false,
          createdAt: Date.now(),
          pendingGarbage: new Map(),
        });

        currentRoom = roomCode;

        // Store reconnect token
        reconnectTokens.set(reconnectToken, {
          roomCode: roomCode,
          playerId: playerId,
          playerName: message.name || "Player 1",
          expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
        });

        ws.send(
          JSON.stringify({
            type: "room_created",
            roomCode: roomCode,
            playerId: playerId,
            seed: seed,
            reconnectToken: reconnectToken,
          }),
        );

        console.log(
          `Room ${roomCode} created by ${message.name || "Player 1"}`,
        );
        break;
      }

      // ========================
      // ROOM JOINING
      // ========================
      case "join_room": {
        const room = rooms.get(message.roomCode);

        if (!room) {
          ws.send(JSON.stringify({ type: "error", message: "Room not found" }));
          return;
        }

        if (room.players.length >= 2) {
          ws.send(JSON.stringify({ type: "error", message: "Room is full" }));
          return;
        }

        if (room.started) {
          ws.send(
            JSON.stringify({ type: "error", message: "Game already started" }),
          );
          return;
        }

        const reconnectToken = generateReconnectToken();
        playerId = "player2";
        currentRoom = message.roomCode;

        room.players.push({
          id: playerId,
          name: message.name || "Player 2",
          ws: ws,
          score: 0,
          level: 1,
          lines: 0,
          board: null,
          ready: false,
          gameOver: false,
          reconnectToken: reconnectToken,
        });

        // Store reconnect token
        reconnectTokens.set(reconnectToken, {
          roomCode: currentRoom,
          playerId: playerId,
          playerName: message.name || "Player 2",
          expiresAt: Date.now() + 30 * 60 * 1000,
        });

        // Notify joiner
        ws.send(
          JSON.stringify({
            type: "room_joined",
            roomCode: currentRoom,
            playerId: playerId,
            seed: room.seed,
            reconnectToken: reconnectToken,
            opponent: {
              id: room.players[0].id,
              name: room.players[0].name,
            },
          }),
        );

        // Notify host
        broadcastToRoom(
          currentRoom,
          {
            type: "player_joined",
            player: {
              id: playerId,
              name: message.name || "Player 2",
            },
          },
          ws,
        );

        console.log(`${message.name || "Player 2"} joined room ${currentRoom}`);
        break;
      }

      // ========================
      // READY STATE
      // ========================
      case "ready": {
        const room = rooms.get(currentRoom);
        if (!room) return;

        const player = room.players.find((p) => p.id === playerId);
        if (player) {
          player.ready = true;
        }

        // Check if both players are ready
        if (room.players.length === 2 && room.players.every((p) => p.ready)) {
          room.started = true;
          room.pendingGarbage = new Map();

          broadcastToRoom(currentRoom, {
            type: "game_start",
            seed: room.seed,
            countdown: 3,
          });

          console.log(`Game started in room ${currentRoom}`);
        } else {
          broadcastToRoom(currentRoom, {
            type: "player_ready",
            playerId: playerId,
          });
        }
        break;
      }

      // ========================
      // GAME UPDATE
      // ========================
      case "game_update": {
        const room = rooms.get(currentRoom);
        if (!room) return;

        const player = room.players.find((p) => p.id === playerId);
        if (player) {
          player.score = message.score;
          player.level = message.level;
          player.lines = message.lines;
          player.board = message.board;
        }

        // Send update to opponent
        broadcastToRoom(
          currentRoom,
          {
            type: "opponent_update",
            playerId: playerId,
            score: message.score,
            level: message.level,
            lines: message.lines,
            board: message.board,
          },
          ws,
        );
        break;
      }

      // ========================
      // GARBAGE ATTACK (new!)
      // ========================
      case "send_garbage": {
        const room = rooms.get(currentRoom);
        if (!room || !room.started) return;

        const linesCleared = message.lines || 0;
        const garbage = calculateGarbage(linesCleared);

        if (garbage > 0) {
          // Find opponent
          const opponent = room.players.find((p) => p.id !== playerId);
          if (opponent && !opponent.gameOver) {
            // Send garbage to opponent
            sendToPlayer(opponent, {
              type: "incoming_garbage",
              lines: garbage,
              fromPlayer: playerId,
            });

            // Notify sender that garbage was sent
            ws.send(
              JSON.stringify({
                type: "garbage_sent",
                lines: garbage,
                toPlayer: opponent.id,
              }),
            );

            console.log(
              `${playerId} sent ${garbage} garbage lines to ${opponent.id}`,
            );
          }
        }
        break;
      }

      // ========================
      // GAME OVER
      // ========================
      case "game_over": {
        const room = rooms.get(currentRoom);
        if (!room) return;

        const player = room.players.find((p) => p.id === playerId);
        if (player) {
          player.gameOver = true;
          player.score = message.score;
          player.level = message.level;
          player.lines = message.lines;
        }

        // Check if both players are done
        const allDone = room.players.every((p) => p.gameOver);

        broadcastToRoom(currentRoom, {
          type: "player_game_over",
          playerId: playerId,
          score: message.score,
          level: message.level,
          lines: message.lines,
          allDone: allDone,
          winner: allDone
            ? room.players.reduce((a, b) => (a.score > b.score ? a : b)).id
            : null,
          results: allDone
            ? room.players.map((p) => ({
                id: p.id,
                name: p.name,
                score: p.score,
                level: p.level,
                lines: p.lines,
              }))
            : null,
        });

        console.log(
          `${playerId} game over in room ${currentRoom} (score: ${message.score})`,
        );
        break;
      }

      // ========================
      // REMATCH REQUEST (new!)
      // ========================
      case "request_rematch": {
        const room = rooms.get(currentRoom);
        if (!room) return;

        const player = room.players.find((p) => p.id === playerId);
        if (player) {
          player.wantsRematch = true;
        }

        // Check if both players want rematch
        if (
          room.players.length === 2 &&
          room.players.every((p) => p.wantsRematch)
        ) {
          // Reset game state for rematch
          const newSeed = generateGameSeed();
          room.seed = newSeed;
          room.started = false;
          room.pendingGarbage = new Map();

          room.players.forEach((p) => {
            p.score = 0;
            p.level = 1;
            p.lines = 0;
            p.board = null;
            p.ready = false;
            p.gameOver = false;
            p.wantsRematch = false;
          });

          broadcastToRoom(currentRoom, {
            type: "rematch_starting",
            seed: newSeed,
          });

          console.log(`Rematch starting in room ${currentRoom}`);
        } else {
          // Notify opponent that rematch was requested
          broadcastToRoom(
            currentRoom,
            {
              type: "rematch_requested",
              playerId: playerId,
            },
            ws,
          );
        }
        break;
      }

      // ========================
      // DECLINE REMATCH (new!)
      // ========================
      case "decline_rematch": {
        const room = rooms.get(currentRoom);
        if (!room) return;

        broadcastToRoom(
          currentRoom,
          {
            type: "rematch_declined",
            playerId: playerId,
          },
          ws,
        );
        break;
      }

      // ========================
      // EMOJI/REACTION (new!)
      // ========================
      case "send_emoji": {
        const room = rooms.get(currentRoom);
        if (!room) return;

        const validEmojis = ["👍", "👎", "😀", "😢", "🔥", "❄️", "💀", "🎉"];
        if (!validEmojis.includes(message.emoji)) return;

        broadcastToRoom(
          currentRoom,
          {
            type: "emoji_received",
            playerId: playerId,
            emoji: message.emoji,
          },
          ws,
        );
        break;
      }

      // ========================
      // LEAVE ROOM
      // ========================
      case "leave_room": {
        if (currentRoom) {
          const room = rooms.get(currentRoom);
          if (room) {
            const player = room.players.find((p) => p.id === playerId);
            if (player && player.reconnectToken) {
              reconnectTokens.delete(player.reconnectToken);
            }

            broadcastToRoom(
              currentRoom,
              {
                type: "player_left",
                playerId: playerId,
              },
              ws,
            );
            room.players = room.players.filter((p) => p.id !== playerId);
            if (room.players.length === 0) {
              rooms.delete(currentRoom);
              console.log(`Room ${currentRoom} deleted (empty)`);
            }
          }
          currentRoom = null;
        }
        break;
      }
    }
  });

  ws.on("close", () => {
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        const player = room.players.find((p) => p.id === playerId);
        if (player) {
          // Mark as disconnected but keep in room for reconnection
          player.ws = null;
          player.disconnectedAt = Date.now();

          broadcastToRoom(
            currentRoom,
            {
              type: "player_disconnected",
              playerId: playerId,
              canReconnect: true,
            },
            ws,
          );

          console.log(
            `${playerId} disconnected from room ${currentRoom} (can reconnect)`,
          );

          // Set timeout to remove player if they don't reconnect
          setTimeout(() => {
            const room = rooms.get(currentRoom);
            if (room) {
              const player = room.players.find((p) => p.id === playerId);
              if (player && player.disconnectedAt) {
                // Player didn't reconnect, remove them
                if (player.reconnectToken) {
                  reconnectTokens.delete(player.reconnectToken);
                }
                room.players = room.players.filter((p) => p.id !== playerId);

                broadcastToRoom(currentRoom, {
                  type: "player_left",
                  playerId: playerId,
                });

                if (room.players.length === 0) {
                  rooms.delete(currentRoom);
                  console.log(`Room ${currentRoom} deleted (timeout)`);
                }
              }
            }
          }, 60000); // 1 minute to reconnect
        }
      }
    }
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });
});

// ========================
// PERIODIC TASKS
// ========================

// Save state periodically
setInterval(saveState, SAVE_INTERVAL);

// Cleanup old rooms
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes

  rooms.forEach((room, code) => {
    if (now - room.createdAt > maxAge) {
      room.players.forEach((p) => {
        if (p.ws && p.ws.readyState === 1) {
          p.ws.send(JSON.stringify({ type: "room_expired" }));
          p.ws.close();
        }
        if (p.reconnectToken) {
          reconnectTokens.delete(p.reconnectToken);
        }
      });
      rooms.delete(code);
      console.log(`Room ${code} expired`);
    }
  });

  // Cleanup expired reconnect tokens
  reconnectTokens.forEach((data, token) => {
    if (data.expiresAt < now) {
      reconnectTokens.delete(token);
    }
  });
}, 60000);

// ========================
// GRACEFUL SHUTDOWN
// ========================

function shutdown() {
  console.log("Shutting down...");

  // Notify all players
  rooms.forEach((room) => {
    room.players.forEach((p) => {
      if (p.ws && p.ws.readyState === 1) {
        p.ws.send(
          JSON.stringify({
            type: "server_shutdown",
            message: "Server is restarting. You can reconnect shortly.",
          }),
        );
      }
    });
  });

  // Save state before exit
  saveState();

  // Close server
  wss.close(() => {
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  });

  // Force exit after 5 seconds
  setTimeout(() => {
    process.exit(0);
  }, 5000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ========================
// STARTUP
// ========================

// Load any saved state
loadState();

server.listen(PORT, () => {
  console.log(`Flixtris Multiplayer Server v2.0 running on port ${PORT}`);
  console.log(
    `Features: Garbage lines, Reconnection, Rematch, Emojis, State persistence`,
  );
});
