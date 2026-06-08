// Attendance Clock Agent — ZKTeco U560 (PULL mode, ZK protocol on UDP/TCP 4370)
// ---------------------------------------------------------------------------
// שימוש:
//   node index.js                    — פולינג רציף לפי POLL_INTERVAL_MS
//   node index.js --once             — מחזור אחד ויציאה
//   node index.js --raw              — מציג רשומות גולמיות, בלי שליחה
//   node index.js --once --since=2026-05-01    — שולח רק מתאריך מסוים
//   node index.js --once --limit=20            — שולח רק N רשומות אחרונות
// ---------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const net = require("net");
const os = require("os");
const dgram = require("dgram");

const AGENT_VERSION = "2.4.5";
const HEARTBEAT_INTERVAL_MS = 60000;
// Watchdog: אם אין מחזור מוצלח / heartbeat במשך הזמן הזה — יוצאים, וה-Service יפעיל מחדש
const WATCHDOG_TIMEOUT_MS = parseInt(process.env.WATCHDOG_TIMEOUT_MS || String(15 * 60 * 1000), 10);
const WATCHDOG_CHECK_MS = 30000;
const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS || "20000", 10);
let LAST_ALIVE_AT = Date.now();
function markAlive() { LAST_ALIVE_AT = Date.now(); }

// תפיסת חריגות לא-מטופלות — לוג + יציאה כדי שה-Service יפעיל מחדש
process.on("uncaughtException", (e) => {
  console.error("💥 uncaughtException:", e?.stack || e?.message || e);
  setTimeout(() => process.exit(1), 500);
});
process.on("unhandledRejection", (e) => {
  console.error("💥 unhandledRejection:", e?.stack || e?.message || e);
  setTimeout(() => process.exit(1), 500);
});

let updater = null;
try { updater = require("./updater"); } catch (e) { console.warn("⚠️  updater לא נטען:", e.message || e); }

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

let ZKLib, ZKLibUDP;
try {
  ZKLib = require("node-zklib");
  // טוענים גם את מחלקת ה-UDP ישירות, כדי שנוכל לכפות UDP כשהשעון לא מדבר ZK ב-TCP
  try { ZKLibUDP = require("node-zklib/zklibudp"); } catch {}
} catch (e) {
  console.error("❌ חסר node-zklib. הרץ: npm install");
  process.exit(1);
}

const TOKEN = process.env.ATTENDANCE_INGEST_TOKEN;
const FUNCTIONS_URL = process.env.SUPABASE_FUNCTIONS_URL;
const COMPANY_ID = process.env.COMPANY_ID;
const CLOCK_HOST = process.env.CLOCK_HOST || "10.0.0.114";
const CLOCK_PORT = parseInt(process.env.CLOCK_PORT || "4370", 10);
const CLOCK_INPORT = parseInt(process.env.CLOCK_INPORT || "5200", 10);
const CLOCK_TIMEOUT = parseInt(process.env.CLOCK_TIMEOUT || "5500", 10);
// פרוטוקול: ברירת מחדל auto — מנסה TCP ואז UDP fallback.
// FORCE_TCP=1 כופה TCP גם אם CLOCK_PROTOCOL נשאר udp בקובץ .env ישן.
let CLOCK_PROTOCOL = (process.env.CLOCK_PROTOCOL || "auto").toLowerCase();
if (process.env.FORCE_TCP === "1") CLOCK_PROTOCOL = "tcp";
if (!["auto", "tcp", "udp"].includes(CLOCK_PROTOCOL)) {
  console.warn(`⚠️  CLOCK_PROTOCOL="${CLOCK_PROTOCOL}" לא תקין — עובר ל-auto`);
  CLOCK_PROTOCOL = "auto";
}
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "30000", 10);
const CYCLE_TIMEOUT_MS = parseInt(process.env.CYCLE_TIMEOUT_MS || String(Math.max(POLL_INTERVAL_MS - 2000, CLOCK_TIMEOUT * 6, 45000)), 10);
const CLEAR_AFTER_SEND = (process.env.CLEAR_AFTER_SEND || "false").toLowerCase() === "true";
const STATE_FILE = path.resolve(__dirname, process.env.STATE_FILE || "./state.json");
// קידומת לקוד עובד — כי בשעון מספר חשוף (363) ובמערכת EMP-363
const EMPLOYEE_CODE_PREFIX = process.env.EMPLOYEE_CODE_PREFIX || "";
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "200", 10);

// --- ניתוח ארגומנטים גמיש: תומך ב --flag=value, --flag value, ועם/בלי מרכאות ---
function parseArgs(argv) {
  const out = { flags: new Set(), values: {} };
  const stripQuotes = (s) => {
    if (!s) return s;
    s = String(s).trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1);
    }
    return s;
  };
  for (let i = 0; i < argv.length; i++) {
    let a = stripQuotes(argv[i]);
    if (!a || !a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq !== -1) {
      const k = a.slice(2, eq);
      const v = stripQuotes(a.slice(eq + 1));
      out.values[k] = v;
      out.flags.add(k);
    } else {
      const k = a.slice(2);
      out.flags.add(k);
      const next = argv[i + 1];
      if (next && !String(next).startsWith("--")) {
        out.values[k] = stripQuotes(next);
        i++;
      }
    }
  }
  return out;
}

const ARGS = parseArgs(process.argv.slice(2));
const RAW_MODE = ARGS.flags.has("raw");
const ONCE_MODE = ARGS.flags.has("once");

// תאריך מינימלי קשיח — גם אם לא הועבר --since, רשומות לפני זה לא יישלחו
const HARD_MIN_DATE = new Date(process.env.HARD_MIN_DATE || "2026-04-01T00:00:00Z");
const DEFAULT_SINCE = process.env.DEFAULT_SINCE ? new Date(process.env.DEFAULT_SINCE) : null;

const SINCE_RAW = ARGS.values["since"] || null;
const LIMIT_RAW = ARGS.values["limit"] || null;
let SINCE = SINCE_RAW ? new Date(SINCE_RAW) : (DEFAULT_SINCE || HARD_MIN_DATE);
if (isNaN(SINCE.getTime())) {
  console.warn(`⚠️  --since לא תקין ("${SINCE_RAW}") — חוזר ל-HARD_MIN_DATE`);
  SINCE = HARD_MIN_DATE;
}
// לעולם לא לרדת מתחת ל-HARD_MIN_DATE
if (SINCE < HARD_MIN_DATE) {
  console.warn(`⚠️  --since=${SINCE.toISOString()} מוקדם מהמינימום — נכפה ${HARD_MIN_DATE.toISOString()}`);
  SINCE = HARD_MIN_DATE;
}
const LIMIT = LIMIT_RAW ? parseInt(LIMIT_RAW, 10) : null;

function mapDirection(state) {
  switch (Number(state)) {
    case 0: return "unknown"; // U560 ישן — state=0 לא אומר כלום
    case 1: return "out";
    case 2: return "break_out";
    case 3: return "break_in";
    case 4: return "overtime_in";
    case 5: return "overtime_out";
    default: return "unknown";
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    console.warn("⚠️  state.json פגום, מתחיל מאפס");
  }
  return { sentKeys: [] };
}

function saveState(state) {
  const trimmed = { ...state, sentKeys: state.sentKeys.slice(-100000) };
  fs.writeFileSync(STATE_FILE, JSON.stringify(trimmed));
}

function recordKey(rec) {
  return `${rec.deviceUserId}|${rec.recordTime}|${rec.state ?? ""}`;
}

function toPayload(rec) {
  return {
    company_id: COMPANY_ID,
    employee_code: `${EMPLOYEE_CODE_PREFIX}${rec.deviceUserId}`,
    punch_at: new Date(rec.recordTime).toISOString(),
    direction: mapDirection(rec.state),
    raw: { state: rec.state, type: rec.type, ip: rec.ip, source: "zkteco-u560" },
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function sendBatch(batch) {
  const res = await fetchWithTimeout(`${FUNCTIONS_URL}/ingest-attendance-punch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(batch.map(toPayload)),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt}`);
  try { return JSON.parse(txt); } catch { return {}; }
}

// === Heartbeat ===
const HEARTBEAT_STATE = {
  lastError: null,
  lastSuccessfulPoll: null,
  clockReachable: null,
};

function checkClockReachable(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    const finish = (ok) => { if (done) return; done = true; try { s.destroy(); } catch {} resolve(ok); };
    s.setTimeout(timeoutMs);
    s.once("connect", () => finish(true));
    s.once("timeout", () => finish(false));
    s.once("error", () => finish(false));
    s.connect(port, host);
  });
}

async function sendHeartbeat() {
  if (!TOKEN || !FUNCTIONS_URL || !COMPANY_ID) return;
  let reachable = false;
  try { reachable = await checkClockReachable(CLOCK_HOST, CLOCK_PORT); } catch {}
  HEARTBEAT_STATE.clockReachable = reachable;

  const payload = {
    company_id: COMPANY_ID,
    device_key: os.hostname() || "main",
    agent_version: AGENT_VERSION,
    clock_ip: CLOCK_HOST,
    clock_reachable: reachable,
    last_error: HEARTBEAT_STATE.lastError,
  };

  try {
    const res = await fetchWithTimeout(`${FUNCTIONS_URL}/ingest-attendance-heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn(`💓 heartbeat נכשל: HTTP ${res.status}: ${txt}`);
    } else {
      console.log(`💓 heartbeat נשלח | clock_reachable=${reachable}`);
      markAlive();
    }
  } catch (e) {
    console.warn("💓 heartbeat נכשל:", e.message || e);
  }
}

async function createZkConnection() {
  const zk = new ZKLib(CLOCK_HOST, CLOCK_PORT, CLOCK_TIMEOUT, CLOCK_INPORT);

  // ניסיון UDP בלבד — מאתחל ידנית ומסמן connectionType='udp'.
  const tryUdp = async () => {
    if (!ZKLibUDP) throw new Error("ZKLibUDP לא זמין בגרסת node-zklib הזו");
    const udp = new ZKLibUDP(CLOCK_HOST, CLOCK_PORT, CLOCK_TIMEOUT, CLOCK_INPORT);
    await udp.createSocket(
      (err) => { console.warn("UDP socket err:", err?.message || err); },
      () => {},
    );
    await udp.connect();
    zk.zklibUdp = udp;
    zk.connectionType = "udp";
  };

  if (CLOCK_PROTOCOL === "udp") {
    console.log("🔌 פרוטוקול: UDP (כפוי)");
    await tryUdp();
    return zk;
  }
  if (CLOCK_PROTOCOL === "tcp") {
    console.log("🔌 פרוטוקול: TCP (כפוי)");
    await zk.createSocket();
    return zk;
  }
  // auto — TCP קודם, ואז UDP גם על TIMEOUT (לא רק EADDRINUSE כברירת המחדל של הספרייה)
  console.log("🔌 פרוטוקול: auto (TCP ואז UDP fallback)");
  try {
    await zk.createSocket();
    return zk;
  } catch (e) {
    console.warn("⚠️  TCP נכשל, מנסה UDP:", e?.message || e);
    try { await zk.disconnect(); } catch {}
    await tryUdp();
    return zk;
  }
}

// עוטף promise ב-timeout קשיח, כדי שלא נישאר תקועים על השעון
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

// סינון לוגים חוזרים — אותה שגיאה לא תודפס יותר מפעם בדקה
const LAST_LOG_AT = new Map();
function logThrottled(key, msg, level = "warn", everyMs = 60000) {
  const now = Date.now();
  const last = LAST_LOG_AT.get(key) || 0;
  if (now - last < everyMs) return;
  LAST_LOG_AT.set(key, now);
  (console[level] || console.log)(msg);
}

function shortErr(e) {
  const m = String(e?.message || e || "");
  // מסירים stack ארוך של ZKError
  return m.split("\n")[0].slice(0, 200);
}

async function runCycle() {
  const ts = new Date().toISOString();
  console.log(`\n[${ts}] מתחבר ל-${CLOCK_HOST}:${CLOCK_PORT} (${CLOCK_PROTOCOL}) ...`);

  let zk;
  try {
    zk = await withTimeout(createZkConnection(), Math.max(CLOCK_TIMEOUT * 2, 10000), "connect");
  } catch (e) {
    const msg = shortErr(e);
    HEARTBEAT_STATE.lastError = msg;
    logThrottled("connect_fail", `❌ נכשל החיבור לשעון ${CLOCK_HOST}: ${msg}  (בדוק שהשעון דולק וברשת)`, "error");
    return;
  }

  try {
    const info = await withTimeout(zk.getInfo(), 8000, "getInfo");
    console.log(`✅ מחובר. רשומות בשעון: ${info.logCounts ?? "?"} | משתמשים: ${info.userCounts ?? "?"}`);
  } catch (e) { logThrottled("getinfo_fail", `⚠️  getInfo: ${shortErr(e)}`); }

  let logs;
  try {
    const res = await withTimeout(zk.getAttendances(), Math.max(CYCLE_TIMEOUT_MS - 5000, 20000), "getAttendances");
    logs = res?.data || [];
    console.log(`📋 נמשכו ${logs.length} רשומות`);
    if (logs.length) {
      const times = logs.map((r) => new Date(r.recordTime).getTime()).filter((t) => !isNaN(t));
      if (times.length) {
        const minD = new Date(Math.min(...times)).toISOString();
        const maxD = new Date(Math.max(...times)).toISOString();
        console.log(`   טווח בשעון: ${minD}  →  ${maxD}`);
      }
    }
  } catch (e) {
    const msg = shortErr(e);
    HEARTBEAT_STATE.lastError = msg;
    logThrottled("getatt_fail", `❌ getAttendances נכשל: ${msg}`, "error");
    try { await zk.disconnect(); } catch {}
    return;
  }

  if (RAW_MODE) {
    console.log("\n=== RAW — 20 אחרונות ===");
    for (const r of logs.slice(-20)) {
      console.log(JSON.stringify({
        deviceUserId: r.deviceUserId,
        recordTime: r.recordTime,
        state: r.state,
        mappedEmployeeCode: `${EMPLOYEE_CODE_PREFIX}${r.deviceUserId}`,
        mappedDirection: mapDirection(r.state),
      }));
    }
    try { await zk.disconnect(); } catch {}
    return;
  }

  // --- סינון תאריך מינימלי (HARD) ---
  const beforeHard = logs.length;
  let filtered = logs.filter((r) => {
    const t = new Date(r.recordTime);
    return !isNaN(t.getTime()) && t >= HARD_MIN_DATE;
  });
  const blockedHard = beforeHard - filtered.length;
  if (blockedHard > 0) {
    console.log(`🛡️  נחסמו ${blockedHard} רשומות לפני HARD_MIN_DATE (${HARD_MIN_DATE.toISOString()})`);
  }

  // --- סינון since (אם גבוה יותר מ-HARD) ---
  if (SINCE > HARD_MIN_DATE) {
    const before = filtered.length;
    filtered = filtered.filter((r) => new Date(r.recordTime) >= SINCE);
    console.log(`🗓️  אחרי --since=${SINCE.toISOString()}: ${filtered.length} (סוננו ${before - filtered.length})`);
  } else {
    console.log(`🗓️  סינון פעיל מ: ${SINCE.toISOString()}  (נשארו ${filtered.length})`);
  }

  const state = loadState();
  const sentSet = new Set(state.sentKeys);
  let newOnes = filtered.filter((r) => !sentSet.has(recordKey(r)));

  if (LIMIT && newOnes.length > LIMIT) {
    newOnes = newOnes.slice(-LIMIT);
    console.log(`✂️  --limit=${LIMIT}: שולח את ${LIMIT} האחרונות`);
  }

  console.log(`📤 ${newOnes.length} רשומות חדשות לשליחה`);

  let ok = 0, fail = 0, matched = 0, unmatched = 0;
  for (let i = 0; i < newOnes.length; i += BATCH_SIZE) {
    const batch = newOnes.slice(i, i + BATCH_SIZE);
    try {
      const result = await sendBatch(batch);
      ok += batch.length;
      matched += result.matched || 0;
      unmatched += result.unmatched || 0;
      for (const rec of batch) state.sentKeys.push(recordKey(rec));
      saveState(state);
      console.log(`  ✓ batch ${i / BATCH_SIZE + 1}: נשלחו ${batch.length} | זוהו ${result.matched ?? "?"} | לא זוהו ${result.unmatched ?? "?"}`);
    } catch (e) {
      fail += batch.length;
      console.error(`  ✗ batch ${i / BATCH_SIZE + 1} נכשל:`, e.message || e);
    }
  }
  console.log(`\nסיכום: נשלחו ${ok} | נכשלו ${fail} | זוהו ${matched} | לא זוהו ${unmatched}`);
  if (fail === 0) { HEARTBEAT_STATE.lastError = null; HEARTBEAT_STATE.lastSuccessfulPoll = new Date().toISOString(); markAlive(); }

  if (CLEAR_AFTER_SEND && fail === 0 && ok > 0) {
    try {
      await zk.clearAttendanceLog();
      console.log("🧹 לוג השעון נמחק");
    } catch (e) { console.warn("⚠️  clearAttendanceLog:", e.message || e); }
  }

  try { await zk.disconnect(); } catch {}
}

let cycleRunning = false;
async function runCycleGuarded() {
  if (cycleRunning) {
    HEARTBEAT_STATE.lastError = `מחזור קודם עדיין רץ מעל ${Math.round(CYCLE_TIMEOUT_MS / 1000)} שנ׳`;
    console.warn(`⏳ מדלג על מחזור — המחזור הקודם עדיין תקוע`);
    return;
  }
  cycleRunning = true;
  let timer;
  try {
    await Promise.race([
      runCycle(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`cycle_timeout_${CYCLE_TIMEOUT_MS}ms`)), CYCLE_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    HEARTBEAT_STATE.lastError = String(e?.message || e);
    console.error("מחזור נכשל/נתקע:", e?.message || e);
    if (String(e?.message || e).startsWith("cycle_timeout_")) {
      console.error("💀 מחזור תקוע — יוצא כדי שה-Service יפעיל מחדש את ה-agent וישחרר את החיבור לשעון");
      setTimeout(() => process.exit(2), 500);
    }
  } finally {
    if (timer) clearTimeout(timer);
    cycleRunning = false;
  }
}

// 🔎 בדיקת נגישות מהירה לשעון בשני הפרוטוקולים
async function runReachabilityProbe() {
  const T = 3000;
  const tcp = await new Promise((resolve) => {
    const start = Date.now();
    const sock = new net.Socket();
    let done = false;
    const fin = (s, d) => { if (done) return; done = true; try { sock.destroy(); } catch {} resolve({ s, d, ms: Date.now() - start }); };
    sock.setTimeout(T);
    sock.once("connect", () => fin("OK", "connected"));
    sock.once("timeout", () => fin("TIMEOUT", `no response in ${T}ms`));
    sock.once("error", (e) => fin("ERROR", `${e.code || ""} ${e.message}`.trim()));
    try { sock.connect(CLOCK_PORT, CLOCK_HOST); } catch (e) { fin("ERROR", e.message); }
  });
  const udp = await new Promise((resolve) => {
    const start = Date.now();
    const sock = dgram.createSocket("udp4");
    let done = false;
    const fin = (s, d) => { if (done) return; done = true; try { sock.close(); } catch {} resolve({ s, d, ms: Date.now() - start }); };
    const tmr = setTimeout(() => fin("TIMEOUT", `no reply in ${T}ms`), T);
    const pkt = Buffer.alloc(8);
    pkt.writeUInt16LE(1000, 0); // CMD_CONNECT
    sock.once("error", (e) => { clearTimeout(tmr); fin("ERROR", `${e.code || ""} ${e.message}`.trim()); });
    sock.once("message", (msg) => { clearTimeout(tmr); fin("OK", `replied ${msg.length} bytes`); });
    try { sock.send(pkt, CLOCK_PORT, CLOCK_HOST, (err) => { if (err) { clearTimeout(tmr); fin("ERROR", err.message); } }); }
    catch (e) { clearTimeout(tmr); fin("ERROR", e.message); }
  });
  console.log(`🔎 probe ${CLOCK_HOST}:${CLOCK_PORT}`);
  console.log(`   TCP → ${tcp.s.padEnd(7)} (${tcp.ms}ms) ${tcp.d}`);
  console.log(`   UDP → ${udp.s.padEnd(7)} (${udp.ms}ms) ${udp.d}`);
  if (udp.s === "OK")       console.log("   ✅ UDP זמין — הסוכן אמור לעבוד");
  else if (tcp.s === "OK")  console.log("   ⚠️ רק TCP זמין — שקול FORCE_TCP=1");
  else                      console.log("   ❌ השעון אינו נגיש — בדוק IP/הפעלה/חיווט/firewall");
}

async function main() {
  if (!RAW_MODE && (!TOKEN || !FUNCTIONS_URL || !COMPANY_ID)) {
    console.error("❌ חסרה הגדרה ב-.env (ATTENDANCE_INGEST_TOKEN / SUPABASE_FUNCTIONS_URL / COMPANY_ID).");
    console.error('   הרץ: npm run setup   — וזה ייצור .env תקין אוטומטית.');
    process.exit(1);
  }

  console.log("=== ZKTeco Attendance Agent ===");
  console.log(`Args: ${JSON.stringify(process.argv.slice(2))}`);
  console.log(`Host: ${CLOCK_HOST}:${CLOCK_PORT} | Prefix: "${EMPLOYEE_CODE_PREFIX}"`);
  console.log(`HARD_MIN_DATE: ${HARD_MIN_DATE.toISOString()} | Effective SINCE: ${SINCE.toISOString()}${LIMIT ? ` | limit=${LIMIT}` : ""}`);
  console.log(`Mode: ${RAW_MODE ? "RAW" : ONCE_MODE ? "ONCE" : `POLL ${POLL_INTERVAL_MS}ms`}`);

  if (!RAW_MODE && !ONCE_MODE && updater && updater.startUpdaterLoop) {
    updater.startUpdaterLoop(AGENT_VERSION);
  }

  // 🔎 בדיקת נגישות מהירה (TCP+UDP) — תוצאות ישר בלוגים
  await runReachabilityProbe();

  await sendHeartbeat();
  await runCycleGuarded();
  if (RAW_MODE || ONCE_MODE) return;

  setInterval(() => runCycleGuarded(), POLL_INTERVAL_MS);
  setInterval(() => sendHeartbeat().catch((e) => console.warn("heartbeat err:", e?.message || e)), HEARTBEAT_INTERVAL_MS);

  // 🐕 Watchdog — אם אין שום סימן חיים בפרק הזמן המוגדר, יוצאים וה-Service יפעיל מחדש
  console.log(`🐕 watchdog פעיל — timeout ${Math.round(WATCHDOG_TIMEOUT_MS / 60000)} דק׳`);
  setInterval(() => {
    const idleMs = Date.now() - LAST_ALIVE_AT;
    if (idleMs > WATCHDOG_TIMEOUT_MS) {
      console.error(`💀 watchdog: אין סימן חיים ${Math.round(idleMs / 1000)}s — יוצא כדי שה-Service יפעיל מחדש`);
      setTimeout(() => process.exit(2), 500);
    }
  }, WATCHDOG_CHECK_MS);

}

main().catch((e) => { console.error("שגיאה קריטית:", e); process.exit(1); });
