// Attendance Clock Agent — ZKTeco U560 (PULL mode, ZK protocol on UDP/TCP 4370)
// ---------------------------------------------------------------------------
// משיכה תקופתית של רשומות נוכחות (attendance log) מהשעון, מיפוי כיוון לפי
// verify_type של ZK, ושליחה ל-Edge Function ingest-attendance-punch.
//
// שימוש:
//   node index.js          — פולינג רציף לפי POLL_INTERVAL_MS
//   node index.js --once   — מחזור אחד ויציאה (טוב ל-cron)
//   node index.js --raw    — חיבור + הדפסת כל הרשומות הגולמיות, בלי שליחה
//
// תלויות: node-zklib (npm install)
// ---------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");

// טעינת .env ידנית (בלי תלות חיצונית)
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

const RAW_MODE = process.argv.includes("--raw");
const ONCE_MODE = process.argv.includes("--once");

// מיפוי verify_type / state של ZK לכיווני נוכחות
// מקור: ZK SDK — Attendance State / verify mode
//   0 = Check-In, 1 = Check-Out, 2 = Break-Out, 3 = Break-In,
//   4 = Overtime-In, 5 = Overtime-Out
function mapDirection(state) {
  switch (Number(state)) {
    case 0: return "in";
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
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    }
  } catch (e) {
    console.warn("⚠️  state.json קיים אך פגום, מתחיל מאפס");
  }
  return { sentKeys: [] };
}

function saveState(state) {
  // נשמור רק את 5000 המפתחות האחרונים כדי שהקובץ לא יגדל לאינסוף
  const trimmed = {
    ...state,
    sentKeys: state.sentKeys.slice(-5000),
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(trimmed, null, 2));
}

function recordKey(rec) {
  // מפתח ייחודי לרשומה: עובד + timestamp + state
  return `${rec.deviceUserId}|${rec.recordTime}|${rec.state ?? ""}`;
}

async function sendPunch(rec) {
  const body = {
    company_id: COMPANY_ID,
    employee_code_raw: String(rec.deviceUserId),
    punched_at: new Date(rec.recordTime).toISOString(),
    direction: mapDirection(rec.state),
    source: "zkteco-u560",
    raw: rec,
  };
  const res = await fetch(`${FUNCTIONS_URL}/ingest-attendance-punch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  return res.json().catch(() => ({}));
}

async function runCycle() {
  const zk = new ZKLib(CLOCK_HOST, CLOCK_PORT, CLOCK_TIMEOUT, CLOCK_INPORT);
  const ts = new Date().toISOString();
  console.log(`\n[${ts}] מתחבר לשעון ${CLOCK_HOST}:${CLOCK_PORT} ...`);

  try {
    await zk.createSocket();
  } catch (e) {
    console.error("❌ נכשל החיבור:", e.message || e);
    try { await zk.disconnect(); } catch {}
    return;
  }

  let info = {};
  try {
    info = await zk.getInfo();
    console.log(`✅ מחובר. רשומות בשעון: ${info.logCounts ?? "?"} | משתמשים: ${info.userCounts ?? "?"}`);
  } catch (e) {
    console.warn("⚠️  לא הצלחתי לקרוא getInfo:", e.message || e);
  }

  let logs;
  try {
    const res = await zk.getAttendances();
    logs = res?.data || [];
    console.log(`📋 נמשכו ${logs.length} רשומות מהשעון`);
  } catch (e) {
    console.error("❌ getAttendances נכשל:", e.message || e);
    try { await zk.disconnect(); } catch {}
    return;
  }

  if (RAW_MODE) {
    console.log("\n=== RAW MODE — מציג עד 20 רשומות אחרונות ===");
    const sample = logs.slice(-20);
    for (const r of sample) {
      console.log(JSON.stringify({
        deviceUserId: r.deviceUserId,
        recordTime: r.recordTime,
        state: r.state,
        type: r.type,
        ip: r.ip,
        mappedDirection: mapDirection(r.state),
      }));
    }
    console.log("\nℹ️  --raw לא שולח כלום ולא מוחק. הסר את הדגל כדי לאפשר שליחה.");
    try { await zk.disconnect(); } catch {}
    return;
  }

  const state = loadState();
  const sentSet = new Set(state.sentKeys);
  const newOnes = logs.filter((r) => !sentSet.has(recordKey(r)));

  console.log(`📤 ${newOnes.length} רשומות חדשות לשליחה (סה״כ ${logs.length})`);

  let ok = 0, fail = 0;
  for (const rec of newOnes) {
    try {
      await sendPunch(rec);
      state.sentKeys.push(recordKey(rec));
      ok++;
    } catch (e) {
      fail++;
      console.error(`  ✗ ${rec.deviceUserId} @ ${rec.recordTime}:`, e.message || e);
    }
  }
  saveState(state);
  console.log(`✓ נשלחו: ${ok} | נכשלו: ${fail}`);

  if (CLEAR_AFTER_SEND && fail === 0 && ok > 0) {
    try {
      await zk.clearAttendanceLog();
      console.log("🧹 לוג נוכחות בשעון נמחק (CLEAR_AFTER_SEND=true)");
    } catch (e) {
      console.warn("⚠️  clearAttendanceLog נכשל:", e.message || e);
    }
  }

  try { await zk.disconnect(); } catch {}
}

async function main() {
  if (!TOKEN || !FUNCTIONS_URL || !COMPANY_ID) {
    if (!RAW_MODE) {
      console.error("❌ חסרים משתני סביבה חובה: ATTENDANCE_INGEST_TOKEN / SUPABASE_FUNCTIONS_URL / COMPANY_ID");
      process.exit(1);
    } else {
      console.warn("⚠️  --raw: רץ בלי שליחה, אז משתני הענן לא חובה.");
    }
  }

  console.log("=== ZKTeco Attendance Agent ===");
  console.log(`Host: ${CLOCK_HOST}:${CLOCK_PORT} (inport ${CLOCK_INPORT})`);
  console.log(`Mode: ${RAW_MODE ? "RAW (no send)" : ONCE_MODE ? "ONCE" : `POLL every ${POLL_INTERVAL_MS}ms`}`);

  await runCycle();
  if (RAW_MODE || ONCE_MODE) return;

  setInterval(() => {
    runCycle().catch((e) => console.error("מחזור נכשל:", e));
  }, POLL_INTERVAL_MS);
}

main().catch((e) => {
  console.error("שגיאה קריטית:", e);
  process.exit(1);
});
