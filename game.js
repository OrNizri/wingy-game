// משחק "כנפיים" — ציפור שמנפנפת בין עמודים
(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const GROUND = 80;

  const GRAVITY = 850;      // פיקסלים לשנייה בריבוע (קטן = נפילה איטית יותר)
  const FLAP = -300;        // מהירות נפנוף
  const MAX_FALL = 420;     // מהירות נפילה מקסימלית
  const PIPE_W = 64;

  // קושי שעולה בהדרגה עם הניקוד
  const BASE_SPEED = 150, MAX_SPEED = 240;
  const BASE_GAP = 170, MIN_GAP = 125;
  const speedFor = s => Math.min(MAX_SPEED, BASE_SPEED + s * 3);
  const gapFor = s => Math.max(MIN_GAP, BASE_GAP - s * 1.5);

  const MEDALS = [
    { min: 40, name: "פלטינה", color: "#c9f0ff" },
    { min: 25, name: "זהב", color: "#ffd700" },
    { min: 10, name: "כסף", color: "#d8d8d8" },
    { min: 5, name: "ארד", color: "#d9905a" },
  ];

  let state, bird, pipes, score, spawnTimer, groundX, lastTime, newRecord, overLockUntil = 0;
  let paused = false, flash = 0, scorePop = 0;
  const clouds = Array.from({ length: 5 }, (_, i) => ({ x: i * 95, y: 40 + Math.random() * 220, s: 0.6 + Math.random() * 0.6 }));

  // ---------- סאונד (נוצר בקוד, בלי קבצים) ----------
  let audio = null;
  let muted = false;
  try { muted = localStorage.getItem("wingy_muted") === "1"; } catch {}

  function tone(freq, dur, type = "sine", vol = 0.15, slideTo = null) {
    if (muted) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime;
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(audio.destination);
      osc.start(t); osc.stop(t + dur);
    } catch {}
  }
  const sfx = {
    flap: () => tone(520, 0.12, "triangle", 0.12, 760),
    point: () => { tone(880, 0.08, "square", 0.06); setTimeout(() => tone(1320, 0.12, "square", 0.06), 70); },
    hit: () => { tone(200, 0.3, "sawtooth", 0.15, 60); },
    record: () => [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.15, "triangle", 0.1), i * 110)),
  };

  // ---------- לוגיקה ----------
  function reset() {
    state = "ready"; // ready | playing | over
    bird = { x: 100, y: H / 2 - 40, vy: 0, r: 16, angle: 0, wing: 0 };
    pipes = [];
    score = 0;
    spawnTimer = 0;
    groundX = 0;
    newRecord = false;
    paused = false;
    flash = 0;
    updateButtons();
  }

  function flap() {
    if (paused) return setPaused(false);
    if (state === "ready") state = "playing";
    if (state === "playing") {
      bird.vy = FLAP;
      sfx.flap();
    } else if (state === "over") {
      reset();
    }
  }

  function spawnPipe() {
    const gap = gapFor(score);
    const min = 60, max = H - GROUND - gap - 60;
    pipes.push({ x: W, top: min + Math.random() * (max - min), gap, passed: false });
  }

  function hit(p) {
    const bx = bird.x, by = bird.y, r = bird.r - 3;
    if (bx + r < p.x || bx - r > p.x + PIPE_W) return false;
    return by - r < p.top || by + r > p.top + p.gap;
  }

  function gameOver() {
    state = "over";
    flash = 1;
    sfx.hit();
    newRecord = saveBestScore(score);
    if (newRecord) setTimeout(sfx.record, 350);
    overLockUntil = performance.now() + 600; // נעילה קצרה כדי לא להתחיל מחדש בטעות
    refreshStats();
    updateButtons();
  }

  function update(dt) {
    flash = Math.max(0, flash - dt * 3);
    scorePop = Math.max(0, scorePop - dt * 4);
    bird.wing += dt * (state === "over" ? 0 : 12);
    const speed = speedFor(score);

    if (state !== "over") {
      groundX = (groundX - speed * dt) % 40;
      for (const c of clouds) {
        c.x -= speed * 0.15 * c.s * dt;
        if (c.x < -80) { c.x = W + 40; c.y = 40 + Math.random() * 220; }
      }
    }
    if (state === "ready") {
      bird.y = H / 2 - 40 + Math.sin(performance.now() / 300) * 8;
    }
    if (state !== "playing") {
      if (state === "over" && bird.y < H - GROUND - bird.r) {
        bird.vy += GRAVITY * dt;
        bird.y = Math.min(bird.y + bird.vy * dt, H - GROUND - bird.r);
        bird.angle = Math.min(1.5, bird.angle + dt * 4);
      }
      return;
    }

    bird.vy = Math.min(bird.vy + GRAVITY * dt, MAX_FALL);
    bird.y += bird.vy * dt;
    bird.angle = Math.max(-0.5, Math.min(1.3, bird.vy / 500));

    spawnTimer -= dt;
    if (spawnTimer <= 0) { spawnPipe(); spawnTimer = 230 / speed; } // מרווח קבוע במרחק בין עמודים

    for (const p of pipes) {
      p.x -= speed * dt;
      if (!p.passed && p.x + PIPE_W < bird.x) { p.passed = true; score++; scorePop = 1; sfx.point(); }
      if (hit(p)) return gameOver();
    }
    pipes = pipes.filter(p => p.x + PIPE_W > 0);

    if (bird.y + bird.r >= H - GROUND) { bird.y = H - GROUND - bird.r; return gameOver(); }
    if (bird.y - bird.r < 0) { bird.y = bird.r; bird.vy = 0; }
  }

  // ---------- ציור ----------
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#2b1d5c");
    g.addColorStop(0.6, "#e0627a");
    g.addColorStop(1, "#ffb86b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,230,150,.85)";
    ctx.beginPath(); ctx.arc(300, 380, 60, 0, Math.PI * 2); ctx.fill();

    // עננים
    ctx.fillStyle = "rgba(255,255,255,.18)";
    for (const c of clouds) {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 34 * c.s, 14 * c.s, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + 22 * c.s, c.y - 8 * c.s, 22 * c.s, 12 * c.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#7b3f6e";
    ctx.beginPath();
    ctx.moveTo(0, H - GROUND);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H - GROUND - 40 - Math.sin(x / 50) * 25);
    ctx.lineTo(W, H - GROUND); ctx.fill();
  }

  function drawPipes() {
    for (const p of pipes) {
      const bottomY = p.top + p.gap;
      ctx.fillStyle = "#3fb6a8";
      ctx.fillRect(p.x, 0, PIPE_W, p.top);
      ctx.fillRect(p.x, bottomY, PIPE_W, H - GROUND - bottomY);
      ctx.fillStyle = "#2a8a7f";
      ctx.fillRect(p.x - 4, p.top - 20, PIPE_W + 8, 20);
      ctx.fillRect(p.x - 4, bottomY, PIPE_W + 8, 20);
      ctx.fillStyle = "rgba(255,255,255,.2)";
      ctx.fillRect(p.x + 6, 0, 8, p.top - 20);
      ctx.fillRect(p.x + 6, bottomY + 20, 8, H - GROUND - bottomY - 20);
    }
  }

  function drawGround() {
    ctx.fillStyle = "#4a2c40";
    ctx.fillRect(0, H - GROUND, W, GROUND);
    ctx.fillStyle = "#6b3f5c";
    for (let x = groundX; x < W; x += 40) ctx.fillRect(x, H - GROUND, 20, 12);
  }

  function drawBird() {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.angle);
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath(); ctx.ellipse(0, 0, bird.r + 3, bird.r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff3c4";
    ctx.beginPath(); ctx.ellipse(-2, 6, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
    const wy = Math.sin(bird.wing) * 6;
    ctx.fillStyle = "#ff9f1c";
    ctx.beginPath(); ctx.ellipse(-6, wy, 9, 5, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(8, -5, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#222";
    if (state === "over") { // עיניים X
      ctx.strokeStyle = "#222"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(5, -8); ctx.lineTo(11, -2); ctx.moveTo(11, -8); ctx.lineTo(5, -2); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(10, -5, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#ff5e5b";
    ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(26, 3); ctx.lineTo(15, 7); ctx.fill();
    ctx.restore();
  }

  function text(str, y, size, color = "#fff", x = W / 2) {
    ctx.font = `bold ${size}px "Segoe UI", Arial`;
    ctx.textAlign = "center";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,0,0,.6)";
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function drawMedal(medal, x, y) {
    ctx.fillStyle = "#b23a48";
    ctx.beginPath(); ctx.moveTo(x - 14, y - 46); ctx.lineTo(x - 4, y - 20); ctx.lineTo(x + 4, y - 20); ctx.lineTo(x + 14, y - 46); ctx.fill();
    ctx.fillStyle = medal.color;
    ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.beginPath(); ctx.arc(x - 7, y - 7, 6, 0, Math.PI * 2); ctx.fill();
  }

  function draw() {
    drawBackground();
    drawPipes();
    drawGround();
    drawBird();

    if (state === "playing") text(String(score), 70, 48 + scorePop * 14);
    if (state === "ready") {
      text("כנפיים", 150, 52, "#ffd23f");
      text("לחצו כדי להתחיל", 420, 24);
      text("P / Esc — הפסקה   ·   M — סאונד", 455, 15, "#ffe9f0");
    }
    if (state === "over") {
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.fillRect(0, 0, W, H);
      text("נפסלת!", 150, 48, "#ff5e5b");
      text(`ניקוד: ${score}`, 215, 30);
      const user = getCurrentUser();
      text(`שיא: ${user ? user.best : score}`, 252, 22);
      const medal = MEDALS.find(m => score >= m.min);
      if (medal) {
        drawMedal(medal, W / 2, 315);
        text(`מדליית ${medal.name}`, 370, 20, medal.color);
      } else {
        text(`עוד ${MEDALS[MEDALS.length - 1].min - score} לארד 🥉`, 320, 18, "#ffe9f0");
      }
      if (newRecord) text("🎉 שיא חדש!", 405, 24, "#ffd23f");
      text("לחצו כדי לשחק שוב", 450, 22);
    }
    if (paused) {
      ctx.fillStyle = "rgba(0,0,0,.45)";
      ctx.fillRect(0, 0, W, H);
      text("⏸ הפסקה", H / 2 - 10, 40);
      text("לחצו כדי להמשיך", H / 2 + 30, 20);
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.7})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function loop(t) {
    const dt = Math.min((t - (lastTime ?? t)) / 1000, 0.05);
    lastTime = t;
    if (!paused) update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- שליטה ----------
  const $ = id => document.getElementById(id);
  const gameVisible = () => !$("game-screen").classList.contains("hidden");

  function setPaused(value) {
    if (state !== "playing") value = false;
    paused = value;
    updateButtons();
  }

  function setMuted(value) {
    muted = value;
    try { localStorage.setItem("wingy_muted", muted ? "1" : "0"); } catch {}
    updateButtons();
  }

  function updateButtons() {
    const muteBtn = $("mute-btn"), pauseBtn = $("pause-btn");
    if (muteBtn) muteBtn.textContent = muted ? "🔇" : "🔊";
    if (pauseBtn) {
      pauseBtn.textContent = paused ? "▶" : "⏸";
      pauseBtn.disabled = state !== "playing";
    }
  }

  function input(e) {
    if (!gameVisible()) return;
    if (state === "over" && performance.now() < overLockUntil) return;
    e.preventDefault();
    flap();
  }

  document.addEventListener("keydown", e => {
    if (!gameVisible() || e.target.matches?.("input, textarea")) return;
    if (e.code === "Space" || e.code === "ArrowUp") input(e);
    else if (e.code === "KeyP" || e.code === "Escape") setPaused(!paused);
    else if (e.code === "KeyM") setMuted(!muted);
  });
  canvas.addEventListener("pointerdown", input);
  $("mute-btn").addEventListener("click", () => setMuted(!muted));
  $("pause-btn").addEventListener("click", () => setPaused(!paused));
  document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(true); });

  reset();
  requestAnimationFrame(loop);
  window.Game = { reset };
})();
