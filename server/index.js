const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const redis = require("redis");

const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === "production";
// In production (Docker), files are in ../public. Locally, they're in the parent dir.
const STATIC_DIR = IS_PROD
  ? path.join(__dirname, "../public")
  : path.join(__dirname, "..");

// Logger that respects environment
const log = (...args) => {
  if (!IS_PROD) console.log(...args);
};

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
      log("Redis: Connected");
      redisConnected = true;
    });

    redisClient.on("reconnecting", () => {
      log("Redis: Reconnecting...");
    });

    await redisClient.connect();
    log(`Redis: Connected to ${REDIS_URL}`);
    return true;
  } catch (err) {
    console.error("Redis: Failed to connect:", err.message);
    log("Redis: Running in memory-only mode (no persistence)");
    return false;
  }
}

// ========================
// REDIS KEYS
// ========================

const KEYS = {
  room: (code) => `flixtris:room:${code}`,
  roomPlayers: (code) => `flixtris:room:${code}:players`,
  roomHistory: (code) => `flixtris:room:${code}:history`,
  reconnectToken: (token) => `flixtris:reconnect:${token}`,
  activeRooms: "flixtris:rooms:active",
  // Player stats
  playerStats: (name) => `flixtris:player:${name}:stats`,
  // Leaderboards
  leaderboardGlobal: "flixtris:leaderboard:global",
  leaderboardDaily: (date) => `flixtris:leaderboard:daily:${date}`,
  leaderboardWeekly: "flixtris:leaderboard:weekly",
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
      type: room.type || "1v1",
      maxPlayers: room.maxPlayers || 2,
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
      eliminated: p.eliminated || false,
      eliminatedAt: p.eliminatedAt || null,
      placement: p.placement || null,
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
// PLAYER STATS & LEADERBOARDS
// ========================

async function updatePlayerStats(playerName, score, isWin = null) {
  if (!redisConnected || !playerName) return;

  try {
    const key = KEYS.playerStats(playerName);
    await redisClient.hIncrBy(key, "games", 1);
    await redisClient.hIncrBy(key, "totalScore", score);

    // Update best score if higher
    const currentBest = await redisClient.hGet(key, "bestScore");
    if (!currentBest || score > parseInt(currentBest)) {
      await redisClient.hSet(key, "bestScore", score);
    }

    if (isWin === true) {
      await redisClient.hIncrBy(key, "wins", 1);
    } else if (isWin === false) {
      await redisClient.hIncrBy(key, "losses", 1);
    }
  } catch (err) {
    console.error("Redis: Failed to update player stats:", err.message);
  }
}

async function getPlayerStats(playerName) {
  if (!redisConnected || !playerName) return null;

  try {
    const stats = await redisClient.hGetAll(KEYS.playerStats(playerName));
    if (!stats || Object.keys(stats).length === 0) return null;
    return {
      games: parseInt(stats.games) || 0,
      totalScore: parseInt(stats.totalScore) || 0,
      bestScore: parseInt(stats.bestScore) || 0,
      wins: parseInt(stats.wins) || 0,
      losses: parseInt(stats.losses) || 0,
    };
  } catch (err) {
    console.error("Redis: Failed to get player stats:", err.message);
    return null;
  }
}

function getDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function submitScore(playerName, score, mode, seed = null) {
  if (!redisConnected || !playerName) return false;

  try {
    const timestamp = Date.now();
    const scoreData = JSON.stringify({
      playerName,
      score,
      mode,
      seed,
      timestamp,
    });

    // Global leaderboard - use score as the sorted set score
    await redisClient.zAdd(KEYS.leaderboardGlobal, {
      score: score,
      value: `${playerName}:${timestamp}`,
    });

    // Daily leaderboard (only for daily mode or all modes)
    const dateKey = getDateKey();
    await redisClient.zAdd(KEYS.leaderboardDaily(dateKey), {
      score: score,
      value: `${playerName}:${timestamp}`,
    });
    // Set TTL of 48 hours on daily leaderboard
    await redisClient.expire(KEYS.leaderboardDaily(dateKey), 48 * 60 * 60);

    // Weekly leaderboard
    await redisClient.zAdd(KEYS.leaderboardWeekly, {
      score: score,
      value: `${playerName}:${timestamp}`,
    });

    // Update player stats
    await updatePlayerStats(playerName, score);

    return true;
  } catch (err) {
    console.error("Redis: Failed to submit score:", err.message);
    return false;
  }
}

async function getLeaderboard(type = "global", limit = 50, date = null) {
  if (!redisConnected) return [];

  try {
    let key;
    if (type === "daily") {
      key = KEYS.leaderboardDaily(date || getDateKey());
    } else if (type === "weekly") {
      key = KEYS.leaderboardWeekly;
    } else {
      key = KEYS.leaderboardGlobal;
    }

    // Get top scores (highest first)
    const results = await redisClient.zRangeWithScores(key, 0, limit - 1, {
      REV: true,
    });

    return results.map((entry, index) => {
      const [playerName] = entry.value.split(":");
      return {
        rank: index + 1,
        playerName,
        score: entry.score,
      };
    });
  } catch (err) {
    console.error("Redis: Failed to get leaderboard:", err.message);
    return [];
  }
}

async function addRoomHistory(roomCode, matchData) {
  if (!redisConnected) return;

  try {
    const key = KEYS.roomHistory(roomCode);
    await redisClient.lPush(key, JSON.stringify(matchData));
    await redisClient.lTrim(key, 0, 9); // Keep only last 10 matches
    await redisClient.expire(key, 24 * 60 * 60); // 24 hour TTL
  } catch (err) {
    console.error("Redis: Failed to add room history:", err.message);
  }
}

async function getRoomHistory(roomCode) {
  if (!redisConnected) return [];

  try {
    const history = await redisClient.lRange(KEYS.roomHistory(roomCode), 0, 9);
    return history.map((h) => JSON.parse(h));
  } catch (err) {
    console.error("Redis: Failed to get room history:", err.message);
    return [];
  }
}

// Reset weekly leaderboard (should be called by cron on Sunday)
async function resetWeeklyLeaderboard() {
  if (!redisConnected) return;

  try {
    await redisClient.del(KEYS.leaderboardWeekly);
    log("Weekly leaderboard reset");
  } catch (err) {
    console.error("Redis: Failed to reset weekly leaderboard:", err.message);
  }
}

// ========================
// HTTP & WEBSOCKET SERVER
// ========================

// Helper to parse JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

// Helper to send JSON response
function sendJSON(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // Health check endpoint
  if (pathname === "/health") {
    sendJSON(res, {
      status: "ok",
      redis: redisConnected ? "connected" : "disconnected",
      rooms: rooms.size,
      uptime: process.uptime(),
    });
    return;
  }

  // ========================
  // LEADERBOARD API
  // ========================

  // GET /api/leaderboard/global?limit=50
  if (pathname === "/api/leaderboard/global" && req.method === "GET") {
    const limit = parseInt(url.searchParams.get("limit")) || 50;
    const leaderboard = await getLeaderboard("global", limit);
    sendJSON(res, { leaderboard });
    return;
  }

  // GET /api/leaderboard/daily?date=YYYY-MM-DD&limit=50
  if (pathname === "/api/leaderboard/daily" && req.method === "GET") {
    const limit = parseInt(url.searchParams.get("limit")) || 50;
    const date = url.searchParams.get("date") || getDateKey();
    const leaderboard = await getLeaderboard("daily", limit, date);
    sendJSON(res, { leaderboard, date });
    return;
  }

  // GET /api/leaderboard/weekly?limit=50
  if (pathname === "/api/leaderboard/weekly" && req.method === "GET") {
    const limit = parseInt(url.searchParams.get("limit")) || 50;
    const leaderboard = await getLeaderboard("weekly", limit);
    sendJSON(res, { leaderboard });
    return;
  }

  // POST /api/score - Submit a score
  if (pathname === "/api/score" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const { playerName, score, mode, seed } = body;

      if (!playerName || typeof score !== "number") {
        sendJSON(res, { error: "Invalid request" }, 400);
        return;
      }

      const success = await submitScore(playerName, score, mode, seed);
      sendJSON(res, { success });
    } catch (err) {
      sendJSON(res, { error: "Invalid JSON" }, 400);
    }
    return;
  }

  // GET /api/player/:name/stats
  if (
    pathname.startsWith("/api/player/") &&
    pathname.endsWith("/stats") &&
    req.method === "GET"
  ) {
    const playerName = decodeURIComponent(pathname.split("/")[3]);
    const stats = await getPlayerStats(playerName);
    sendJSON(res, { stats });
    return;
  }

  // GET /api/room/:code/history
  if (
    pathname.startsWith("/api/room/") &&
    pathname.endsWith("/history") &&
    req.method === "GET"
  ) {
    const roomCode = pathname.split("/")[3].toUpperCase();
    const history = await getRoomHistory(roomCode);
    sendJSON(res, { history });
    return;
  }

  // Serve static files
  let filePath = pathname === "/" ? "/index.html" : pathname;
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

const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket upgrade
server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

// In-memory room storage (Redis is for persistence, not real-time)
const rooms = new Map();

// Room configuration
const ROOM_TYPES = {
  "1v1": { minPlayers: 2, maxPlayers: 2 },
  royale: { minPlayers: 2, maxPlayers: 16 },
};

const DEFAULT_ROOM_TYPE = "1v1";

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

async function createRoom(playerName, ws, roomType = "1v1") {
  const roomCode = generateRoomCode();
  const seed = generateGameSeed();
  const reconnectToken = generateReconnectToken();
  const playerId = "player1";

  // Get room type config
  const typeConfig = ROOM_TYPES[roomType] || ROOM_TYPES["1v1"];

  const room = {
    code: roomCode,
    seed: seed,
    type: roomType,
    maxPlayers: typeConfig.maxPlayers,
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
        eliminated: false,
        eliminatedAt: null,
        placement: null,
      },
    ],
    started: false,
    createdAt: Date.now(),
    pendingGarbage: new Map(),
    // Royale-specific fields
    alivePlayers: new Set([playerId]),
    eliminationOrder: [],
    spectators: new Set(),
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

  const maxPlayers = room.maxPlayers || 2;
  if (room.players.length >= maxPlayers) {
    return { error: "Room is full" };
  }

  if (room.started) {
    return { error: "Game already started" };
  }

  const reconnectToken = generateReconnectToken();
  const playerNum = room.players.length + 1;
  const playerId = `player${playerNum}`;

  room.players.push({
    id: playerId,
    name: playerName || `Player ${playerNum}`,
    ws: ws,
    score: 0,
    level: 1,
    lines: 0,
    board: null,
    ready: false,
    gameOver: false,
    reconnectToken: reconnectToken,
    eliminated: false,
    eliminatedAt: null,
    placement: null,
  });

  // Add to alive players set
  if (!room.alivePlayers) {
    room.alivePlayers = new Set(room.players.map((p) => p.id));
  } else {
    room.alivePlayers.add(playerId);
  }

  // Save to Redis
  await saveRoom(room);
  await saveReconnectToken(reconnectToken, {
    roomCode: roomCode,
    playerId: playerId,
    playerName: playerName || `Player ${playerNum}`,
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
    log(`Room ${roomCode} deleted (empty)`);
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

        log(`Player ${playerId} reconnected to room ${currentRoom}`);
        break;
      }

      // ========================
      // ROOM CREATION
      // ========================
      case "create_room": {
        const roomType = message.roomType || "1v1";
        const result = await createRoom(message.name, ws, roomType);
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
            roomType: room.type,
            maxPlayers: room.maxPlayers,
          }),
        );

        log(
          `Room ${room.code} (${room.type}, max ${room.maxPlayers}) created by ${message.name || "Player 1"}`,
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

        // Build list of all other players (opponents)
        const otherPlayers = room.players
          .filter((p) => p.id !== playerId)
          .map((p) => ({
            id: p.id,
            name: p.name,
            ready: p.ready,
          }));

        ws.send(
          JSON.stringify({
            type: "room_joined",
            roomCode: currentRoom,
            playerId: playerId,
            seed: room.seed,
            reconnectToken: reconnectToken,
            roomType: room.type,
            maxPlayers: room.maxPlayers,
            players: otherPlayers,
            // Keep backward compatibility
            opponent:
              otherPlayers.length > 0
                ? { id: otherPlayers[0].id, name: otherPlayers[0].name }
                : null,
          }),
        );

        const playerNum = room.players.length;
        broadcastToRoom(
          currentRoom,
          {
            type: "player_joined",
            player: {
              id: playerId,
              name: message.name || `Player ${playerNum}`,
            },
            playerCount: room.players.length,
            maxPlayers: room.maxPlayers,
          },
          ws,
        );

        log(
          `${message.name || `Player ${playerNum}`} joined room ${currentRoom} (${room.players.length}/${room.maxPlayers})`,
        );
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

        const readyCount = room.players.filter((p) => p.ready).length;
        const totalPlayers = room.players.length;
        const minPlayers = ROOM_TYPES[room.type]?.minPlayers || 2;

        // Start game when all players are ready and we have minimum players
        const canStart =
          totalPlayers >= minPlayers && room.players.every((p) => p.ready);

        if (canStart) {
          room.started = true;
          room.pendingGarbage = new Map();

          // Initialize alive players set for royale
          room.alivePlayers = new Set(room.players.map((p) => p.id));
          room.eliminationOrder = [];

          await saveRoom(room);

          // Send game start with all player info
          const playerList = room.players.map((p) => ({
            id: p.id,
            name: p.name,
          }));

          broadcastToRoom(currentRoom, {
            type: "game_start",
            seed: room.seed,
            countdown: 3,
            players: playerList,
            roomType: room.type,
          });

          log(
            `Game started in room ${currentRoom} (${room.type}, ${totalPlayers} players)`,
          );
        } else {
          await saveRoom(room);

          broadcastToRoom(currentRoom, {
            type: "player_ready",
            playerId: playerId,
            readyCount: readyCount,
            totalPlayers: totalPlayers,
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
          if (room.type === "royale") {
            // Royale mode: distribute garbage to all alive opponents
            const aliveOpponents = room.players.filter(
              (p) =>
                p.id !== playerId &&
                !p.eliminated &&
                !p.gameOver &&
                room.alivePlayers?.has(p.id),
            );

            if (aliveOpponents.length > 0) {
              // Round-robin: each opponent gets garbage
              aliveOpponents.forEach((opponent) => {
                sendToPlayer(opponent, {
                  type: "incoming_garbage",
                  lines: garbage,
                  fromPlayer: playerId,
                });
              });

              ws.send(
                JSON.stringify({
                  type: "garbage_sent",
                  lines: garbage,
                  toPlayers: aliveOpponents.map((p) => p.id),
                }),
              );

              log(
                `${playerId} sent ${garbage} garbage lines to ${aliveOpponents.length} opponents`,
              );
            }
          } else {
            // 1v1 mode: send to single opponent
            const opponent = room.players.find(
              (p) => p.id !== playerId && !p.gameOver,
            );
            if (opponent) {
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

              log(
                `${playerId} sent ${garbage} garbage lines to ${opponent.id}`,
              );
            }
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
        if (!player) return;

        player.gameOver = true;
        player.score = message.score;
        player.level = message.level;
        player.lines = message.lines;

        if (room.type === "royale") {
          // Royale mode: handle elimination
          player.eliminated = true;
          player.eliminatedAt = Date.now();

          // Remove from alive players
          if (room.alivePlayers) {
            room.alivePlayers.delete(playerId);
          }

          // Add to elimination order (first eliminated = last place)
          if (!room.eliminationOrder) {
            room.eliminationOrder = [];
          }
          room.eliminationOrder.push(playerId);

          // Calculate placement (reverse of elimination order)
          const totalPlayers = room.players.length;
          player.placement = totalPlayers - room.eliminationOrder.length + 1;

          // Add to spectators
          if (!room.spectators) {
            room.spectators = new Set();
          }
          room.spectators.add(playerId);

          const aliveCount = room.alivePlayers?.size || 0;

          // Broadcast elimination
          broadcastToRoom(currentRoom, {
            type: "player_eliminated",
            playerId: playerId,
            playerName: player.name,
            score: message.score,
            placement: player.placement,
            aliveCount: aliveCount,
            totalPlayers: totalPlayers,
          });

          log(
            `${player.name} eliminated in room ${currentRoom} (${player.placement}/${totalPlayers}, ${aliveCount} remaining)`,
          );

          // Check if game is over (1 or 0 players remaining)
          if (aliveCount <= 1) {
            // Find the winner (last alive player)
            const winner = room.players.find(
              (p) => room.alivePlayers?.has(p.id) && !p.eliminated,
            );

            if (winner) {
              winner.placement = 1;
              winner.gameOver = true;
            }

            // Build final standings
            const standings = room.players
              .map((p) => ({
                id: p.id,
                name: p.name,
                score: p.score,
                level: p.level,
                lines: p.lines,
                placement: p.placement || 1,
                eliminated: p.eliminated || false,
              }))
              .sort((a, b) => a.placement - b.placement);

            await saveRoom(room);

            broadcastToRoom(currentRoom, {
              type: "royale_results",
              winner: winner
                ? { id: winner.id, name: winner.name, score: winner.score }
                : null,
              standings: standings,
            });

            // Save royale match to room history
            const matchData = {
              matchId: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
              timestamp: Date.now(),
              type: "royale",
              winner: winner
                ? { id: winner.id, name: winner.name, score: winner.score }
                : null,
              standings: standings,
            };
            await addRoomHistory(currentRoom, matchData);

            log(
              `Royale ended in room ${currentRoom}. Winner: ${winner?.name || "none"}`,
            );
          } else {
            await saveRoom(room);

            // Send spectator mode to eliminated player
            sendToPlayer(player, {
              type: "spectating",
              alivePlayers: room.players
                .filter((p) => room.alivePlayers?.has(p.id))
                .map((p) => ({
                  id: p.id,
                  name: p.name,
                  score: p.score,
                })),
            });
          }
        } else {
          // 1v1 mode: original logic
          const allDone = room.players.every((p) => p.gameOver);

          await saveRoom(room);

          const winner = allDone
            ? room.players.reduce((a, b) => (a.score > b.score ? a : b))
            : null;

          broadcastToRoom(currentRoom, {
            type: "player_game_over",
            playerId: playerId,
            score: message.score,
            level: message.level,
            lines: message.lines,
            allDone: allDone,
            winner: winner?.id || null,
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

          // Save match to room history when game ends
          if (allDone && winner) {
            const matchData = {
              matchId: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
              timestamp: Date.now(),
              winner: { id: winner.id, name: winner.name, score: winner.score },
              players: room.players.map((p) => ({
                id: p.id,
                name: p.name,
                score: p.score,
                level: p.level,
                lines: p.lines,
              })),
            };
            await addRoomHistory(currentRoom, matchData);
          }

          log(
            `${playerId} game over in room ${currentRoom} (score: ${message.score})`,
          );
        }
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

        const rematchCount = room.players.filter((p) => p.wantsRematch).length;
        const allWantRematch = room.players.every((p) => p.wantsRematch);

        if (allWantRematch && room.players.length >= 2) {
          const newSeed = generateGameSeed();
          room.seed = newSeed;
          room.started = false;
          room.pendingGarbage = new Map();

          // Reset all player states
          room.players.forEach((p) => {
            p.score = 0;
            p.level = 1;
            p.lines = 0;
            p.board = null;
            p.ready = false;
            p.gameOver = false;
            p.wantsRematch = false;
            p.eliminated = false;
            p.eliminatedAt = null;
            p.placement = null;
          });

          // Reset royale-specific fields
          room.alivePlayers = new Set(room.players.map((p) => p.id));
          room.eliminationOrder = [];
          room.spectators = new Set();

          await saveRoom(room);

          broadcastToRoom(currentRoom, {
            type: "rematch_starting",
            seed: newSeed,
            players: room.players.map((p) => ({ id: p.id, name: p.name })),
          });

          log(`Rematch starting in room ${currentRoom}`);
        } else {
          await saveRoom(room);

          broadcastToRoom(
            currentRoom,
            {
              type: "rematch_requested",
              playerId: playerId,
              rematchCount: rematchCount,
              totalPlayers: room.players.length,
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

          log(
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
                // Check if game was in progress (1v1 mode)
                if (
                  room.started &&
                  room.type === "1v1" &&
                  room.players.length === 2
                ) {
                  // Award win to remaining player
                  const remainingPlayer = room.players.find(
                    (p) => p.id !== pId && p.ws,
                  );
                  if (remainingPlayer) {
                    const leavingPlayer = player;

                    // Send game results - remaining player wins by forfeit
                    broadcastToRoom(roomCode, {
                      type: "player_game_over",
                      playerId: pId,
                      score: leavingPlayer.score || 0,
                      level: leavingPlayer.level || 1,
                      lines: leavingPlayer.lines || 0,
                      allDone: true,
                      winner: remainingPlayer.id,
                      forfeit: true,
                      results: [
                        {
                          id: remainingPlayer.id,
                          name: remainingPlayer.name,
                          score: remainingPlayer.score || 0,
                          level: remainingPlayer.level || 1,
                          lines: remainingPlayer.lines || 0,
                        },
                        {
                          id: leavingPlayer.id,
                          name: leavingPlayer.name,
                          score: leavingPlayer.score || 0,
                          level: leavingPlayer.level || 1,
                          lines: leavingPlayer.lines || 0,
                          forfeited: true,
                        },
                      ],
                    });

                    log(
                      `${pId} forfeited in room ${roomCode}, ${remainingPlayer.id} wins`,
                    );
                  }
                } else {
                  // Game not started or not 1v1, just notify player left
                  broadcastToRoom(roomCode, {
                    type: "player_left",
                    playerId: pId,
                  });
                }

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
      log(`Room ${code} expired (memory)`);
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
  log("Shutting down...");

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
      log("Redis: Disconnected");
    } catch (err) {
      console.error("Redis: Error closing connection:", err.message);
    }
  }

  // Close WebSocket server
  wss.close(() => {
    server.close(() => {
      log("Server closed");
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
      log(`Redis: Found ${activeRoomCodes.length} persisted rooms`);

      // We don't preload all rooms - they'll be loaded on demand
    } catch (err) {
      console.error("Redis: Failed to check persisted rooms:", err.message);
    }
  }

  // Start HTTP server
  server.listen(PORT, () => {
    log(`Flixtris Multiplayer Server v2.1 running on port ${PORT}`);
    log(
      `Redis: ${redisConnected ? "Connected" : "Not connected (memory-only mode)"}`,
    );
    log(
      `Features: Garbage lines, Reconnection, Rematch, Emojis, Redis persistence`,
    );
    log(`Health check: http://localhost:${PORT}/health`);
  });
}

start();
