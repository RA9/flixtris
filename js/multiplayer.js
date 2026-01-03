// multiplayer.js - WebSocket multiplayer client
(() => {
  const api = window.Flixtris.api;

  let ws = null;
  let roomCode = null;
  let playerId = null;
  let playerName = "Player";
  let opponent = null;
  let gameSeed = null;
  let isHost = false;
  let callbacks = {};

  const SERVER_URL = window.location.hostname === "localhost"
    ? "ws://localhost:3001"
    : `wss://${window.location.hostname}:3001`;

  function connect() {
    return new Promise((resolve, reject) => {
      try {
        ws = new WebSocket(SERVER_URL);

        ws.onopen = () => {
          console.log("Connected to multiplayer server");
          resolve();
        };

        ws.onerror = (err) => {
          console.error("WebSocket error:", err);
          reject(new Error("Failed to connect to server"));
        };

        ws.onclose = () => {
          console.log("Disconnected from server");
          if (callbacks.onDisconnect) {
            callbacks.onDisconnect();
          }
          ws = null;
        };

        ws.onmessage = (event) => {
          handleMessage(JSON.parse(event.data));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  function disconnect() {
    if (ws) {
      send({ type: "leave_room" });
      ws.close();
      ws = null;
    }
    roomCode = null;
    playerId = null;
    opponent = null;
    gameSeed = null;
  }

  function send(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  function handleMessage(message) {
    switch (message.type) {
      case "room_created":
        roomCode = message.roomCode;
        playerId = message.playerId;
        gameSeed = message.seed;
        isHost = true;
        if (callbacks.onRoomCreated) {
          callbacks.onRoomCreated(roomCode, gameSeed);
        }
        break;

      case "room_joined":
        roomCode = message.roomCode;
        playerId = message.playerId;
        gameSeed = message.seed;
        opponent = message.opponent;
        isHost = false;
        if (callbacks.onRoomJoined) {
          callbacks.onRoomJoined(roomCode, gameSeed, opponent);
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

      case "player_left":
      case "player_disconnected":
        if (callbacks.onPlayerLeft) {
          callbacks.onPlayerLeft(message.playerId);
        }
        break;

      case "error":
        if (callbacks.onError) {
          callbacks.onError(message.message);
        }
        break;

      case "room_expired":
        if (callbacks.onRoomExpired) {
          callbacks.onRoomExpired();
        }
        break;
    }
  }

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

  function setReady() {
    send({ type: "ready" });
  }

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

  function on(event, callback) {
    callbacks[event] = callback;
  }

  function off(event) {
    delete callbacks[event];
  }

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

  api.multiplayer = {
    connect,
    disconnect,
    createRoom,
    joinRoom,
    setReady,
    sendGameUpdate,
    sendGameOver,
    on,
    off,
    isConnected,
    getRoomCode,
    getPlayerId,
    getOpponent,
    getSeed,
    isHostPlayer,
  };
})();
