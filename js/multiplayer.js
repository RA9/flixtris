// multiplayer.js - WebSocket multiplayer client v2.0
// Features: Garbage lines, Reconnection, Rematch, Emojis
(() => {
  const api = window.Flixtris.api;
  const IS_PROD =
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";
  const log = (...args) => {
    if (!IS_PROD) console.log(...args);
  };

  let ws = null;
  let roomCode = null;
  let playerId = null;
  let playerName = "Player";
  let opponent = null;
  let gameSeed = null;
  let isHost = false;
  let reconnectToken = null;
  let callbacks = {};
  let reconnectAttempts = 0;
  let maxReconnectAttempts = 3;
  let reconnectTimeout = null;

  // Server URL configuration
  // Can be overridden by setting window.FLIXTRIS_SERVER_URL before this script loads
  function getServerUrl() {
    // Allow manual override
    if (window.FLIXTRIS_SERVER_URL) {
      return window.FLIXTRIS_SERVER_URL;
    }

    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port;

    // Handle file:// protocol or empty hostname (local file)
    if (!hostname || protocol === "file:") {
      return "ws://localhost:3001";
    }

    // Handle localhost and 127.0.0.1
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "ws://localhost:3001";
    }

    // Handle local network IPs (192.168.x.x, 10.x.x.x, etc.)
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostname)) {
      return `ws://${hostname}:3001`;
    }

    // Production: use secure WebSocket on same host (no port needed)
    // Works for Railway, Heroku, and other platforms where WS runs on same port
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    const wsPort = port ? `:${port}` : "";
    return `${wsProtocol}//${hostname}${wsPort}`;
  }

  const SERVER_URL = getServerUrl();

  // ========================
  // CONNECTION MANAGEMENT
  // ========================

  function connect() {
    return new Promise((resolve, reject) => {
      try {
        log("Connecting to multiplayer server:", SERVER_URL);
        ws = new WebSocket(SERVER_URL);

        ws.onopen = () => {
          log("Connected to multiplayer server:", SERVER_URL);
          reconnectAttempts = 0;
          resolve();
        };

        ws.onerror = (err) => {
          console.error("WebSocket error:", err);
          reject(new Error("Failed to connect to server"));
        };

        ws.onclose = () => {
          log("Disconnected from server");
          ws = null;

          // Try to reconnect if we have a token
          if (reconnectToken && reconnectAttempts < maxReconnectAttempts) {
            attemptReconnect();
          } else if (callbacks.onDisconnect) {
            callbacks.onDisconnect();
          }
        };

        ws.onmessage = (event) => {
          handleMessage(JSON.parse(event.data));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  function attemptReconnect() {
    reconnectAttempts++;
    log(
      `Attempting reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`,
    );

    if (callbacks.onReconnecting) {
      callbacks.onReconnecting(reconnectAttempts, maxReconnectAttempts);
    }

    reconnectTimeout = setTimeout(async () => {
      try {
        await connect();
        // Send reconnect request with token
        send({ type: "reconnect", token: reconnectToken });
      } catch (err) {
        console.error("Reconnect failed:", err);
        if (reconnectAttempts >= maxReconnectAttempts) {
          if (callbacks.onReconnectFailed) {
            callbacks.onReconnectFailed();
          }
        }
      }
    }, 2000 * reconnectAttempts); // Exponential backoff
  }

  function disconnect() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    if (ws) {
      send({ type: "leave_room" });
      ws.close();
      ws = null;
    }

    roomCode = null;
    playerId = null;
    opponent = null;
    gameSeed = null;
    reconnectToken = null;
    reconnectAttempts = 0;
  }

  function send(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // ========================
  // MESSAGE HANDLING
  // ========================

  function handleMessage(message) {
    switch (message.type) {
      case "room_created":
        roomCode = message.roomCode;
        playerId = message.playerId;
        gameSeed = message.seed;
        reconnectToken = message.reconnectToken;
        isHost = true;
        saveReconnectToken();
        if (callbacks.onRoomCreated) {
          callbacks.onRoomCreated(roomCode, gameSeed);
        }
        break;

      case "room_joined":
        roomCode = message.roomCode;
        playerId = message.playerId;
        gameSeed = message.seed;
        reconnectToken = message.reconnectToken;
        opponent = message.opponent;
        isHost = false;
        saveReconnectToken();
        if (callbacks.onRoomJoined) {
          callbacks.onRoomJoined(roomCode, gameSeed, opponent);
        }
        break;

      case "reconnected":
        roomCode = message.roomCode;
        playerId = message.playerId;
        gameSeed = message.seed;
        opponent = message.opponent;
        saveReconnectToken();
        if (callbacks.onReconnected) {
          callbacks.onReconnected({
            roomCode: message.roomCode,
            seed: message.seed,
            gameStarted: message.gameStarted,
            opponent: message.opponent,
          });
        }
        break;

      case "player_joined":
        opponent = message.player;
        if (callbacks.onPlayerJoined) {
          callbacks.onPlayerJoined(opponent);
        }
        break;

      case "player_ready":
        if (callbacks.onPlayerReady) {
          callbacks.onPlayerReady(message.playerId);
        }
        break;

      case "game_start":
        if (callbacks.onGameStart) {
          callbacks.onGameStart(message.seed, message.countdown);
        }
        break;

      case "opponent_update":
        if (callbacks.onOpponentUpdate) {
          callbacks.onOpponentUpdate({
            score: message.score,
            level: message.level,
            lines: message.lines,
            board: message.board,
          });
        }
        break;

      // ========================
      // GARBAGE LINES (new!)
      // ========================
      case "incoming_garbage":
        if (callbacks.onIncomingGarbage) {
          callbacks.onIncomingGarbage({
            lines: message.lines,
            fromPlayer: message.fromPlayer,
          });
        }
        break;

      case "garbage_sent":
        if (callbacks.onGarbageSent) {
          callbacks.onGarbageSent({
            lines: message.lines,
            toPlayer: message.toPlayer,
          });
        }
        break;

      // ========================
      // GAME OVER
      // ========================
      case "player_game_over":
        if (callbacks.onPlayerGameOver) {
          callbacks.onPlayerGameOver({
            playerId: message.playerId,
            score: message.score,
            allDone: message.allDone,
            winner: message.winner,
            results: message.results,
          });
        }
        break;

      // ========================
      // REMATCH (new!)
      // ========================
      case "rematch_requested":
        if (callbacks.onRematchRequested) {
          callbacks.onRematchRequested(message.playerId);
        }
        break;

      case "rematch_declined":
        if (callbacks.onRematchDeclined) {
          callbacks.onRematchDeclined(message.playerId);
        }
        break;

      case "rematch_starting":
        gameSeed = message.seed;
        if (callbacks.onRematchStarting) {
          callbacks.onRematchStarting(message.seed);
        }
        break;

      // ========================
      // EMOJIS (new!)
      // ========================
      case "emoji_received":
        if (callbacks.onEmojiReceived) {
          callbacks.onEmojiReceived({
            playerId: message.playerId,
            emoji: message.emoji,
          });
        }
        break;

      // ========================
      // PLAYER STATUS
      // ========================
      case "player_left":
        if (callbacks.onPlayerLeft) {
          callbacks.onPlayerLeft(message.playerId);
        }
        break;

      case "player_disconnected":
        if (callbacks.onPlayerDisconnected) {
          callbacks.onPlayerDisconnected({
            playerId: message.playerId,
            canReconnect: message.canReconnect,
          });
        }
        break;

      case "player_reconnected":
        if (callbacks.onPlayerReconnected) {
          callbacks.onPlayerReconnected(message.playerId);
        }
        break;

      // ========================
      // ERRORS & SERVER EVENTS
      // ========================
      case "error":
        if (callbacks.onError) {
          callbacks.onError(message.message);
        }
        break;

      case "room_expired":
        clearReconnectToken();
        if (callbacks.onRoomExpired) {
          callbacks.onRoomExpired();
        }
        break;

      case "server_shutdown":
        if (callbacks.onServerShutdown) {
          callbacks.onServerShutdown(message.message);
        }
        break;
    }
  }

  // ========================
  // RECONNECT TOKEN STORAGE
  // ========================

  function saveReconnectToken() {
    if (reconnectToken) {
      try {
        localStorage.setItem(
          "flixtris_mp_token",
          JSON.stringify({
            token: reconnectToken,
            roomCode: roomCode,
            playerId: playerId,
            playerName: playerName,
            savedAt: Date.now(),
          }),
        );
      } catch (e) {
        // localStorage might not be available
      }
    }
  }

  function loadReconnectToken() {
    try {
      const data = localStorage.getItem("flixtris_mp_token");
      if (data) {
        const parsed = JSON.parse(data);
        // Token valid for 30 minutes
        if (Date.now() - parsed.savedAt < 30 * 60 * 1000) {
          return parsed;
        }
        clearReconnectToken();
      }
    } catch (e) {
      // localStorage might not be available
    }
    return null;
  }

  function clearReconnectToken() {
    reconnectToken = null;
    try {
      localStorage.removeItem("flixtris_mp_token");
    } catch (e) {
      // localStorage might not be available
    }
  }

  // ========================
  // PUBLIC API - ROOM MANAGEMENT
  // ========================

  async function createRoom(name) {
    playerName = name || "Player 1";
    await connect();
    send({ type: "create_room", name: playerName });
  }

  async function joinRoom(code, name) {
    playerName = name || "Player 2";
    await connect();
    send({ type: "join_room", roomCode: code.toUpperCase(), name: playerName });
  }

  async function tryReconnect() {
    const savedToken = loadReconnectToken();
    if (!savedToken) {
      return false;
    }

    reconnectToken = savedToken.token;
    playerName = savedToken.playerName;

    try {
      await connect();
      send({ type: "reconnect", token: reconnectToken });
      return true;
    } catch (err) {
      clearReconnectToken();
      return false;
    }
  }

  function setReady() {
    send({ type: "ready" });
  }

  // ========================
  // PUBLIC API - GAME UPDATES
  // ========================

  function sendGameUpdate(score, level, lines, board) {
    send({
      type: "game_update",
      score,
      level,
      lines,
      board,
    });
  }

  function sendGameOver(score, level, lines) {
    send({
      type: "game_over",
      score,
      level,
      lines,
    });
  }

  // ========================
  // PUBLIC API - GARBAGE LINES (new!)
  // ========================

  function sendGarbage(linesCleared) {
    if (linesCleared > 0) {
      send({
        type: "send_garbage",
        lines: linesCleared,
      });
    }
  }

  // ========================
  // PUBLIC API - REMATCH (new!)
  // ========================

  function requestRematch() {
    send({ type: "request_rematch" });
  }

  function declineRematch() {
    send({ type: "decline_rematch" });
  }

  // ========================
  // PUBLIC API - EMOJIS (new!)
  // ========================

  const VALID_EMOJIS = ["👍", "👎", "😀", "😢", "🔥", "❄️", "💀", "🎉"];

  function sendEmoji(emoji) {
    if (VALID_EMOJIS.includes(emoji)) {
      send({ type: "send_emoji", emoji });
    }
  }

  function getValidEmojis() {
    return [...VALID_EMOJIS];
  }

  // ========================
  // PUBLIC API - CALLBACKS
  // ========================

  function on(event, callback) {
    callbacks[event] = callback;
  }

  function off(event) {
    delete callbacks[event];
  }

  // ========================
  // PUBLIC API - STATE GETTERS
  // ========================

  function isConnected() {
    return ws && ws.readyState === WebSocket.OPEN;
  }

  function getRoomCode() {
    return roomCode;
  }

  function getPlayerId() {
    return playerId;
  }

  function getOpponent() {
    return opponent;
  }

  function getSeed() {
    return gameSeed;
  }

  function isHostPlayer() {
    return isHost;
  }

  function hasReconnectToken() {
    return loadReconnectToken() !== null;
  }

  // ========================
  // EXPORT API
  // ========================

  api.multiplayer = {
    // Connection
    connect,
    disconnect,
    tryReconnect,
    hasReconnectToken,

    // Room management
    createRoom,
    joinRoom,
    setReady,

    // Game updates
    sendGameUpdate,
    sendGameOver,

    // Garbage lines
    sendGarbage,

    // Rematch
    requestRematch,
    declineRematch,

    // Emojis
    sendEmoji,
    getValidEmojis,

    // Callbacks
    on,
    off,

    // State getters
    isConnected,
    getRoomCode,
    getPlayerId,
    getOpponent,
    getSeed,
    isHostPlayer,
  };
})();
