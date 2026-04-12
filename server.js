import express from "express";
import cors from "cors";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  pgTable, text, serial, timestamp, integer, numeric
} from "drizzle-orm/pg-core";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── DATABASE SCHEMA ────────────────────────────────────────────────────────
const usersTable = pgTable("users", {
  id:           serial("id").primaryKey(),
  username:     text("username").notNull().unique(),
  email:        text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  balance:      numeric("balance", { precision: 18, scale: 2 }).notNull().default("0"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

const sessionsTable = pgTable("sessions", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull(),
  token:     text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

const operationsTable = pgTable("operations", {
  id:            serial("id").primaryKey(),
  userId:        integer("user_id").notNull(),
  operationType: text("operation_type").notNull(),
  status:        text("status").notNull().default("pending"),
  cost:          numeric("cost", { precision: 10, scale: 2 }).notNull(),
  result:        text("result"),
  accessToken:   text("access_token"),
  manualEmail:   text("manual_email"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

const settingsTable = pgTable("settings", {
  id:        serial("id").primaryKey(),
  key:       text("key").notNull().unique(),
  value:     text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── DATABASE CONNECTION ─────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required.");
  console.error("Set it in .env file: DATABASE_URL=postgresql://user:pass@host:5432/dbname");
  process.exit(1);
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

// ─── APP SETUP ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function hashPassword(password) {
  return crypto.createHash("sha256").update(password + "tamilanda_salt_2024").digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.token, token));
  if (!session) { res.status(401).json({ error: "Invalid or expired session" }); return; }
  if (session.expiresAt < new Date()) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
    res.status(401).json({ error: "Session expired" }); return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }
  req.userId = user.id;
  req.user   = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.username !== "tamilanda") {
    res.status(403).json({ error: "Admin access required" }); return;
  }
  next();
}

async function garenaGet(url, params) {
  const qs = new URLSearchParams(params).toString();
  const resp = await fetch(`${url}?${qs}`, {
    signal: AbortSignal.timeout(20000),
    headers: { "user-agent": "Mozilla/5.0" },
  });
  const data = await resp.json();
  let ok = data?.success === true;
  if (ok && data?.data?.error) ok = false;
  if (ok && data?.data?.garena_response?.error) ok = false;
  if (ok && data?.error) ok = false;
  return { ok, data };
}

function extractError(data) {
  try {
    if (data?.error) {
      const e = data.error;
      if (typeof e === "string") return e;
      if (typeof e === "object") {
        const gr = e?.garena_response;
        if (gr?.error) return gr.error;
        if (e?.message) return e.message;
        if (e?.error) return e.error;
        return JSON.stringify(e);
      }
    }
    if (data?.data?.error) return data.data.error;
    if (data?.data?.garena_response?.error) return data.data.garena_response.error;
    if (data?.message) return data.message;
  } catch {}
  return "Unknown error";
}

async function deductBalance(userId, amount) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return { success: false, error: "User not found" };
  const current = parseFloat(user.balance);
  if (current < amount) return { success: false, error: "Insufficient balance" };
  await db.update(usersTable).set({ balance: (current - amount).toFixed(2) }).where(eq(usersTable.id, userId));
  return { success: true };
}

async function refundBalance(userId, amount) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (user) {
    const refunded = parseFloat(user.balance) + amount;
    await db.update(usersTable).set({ balance: refunded.toFixed(2) }).where(eq(usersTable.id, userId));
  }
}

// ─── GARENA API ENDPOINTS ────────────────────────────────────────────────────
const CHECK_API               = "https://bindinfocrownx612.vercel.app/check";
const CANCEL_API              = "https://bindcnclcrownx34.vercel.app/cancelbind";
const ADD_BIND_API            = "https://bindcnclcrownx34.vercel.app/bind";
const CONFIRM_BIND_API        = "https://bindcnclcrownx34.vercel.app/confirmbind";
const REBIND_CODE_SEND_OTP    = "https://chngemailcode48.vercel.app/send_otp";
const REBIND_CODE_VERIFY_OTP  = "https://chngemailcode48.vercel.app/verify_otp";
const REBIND_CODE_VERIFY_ID   = "https://chngemailcode48.vercel.app/verify_identity";
const REBIND_CODE_CREATE      = "https://chngemailcode48.vercel.app/create_rebind";
const REBIND_OTP_SEND_OLD     = "https://chngeforgotcrownx72.vercel.app/otp";
const REBIND_OTP_VERIFY_OLD   = "https://chngeforgotcrownx72.vercel.app/verify";
const REBIND_OTP_SEND_NEW     = "https://chngeforgotcrownx72.vercel.app/newotp";
const REBIND_OTP_VERIFY_NEW   = "https://chngeforgotcrownx72.vercel.app/newverify";
const REBIND_OTP_CHANGE       = "https://chngeforgotcrownx72.vercel.app/change";
const UNBIND_CODE_API         = "https://crownxnewkey10010.vercel.app/securityunbind";
const UNBIND_FORGOT_API       = "https://crownxforgotremove23.vercel.app/forgotunbind";
const REVOKE_TOKEN_API        = "https://crownxrevoker73.vercel.app/revoke";
const AUTO_EXTRACT_API        = "https://dakkssh-sigma.vercel.app/auto_extract";
const GARENA_PLATFORM_API     = "https://100067.connect.garena.com/bind/app/platform/info/get";
const GARENA_PLATFORM_MAP     = { 3:"Facebook", 8:"Gmail", 10:"iCloud", 5:"VK", 11:"Twitter", 7:"Huawei" };

const PRICING = {
  rebindCode: 3000, rebindOtp: 3000, cancelEmail: 1500,
  addEmail: 1000,   checkEmail: 500, unbindCode: 1500,
  unbindOtp: 3000,  checkPlatforms: 500, revokeToken: 500,
};

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) { res.status(400).json({ error: "username and password required" }); return; }
  const passwordHash = hashPassword(password);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (!user || user.passwordHash !== passwordHash) {
    res.status(401).json({ error: "Invalid username or password" }); return;
  }
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(sessionsTable).values({ userId: user.id, token, expiresAt });
  res.json({ user: { id: user.id, username: user.username, email: user.email, balance: parseFloat(user.balance), createdAt: user.createdAt.toISOString() }, token });
});

app.post("/api/auth/register", async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password || !email) { res.status(400).json({ error: "username, password, and email required" }); return; }
  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existingUser) { res.status(400).json({ error: "Username already taken" }); return; }
  const [existingEmail] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existingEmail) { res.status(400).json({ error: "Email already registered" }); return; }
  const passwordHash = hashPassword(password);
  try {
    const [user] = await db.insert(usersTable).values({ username, email, passwordHash, balance: "0" }).returning();
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(sessionsTable).values({ userId: user.id, token, expiresAt });
    res.status(201).json({ user: { id: user.id, username: user.username, email: user.email, balance: parseFloat(user.balance), createdAt: user.createdAt.toISOString() }, token });
  } catch (err) {
    if (err?.code === "23505") { res.status(400).json({ error: "Username or email already registered" }); }
    else { res.status(500).json({ error: "Registration failed" }); }
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const u = req.user;
  res.json({ id: u.id, username: u.username, email: u.email, balance: parseFloat(u.balance), createdAt: u.createdAt.toISOString() });
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  const token = req.headers.authorization.slice(7);
  await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  res.json({ message: "Logged out successfully" });
});

// ─── BALANCE ROUTES ───────────────────────────────────────────────────────────
const RECHARGE_CODES = {
  "TAMILANDA100": 100, "TAMILANDA500": 500, "TAMILANDA1000": 1000,
  "TAMILANDA5000": 5000, "TAMILANDA9999999": 9999999,
  "DEMO2024": 9999999989999, "ADMIN9999": 9999999989999,
};

app.post("/api/balance/add", requireAuth, async (req, res) => {
  const { code } = req.body;
  if (!code) { res.status(400).json({ error: "code required" }); return; }
  const amount = RECHARGE_CODES[code.toUpperCase()];
  if (!amount) { res.status(400).json({ error: "Invalid recharge code" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId));
  const newBalance = parseFloat(user.balance) + amount;
  const [updated] = await db.update(usersTable).set({ balance: newBalance.toFixed(2) }).where(eq(usersTable.id, req.userId)).returning();
  res.json({ id: updated.id, username: updated.username, email: updated.email, balance: parseFloat(updated.balance), createdAt: updated.createdAt.toISOString() });
});

// ─── TOKEN ROUTES ─────────────────────────────────────────────────────────────
const SOCIAL_AUTH_URLS = {
  facebook: "https://sso.garena.com/api/login?app_id=10100&redirect_uri=https%3A%2F%2Fapi.ff.garena.co.id%2Fauth%2Fauth%2Fcallback_n&response_type=code&socialite_type=facebook",
  gmail:    "https://sso.garena.com/api/login?app_id=10100&redirect_uri=https%3A%2F%2Fapi.ff.garena.co.id%2Fauth%2Fauth%2Fcallback_n&response_type=code&socialite_type=google",
  vk:       "https://sso.garena.com/api/login?app_id=10100&redirect_uri=https%3A%2F%2Fapi.ff.garena.co.id%2Fauth%2Fauth%2Fcallback_n&response_type=code&socialite_type=vk",
  twitter:  "https://sso.garena.com/api/login?app_id=10100&redirect_uri=https%3A%2F%2Fapi.ff.garena.co.id%2Fauth%2Fauth%2Fcallback_n&response_type=code&socialite_type=twitter",
  apple:    "https://sso.garena.com/api/login?app_id=10100&redirect_uri=https%3A%2F%2Fapi.ff.garena.co.id%2Fauth%2Fauth%2Fcallback_n&response_type=code&socialite_type=apple",
};

app.get("/api/tokens/auth-urls", (_req, res) => { res.json(SOCIAL_AUTH_URLS); });

app.post("/api/tokens/auto-extract", async (req, res) => {
  const { url: kiosUrl } = req.body;
  if (!kiosUrl) { res.status(400).json({ error: "url field is required" }); return; }
  try { new URL(kiosUrl); } catch { res.status(400).json({ error: "Invalid URL format" }); return; }
  try {
    const formData = new FormData();
    formData.append("url", kiosUrl);
    const resp = await fetch(AUTO_EXTRACT_API, {
      method: "POST",
      headers: { "accept": "*/*", "origin": "https://dakkssh-sigma.vercel.app", "referer": "https://dakkssh-sigma.vercel.app/dashboard", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      body: formData, signal: AbortSignal.timeout(20000),
    });
    const data = await resp.json();
    if (!resp.ok || data.status !== "success") { res.status(400).json({ error: data.error || data.message || "Extraction failed" }); return; }
    res.json({ accessToken: data.access_token, nickname: data.nickname !== "Unknown" ? data.nickname : null, uid: data.uid !== "N/A" ? data.uid : null, region: data.region || null });
  } catch (err) {
    if (err?.name === "TimeoutError") { res.status(504).json({ error: "Auto-extract timed out" }); }
    else { res.status(503).json({ error: "Auto-extract unavailable" }); }
  }
});

app.post("/api/tokens/extract", (req, res) => {
  const { callbackUrl } = req.body;
  if (!callbackUrl) { res.status(400).json({ error: "callbackUrl required" }); return; }
  try {
    const url = new URL(callbackUrl);
    const params = url.searchParams;
    const eat = params.get("eat"), code = params.get("code"), directToken = params.get("access_token") || params.get("token");
    const accountId = params.get("account_id") || params.get("uid") || null;
    const nickname = params.get("nickname") || null;
    const region = params.get("region") || null;
    const meta = { ...(accountId ? { accountId } : {}), ...(nickname ? { nickname } : {}), ...(region ? { region } : {}) };
    const platform = callbackUrl.includes("kiosgamer") ? "Kiosgamer" : callbackUrl.includes("facebook") ? "Facebook" : callbackUrl.includes("google") ? "Gmail" : "Garena";
    if (eat)         { res.json({ accessToken: eat, platform, ...meta }); return; }
    if (directToken) { res.json({ accessToken: directToken, platform, ...meta }); return; }
    if (code)        { res.json({ accessToken: code, platform, ...meta }); return; }
    res.status(400).json({ error: "No access token found in URL. Expected: eat, code, or access_token parameter." });
  } catch { res.status(400).json({ error: "Invalid URL format" }); }
});

// ─── OPERATIONS ROUTES ────────────────────────────────────────────────────────

// 1. Check Recovery Email (₹500)
app.post("/api/operations/check-recovery-email", requireAuth, async (req, res) => {
  const { accessToken } = req.body;
  if (!accessToken) { res.status(400).json({ error: "accessToken required" }); return; }
  const deduct = await deductBalance(req.userId, PRICING.checkEmail);
  if (!deduct.success) { res.status(402).json({ error: deduct.error }); return; }
  try {
    const result = await garenaGet(CHECK_API, { access_token: accessToken });
    if (!result.ok) { await refundBalance(req.userId, PRICING.checkEmail); res.status(400).json({ error: extractError(result.data) || "Invalid access token." }); return; }
    const inner = result.data?.data || {};
    const isBound = (inner.result === 1);
    await db.insert(operationsTable).values({ userId: req.userId, operationType: "check_recovery_email", status: "completed", cost: PRICING.checkEmail.toString(), result: inner.email || (isBound ? "email_bound_hidden" : "no_email_bound"), accessToken });
    res.json({ success: true, email: inner.email || null, email_to_be: inner.email_to_be || null, mobile: inner.mobile || null, isBound, countdown: inner.countdown_human || null, status: inner.summary || (isBound ? "Recovery email found" : "No recovery email set"), noEmailBound: !isBound });
  } catch { await refundBalance(req.userId, PRICING.checkEmail); res.status(503).json({ error: "Service unavailable" }); }
});

// 2. Cancel Recovery Email (₹1500)
app.post("/api/operations/cancel-recovery-email", requireAuth, async (req, res) => {
  const { accessToken } = req.body;
  if (!accessToken) { res.status(400).json({ error: "accessToken required" }); return; }
  const deduct = await deductBalance(req.userId, PRICING.cancelEmail);
  if (!deduct.success) { res.status(402).json({ error: deduct.error }); return; }
  try {
    const result = await garenaGet(CANCEL_API, { access_token: accessToken });
    if (!result.ok) { await refundBalance(req.userId, PRICING.cancelEmail); res.status(400).json({ error: extractError(result.data) || "Cancel failed." }); return; }
    await db.insert(operationsTable).values({ userId: req.userId, operationType: "cancel_recovery_email", status: "completed", cost: PRICING.cancelEmail.toString(), result: "Recovery email cancelled" });
    res.json({ success: true, message: "Recovery email cancelled successfully." });
  } catch { await refundBalance(req.userId, PRICING.cancelEmail); res.status(503).json({ error: "Service unavailable" }); }
});

// 3. Add Recovery Email — Step 1: Send OTP (₹1000)
app.post("/api/operations/add-recovery-email", requireAuth, async (req, res) => {
  const { accessToken, email } = req.body;
  if (!accessToken || !email) { res.status(400).json({ error: "accessToken and email required" }); return; }
  const deduct = await deductBalance(req.userId, PRICING.addEmail);
  if (!deduct.success) { res.status(402).json({ error: deduct.error }); return; }
  try {
    const result = await garenaGet(ADD_BIND_API, { access_token: accessToken, email });
    if (!result.ok) { await refundBalance(req.userId, PRICING.addEmail); res.status(400).json({ error: extractError(result.data) || "Failed to initiate email add." }); return; }
    await db.insert(operationsTable).values({ userId: req.userId, operationType: "add_recovery_email", status: "processing", cost: PRICING.addEmail.toString(), result: `OTP sent to ${email}`, accessToken });
    res.json({ success: true, otpSent: true, message: `OTP sent to ${email}. Enter OTP and security code to complete.` });
  } catch { await refundBalance(req.userId, PRICING.addEmail); res.status(503).json({ error: "Service unavailable" }); }
});

// 3b. Add Recovery Email — Step 2: Verify OTP (free)
app.post("/api/operations/verify-email", requireAuth, async (req, res) => {
  const { accessToken, email, otp, securityCode } = req.body;
  if (!accessToken || !email || !otp || !securityCode) { res.status(400).json({ error: "accessToken, email, otp, and securityCode required" }); return; }
  try {
    const result = await garenaGet(CONFIRM_BIND_API, { access_token: accessToken, email, otp, security_code: securityCode });
    if (!result.ok) { res.status(400).json({ error: extractError(result.data) || "Verification failed." }); return; }
    await db.update(operationsTable).set({ status: "completed", result: `${email} added successfully` }).where(and(eq(operationsTable.userId, req.userId), eq(operationsTable.operationType, "add_recovery_email"), eq(operationsTable.status, "processing")));
    res.json({ success: true, message: `${email} successfully added as recovery email!` });
  } catch { res.status(503).json({ error: "Service unavailable" }); }
});

// 4. Rebind with Security Code — Step 1: Send OTP (free)
app.post("/api/operations/send-otp", requireAuth, async (req, res) => {
  const { accessToken, email } = req.body;
  if (!accessToken || !email) { res.status(400).json({ error: "accessToken and email required" }); return; }
  try {
    const result = await garenaGet(REBIND_CODE_SEND_OTP, { access_token: accessToken, email });
    if (!result.ok) { res.status(400).json({ error: extractError(result.data) || "Failed to send OTP." }); return; }
    res.json({ success: true, message: `OTP sent to ${email}.` });
  } catch { res.status(503).json({ error: "Service unavailable" }); }
});

// 4b. Rebind with Security Code — Step 2: Verify + Create (₹3000)
app.post("/api/operations/rebind-email-code", requireAuth, async (req, res) => {
  const { accessToken, newEmail, otp, securityCode } = req.body;
  if (!accessToken || !newEmail || !otp || !securityCode) { res.status(400).json({ error: "accessToken, newEmail, otp, and securityCode required" }); return; }
  const deduct = await deductBalance(req.userId, PRICING.rebindCode);
  if (!deduct.success) { res.status(402).json({ error: deduct.error }); return; }
  try {
    const verifyOtp = await garenaGet(REBIND_CODE_VERIFY_OTP, { access_token: accessToken, email: newEmail, otp });
    if (!verifyOtp.ok) { await refundBalance(req.userId, PRICING.rebindCode); res.status(400).json({ error: extractError(verifyOtp.data) || "OTP verification failed." }); return; }
    const verifierToken = verifyOtp.data?.verifier_token || verifyOtp.data?.data?.verifier_token;
    if (!verifierToken) { await refundBalance(req.userId, PRICING.rebindCode); res.status(400).json({ error: "Could not get verifier token." }); return; }
    const verifyId = await garenaGet(REBIND_CODE_VERIFY_ID, { access_token: accessToken, code: securityCode });
    if (!verifyId.ok) { await refundBalance(req.userId, PRICING.rebindCode); res.status(400).json({ error: extractError(verifyId.data) || "Security code verification failed." }); return; }
    const identityToken = verifyId.data?.identity_token || verifyId.data?.data?.identity_token;
    if (!identityToken) { await refundBalance(req.userId, PRICING.rebindCode); res.status(400).json({ error: "Could not get identity token." }); return; }
    const createRebind = await garenaGet(REBIND_CODE_CREATE, { access_token: accessToken, email: newEmail, identity_token: identityToken, verifier_token: verifierToken });
    if (!createRebind.ok) { await refundBalance(req.userId, PRICING.rebindCode); res.status(400).json({ error: extractError(createRebind.data) || "Rebind creation failed." }); return; }
    await db.insert(operationsTable).values({ userId: req.userId, operationType: "rebind_email_code", status: "completed", cost: PRICING.rebindCode.toString(), result: `Rebound to ${newEmail}` });
    res.json({ success: true, message: `Email successfully rebound to ${newEmail}!` });
  } catch { await refundBalance(req.userId, PRICING.rebindCode); res.status(503).json({ error: "Service unavailable" }); }
});

// 5. Rebind with OTP — Step 1: Send OTP to current email (free)
app.post("/api/operations/rebind-otp/send-old-otp", requireAuth, async (req, res) => {
  const { accessToken, currentEmail } = req.body;
  if (!accessToken || !currentEmail) { res.status(400).json({ error: "accessToken and currentEmail required" }); return; }
  try {
    const result = await garenaGet(REBIND_OTP_SEND_OLD, { access_token: accessToken, current_email: currentEmail });
    if (!result.ok) { res.status(400).json({ error: extractError(result.data) || "Failed to send OTP." }); return; }
    res.json({ success: true, message: `OTP sent to ${currentEmail}.` });
  } catch { res.status(503).json({ error: "Service unavailable" }); }
});

// 5b. Rebind with OTP — Step 2: Verify old OTP + Send new OTP (free)
app.post("/api/operations/rebind-otp/verify-and-send-new", requireAuth, async (req, res) => {
  const { accessToken, currentEmail, oldOtp, newEmail } = req.body;
  if (!accessToken || !currentEmail || !oldOtp || !newEmail) { res.status(400).json({ error: "accessToken, currentEmail, oldOtp, and newEmail required" }); return; }
  try {
    const verifyOld = await garenaGet(REBIND_OTP_VERIFY_OLD, { access_token: accessToken, current_email: currentEmail, otp: oldOtp });
    if (!verifyOld.ok) { res.status(400).json({ error: extractError(verifyOld.data) || "Old OTP verification failed." }); return; }
    const identityToken = verifyOld.data?.identity_token || verifyOld.data?.data?.identity_token;
    if (!identityToken) { res.status(400).json({ error: "Could not get identity token." }); return; }
    const sendNew = await garenaGet(REBIND_OTP_SEND_NEW, { access_token: accessToken, new_email: newEmail });
    if (!sendNew.ok) { res.status(400).json({ error: extractError(sendNew.data) || "Failed to send OTP to new email." }); return; }
    res.json({ success: true, identityToken, message: `OTP sent to ${newEmail}.` });
  } catch { res.status(503).json({ error: "Service unavailable" }); }
});

// 5c. Rebind with OTP — Step 3: Verify new OTP + Complete (₹3000)
app.post("/api/operations/rebind-email-otp", requireAuth, async (req, res) => {
  const { accessToken, newEmail, newOtp, identityToken } = req.body;
  if (!accessToken || !newEmail || !newOtp || !identityToken) { res.status(400).json({ error: "accessToken, newEmail, newOtp, and identityToken required" }); return; }
  const deduct = await deductBalance(req.userId, PRICING.rebindOtp);
  if (!deduct.success) { res.status(402).json({ error: deduct.error }); return; }
  try {
    const verifyNew = await garenaGet(REBIND_OTP_VERIFY_NEW, { access_token: accessToken, new_email: newEmail, otp: newOtp });
    if (!verifyNew.ok) { await refundBalance(req.userId, PRICING.rebindOtp); res.status(400).json({ error: extractError(verifyNew.data) || "New OTP verification failed." }); return; }
    const verifierToken = verifyNew.data?.verifier_token || verifyNew.data?.data?.verifier_token;
    if (!verifierToken) { await refundBalance(req.userId, PRICING.rebindOtp); res.status(400).json({ error: "Could not get verifier token." }); return; }
    const change = await garenaGet(REBIND_OTP_CHANGE, { access_token: accessToken, new_email: newEmail, identity_token: identityToken, verifier_token: verifierToken });
    if (!change.ok) { await refundBalance(req.userId, PRICING.rebindOtp); res.status(400).json({ error: extractError(change.data) || "Rebind failed." }); return; }
    await db.insert(operationsTable).values({ userId: req.userId, operationType: "rebind_email_otp", status: "completed", cost: PRICING.rebindOtp.toString(), result: `Rebound to ${newEmail}` });
    res.json({ success: true, message: `Email successfully rebound to ${newEmail}!` });
  } catch { await refundBalance(req.userId, PRICING.rebindOtp); res.status(503).json({ error: "Service unavailable" }); }
});

// 6. Unbind with Security Code (₹1500)
app.post("/api/operations/unbind-with-code", requireAuth, async (req, res) => {
  const { accessToken, securityCode } = req.body;
  if (!accessToken || !securityCode) { res.status(400).json({ error: "accessToken and securityCode required" }); return; }
  const deduct = await deductBalance(req.userId, PRICING.unbindCode);
  if (!deduct.success) { res.status(402).json({ error: deduct.error }); return; }
  try {
    const result = await garenaGet(UNBIND_CODE_API, { access_token: accessToken, security_code: securityCode });
    if (!result.ok) { await refundBalance(req.userId, PRICING.unbindCode); res.status(400).json({ error: extractError(result.data) || "Unbind failed." }); return; }
    await db.insert(operationsTable).values({ userId: req.userId, operationType: "unbind_with_code", status: "completed", cost: PRICING.unbindCode.toString(), result: "Unbind request created — 15-day timer started" });
    res.json({ success: true, message: "Unbind request created! 15-day timer started." });
  } catch { await refundBalance(req.userId, PRICING.unbindCode); res.status(503).json({ error: "Service unavailable" }); }
});

// 7. Unbind without Security Code — Step 1: Send OTP (free)
app.post("/api/operations/unbind-otp/send-otp", requireAuth, async (req, res) => {
  const { accessToken, currentEmail } = req.body;
  if (!accessToken || !currentEmail) { res.status(400).json({ error: "accessToken and currentEmail required" }); return; }
  try {
    const result = await garenaGet(REBIND_OTP_SEND_OLD, { access_token: accessToken, current_email: currentEmail });
    if (!result.ok) { res.status(400).json({ error: extractError(result.data) || "Failed to send OTP." }); return; }
    res.json({ success: true, message: `OTP sent to ${currentEmail}.` });
  } catch { res.status(503).json({ error: "Service unavailable" }); }
});

// 7b. Unbind without Security Code — Step 2: Verify OTP + Create Unbind (₹3000)
app.post("/api/operations/unbind-email-otp", requireAuth, async (req, res) => {
  const { accessToken, currentEmail, otp } = req.body;
  if (!accessToken || !currentEmail || !otp) { res.status(400).json({ error: "accessToken, currentEmail, and otp required" }); return; }
  const deduct = await deductBalance(req.userId, PRICING.unbindOtp);
  if (!deduct.success) { res.status(402).json({ error: deduct.error }); return; }
  try {
    const verifyOld = await garenaGet(REBIND_OTP_VERIFY_OLD, { access_token: accessToken, current_email: currentEmail, otp });
    if (!verifyOld.ok) { await refundBalance(req.userId, PRICING.unbindOtp); res.status(400).json({ error: extractError(verifyOld.data) || "OTP verification failed." }); return; }
    const identityToken = verifyOld.data?.identity_token || verifyOld.data?.data?.identity_token;
    if (!identityToken) { await refundBalance(req.userId, PRICING.unbindOtp); res.status(400).json({ error: "Could not get identity token." }); return; }
    const createUnbind = await garenaGet(UNBIND_FORGOT_API, { access_token: accessToken, identity_token: identityToken });
    if (!createUnbind.ok) { await refundBalance(req.userId, PRICING.unbindOtp); res.status(400).json({ error: extractError(createUnbind.data) || "Failed to create unbind request." }); return; }
    await db.insert(operationsTable).values({ userId: req.userId, operationType: "unbind_without_code", status: "completed", cost: PRICING.unbindOtp.toString(), result: "Unbind request created — 15-day timer started" });
    res.json({ success: true, message: "Unbind request created! 15-day timer started." });
  } catch { await refundBalance(req.userId, PRICING.unbindOtp); res.status(503).json({ error: "Service unavailable" }); }
});

// 8. Check Platform Links (₹500)
app.post("/api/operations/check-platforms", requireAuth, async (req, res) => {
  const { accessToken } = req.body;
  if (!accessToken) { res.status(400).json({ error: "accessToken required" }); return; }
  const deduct = await deductBalance(req.userId, PRICING.checkPlatforms);
  if (!deduct.success) { res.status(402).json({ error: deduct.error }); return; }
  try {
    const qs = new URLSearchParams({ access_token: accessToken }).toString();
    const resp = await fetch(`${GARENA_PLATFORM_API}?${qs}`, { signal: AbortSignal.timeout(20000), headers: { "user-agent": "Mozilla/5.0" } });
    const data = await resp.json();
    if (!resp.ok || data?.errcode) {
      await refundBalance(req.userId, PRICING.checkPlatforms);
      res.status(400).json({ error: data?.errmsg || "Failed to fetch platform info." }); return;
    }
    const platforms = (data?.data?.list || []).map(p => ({ id: p.type, name: GARENA_PLATFORM_MAP[p.type] || `Platform ${p.type}`, linked: true }));
    await db.insert(operationsTable).values({ userId: req.userId, operationType: "check_platforms", status: "completed", cost: PRICING.checkPlatforms.toString(), result: `${platforms.length} platforms found`, accessToken });
    res.json({ success: true, platforms });
  } catch { await refundBalance(req.userId, PRICING.checkPlatforms); res.status(503).json({ error: "Service unavailable" }); }
});

// 9. Revoke Token (₹500)
app.post("/api/operations/revoke-token", requireAuth, async (req, res) => {
  const { accessToken } = req.body;
  if (!accessToken) { res.status(400).json({ error: "accessToken required" }); return; }
  const deduct = await deductBalance(req.userId, PRICING.revokeToken);
  if (!deduct.success) { res.status(402).json({ error: deduct.error }); return; }
  try {
    const result = await garenaGet(REVOKE_TOKEN_API, { access_token: accessToken });
    if (!result.ok) { await refundBalance(req.userId, PRICING.revokeToken); res.status(400).json({ error: extractError(result.data) || "Revoke failed." }); return; }
    await db.insert(operationsTable).values({ userId: req.userId, operationType: "revoke_token", status: "completed", cost: PRICING.revokeToken.toString(), result: "Token revoked successfully", accessToken });
    res.json({ success: true, message: "Token revoked successfully!" });
  } catch { await refundBalance(req.userId, PRICING.revokeToken); res.status(503).json({ error: "Service unavailable" }); }
});

// Operation history
app.get("/api/operations/history", requireAuth, async (req, res) => {
  const ops = await db.select().from(operationsTable).where(eq(operationsTable.userId, req.userId)).orderBy(desc(operationsTable.createdAt)).limit(50);
  res.json(ops.map(op => ({ ...op, cost: parseFloat(op.cost ?? "0") })));
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────
app.get("/api/admin/stats", requireAuth, requireAdmin, async (req, res) => {
  const [userCount] = await db.select({ count: sql`count(*)::int` }).from(usersTable);
  const [opCount] = await db.select({ count: sql`count(*)::int` }).from(operationsTable);
  const [revenue] = await db.select({ total: sql`coalesce(sum(cost), 0)` }).from(operationsTable).where(eq(operationsTable.status, "success"));
  const recentOps = await db.select().from(operationsTable).orderBy(desc(operationsTable.createdAt)).limit(5);
  res.json({ totalUsers: userCount.count, totalOperations: opCount.count, totalRevenue: parseFloat(revenue.total), recentOperations: recentOps });
});

app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  const users = await db.select({ id: usersTable.id, username: usersTable.username, email: usersTable.email, balance: usersTable.balance, createdAt: usersTable.createdAt }).from(usersTable).orderBy(desc(usersTable.createdAt));
  res.json(users.map(u => ({ ...u, balance: parseFloat(u.balance) })));
});

app.put("/api/admin/users/:id/balance", requireAuth, requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }
  const balance = parseFloat(req.body.balance);
  if (isNaN(balance) || balance < 0) { res.status(400).json({ error: "Invalid balance" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.username === "tamilanda") { res.status(400).json({ error: "Cannot modify admin balance" }); return; }
  const [updated] = await db.update(usersTable).set({ balance: balance.toFixed(2) }).where(eq(usersTable.id, userId)).returning();
  res.json({ id: updated.id, username: updated.username, balance: parseFloat(updated.balance) });
});

app.post("/api/admin/users/:id/credit", requireAuth, requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }
  const amount = parseFloat(req.body.amount);
  if (isNaN(amount)) { res.status(400).json({ error: "Invalid amount" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const newBalance = Math.max(0, parseFloat(user.balance) + amount);
  const [updated] = await db.update(usersTable).set({ balance: newBalance.toFixed(2) }).where(eq(usersTable.id, userId)).returning();
  res.json({ id: updated.id, username: updated.username, balance: parseFloat(updated.balance) });
});

app.delete("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.username === "tamilanda") { res.status(400).json({ error: "Cannot delete admin account" }); return; }
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  res.json({ message: "User deleted successfully" });
});

app.get("/api/admin/operations", requireAuth, requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;
  const ops = await db.select({ id: operationsTable.id, userId: operationsTable.userId, username: usersTable.username, operationType: operationsTable.operationType, status: operationsTable.status, cost: operationsTable.cost, result: operationsTable.result, createdAt: operationsTable.createdAt }).from(operationsTable).leftJoin(usersTable, eq(operationsTable.userId, usersTable.id)).orderBy(desc(operationsTable.createdAt)).limit(limit).offset(offset);
  res.json(ops.map(op => ({ ...op, cost: parseFloat(op.cost ?? "0") })));
});

app.get("/api/health", (_req, res) => { res.json({ status: "ok", timestamp: new Date().toISOString() }); });

// ─── SERVE FRONTEND ───────────────────────────────────────────────────────────
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Tamilanda Bind Manager running on http://localhost:${PORT}`);
  console.log(`  Admin login: username=tamilanda  password=TamilandaX@178\n`);
});
