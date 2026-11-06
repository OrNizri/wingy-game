// מערכת משתמשים — נשמרת ב-localStorage של הדפדפן
const USERS_KEY = "wingy_users";
const SESSION_KEY = "wingy_session";

// אובייקט בלי prototype, כדי ששמות כמו "__proto__" או "constructor" לא ישברו את הטבלה
function loadUsers() {
  const users = Object.create(null);
  try { Object.assign(users, JSON.parse(localStorage.getItem(USERS_KEY))); } catch {}
  return users;
}
function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

const toHex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
const PBKDF2_ITERATIONS = 210000;

// PBKDF2-SHA256 — איטי בכוונה, כדי שיהיה קשה לנחש סיסמאות גם אם מישהו משיג את הנתונים
async function hashPassword(password, salt, iterations = PBKDF2_ITERATIONS) {
  if (!crypto.subtle) throw new Error("נדרש חיבור מאובטח (https או localhost)");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations }, key, 256);
  return toHex(bits);
}

// תמיכה בחשבונות ישנים שנשמרו עם SHA-256 בודד — משודרגים אוטומטית בכניסה הבאה
async function legacyHash(password, salt) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + password)));
}

// השוואה בזמן קבוע
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function normalize(name) { return name.trim().toLowerCase(); }

async function register(username, password, password2) {
  username = username.trim();
  if (username.length < 3 || username.length > 20) return "שם המשתמש חייב להיות באורך 3–20 תווים";
  if (username.includes(":")) return "שם המשתמש לא יכול להכיל את התו :";
  if (password.length < 6) return "הסיסמה חייבת להכיל לפחות 6 תווים";
  if (password !== password2) return "הסיסמאות אינן תואמות";
  const users = loadUsers();
  const key = normalize(username);
  if (users[key]) return "שם המשתמש כבר תפוס";
  const salt = randomSalt();
  users[key] = { name: username, salt, hash: await hashPassword(password, salt), iter: PBKDF2_ITERATIONS, best: 0 };
  saveUsers(users);
  localStorage.setItem(SESSION_KEY, key);
  return null;
}

async function login(username, password) {
  const users = loadUsers();
  const key = normalize(username);
  const user = users[key];
  const fail = "שם משתמש או סיסמה שגויים";
  if (!user || user.provider || !user.salt) {
    await hashPassword(password, randomSalt()); // אותו זמן תגובה גם כשהמשתמש לא קיים
    return fail;
  }
  const hash = user.iter
    ? await hashPassword(password, user.salt, user.iter)
    : await legacyHash(password, user.salt);
  if (!safeEqual(hash, user.hash)) return fail;
  if (!user.iter) { // שדרוג חשבון ישן ל-PBKDF2
    user.salt = randomSalt();
    user.hash = await hashPassword(password, user.salt);
    user.iter = PBKDF2_ITERATIONS;
    saveUsers(users);
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
  // הערה: בלי שרת אי אפשר לאמת את חתימת הטוקן; בודקים את מה שאפשר בצד הדפדפן
  let info;
  try { info = decodeJwt(credential); } catch { return "הכניסה עם Google נכשלה"; }
  const validIssuer = info.iss === "accounts.google.com" || info.iss === "https://accounts.google.com";
  if (!validIssuer || info.aud !== GOOGLE_CLIENT_ID || !info.sub || !(info.exp * 1000 > Date.now())) {
    return "הכניסה עם Google נכשלה";
  }
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
  if (score > (Number(users[key].best) || 0)) {
    users[key].best = score;
    saveUsers(users);
    return true;
  }
  return false;
}

function getLeaderboard(limit = 5) {
  return Object.entries(loadUsers())
    .map(([key, u]) => ({ key, name: String(u.name ?? ""), best: Number(u.best) || 0 }))
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
  const btn = e.target.querySelector("button"); btn.disabled = true;
  const err = await login($("login-username").value, $("login-password").value)
    .catch(ex => ex.message).finally(() => { btn.disabled = false; });
  $("login-error").textContent = err || "";
  if (!err) { e.target.reset(); showScreen(); }
});

$("register-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = e.target.querySelector("button"); btn.disabled = true;
  const err = await register($("reg-username").value, $("reg-password").value, $("reg-password2").value)
    .catch(ex => ex.message).finally(() => { btn.disabled = false; });
  $("register-error").textContent = err || "";
  if (!err) { e.target.reset(); showScreen(); }
});

$("logout-btn").addEventListener("click", () => { logout(); showScreen(); });

window.addEventListener("DOMContentLoaded", showScreen);
window.addEventListener("load", initGoogleSignIn); // אחרי שסקריפט Google נטען
