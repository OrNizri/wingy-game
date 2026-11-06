// מערכת משתמשים — נשמרת ב-localStorage של הדפדפן
const USERS_KEY = "wingy_users";
const SESSION_KEY = "wingy_session";

function loadUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; }
  catch { return {}; }
}
function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(salt + ":" + password);
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
  }
  // גיבוי לדפדפנים בלי Web Crypto
  let h = 5381;
  for (const b of data) h = ((h << 5) + h + b) | 0;
  return "f" + (h >>> 0).toString(16);
}

function normalize(name) { return name.trim().toLowerCase(); }

async function register(username, password, password2) {
  username = username.trim();
  if (username.length < 3 || username.length > 20) return "שם המשתמש חייב להיות באורך 3–20 תווים";
  if (username.includes(":")) return "שם המשתמש לא יכול להכיל את התו :";
  if (password.length < 4) return "הסיסמה חייבת להכיל לפחות 4 תווים";
  if (password !== password2) return "הסיסמאות אינן תואמות";
  const users = loadUsers();
  const key = normalize(username);
  if (users[key]) return "שם המשתמש כבר תפוס";
  const salt = randomSalt();
  users[key] = { name: username, salt, hash: await hashPassword(password, salt), best: 0 };
  saveUsers(users);
  localStorage.setItem(SESSION_KEY, key);
  return null;
}

async function login(username, password) {
  const users = loadUsers();
  const key = normalize(username);
  const user = users[key];
  if (!user || user.provider || (await hashPassword(password, user.salt)) !== user.hash) {
    return "שם משתמש או סיסמה שגויים";
  }
  localStorage.setItem(SESSION_KEY, key);
  return null;
}

// ---------- כניסה עם Google ----------
function decodeJwt(token) {
  const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function loginWithGoogle(credential) {
  if (!GOOGLE_CLIENT_ID) return "כניסה עם Google לא מוגדרת";
  const info = decodeJwt(credential);
  if (info.aud !== GOOGLE_CLIENT_ID || info.exp * 1000 < Date.now()) return "הכניסה עם Google נכשלה";
  const users = loadUsers();
  const key = "google:" + info.sub;
  const name = info.given_name || info.name || info.email;
  users[key] = { ...(users[key] || { best: 0 }), name, email: info.email, provider: "google" };
  saveUsers(users);
  localStorage.setItem(SESSION_KEY, key);
  return null;
}

function initGoogleSignIn() {
  const hasGoogle = typeof GOOGLE_CLIENT_ID === "string" && GOOGLE_CLIENT_ID.trim() &&
                    window.google && google.accounts && google.accounts.id;
  document.getElementById("google-note").classList.toggle("hidden", !!hasGoogle);
  document.getElementById("google-btn").classList.toggle("hidden", !hasGoogle);
  if (!hasGoogle) return;
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: res => {
      const err = loginWithGoogle(res.credential);
      document.getElementById("google-error").textContent = err || "";
      if (!err) showScreen();
    },
  });
  google.accounts.id.renderButton(document.getElementById("google-btn"), {
    theme: "outline", size: "large", text: "signin_with", locale: "he", width: 280,
  });
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
}

function getCurrentUser() {
  const key = localStorage.getItem(SESSION_KEY);
  if (!key) return null;
  const user = loadUsers()[key];
  return user ? { key, ...user } : null;
}

function saveBestScore(score) {
  const key = localStorage.getItem(SESSION_KEY);
  const users = loadUsers();
  if (!key || !users[key]) return false;
  if (score > users[key].best) {
    users[key].best = score;
    saveUsers(users);
    return true;
  }
  return false;
}

function getLeaderboard(limit = 5) {
  return Object.entries(loadUsers())
    .map(([key, u]) => ({ key, name: u.name, best: u.best }))
    .filter(u => u.best > 0)
    .sort((a, b) => b.best - a.best)
    .slice(0, limit);
}

// ---------- ממשק ----------
const $ = id => document.getElementById(id);

function showScreen() {
  const user = getCurrentUser();
  $("auth-screen").classList.toggle("hidden", !!user);
  $("game-screen").classList.toggle("hidden", !user);
  if (user) {
    $("current-user").textContent = user.name;
    refreshStats();
    if (window.Game) window.Game.reset();
  }
}

function refreshStats() {
  const user = getCurrentUser();
  if (!user) return;
  $("best-score").textContent = user.best;
  const list = $("leaderboard-list");
  list.innerHTML = "";
  const board = getLeaderboard();
  if (!board.length) {
    list.innerHTML = "<li>עדיין אין שיאים</li>";
    return;
  }
  for (const entry of board) {
    const li = document.createElement("li");
    li.textContent = `${entry.name} — ${entry.best}`;
    if (entry.key === user.key) li.classList.add("me");
    list.appendChild(li);
  }
}

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
    $("login-form").classList.toggle("hidden", tab.dataset.tab !== "login");
    $("register-form").classList.toggle("hidden", tab.dataset.tab !== "register");
    $("login-error").textContent = "";
    $("register-error").textContent = "";
  });
});

$("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const err = await login($("login-username").value, $("login-password").value);
  $("login-error").textContent = err || "";
  if (!err) { e.target.reset(); showScreen(); }
});

$("register-form").addEventListener("submit", async e => {
  e.preventDefault();
  const err = await register($("reg-username").value, $("reg-password").value, $("reg-password2").value);
  $("register-error").textContent = err || "";
  if (!err) { e.target.reset(); showScreen(); }
});

$("logout-btn").addEventListener("click", () => { logout(); showScreen(); });

window.addEventListener("DOMContentLoaded", showScreen);
window.addEventListener("load", initGoogleSignIn); // אחרי שסקריפט Google נטען
