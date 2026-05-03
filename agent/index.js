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

let ZKLib;
try {
  ZKLib = require("node-zklib");
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
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "30000", 10);
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

async function sendBatch(batch) {
  const res = await fetch(`${FUNCTIONS_URL}/ingest-attendance-punch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(batch.map(toPayload)),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt}`);
  try { return JSON.parse(txt); } catch { return {}; }
}

async function runCycle() {
  const zk = new ZKLib(CLOCK_HOST, CLOCK_PORT, CLOCK_TIMEOUT, CLOCK_INPORT);
  const ts = new Date().toISOString();
  console.log(`\n[${ts}] מתחבר ל-${CLOCK_HOST}:${CLOCK_PORT} ...`);

  try { await zk.createSocket(); } catch (e) {
    console.error("❌ נכשל החיבור:", e.message || e);
    try { await zk.disconnect(); } catch {}
    return;
  }

  try {
    const info = await zk.getInfo();
    console.log(`✅ מחובר. רשומות בשעון: ${info.logCounts ?? "?"} | משתמשים: ${info.userCounts ?? "?"}`);
  } catch (e) { console.warn("⚠️  getInfo:", e.message || e); }

  let logs;
  try {
    const res = await zk.getAttendances();
    logs = res?.data || [];
    console.log(`📋 נמשכו ${logs.length} רשומות`);
  } catch (e) {
    console.error("❌ getAttendances נכשל:", e.message || e);
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

  // סינון
  let filtered = logs;
  if (SINCE) {
    filtered = filtered.filter((r) => new Date(r.recordTime) >= SINCE);
    console.log(`🗓️  אחרי --since=${SINCE.toISOString()}: ${filtered.length}`);
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

  if (CLEAR_AFTER_SEND && fail === 0 && ok > 0) {
    try {
      await zk.clearAttendanceLog();
      console.log("🧹 לוג השעון נמחק");
    } catch (e) { console.warn("⚠️  clearAttendanceLog:", e.message || e); }
  }

  try { await zk.disconnect(); } catch {}
}

async function main() {
  if (!RAW_MODE && (!TOKEN || !FUNCTIONS_URL || !COMPANY_ID)) {
    console.error("❌ חסרים: ATTENDANCE_INGEST_TOKEN / SUPABASE_FUNCTIONS_URL / COMPANY_ID");
    process.exit(1);
  }

  console.log("=== ZKTeco Attendance Agent ===");
  console.log(`Host: ${CLOCK_HOST}:${CLOCK_PORT} | Prefix: "${EMPLOYEE_CODE_PREFIX}"`);
  console.log(`Mode: ${RAW_MODE ? "RAW" : ONCE_MODE ? "ONCE" : `POLL ${POLL_INTERVAL_MS}ms`}${SINCE ? ` since=${SINCE.toISOString()}` : ""}${LIMIT ? ` limit=${LIMIT}` : ""}`);

  await runCycle();
  if (RAW_MODE || ONCE_MODE) return;

  setInterval(() => runCycle().catch((e) => console.error("מחזור נכשל:", e)), POLL_INTERVAL_MS);
}

main().catch((e) => { console.error("שגיאה קריטית:", e); process.exit(1); });
