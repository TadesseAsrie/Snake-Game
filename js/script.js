/* ============================================================
   SNAKE GAME — Vanilla JS (ES6)
   All game logic, rendering, UI, sounds, and storage.
   ============================================================ */

(() => {
  "use strict";

  // ============================================================
  // 1. CONFIGURATION
  // ============================================================
  const CONFIG = {
    GRID_SIZE: 20,
    BASE_SPEEDS: {
      easy: 180,
      medium: 130,
      hard: 85,
    },
    STORAGE_KEY: "snake_game_data",
    INITIAL_SNAKE: [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ],
    INITIAL_DIR: "right",
    FOOD_PULSE_SPEED: 0.06,
  };

  // ============================================================
  // 2. STATE
  // ============================================================
  const state = {
    snake: [],
    direction: CONFIG.INITIAL_DIR,
    nextDirection: CONFIG.INITIAL_DIR,
    food: null,
    score: 0,
    highScore: 0,
    gameState: "idle", // 'idle' | 'playing' | 'paused' | 'gameover'
    difficulty: "medium",
    theme: "dark",
    soundEnabled: true,
    tickInterval: CONFIG.BASE_SPEEDS.medium,
    lastTickTime: 0,
    animFrame: 0,
    foodPulsePhase: 0,
    // countdown
    countdownActive: false,
    countdownValue: 3,
    // game loop id
    rafId: null,
  };

  // ============================================================
  // 3. DOM REFS
  // ============================================================
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const scoreDisplay = document.getElementById("scoreDisplay");
  const highScoreDisplay = document.getElementById("highScoreDisplay");
  const diffBadge = document.getElementById("diffBadge");
  const finalScore = document.getElementById("finalScore");
  const finalHighScore = document.getElementById("finalHighScore");

  const startOverlay = document.getElementById("startOverlay");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const countdownOverlay = document.getElementById("countdownOverlay");
  const countdownNumber = document.getElementById("countdownNumber");

  const startBtn = document.getElementById("startBtn");
  const startBtn2 = document.getElementById("startBtn2");
  const pauseBtn = document.getElementById("pauseBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  const restartBtn = document.getElementById("restartBtn");
  const restartBtn2 = document.getElementById("restartBtn2");
  const themeToggle = document.getElementById("themeToggle");
  const soundToggle = document.getElementById("soundToggle");
  const diffSelector = document.getElementById("diffSelector");

  const touchBtns = document.querySelectorAll(".touch-btn[data-dir]");
  const boardWrapper = document.getElementById("boardWrapper");

  // ============================================================
  // 4. AUDIO (Web Audio API)
  // ============================================================
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function playTone(freq, duration, type = "sine", volume = 0.3) {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (_) {
      /* silent fail */
    }
  }

  function soundEat() {
    playTone(520, 0.1, "sine", 0.25);
    setTimeout(() => playTone(680, 0.1, "sine", 0.2), 80);
  }

  function soundGameOver() {
    playTone(440, 0.25, "sawtooth", 0.2);
    setTimeout(() => playTone(330, 0.3, "sawtooth", 0.18), 200);
    setTimeout(() => playTone(220, 0.4, "sawtooth", 0.15), 420);
  }

  function soundClick() {
    playTone(800, 0.05, "sine", 0.12);
  }

  // ============================================================
  // 5. STORAGE
  // ============================================================
  function loadStorage() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data;
    } catch (_) {
      return null;
    }
  }

  function saveStorage() {
    try {
      const data = {
        highScore: state.highScore,
        theme: state.theme,
        difficulty: state.difficulty,
      };
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
    } catch (_) {
      /* ignore */
    }
  }

  function loadSettings() {
    const data = loadStorage();
    if (data) {
      state.highScore = data.highScore || 0;
      state.theme = data.theme || "dark";
      state.difficulty = data.difficulty || "medium";
    } else {
      state.highScore = 0;
      state.theme = "dark";
      state.difficulty = "medium";
    }
    applyTheme();
    applyDifficultyUI();
    updateHighScoreDisplay();
    updateDiffBadge();
  }

  // ============================================================
  // 6. THEME
  // ============================================================
  function applyTheme() {
    const isDark = state.theme === "dark";
    document.documentElement.setAttribute("data-theme", state.theme);
    themeToggle.textContent = isDark ? "🌙" : "☀️";
    themeToggle.setAttribute(
      "aria-label",
      isDark ? "Switch to light theme" : "Switch to dark theme",
    );
  }

  function toggleTheme() {
    soundClick();
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    saveStorage();
  }

  // ============================================================
  // 7. DIFFICULTY
  // ============================================================
  function applyDifficultyUI() {
    const btns = diffSelector.querySelectorAll("button");
    btns.forEach((btn) => {
      const diff = btn.dataset.diff;
      const isActive = diff === state.difficulty;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-checked", isActive ? "true" : "false");
    });
    updateDiffBadge();
    state.tickInterval =
      CONFIG.BASE_SPEEDS[state.difficulty] || CONFIG.BASE_SPEEDS.medium;
  }

  function updateDiffBadge() {
    const labels = { easy: "Easy", medium: "Medium", hard: "Hard" };
    diffBadge.textContent = labels[state.difficulty] || "Medium";
  }

  function setDifficulty(diff) {
    if (state.gameState === "playing" || state.gameState === "paused") return;
    state.difficulty = diff;
    state.tickInterval = CONFIG.BASE_SPEEDS[diff] || CONFIG.BASE_SPEEDS.medium;
    applyDifficultyUI();
    saveStorage();
  }

  // ============================================================
  // 8. SCORE
  // ============================================================
  function updateScoreDisplay() {
    scoreDisplay.textContent = state.score;
  }

  function updateHighScoreDisplay() {
    highScoreDisplay.textContent = state.highScore;
  }

  function updateScore() {
    state.score += 1;
    if (state.score > state.highScore) {
      state.highScore = state.score;
      saveStorage();
    }
    updateScoreDisplay();
    updateHighScoreDisplay();
  }

  // ============================================================
  // 9. FOOD
  // ============================================================
  function generateFood() {
    const maxAttempts = 1000;
    for (let i = 0; i < maxAttempts; i++) {
      const x = Math.floor(Math.random() * CONFIG.GRID_SIZE);
      const y = Math.floor(Math.random() * CONFIG.GRID_SIZE);
      if (!state.snake.some((seg) => seg.x === x && seg.y === y)) {
        state.food = { x, y };
        return;
      }
    }
    // fallback: scan all cells
    for (let y = 0; y < CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < CONFIG.GRID_SIZE; x++) {
        if (!state.snake.some((seg) => seg.x === x && seg.y === y)) {
          state.food = { x, y };
          return;
        }
      }
    }
    // board is full — win condition!
    state.food = null;
  }

  // ============================================================
  // 10. SNAKE
  // ============================================================
  function resetSnake() {
    state.snake = CONFIG.INITIAL_SNAKE.map((p) => ({ ...p }));
    state.direction = CONFIG.INITIAL_DIR;
    state.nextDirection = CONFIG.INITIAL_DIR;
  }

  function moveSnake() {
    // Apply queued direction
    state.direction = state.nextDirection;

    const head = state.snake[0];
    let newHead = { ...head };
    switch (state.direction) {
      case "up":
        newHead.y -= 1;
        break;
      case "down":
        newHead.y += 1;
        break;
      case "left":
        newHead.x -= 1;
        break;
      case "right":
        newHead.x += 1;
        break;
      default:
        return;
    }

    // Check if food eaten
    const willEat =
      state.food && newHead.x === state.food.x && newHead.y === state.food.y;

    // Build new snake
    let newSnake = [newHead, ...state.snake];
    if (!willEat) {
      newSnake.pop();
    }

    state.snake = newSnake;

    if (willEat) {
      soundEat();
      updateScore();
      generateFood();
      // Speed increase every 5 points (bonus feature)
      if (state.score > 0 && state.score % 5 === 0) {
        // Slight speed boost, but don't go below 50ms
        const newInterval = Math.max(50, state.tickInterval - 4);
        state.tickInterval = newInterval;
      }
    }
  }

  // ============================================================
  // 11. COLLISION DETECTION
  // ============================================================
  function checkCollisions() {
    if (state.snake.length === 0) return true;
    const head = state.snake[0];

    // Wall collision
    if (
      head.x < 0 ||
      head.x >= CONFIG.GRID_SIZE ||
      head.y < 0 ||
      head.y >= CONFIG.GRID_SIZE
    ) {
      return true;
    }

    // Self collision (skip head)
    for (let i = 1; i < state.snake.length; i++) {
      if (state.snake[i].x === head.x && state.snake[i].y === head.y) {
        return true;
      }
    }

    return false;
  }

  // ============================================================
  // 12. GAME STATE MANAGEMENT
  // ============================================================
  function setGameState(newState) {
    state.gameState = newState;
    updateUIButtons();
    updateOverlays();
  }

  function updateUIButtons() {
    const isPlaying = state.gameState === "playing";
    const isPaused = state.gameState === "paused";
    const isIdle = state.gameState === "idle";
    const isOver = state.gameState === "gameover";

    startBtn.disabled = isPlaying || isPaused || isOver;
    startBtn2.disabled = isPlaying || isPaused || isOver;
    pauseBtn.disabled = !isPlaying;
    pauseBtn.textContent = isPaused ? "▶ Resume" : "⏸ Pause";
    resumeBtn.disabled = !isPaused;

    // Start button text
    const startText = isIdle ? "▶ Start" : isOver ? "↻ Restart" : "▶ Start";
    startBtn.textContent = startText;
    startBtn2.textContent = startText;
  }

  function updateOverlays() {
    const isIdle = state.gameState === "idle";
    const isOver = state.gameState === "gameover";
    const isPaused = state.gameState === "paused";
    const isPlaying = state.gameState === "playing";

    startOverlay.classList.toggle("active", isIdle);
    gameOverOverlay.classList.toggle("active", isOver);
    pauseOverlay.classList.toggle("active", isPaused);

    if (isOver) {
      finalScore.textContent = state.score;
      finalHighScore.textContent = state.highScore;
    }
  }

  // ============================================================
  // 13. COUNTDOWN
  // ============================================================
  function startCountdown(callback) {
    state.countdownActive = true;
    state.countdownValue = 3;
    countdownOverlay.classList.add("active");
    countdownNumber.textContent = "3";
    countdownNumber.style.animation = "none";
    // force reflow
    void countdownNumber.offsetWidth;
    countdownNumber.style.animation = "countPop 0.6s ease";

    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(interval);
        countdownOverlay.classList.remove("active");
        state.countdownActive = false;
        callback();
        return;
      }
      countdownNumber.textContent = count;
      countdownNumber.style.animation = "none";
      void countdownNumber.offsetWidth;
      countdownNumber.style.animation = "countPop 0.6s ease";
    }, 700);
  }

  // ============================================================
  // 14. GAME LOOP
  // ============================================================
  function gameTick() {
    if (state.gameState !== "playing") return;

    // Apply queued direction (with reverse prevention)
    const opposites = { up: "down", down: "up", left: "right", right: "left" };
    if (
      state.nextDirection &&
      opposites[state.nextDirection] !== state.direction
    ) {
      state.direction = state.nextDirection;
    }

    moveSnake();

    if (checkCollisions()) {
      soundGameOver();
      setGameState("gameover");
      saveStorage();
      render();
      return;
    }

    render();
  }

  function gameLoop(timestamp) {
    if (state.gameState === "idle" || state.gameState === "gameover") {
      // Still render but don't tick
      render();
      state.rafId = requestAnimationFrame(gameLoop);
      return;
    }

    // Tick
    if (state.gameState === "playing") {
      const elapsed = timestamp - state.lastTickTime;
      if (elapsed >= state.tickInterval) {
        state.lastTickTime = timestamp;
        gameTick();
      }
    }

    // Always render (smooth animations)
    render();
    state.rafId = requestAnimationFrame(gameLoop);
  }

  // ============================================================
  // 15. RENDER
  // ============================================================
  function render() {
    const grid = CONFIG.GRID_SIZE;
    const rect = canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const cellSize = size / grid;

    // Set canvas size for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    const logicalSize = Math.min(canvas.clientWidth, canvas.clientHeight);
    canvas.width = logicalSize * dpr;
    canvas.height = logicalSize * dpr;
    ctx.scale(dpr, dpr);

    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    // Clear
    const bgColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg-card")
        .trim() || "#1a2230";
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    const cSize = w / grid;

    // Grid lines
    const gridColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--grid-color")
        .trim() || "rgba(255,255,255,0.04)";
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= grid; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cSize, 0);
      ctx.lineTo(i * cSize, w);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cSize);
      ctx.lineTo(w, i * cSize);
      ctx.stroke();
    }

    // Food
    if (state.food) {
      const fx = state.food.x * cSize + cSize / 2;
      const fy = state.food.y * cSize + cSize / 2;
      const pulse = 1 + 0.12 * Math.sin(state.foodPulsePhase);
      const radius = cSize * 0.38 * pulse;

      // Glow
      const glowColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--food-glow")
          .trim() || "rgba(255,107,138,0.5)";
      const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, radius * 2.2);
      grad.addColorStop(0, glowColor);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(fx, fy, radius * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Food body
      const foodColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--food-color")
          .trim() || "#ff6b8a";
      ctx.fillStyle = foodColor;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(fx, fy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner highlight
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.arc(
        fx - radius * 0.2,
        fy - radius * 0.25,
        radius * 0.3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Snake
    if (state.snake.length > 0) {
      const headColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--snake-head")
          .trim() || "#4cd9a0";
      const bodyColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--snake-body")
          .trim() || "#2ebd85";
      const bodyAltColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--snake-body-alt")
          .trim() || "#1fa070";

      state.snake.forEach((seg, idx) => {
        const x = seg.x * cSize;
        const y = seg.y * cSize;
        const pad = cSize * 0.04;
        const radius = cSize * 0.14;

        let color;
        if (idx === 0) {
          color = headColor;
        } else {
          color = idx % 2 === 0 ? bodyColor : bodyAltColor;
        }

        ctx.fillStyle = color;
        ctx.shadowColor = idx === 0 ? "rgba(76,217,160,0.25)" : "transparent";
        ctx.shadowBlur = idx === 0 ? 12 : 0;

        // Rounded rect
        const rx = x + pad;
        const ry = y + pad;
        const rw = cSize - pad * 2;
        const rh = cSize - pad * 2;
        ctx.beginPath();
        ctx.moveTo(rx + radius, ry);
        ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, radius);
        ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, radius);
        ctx.arcTo(rx, ry + rh, rx, ry, radius);
        ctx.arcTo(rx, ry, rx + rw, ry, radius);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Head details: eyes
        if (idx === 0) {
          const eyeSize = cSize * 0.1;
          const eyeOff = cSize * 0.18;
          let ex1, ey1, ex2, ey2;
          const dir = state.direction;
          if (dir === "right") {
            ex1 = x + cSize * 0.7;
            ey1 = y + cSize * 0.22;
            ex2 = x + cSize * 0.7;
            ey2 = y + cSize * 0.62;
          } else if (dir === "left") {
            ex1 = x + cSize * 0.3;
            ey1 = y + cSize * 0.22;
            ex2 = x + cSize * 0.3;
            ey2 = y + cSize * 0.62;
          } else if (dir === "up") {
            ex1 = x + cSize * 0.22;
            ey1 = y + cSize * 0.3;
            ex2 = x + cSize * 0.62;
            ey2 = y + cSize * 0.3;
          } else {
            ex1 = x + cSize * 0.22;
            ey1 = y + cSize * 0.7;
            ex2 = x + cSize * 0.62;
            ey2 = y + cSize * 0.7;
          }
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.beginPath();
          ctx.arc(ex1, ey1, eyeSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(ex2, ey2, eyeSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#0b0e14";
          const pupilOff = cSize * 0.04;
          const pd = dir;
          let px1 = ex1,
            py1 = ey1,
            px2 = ex2,
            py2 = ey2;
          if (pd === "right") {
            px1 += pupilOff;
            px2 += pupilOff;
          } else if (pd === "left") {
            px1 -= pupilOff;
            px2 -= pupilOff;
          } else if (pd === "up") {
            py1 -= pupilOff;
            py2 -= pupilOff;
          } else {
            py1 += pupilOff;
            py2 += pupilOff;
          }
          ctx.beginPath();
          ctx.arc(px1, py1, eyeSize * 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(px2, py2, eyeSize * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // Update pulse
    state.foodPulsePhase += CONFIG.FOOD_PULSE_SPEED;
  }

  // ============================================================
  // 16. GAME ACTIONS
  // ============================================================
  function startGame() {
    if (state.gameState === "playing" || state.gameState === "paused") return;
    soundClick();

    resetSnake();
    state.score = 0;
    state.tickInterval =
      CONFIG.BASE_SPEEDS[state.difficulty] || CONFIG.BASE_SPEEDS.medium;
    updateScoreDisplay();
    updateHighScoreDisplay();
    generateFood();
    setGameState("idle");

    // Countdown then start
    startCountdown(() => {
      state.lastTickTime = performance.now();
      setGameState("playing");
      // Start loop if not running
      if (!state.rafId) {
        state.rafId = requestAnimationFrame(gameLoop);
      }
    });
  }

  function pauseGame() {
    if (state.gameState === "playing") {
      soundClick();
      setGameState("paused");
    }
  }

  function resumeGame() {
    if (state.gameState === "paused") {
      soundClick();
      state.lastTickTime = performance.now();
      setGameState("playing");
    }
  }

  function restartGame() {
    soundClick();
    if (
      state.gameState === "gameover" ||
      state.gameState === "playing" ||
      state.gameState === "paused"
    ) {
      // Cancel any ongoing countdown
      state.countdownActive = false;
      countdownOverlay.classList.remove("active");
      resetSnake();
      state.score = 0;
      state.tickInterval =
        CONFIG.BASE_SPEEDS[state.difficulty] || CONFIG.BASE_SPEEDS.medium;
      updateScoreDisplay();
      generateFood();
      setGameState("idle");
      // Start with countdown
      startCountdown(() => {
        state.lastTickTime = performance.now();
        setGameState("playing");
        if (!state.rafId) {
          state.rafId = requestAnimationFrame(gameLoop);
        }
      });
    } else {
      // Idle state: just reset and show start
      resetSnake();
      state.score = 0;
      updateScoreDisplay();
      generateFood();
      setGameState("idle");
    }
  }

  function togglePause() {
    if (state.gameState === "playing") pauseGame();
    else if (state.gameState === "paused") resumeGame();
  }

  // ============================================================
  // 17. SOUND TOGGLE
  // ============================================================
  function toggleSound() {
    soundClick();
    state.soundEnabled = !state.soundEnabled;
    soundToggle.textContent = state.soundEnabled ? "🔊" : "🔇";
    soundToggle.setAttribute(
      "aria-label",
      state.soundEnabled ? "Mute sound" : "Unmute sound",
    );
    saveStorage();
  }

  // ============================================================
  // 18. KEYBOARD CONTROLS
  // ============================================================
  function handleKeydown(e) {
    const key = e.key;

    // Space: pause toggle
    if (key === " " || key === "Spacebar") {
      e.preventDefault();
      if (state.gameState === "playing" || state.gameState === "paused") {
        togglePause();
      }
      return;
    }

    // Arrow keys / WASD
    let dir = null;
    if (key === "ArrowUp" || key === "w" || key === "W") dir = "up";
    else if (key === "ArrowDown" || key === "s" || key === "S") dir = "down";
    else if (key === "ArrowLeft" || key === "a" || key === "A") dir = "left";
    else if (key === "ArrowRight" || key === "d" || key === "D") dir = "right";
    else return;

    e.preventDefault();

    // Only allow direction changes if playing
    if (state.gameState !== "playing") return;

    const opposites = { up: "down", down: "up", left: "right", right: "left" };
    if (dir && opposites[dir] !== state.direction) {
      state.nextDirection = dir;
    }
  }

  // ============================================================
  // 19. TOUCH CONTROLS
  // ============================================================
  function setupTouchControls() {
    touchBtns.forEach((btn) => {
      const dir = btn.dataset.dir;

      const handleTouch = (e) => {
        e.preventDefault();
        if (state.gameState !== "playing") return;
        const opposites = {
          up: "down",
          down: "up",
          left: "right",
          right: "left",
        };
        if (dir && opposites[dir] !== state.direction) {
          state.nextDirection = dir;
        }
        // haptic feedback if available
        if (navigator.vibrate) navigator.vibrate(6);
      };

      btn.addEventListener("touchstart", handleTouch, { passive: false });
      btn.addEventListener("mousedown", handleTouch);
    });
  }

  // ============================================================
  // 20. RESIZE / RESPONSIVE
  // ============================================================
  function handleResize() {
    // Canvas sizing is handled in render via getBoundingClientRect
    // Just re-render
    if (state.rafId) {
      // render will be called in the loop
    } else {
      render();
    }
  }

  // ============================================================
  // 21. INITIALIZATION
  // ============================================================
  function init() {
    // Load settings from storage
    loadSettings();

    // Initial snake
    resetSnake();

    // Generate initial food
    generateFood();

    // Update UI
    updateScoreDisplay();
    updateHighScoreDisplay();
    setGameState("idle");

    // Apply sound toggle state
    soundToggle.textContent = state.soundEnabled ? "🔊" : "🔇";

    // Event listeners
    window.addEventListener("keydown", handleKeydown);

    // Start button
    startBtn.addEventListener("click", startGame);
    startBtn2.addEventListener("click", startGame);

    // Pause / Resume
    pauseBtn.addEventListener("click", togglePause);
    resumeBtn.addEventListener("click", resumeGame);

    // Restart
    restartBtn.addEventListener("click", restartGame);
    restartBtn2.addEventListener("click", restartGame);

    // Theme
    themeToggle.addEventListener("click", toggleTheme);

    // Sound
    soundToggle.addEventListener("click", toggleSound);

    // Difficulty selector
    diffSelector.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const diff = btn.dataset.diff;
        if (
          diff &&
          state.gameState !== "playing" &&
          state.gameState !== "paused"
        ) {
          setDifficulty(diff);
        }
      });
    });

    // Touch controls
    setupTouchControls();

    // Resize
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", () => {
      setTimeout(handleResize, 300);
    });

    // Start the render loop (always running for animations)
    state.rafId = requestAnimationFrame(gameLoop);

    // Initial render
    render();

    console.log("🐍 Snake Game initialized!");
  }

  // ============================================================
  // 22. START
  // ============================================================
  document.addEventListener("DOMContentLoaded", init);
})();
