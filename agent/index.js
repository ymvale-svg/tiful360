#!/usr/bin/env node
/**
 * Attendance Clock Agent — Lovable Cloud
 *
 * רץ על השרת המקומי שלך, מתחבר לשעון הנוכחות (TCP או Serial),
 * וקורא פאנצ'ים. כל פאנץ' נשלח ל-Edge Function ingest-attendance-punch.
 *
 * מצב raw: node index.js --raw
 *   רק מדפיס למסך כל מה שמגיע מהשעון, בלי לפרסר ובלי לשלוח. שימושי לכיול.
 *
 * מצב רגיל: node index.js
 */

require("dotenv").config?.();
const fs = require("fs");
const path = require("path");
const net = require("net");

// טעינת .env ידנית אם dotenv לא קיים
try {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  }
} catch {}

const RAW_MODE = process.argv.includes("--raw");
const TOKEN = process.env.ATTENDANCE_INGEST_TOKEN;
const FN_URL = process.env.SUPABASE_FUNCTIONS_URL;
const COMPANY_ID = process.env.COMPANY_ID;
const MODE = (process.env.CLOCK_MODE || "tcp").toLowerCase();

if (!RAW_MODE) {
  if (!TOKEN || !FN_URL || !COMPANY_ID) {
    console.error("[FATAL] חסרים משתנים: ATTENDANCE_INGEST_TOKEN, SUPABASE_FUNCTIONS_URL, COMPANY_ID");
    process.exit(1);
  }
}

async function sendPunch({ employee_code, punch_at, direction, raw }) {
  if (RAW_MODE) {
    console.log("[RAW]", JSON.stringify({ employee_code, punch_at, direction, raw }));
    return;
  }
  try {
    const res = await fetch(`${FN_URL}/ingest-attendance-punch`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        company_id: COMPANY_ID,
        employee_code,
        punch_at: punch_at || new Date().toISOString(),
        direction: direction || "unknown",
        raw,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[ERR ${res.status}]`, text);
    } else {
      console.log(`[OK] employee=${employee_code} dir=${direction || "?"}`, text);
    }
  } catch (e) {
    console.error("[NET ERR]", e.message);
  }
}

/**
 * פרסר ברירת מחדל — מטפל בכמה פורמטים נפוצים.
 * אם השעון שלך משתמש בפורמט אחר, ערוך את הפונקציה הזו.
 *
 * מנסה לזהות:
 *  - שורה עם טוקן ראשון = מספר עובד, ולפעמים אינדיקציית כיוון (I/O)
 *  - JSON
 *  - מבנה Synel/ZK בסיסי (12 ספרות)
 */
function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // נסה JSON
  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed);
      const code = j.employee_code || j.emp_code || j.user_id || j.badge;
      if (code) {
        return {
          employee_code: String(code),
          punch_at: j.timestamp || j.time || j.punch_at,
          direction: (j.direction || j.dir || "").toLowerCase().startsWith("o") ? "out"
                   : (j.direction || j.dir || "").toLowerCase().startsWith("i") ? "in"
                   : "unknown",
          raw: j,
        };
      }
    } catch {}
  }

  // נסה CSV/TSV: code,timestamp,direction
  const parts = trimmed.split(/[,\t;|\s]+/);
  if (parts.length >= 1 && /^\d+$/.test(parts[0])) {
    let direction = "unknown";
    const dirToken = parts.find(p => /^[ioIO]$/.test(p) || /^(in|out|IN|OUT)$/.test(p));
    if (dirToken) direction = /^o/i.test(dirToken) ? "out" : "in";
    return {
      employee_code: parts[0],
      punch_at: undefined,
      direction,
      raw: { line: trimmed },
    };
  }

  return null;
}

// ============ TCP MODE ============
function startTcp() {
  const HOST = process.env.CLOCK_HOST || "10.0.0.114";
  const PORT = Number(process.env.CLOCK_PORT || 4370);
  console.log(`[TCP] מתחבר אל ${HOST}:${PORT} …`);

  const connect = () => {
    const sock = new net.Socket();
    let buffer = "";

    sock.connect(PORT, HOST, () => {
      console.log(`[TCP] מחובר ל-${HOST}:${PORT}`);
    });

    sock.on("data", (chunk) => {
      if (RAW_MODE) {
        console.log("[RAW BYTES]", chunk.toString("hex"));
        console.log("[RAW TEXT]", chunk.toString("utf8"));
      }
      buffer += chunk.toString("utf8");
      let idx;
      while ((idx = buffer.search(/[\r\n]/)) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const parsed = parseLine(line);
        if (parsed) sendPunch(parsed);
        else if (RAW_MODE && line.trim()) console.log("[RAW LINE]", line);
      }
    });

    sock.on("error", (err) => {
      console.error("[TCP ERR]", err.message);
    });

    sock.on("close", () => {
      console.log("[TCP] חיבור נסגר. מנסה שוב בעוד 5 שניות…");
      setTimeout(connect, 5000);
    });
  };

  connect();
}

// ============ SERIAL MODE ============
function startSerial() {
  let SerialPort;
  try {
    ({ SerialPort } = require("serialport"));
  } catch (e) {
    console.error("[FATAL] חבילת serialport לא מותקנת. הרץ: npm install serialport");
    process.exit(1);
  }
  const PATH_ = process.env.SERIAL_PATH || "/dev/ttyUSB0";
  const BAUD = Number(process.env.BAUD_RATE || 9600);
  console.log(`[SERIAL] פותח ${PATH_} @ ${BAUD}…`);

  const port = new SerialPort({ path: PATH_, baudRate: BAUD });
  let buffer = "";

  port.on("open", () => console.log(`[SERIAL] פתוח ${PATH_}`));
  port.on("data", (chunk) => {
    if (RAW_MODE) {
      console.log("[RAW BYTES]", chunk.toString("hex"));
      console.log("[RAW TEXT]", chunk.toString("utf8"));
    }
    buffer += chunk.toString("utf8");
    let idx;
    while ((idx = buffer.search(/[\r\n]/)) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      const parsed = parseLine(line);
      if (parsed) sendPunch(parsed);
      else if (RAW_MODE && line.trim()) console.log("[RAW LINE]", line);
    }
  });
  port.on("error", (e) => console.error("[SERIAL ERR]", e.message));
}

// ============ MAIN ============
console.log(`=== Attendance Agent ===  mode=${MODE}  raw=${RAW_MODE}`);
if (MODE === "tcp") startTcp();
else if (MODE === "serial") startSerial();
else {
  console.error(`[FATAL] CLOCK_MODE לא תקין: ${MODE} (חייב להיות tcp או serial)`);
  process.exit(1);
}
