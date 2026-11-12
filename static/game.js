"use strict";

(() => {
  const WIDTH = 960;
  const HEIGHT = 540;
  const PADDLE_WIDTH = 14;
  const PADDLE_HEIGHT = 102;
  const PADDLE_OFFSET = 49;
  const BALL_RADIUS = 9;
  const PLAYER_SPEED = 550;
  const WIN_SCORE = Number(document.querySelector(".app-shell").dataset.winScore) || 7;
  const CPU_SPEED = { easy: 255, normal: 375, hard: 485 };

  const canvas = document.getElementById("pong");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const el = (id) => document.getElementById(id);
  const overlay = el("overlay");
  const startButton = el("startButton");
  const pauseButton = el("pauseButton");
  const resetButton = el("resetButton");
  const soundButton = el("soundButton");
  const modeSelect = el("mode");
  const difficultySelect = el("difficulty");
  const statusLabel = el("statusLabel");
  const statusDot = el("statusDot");

  const left = { x: PADDLE_OFFSET, y: (HEIGHT - PADDLE_HEIGHT) / 2, previousY: 0 };
  const right = { x: WIDTH - PADDLE_OFFSET - PADDLE_WIDTH, y: (HEIGHT - PADDLE_HEIGHT) / 2, previousY: 0 };
  const ball = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, trail: [] };
  const keys = new Set();
  const state = {
    phase: "idle", // idle | playing | paused | finished
    scores: [0, 0],
    rally: 0,
    bestRally: loadBest(),
    serveCountdown: 0,
    serves: 0,
    aiOffset: 0,
    audioEnabled: false,
    audioContext: null,
    pointerY: null,
    pointerActive: false,
    winner: -1,
  };

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function loadBest() {
    try {
      return Number(localStorage.getItem("go-pong-best-rally")) || 0;
    } catch {
      return 0;
    }
  }

  function storeBest() {
    try {
      localStorage.setItem("go-pong-best-rally", String(state.bestRally));
    } catch {
      // Storage may be disabled; the game still works.
    }
  }

  function displayNumber(value) {
    return String(value).padStart(2, "0");
  }

  function syncHUD() {
    el("leftScore").textContent = state.scores[0];
    el("rightScore").textContent = state.scores[1];
    el("rallyCount").textContent = displayNumber(state.rally);
    el("bestRally").textContent = displayNumber(state.bestRally);
    const cpuMode = modeSelect.value === "cpu";
    el("playerLabel").textContent = cpuMode ? "YOU" : "P1";
    el("opponentLabel").textContent = cpuMode ? "CPU" : "P2";
    el("leftHelp").textContent = cpuMode ? "MOVE PADDLE" : "LEFT PADDLE";
    el("touchHelp").textContent = cpuMode
      ? "On touch devices, drag your finger in the court to move your paddle."
      : "In two-player mode, Player 1 uses W / S and Player 2 uses ↑ / ↓.";
    difficultySelect.disabled = !cpuMode;
    el("onePlayerKeys").hidden = !cpuMode;
    el("player2Controls").hidden = cpuMode;

    pauseButton.disabled = state.phase === "idle" || state.phase === "finished";
    el("pauseLabel").textContent = state.phase === "paused" ? "RESUME" : "PAUSE";
    statusDot.classList.toggle("playing", state.phase === "playing");
    statusDot.classList.toggle("stopped", state.phase === "finished");
    statusLabel.textContent = {
      idle: "READY TO PLAY",
      playing: state.serveCountdown > 0 ? "GET READY" : "MATCH IN PROGRESS",
      paused: "GAME PAUSED",
      finished: "MATCH FINISHED",
    }[state.phase];
  }

  function setOverlay(eyebrow, title, description, action, hint) {
    el("overlayEyebrow").textContent = eyebrow;
    el("overlayTitle").textContent = title;
    el("overlayText").textContent = description;
    startButton.innerHTML = `${action} <span aria-hidden="true">↗</span>`;
    overlay.querySelector(".overlay-hint").textContent = hint;
    overlay.hidden = false;
  }

  function resetMatch() {
    state.phase = "idle";
    state.scores = [0, 0];
    state.rally = 0;
    state.winner = -1;
    state.serves = 0;
    state.pointerY = null;
    state.pointerActive = false;
    left.y = right.y = (HEIGHT - PADDLE_HEIGHT) / 2;
    resetBall();
    state.serveCountdown = 0;
    setOverlay("THE COURT IS YOURS", "GAME ON.", "Test your reflexes. Own the rally.", "START GAME", "PRESS SPACE TO START");
    syncHUD();
    draw();
  }

  function resetBall() {
    ball.x = WIDTH / 2;
    ball.y = HEIGHT / 2;
    ball.vx = 0;
    ball.vy = 0;
    ball.trail = [];
  }

  function queueServe(direction) {
    resetBall();
    state.serveCountdown = 0.7;
    state.rally = 0;
    state.aiOffset = (Math.random() - 0.5) * 74;
    state.serveDirection = direction;
    syncHUD();
  }

  function launchBall() {
    const direction = state.serveDirection;
    const angle = (Math.random() * 0.64 - 0.32);
    const speed = 355;
    ball.vx = direction * speed * Math.cos(angle);
    ball.vy = speed * Math.sin(angle);
    state.serveCountdown = 0;
    syncHUD();
  }

  function startMatch() {
    if (state.phase === "paused") {
      state.phase = "playing";
      overlay.hidden = true;
      syncHUD();
      return;
    }
    if (state.phase === "playing") return;
    state.scores = [0, 0];
    state.serves = 0;
    state.rally = 0;
    state.winner = -1;
    left.y = right.y = (HEIGHT - PADDLE_HEIGHT) / 2;
    state.phase = "playing";
    overlay.hidden = true;
    queueServe(Math.random() > 0.5 ? 1 : -1);
    syncHUD();
  }

  function togglePause() {
    if (state.phase === "playing") {
      state.phase = "paused";
      setOverlay("TAKE YOUR TIME", "PAUSED.", "The next point is waiting for you.", "RESUME GAME", "PRESS SPACE TO RESUME");
    } else if (state.phase === "paused") {
      state.phase = "playing";
      overlay.hidden = true;
    } else if (state.phase === "idle" || state.phase === "finished") {
      startMatch();
    }
    syncHUD();
  }

  function sound(frequency = 440, duration = 0.055, wave = "sine") {
    if (!state.audioEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const audio = state.audioContext ||= new AudioContext();
      if (audio.state === "suspended") void audio.resume();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
      gain.gain.setValueAtTime(0.045, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    } catch {
      // Audio is optional (e.g., browser disallows WebAudio).
    }
  }

  function reflectFromPaddle(paddle, direction) {
    const center = paddle.y + PADDLE_HEIGHT / 2;
    const impact = clamp((ball.y - center) / (PADDLE_HEIGHT / 2), -1, 1);
    const angle = impact * 0.94;
    const speed = Math.min(775, Math.hypot(ball.vx, ball.vy) * 1.06 + 10);
    ball.vx = direction * speed * Math.cos(angle);
    const paddleMotion = paddle.y - paddle.previousY;
    ball.vy = speed * Math.sin(angle) + clamp(paddleMotion * 6, -70, 70);
    ball.trail = [];
    state.rally += 1;
    if (state.rally > state.bestRally) {
      state.bestRally = state.rally;
      storeBest();
    }
    state.aiOffset = (Math.random() - 0.5) * (difficultySelect.value === "hard" ? 24 : 74);
    sound(360 + Math.min(450, speed / 2), 0.055, "triangle");
    syncHUD();
  }

  function hitPaddle(paddle) {
    return ball.y + BALL_RADIUS >= paddle.y && ball.y - BALL_RADIUS <= paddle.y + PADDLE_HEIGHT;
  }

  function scorePoint(player) {
    state.scores[player]++;
    sound(190, 0.24, "sawtooth");
    if (state.scores[player] >= WIN_SCORE) {
      state.phase = "finished";
      state.winner = player;
      const local = modeSelect.value === "local";
      const label = local ? `PLAYER ${player + 1}` : (player === 0 ? "YOU" : "CPU");
      const message = !local && player === 0 ? "Legendary reflexes. You own the court." : "Another match? The court is ready.";
      setOverlay("MATCH COMPLETE", `${label} WIN${label === "YOU" ? "" : "S"}!`, message, "PLAY AGAIN", "PRESS SPACE TO RESTART");
      resetBall();
      state.serveCountdown = 0;
    } else {
      queueServe(player === 0 ? 1 : -1); // Serve toward the player who lost the point.
    }
    syncHUD();
  }

  function predictYAtRightPaddle() {
    if (ball.vx <= 0) return HEIGHT / 2;
    const remaining = Math.max(0, (right.x - ball.x) / ball.vx);
    const top = BALL_RADIUS + 6;
    const bottom = HEIGHT - BALL_RADIUS - 6;
    const range = bottom - top;
    let projected = (ball.y - top + ball.vy * remaining) % (2 * range);
    if (projected < 0) projected += 2 * range;
    return top + (projected > range ? 2 * range - projected : projected);
  }

  function updatePaddles(dt) {
    left.previousY = left.y;
    right.previousY = right.y;
    if (keys.has("w")) left.y -= PLAYER_SPEED * dt;
    if (keys.has("s")) left.y += PLAYER_SPEED * dt;
    if (modeSelect.value === "cpu") {
      if (keys.has("arrowup")) left.y -= PLAYER_SPEED * dt;
      if (keys.has("arrowdown")) left.y += PLAYER_SPEED * dt;
      if (state.pointerY !== null) {
        const target = state.pointerY - PADDLE_HEIGHT / 2;
        left.y += clamp(target - left.y, -PLAYER_SPEED * dt * 1.5, PLAYER_SPEED * dt * 1.5);
      }
      const target = predictYAtRightPaddle() - PADDLE_HEIGHT / 2 + state.aiOffset;
      const speed = CPU_SPEED[difficultySelect.value] || CPU_SPEED.normal;
      const delta = target - right.y;
      if (Math.abs(delta) > 7) right.y += clamp(delta, -speed * dt, speed * dt);
    } else {
      if (keys.has("arrowup")) right.y -= PLAYER_SPEED * dt;
      if (keys.has("arrowdown")) right.y += PLAYER_SPEED * dt;
      if (state.pointerY !== null) {
        const target = state.pointerY - PADDLE_HEIGHT / 2;
        left.y += clamp(target - left.y, -PLAYER_SPEED * dt * 1.5, PLAYER_SPEED * dt * 1.5);
      }
    }
    left.y = clamp(left.y, 8, HEIGHT - PADDLE_HEIGHT - 8);
    right.y = clamp(right.y, 8, HEIGHT - PADDLE_HEIGHT - 8);
  }

  function update(dt) {
    if (state.phase !== "playing") return;
    updatePaddles(dt);
    if (state.serveCountdown > 0) {
      state.serveCountdown -= dt;
      if (state.serveCountdown <= 0) launchBall();
      return;
    }

    ball.trail.unshift({ x: ball.x, y: ball.y });
    if (ball.trail.length > 12) ball.trail.pop();
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.y <= BALL_RADIUS + 5 && ball.vy < 0) {
      ball.y = BALL_RADIUS + 5;
      ball.vy *= -1;
      sound(240, 0.04);
    } else if (ball.y >= HEIGHT - BALL_RADIUS - 5 && ball.vy > 0) {
      ball.y = HEIGHT - BALL_RADIUS - 5;
      ball.vy *= -1;
      sound(240, 0.04);
    }

    if (ball.vx < 0 && ball.x - BALL_RADIUS <= left.x + PADDLE_WIDTH &&
        ball.x + BALL_RADIUS >= left.x && hitPaddle(left)) {
      ball.x = left.x + PADDLE_WIDTH + BALL_RADIUS;
      reflectFromPaddle(left, 1);
    } else if (ball.vx > 0 && ball.x + BALL_RADIUS >= right.x &&
        ball.x - BALL_RADIUS <= right.x + PADDLE_WIDTH && hitPaddle(right)) {
      ball.x = right.x - BALL_RADIUS;
      reflectFromPaddle(right, -1);
    }

    if (ball.x < -BALL_RADIUS) scorePoint(1);
    else if (ball.x > WIDTH + BALL_RADIUS) scorePoint(0);
  }

  function roundedRect(x, y, w, h, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
  }

  function paintPaddle(paddle, color) {
    ctx.save();
    ctx.shadowBlur = 30;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    roundedRect(paddle.x, paddle.y, PADDLE_WIDTH, PADDLE_HEIGHT, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff80";
    roundedRect(paddle.x + 3, paddle.y + 10, 2, PADDLE_HEIGHT - 20, 2);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    background.addColorStop(0, "#0b1a31");
    background.addColorStop(0.55, "#0a162a");
    background.addColorStop(1, "#13162e");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.strokeStyle = "#7795c013";
    ctx.lineWidth = 1;
    for (let x = 0; x <= WIDTH; x += 48) {
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, HEIGHT); ctx.stroke();
    }
    for (let y = 0; y <= HEIGHT; y += 48) {
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(WIDTH, y + 0.5); ctx.stroke();
    }

    ctx.strokeStyle = "#88a5c72a";
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, WIDTH - 10, HEIGHT - 10);
    ctx.setLineDash([8, 12]);
    ctx.strokeStyle = "#8a9dbd4d";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(WIDTH / 2, 12); ctx.lineTo(WIDTH / 2, HEIGHT - 12); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#8a9dbd20";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(WIDTH / 2, HEIGHT / 2, 66, 0, Math.PI * 2); ctx.stroke();

    // Pale blue/pink ambient spotlights near each side of the court.
    const leftGlow = ctx.createRadialGradient(0, HEIGHT / 2, 0, 0, HEIGHT / 2, 340);
    leftGlow.addColorStop(0, "#5fe8e010"); leftGlow.addColorStop(1, "#5fe8e000");
    ctx.fillStyle = leftGlow; ctx.fillRect(0, 0, 340, HEIGHT);
    const rightGlow = ctx.createRadialGradient(WIDTH, HEIGHT / 2, 0, WIDTH, HEIGHT / 2, 340);
    rightGlow.addColorStop(0, "#f783ae0c"); rightGlow.addColorStop(1, "#f783ae00");
    ctx.fillStyle = rightGlow; ctx.fillRect(WIDTH - 340, 0, 340, HEIGHT);

    paintPaddle(left, "#5fe8e0");
    paintPaddle(right, "#f783ae");

    for (let i = ball.trail.length - 1; i >= 0; i--) {
      const point = ball.trail[i];
      const fade = 1 - i / ball.trail.length;
      ctx.beginPath();
      ctx.arc(point.x, point.y, BALL_RADIUS * fade * 0.85, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(205, 246, 229, ${fade * 0.27})`;
      ctx.fill();
    }
    ctx.save();
    ctx.shadowBlur = 28;
    ctx.shadowColor = "#e8fdfa";
    ctx.fillStyle = "#eafffa";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function resizeCanvas() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
    draw();
  }

  let previousTime = 0;
  function frame(timestamp) {
    const dt = previousTime ? Math.min((timestamp - previousTime) / 1000, 0.028) : 0;
    previousTime = timestamp;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function isEditingInput(target) {
    return target instanceof HTMLElement && !!target.closest("select, input, textarea, [contenteditable]");
  }

  document.addEventListener("keydown", (event) => {
    if (isEditingInput(event.target)) return;
    const key = event.key.toLowerCase();
    // Preserve Space as native keyboard activation for focused buttons and links.
    if (key === " " && event.target instanceof HTMLElement && event.target.closest("button, a")) return;
    if (["w", "s", "arrowup", "arrowdown", " "].includes(key)) event.preventDefault();
    if (key === " " && !event.repeat) {
      togglePause();
      return;
    }
    keys.add(key);
  });

  document.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener("blur", () => {
    keys.clear();
    state.pointerActive = false;
    state.pointerY = null;
    if (state.phase === "playing") togglePause();
  });

  function setPointerY(event) {
    const rect = canvas.getBoundingClientRect();
    state.pointerY = clamp((event.clientY - rect.top) / rect.height * HEIGHT, 0, HEIGHT);
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (state.phase !== "playing") return;
    state.pointerActive = true;
    setPointerY(event);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (state.phase !== "playing") return;
    if (event.pointerType === "mouse" || state.pointerActive) setPointerY(event);
  });
  const stopPointer = () => {
    state.pointerActive = false;
    state.pointerY = null;
  };
  canvas.addEventListener("pointerup", stopPointer);
  canvas.addEventListener("pointercancel", stopPointer);
  canvas.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse" && !state.pointerActive) state.pointerY = null;
  });

  startButton.addEventListener("click", startMatch);
  pauseButton.addEventListener("click", togglePause);
  resetButton.addEventListener("click", resetMatch);
  modeSelect.addEventListener("change", resetMatch);
  difficultySelect.addEventListener("change", () => {
    state.aiOffset = 0;
    syncHUD();
  });
  soundButton.addEventListener("click", () => {
    state.audioEnabled = !state.audioEnabled;
    soundButton.setAttribute("aria-pressed", String(state.audioEnabled));
    soundButton.setAttribute("aria-label", state.audioEnabled ? "Disable sound" : "Enable sound");
    el("soundLabel").textContent = state.audioEnabled ? "ON" : "OFF";
    if (state.audioEnabled) sound(530, 0.07);
  });

  if (typeof ResizeObserver !== "undefined") new ResizeObserver(resizeCanvas).observe(canvas);
  else window.addEventListener("resize", resizeCanvas);
  resetMatch();
  resizeCanvas();
  requestAnimationFrame(frame);
})();
