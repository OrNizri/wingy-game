// משחק "כנפיים" — ציפור שמנפנפת בין עמודים
(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const GROUND = 80;

  const GRAVITY = 850;      // פיקסלים לשנייה בריבוע (קטן = נפילה איטית יותר)
  const FLAP = -300;        // מהירות נפנוף
  const MAX_FALL = 420;     // מהירות נפילה מקסימלית
  const SPEED = 160;        // מהירות העמודים
  const GAP = 160;          // גודל הפתח
  const PIPE_W = 64;
  const PIPE_EVERY = 1.5;   // שניות בין עמודים

  let state, bird, pipes, score, spawnTimer, groundX, lastTime, newRecord, overLockUntil = 0;

  function reset() {
    state = "ready"; // ready | playing | over
    bird = { x: 100, y: H / 2 - 40, vy: 0, r: 16, angle: 0, wing: 0 };
    pipes = [];
    score = 0;
    spawnTimer = 0;
    groundX = 0;
    newRecord = false;
  }

  function flap() {
    if (state === "ready") state = "playing";
    if (state === "playing") {
      bird.vy = FLAP;
    } else if (state === "over") {
      reset();
    }
  }

  function spawnPipe() {
    const min = 60, max = H - GROUND - GAP - 60;
    pipes.push({ x: W, top: min + Math.random() * (max - min), passed: false });
  }

  function hit(p) {
    const bx = bird.x, by = bird.y, r = bird.r - 3;
    if (bx + r < p.x || bx - r > p.x + PIPE_W) return false;
    return by - r < p.top || by + r > p.top + GAP;
  }

  function gameOver() {
    state = "over";
    newRecord = saveBestScore(score);
    overLockUntil = performance.now() + 600; // נעילה קצרה כדי לא להתחיל מחדש בטעות
    refreshStats();
  }

  function update(dt) {
    bird.wing += dt * (state === "over" ? 0 : 12);
    if (state === "ready") {
      bird.y = H / 2 - 40 + Math.sin(performance.now() / 300) * 8;
    }
    if (state !== "over") groundX = (groundX - SPEED * dt) % 40;
    if (state !== "playing") {
      if (state === "over" && bird.y < H - GROUND - bird.r) {
        bird.vy += GRAVITY * dt;
        bird.y = Math.min(bird.y + bird.vy * dt, H - GROUND - bird.r);
      }
      return;
    }

    bird.vy = Math.min(bird.vy + GRAVITY * dt, MAX_FALL);
    bird.y += bird.vy * dt;
    bird.angle = Math.max(-0.5, Math.min(1.3, bird.vy / 500));

    spawnTimer -= dt;
    if (spawnTimer <= 0) { spawnPipe(); spawnTimer = PIPE_EVERY; }

    for (const p of pipes) {
      p.x -= SPEED * dt;
      if (!p.passed && p.x + PIPE_W < bird.x) { p.passed = true; score++; }
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

    // שמש וגבעות
    ctx.fillStyle = "rgba(255,230,150,.85)";
    ctx.beginPath(); ctx.arc(300, 380, 60, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#7b3f6e";
    ctx.beginPath();
    ctx.moveTo(0, H - GROUND);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H - GROUND - 40 - Math.sin(x / 50) * 25);
    ctx.lineTo(W, H - GROUND); ctx.fill();
  }

  function drawPipes() {
    for (const p of pipes) {
      const bottomY = p.top + GAP;
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
    // גוף
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath(); ctx.ellipse(0, 0, bird.r + 3, bird.r, 0, 0, Math.PI * 2); ctx.fill();
    // בטן
    ctx.fillStyle = "#fff3c4";
    ctx.beginPath(); ctx.ellipse(-2, 6, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
    // כנף
    const wy = Math.sin(bird.wing) * 6;
    ctx.fillStyle = "#ff9f1c";
    ctx.beginPath(); ctx.ellipse(-6, wy, 9, 5, -0.3, 0, Math.PI * 2); ctx.fill();
    // עין
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(8, -5, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath(); ctx.arc(10, -5, 3, 0, Math.PI * 2); ctx.fill();
    // מקור
    ctx.fillStyle = "#ff5e5b";
    ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(26, 3); ctx.lineTo(15, 7); ctx.fill();
    ctx.restore();
  }

  function text(str, y, size, color = "#fff") {
    ctx.font = `bold ${size}px "Segoe UI", Arial`;
    ctx.textAlign = "center";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,0,0,.6)";
    ctx.strokeText(str, W / 2, y);
    ctx.fillStyle = color;
    ctx.fillText(str, W / 2, y);
  }

  function draw() {
    drawBackground();
    drawPipes();
    drawGround();
    drawBird();

    if (state === "playing") text(String(score), 70, 48);
    if (state === "ready") {
      text("כנפיים", 150, 52, "#ffd23f");
      text("לחצו כדי להתחיל", 420, 24);
    }
    if (state === "over") {
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.fillRect(0, 0, W, H);
      text("נפסלת!", 180, 48, "#ff5e5b");
      text(`ניקוד: ${score}`, 250, 30);
      const user = getCurrentUser();
      text(`שיא: ${user ? user.best : score}`, 290, 24);
      if (newRecord) text("🎉 שיא חדש!", 340, 26, "#ffd23f");
      text("לחצו כדי לשחק שוב", 420, 22);
    }
  }

  function loop(t) {
    const dt = Math.min((t - (lastTime ?? t)) / 1000, 0.05);
    lastTime = t;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- שליטה ----------
  const gameVisible = () => !document.getElementById("game-screen").classList.contains("hidden");
  function input(e) {
    if (!gameVisible()) return;
    if (state === "over" && performance.now() < overLockUntil) return;
    e.preventDefault();
    flap();
  }
  document.addEventListener("keydown", e => {
    if (e.code === "Space" || e.code === "ArrowUp") input(e);
  });
  canvas.addEventListener("pointerdown", input);

  reset();
  requestAnimationFrame(loop);
  window.Game = { reset };
})();
