const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const redis = require("redis");

const PORT = process.env.PORT || 3001;
const STATIC_DIR = path.join(__dirname, "../public");

// MIME types for static files
const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const ROOM_TTL = 30 * 60; // 30 minutes in seconds
const RECONNECT_TTL = 30 * 60; // 30 minutes in seconds

// ========================
// REDIS CLIENT SETUP
// ========================

let redisClient = null;
let redisConnected = false;

async function initRedis() {
  try {
    redisClient = redis.createClient({
      url: REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error("Redis: Max reconnection attempts reached");
            return new Error("Max reconnection attempts reached");
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    redisClient.on("error", (err) => {
      console.error("Redis error:", err.message);
      redisConnected = false;
    });

    redisClient.on("connect", () => {
      console.log("Redis: Connected");
      redisConnected = true;
    });

    redisClient.on("reconnecting", () => {
      console.log("Redis: Reconnecting...");
    });

    await redisClient.connect();
    console.log(`Redis: Connected to ${REDIS_URL}`);
    return true;
  } catch (err) {
    console.error("Redis: Failed to connect:", err.message);
    console.log("Redis: Running in memory-only mode (no persistence)");
    return false;
  }
}

// ========================
// REDIS KEYS
// ========================

const KEYS = {
  room: (code) => `flixtris:room:${code}`,
  roomPlayers: (code) => `flixtris:room:${code}:players`,
  reconnectToken: (token) => `flixtris:reconnect:${token}`,
  activeRooms: "flixtris:rooms:active",
};

// ========================
// REDIS OPERATIONS
// ========================

async function saveRoom(room) {
  if (!redisConnected) return;

  try {
    const roomData = {
      code: room.code,
      seed: room.seed,
      started: room.started,
      createdAt: room.createdAt,
    };

    const playersData = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      level: p.level,
      lines: p.lines,
      ready: p.ready,
      gameOver: p.gameOver,
      reconnectToken: p.reconnectToken,
      wantsRematch: p.wantsRematch || false,
    }));

    await redisClient
      .multi()
      .set(KEYS.room(room.code), JSON.stringify(roomData), { EX: ROOM_TTL })
      .set(KEYS.roomPlayers(room.code), JSON.stringify(playersData), {
        EX: ROOM_TTL,
      })
      .sAdd(KEYS.activeRooms, room.code)
      .exec();
  } catch (err) {
    console.error("Redis: Failed to save room:", err.message);
  }
}

async function loadRoom(code) {
  if (!redisConnected) return null;

  try {
    const [roomData, playersData] = await Promise.all([
      redisClient.get(KEYS.room(code)),
      redisClient.get(KEYS.roomPlayers(code)),
    ]);

    if (!roomData) return null;

    const room = JSON.parse(roomData);
    const players = playersData ? JSON.parse(playersData) : [];

    return {
      ...room,
      players: players.map((p) => ({
        ...p,
        ws: null,
        board: null,
        disconnectedAt: Date.now(),
      })),
      pendingGarbage: new Map(),
    };
  } catch (err) {
    console.error("Redis: Failed to load room:", err.message);
    return null;
  }
}

async function deleteRoom(code) {
  if (!redisConnected) return;

  try {
    await redisClient
      .multi()
      .del(KEYS.room(code))
      .del(KEYS.roomPlayers(code))
      .sRem(KEYS.activeRooms, code)
      .exec();
  } catch (err) {
    console.error("Redis: Failed to delete room:", err.message);
  }
}

async function saveReconnectToken(token, data) {
  if (!redisConnected) return;

  try {
    await redisClient.set(KEYS.reconnectToken(token), JSON.stringify(data), {
      EX: RECONNECT_TTL,
    });
  } catch (err) {
    console.error("Redis: Failed to save reconnect token:", err.message);
  }
}

async function loadReconnectToken(token) {
  if (!redisConnected) return null;

  try {
    const data = await redisClient.get(KEYS.reconnectToken(token));
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error("Redis: Failed to load reconnect token:", err.message);
    return null;
  }
}

async function deleteReconnectToken(token) {
  if (!redisConnected) return;

  try {
    await redisClient.del(KEYS.reconnectToken(token));
  } catch (err) {
    console.error("Redis: Failed to delete reconnect token:", err.message);
  }
}

async function getAllActiveRoomCodes() {
  if (!redisConnected) return [];

  try {
    return await redisClient.sMembers(KEYS.activeRooms);
  } catch (err) {
    console.error("Redis: Failed to get active rooms:", err.message);
    return [];
  }
}

// ========================
// HTTP & WEBSOCKET SERVER
// ========================

const server = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        redis: redisConnected ? "connected" : "disconnected",
        rooms: rooms.size,
        uptime: process.uptime(),
      }),
    );
    return;
  }

  // Serve static files
  let filePath = req.url === "/" ? "/index.html" : req.url;
  filePath = path.join(STATIC_DIR, filePath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        // For SPA, serve index.html for non-file routes
        fs.readFile(path.join(STATIC_DIR, "index.html"), (err2, indexData) => {
          if (err2) {
            res.writeHead(404);
            res.end("Not Found");
            return;
          }
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(indexData);
        });
        return;
      }
      res.writeHead(500);
      res.end("Server Error");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

// In-memory room storage (Redis is for persistence, not real-time)
const rooms = new Map();

// ========================
// UTILITY FUNCTIONS
// ========================

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
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

function calculateGarbage(linesCleared) {
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
// ROOM MANAGEMENT
// ========================

async function getOrLoadRoom(code) {
  // Check memory first
  if (rooms.has(code)) {
    return rooms.get(code);
  }

  // Try to load from Redis
  const room = await loadRoom(code);
  if (room) {
    rooms.set(code, room);
    return room;
  }

  return null;
}

async function createRoom(playerName, ws) {
  const roomCode = generateRoomCode();
  const seed = generateGameSeed();
  const reconnectToken = generateReconnectToken();
  const playerId = "player1";

  const room = {
    code: roomCode,
    seed: seed,
    players: [
      {
        id: playerId,
        name: playerName || "Player 1",
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
  };

  rooms.set(roomCode, room);

  // Save to Redis
  await saveRoom(room);
  await saveReconnectToken(reconnectToken, {
    roomCode: roomCode,
    playerId: playerId,
    playerName: playerName || "Player 1",
  });

  return { room, playerId, reconnectToken };
}

async function joinRoom(roomCode, playerName, ws) {
  const room = await getOrLoadRoom(roomCode);

  if (!room) {
    return { error: "Room not found" };
  }

  if (room.players.length >= 2) {
    return { error: "Room is full" };
  }

  if (room.started) {
    return { error: "Game already started" };
  }

  const reconnectToken = generateReconnectToken();
  const playerId = "player2";

  room.players.push({
    id: playerId,
    name: playerName || "Player 2",
    ws: ws,
    score: 0,
    level: 1,
    lines: 0,
    board: null,
    ready: false,
    gameOver: false,
    reconnectToken: reconnectToken,
  });

  // Save to Redis
  await saveRoom(room);
  await saveReconnectToken(reconnectToken, {
    roomCode: roomCode,
    playerId: playerId,
    playerName: playerName || "Player 2",
  });

  return { room, playerId, reconnectToken };
}

async function reconnectPlayer(token, ws) {
  const tokenData = await loadReconnectToken(token);

  if (!tokenData) {
    return { error: "Invalid or expired reconnect token" };
  }

  const room = await getOrLoadRoom(tokenData.roomCode);

  if (!room) {
    await deleteReconnectToken(token);
    return { error: "Room no longer exists" };
  }

  const player = room.players.find((p) => p.id === tokenData.playerId);

  if (!player) {
    await deleteReconnectToken(token);
    return { error: "Player not found in room" };
  }

  // Reconnect the player
  player.ws = ws;
  delete player.disconnectedAt;

  // Save to Redis
  await saveRoom(room);

  return { room, player, tokenData };
}

async function removePlayerFromRoom(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const player = room.players.find((p) => p.id === playerId);
  if (player && player.reconnectToken) {
    await deleteReconnectToken(player.reconnectToken);
  }

  room.players = room.players.filter((p) => p.id !== playerId);

  if (room.players.length === 0) {
    rooms.delete(roomCode);
    await deleteRoom(roomCode);
    console.log(`Room ${roomCode} deleted (empty)`);
  } else {
    await saveRoom(room);
  }
}

// ========================
// WEBSOCKET HANDLING
// ========================

wss.on("connection", (ws) => {
  let currentRoom = null;
  let playerId = null;

  ws.on("message", async (data) => {
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
        const result = await reconnectPlayer(message.token, ws);

        if (result.error) {
          ws.send(JSON.stringify({ type: "error", message: result.error }));
          return;
        }

        const { room, player, tokenData } = result;
        currentRoom = room.code;
        playerId = player.id;

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
        const result = await createRoom(message.name, ws);
        const { room, playerId: newPlayerId, reconnectToken } = result;

        currentRoom = room.code;
        playerId = newPlayerId;

        ws.send(
          JSON.stringify({
            type: "room_created",
            roomCode: room.code,
            playerId: playerId,
            seed: room.seed,
            reconnectToken: reconnectToken,
          }),
        );

        console.log(
          `Room ${room.code} created by ${message.name || "Player 1"}`,
        );
        break;
      }

      // ========================
      // ROOM JOINING
      // ========================
      case "join_room": {
        const result = await joinRoom(message.roomCode, message.name, ws);

        if (result.error) {
          ws.send(JSON.stringify({ type: "error", message: result.error }));
          return;
        }

        const { room, playerId: newPlayerId, reconnectToken } = result;
        currentRoom = room.code;
        playerId = newPlayerId;

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

        if (room.players.length === 2 && room.players.every((p) => p.ready)) {
          room.started = true;
          room.pendingGarbage = new Map();

          await saveRoom(room);

          broadcastToRoom(currentRoom, {
            type: "game_start",
            seed: room.seed,
            countdown: 3,
          });

          console.log(`Game started in room ${currentRoom}`);
        } else {
          await saveRoom(room);

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

        // Don't save board to Redis (too large/frequent)
        // Only broadcast to opponent
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
      // GARBAGE ATTACK
      // ========================
      case "send_garbage": {
        const room = rooms.get(currentRoom);
        if (!room || !room.started) return;

        const linesCleared = message.lines || 0;
        const garbage = calculateGarbage(linesCleared);

        if (garbage > 0) {
          const opponent = room.players.find((p) => p.id !== playerId);
          if (opponent && !opponent.gameOver) {
            sendToPlayer(opponent, {
              type: "incoming_garbage",
              lines: garbage,
              fromPlayer: playerId,
            });

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

        const allDone = room.players.every((p) => p.gameOver);

        await saveRoom(room);

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
      // REMATCH REQUEST
      // ========================
      case "request_rematch": {
        const room = rooms.get(currentRoom);
        if (!room) return;

        const player = room.players.find((p) => p.id === playerId);
        if (player) {
          player.wantsRematch = true;
        }

        if (
          room.players.length === 2 &&
          room.players.every((p) => p.wantsRematch)
        ) {
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

          await saveRoom(room);

          broadcastToRoom(currentRoom, {
            type: "rematch_starting",
            seed: newSeed,
          });

          console.log(`Rematch starting in room ${currentRoom}`);
        } else {
          await saveRoom(room);

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
      // DECLINE REMATCH
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
      // EMOJI/REACTION
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
          broadcastToRoom(
            currentRoom,
            {
              type: "player_left",
              playerId: playerId,
            },
            ws,
          );

          await removePlayerFromRoom(currentRoom, playerId);
          currentRoom = null;
        }
        break;
      }
    }
  });

  ws.on("close", async () => {
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        const player = room.players.find((p) => p.id === playerId);
        if (player) {
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
          const roomCode = currentRoom;
          const pId = playerId;

          setTimeout(async () => {
            const room = rooms.get(roomCode);
            if (room) {
              const player = room.players.find((p) => p.id === pId);
              if (player && player.disconnectedAt) {
                broadcastToRoom(roomCode, {
                  type: "player_left",
                  playerId: pId,
                });

                await removePlayerFromRoom(roomCode, pId);
              }
            }
          }, 60000); // 1 minute to reconnect
        }
      }
    }
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
});

// ========================
// PERIODIC CLEANUP
// ========================

setInterval(async () => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes

  // Cleanup expired rooms from memory
  rooms.forEach((room, code) => {
    if (now - room.createdAt > maxAge) {
      room.players.forEach((p) => {
        if (p.ws && p.ws.readyState === 1) {
          p.ws.send(JSON.stringify({ type: "room_expired" }));
          p.ws.close();
        }
      });
      rooms.delete(code);
      console.log(`Room ${code} expired (memory)`);
    }
  });

  // Cleanup Redis (handled by TTL, but also sync activeRooms set)
  if (redisConnected) {
    try {
      const activeRooms = await getAllActiveRoomCodes();
      for (const code of activeRooms) {
        const exists = await redisClient.exists(KEYS.room(code));
        if (!exists) {
          await redisClient.sRem(KEYS.activeRooms, code);
        }
      }
    } catch (err) {
      console.error("Redis cleanup error:", err.message);
    }
  }
}, 60000);

// ========================
// GRACEFUL SHUTDOWN
// ========================

async function shutdown() {
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

  // Close Redis connection
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log("Redis: Disconnected");
    } catch (err) {
      console.error("Redis: Error closing connection:", err.message);
    }
  }

  // Close WebSocket server
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

async function start() {
  // Initialize Redis
  await initRedis();

  // Load any persisted rooms from Redis
  if (redisConnected) {
    try {
      const activeRoomCodes = await getAllActiveRoomCodes();
      console.log(`Redis: Found ${activeRoomCodes.length} persisted rooms`);

      // We don't preload all rooms - they'll be loaded on demand
    } catch (err) {
      console.error("Redis: Failed to check persisted rooms:", err.message);
    }
  }

  // Start HTTP server
  server.listen(PORT, () => {
    console.log(`Flixtris Multiplayer Server v2.1 running on port ${PORT}`);
    console.log(
      `Redis: ${redisConnected ? "Connected" : "Not connected (memory-only mode)"}`,
    );
    console.log(
      `Features: Garbage lines, Reconnection, Rematch, Emojis, Redis persistence`,
    );
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}

start();
