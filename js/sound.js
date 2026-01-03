// sound.js - Retro sound effects using Web Audio API
(() => {
  let audioCtx = null;
  let enabled = true;

  function getContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function resumeContext() {
    const ctx = getContext();
    if (ctx.state === "suspended") {
      ctx.resume();
    }
  }

  function playTone(frequency, duration, type = "square", volume = 0.3) {
    if (!enabled) return;

    const ctx = getContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  }

  function playNoise(duration, volume = 0.2) {
    if (!enabled) return;

    const ctx = getContext();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    noise.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = 1000;

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    noise.start(ctx.currentTime);
    noise.stop(ctx.currentTime + duration);
  }

  // Sound effects
  const sounds = {
    move() {
      playTone(200, 0.05, "square", 0.15);
    },

    rotate() {
      playTone(300, 0.08, "square", 0.2);
      setTimeout(() => playTone(400, 0.05, "square", 0.15), 30);
    },

    softDrop() {
      playTone(150, 0.03, "square", 0.1);
    },

    hardDrop() {
      playTone(100, 0.1, "square", 0.3);
      playNoise(0.1, 0.15);
    },

    lock() {
      playTone(180, 0.08, "triangle", 0.2);
    },

    lineClear() {
      playTone(523, 0.1, "square", 0.25);
      setTimeout(() => playTone(659, 0.1, "square", 0.25), 80);
      setTimeout(() => playTone(784, 0.15, "square", 0.25), 160);
    },

    tetris() {
      // Special sound for 4-line clear
      playTone(523, 0.1, "square", 0.3);
      setTimeout(() => playTone(659, 0.1, "square", 0.3), 100);
      setTimeout(() => playTone(784, 0.1, "square", 0.3), 200);
      setTimeout(() => playTone(1047, 0.2, "square", 0.3), 300);
    },

    gameOver() {
      playTone(392, 0.2, "square", 0.3);
      setTimeout(() => playTone(330, 0.2, "square", 0.3), 200);
      setTimeout(() => playTone(262, 0.4, "square", 0.3), 400);
    },

    menuSelect() {
      playTone(440, 0.08, "square", 0.2);
      setTimeout(() => playTone(880, 0.1, "square", 0.2), 50);
    },

    pause() {
      playTone(440, 0.15, "triangle", 0.2);
    }
  };

  // Enable/disable sounds
  function setEnabled(value) {
    enabled = value;
  }

  function isEnabled() {
    return enabled;
  }

  window.Flixtris.api.sound = {
    ...sounds,
    setEnabled,
    isEnabled,
    resumeContext,
  };
})();
