// Flixtris Multiplayer Server
// Run with: node server/index.js

const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Flixtris Multiplayer Server");
});

const wss = new WebSocketServer({ server });

// Game rooms storage
const rooms = new Map();

// Generate random room code
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Generate seeded random for consistent piece order
function generateGameSeed() {
  return `MP-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

// Broadcast to all players in a room
function broadcastToRoom(roomCode, message, excludeWs = null) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const data = JSON.stringify(message);
  room.players.forEach((player) => {
    if (player.ws !== excludeWs && player.ws.readyState === 1) {
      player.ws.send(data);
    }
  });
}

// Handle WebSocket connections
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
      case "create_room": {
        const roomCode = generateRoomCode();
        const seed = generateGameSeed();
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
            },
          ],
          started: false,
          createdAt: Date.now(),
        });

        currentRoom = roomCode;

        ws.send(
          JSON.stringify({
            type: "room_created",
            roomCode: roomCode,
            playerId: playerId,
            seed: seed,
          })
        );
        break;
      }

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
            JSON.stringify({ type: "error", message: "Game already started" })
          );
          return;
        }

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
        });

        // Notify joiner
        ws.send(
          JSON.stringify({
            type: "room_joined",
            roomCode: currentRoom,
            playerId: playerId,
            seed: room.seed,
            opponent: {
              id: room.players[0].id,
              name: room.players[0].name,
            },
          })
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
          ws
        );
        break;
      }

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
          broadcastToRoom(currentRoom, {
            type: "game_start",
            seed: room.seed,
            countdown: 3,
          });
        } else {
          broadcastToRoom(currentRoom, {
            type: "player_ready",
            playerId: playerId,
          });
        }
        break;
      }

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
          ws
        );
        break;
      }

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
        break;
      }

      case "leave_room": {
        if (currentRoom) {
          const room = rooms.get(currentRoom);
          if (room) {
            broadcastToRoom(
              currentRoom,
              {
                type: "player_left",
                playerId: playerId,
              },
              ws
            );
            room.players = room.players.filter((p) => p.id !== playerId);
            if (room.players.length === 0) {
              rooms.delete(currentRoom);
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
        broadcastToRoom(
          currentRoom,
          {
            type: "player_disconnected",
            playerId: playerId,
          },
          ws
        );
        room.players = room.players.filter((p) => p.id !== playerId);
        if (room.players.length === 0) {
          rooms.delete(currentRoom);
        }
      }
    }
  });
});

// Cleanup old rooms periodically
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes

  rooms.forEach((room, code) => {
    if (now - room.createdAt > maxAge) {
      room.players.forEach((p) => {
        if (p.ws.readyState === 1) {
          p.ws.send(JSON.stringify({ type: "room_expired" }));
          p.ws.close();
        }
      });
      rooms.delete(code);
    }
  });
}, 60000);

server.listen(PORT, () => {
  console.log(`Flixtris Multiplayer Server running on port ${PORT}`);
});
