// מתקין אינטראקטיבי יחיד ל-Attendance Agent.
// הרצה: npm run setup
//
// מה זה עושה:
//   1) טוען .env קיים אם יש, ומציג ערכים נוכחיים כברירות מחדל (Enter = השאר)
//   2) שואל רק את השדות המשתנים בין התקנות:
//      ATTENDANCE_INGEST_TOKEN, COMPANY_ID, CLOCK_HOST, EMPLOYEE_CODE_PREFIX
//   3) אם לא יודעים COMPANY_ID — שולף רשימת חברות מהענן ומאפשר לבחור מספר
//   4) מאמת חיבור לשעון (TCP 4370) — אזהרה בלבד אם לא מצליח
//   5) כותב .env מלא עם ברירות מחדל קבועות לשאר השדות
//   6) שואל אם להתקין כ-Windows Service ומריץ אוטומטית

const fs = require("fs");
const path = require("path");
const net = require("net");
const readline = require("readline");
const { spawnSync } = require("child_process");

const ENV_PATH = path.join(__dirname, ".env");

// === ברירות מחדל קבועות לכל ההתקנות ===
const FIXED_DEFAULTS = {
  SUPABASE_FUNCTIONS_URL: "https://rhzmhiknbcipucfvgkok.supabase.co/functions/v1",
  BATCH_SIZE: "200",
  HARD_MIN_DATE: "2026-04-01T00:00:00Z",
  DEFAULT_SINCE: "2026-04-01T00:00:00Z",
  CLOCK_PORT: "4370",
  CLOCK_INPORT: "5200",
  CLOCK_TIMEOUT: "5500",
  CLOCK_PROTOCOL: "auto",
  FORCE_TCP: "0",
  POLL_INTERVAL_MS: "30000",
  CLEAR_AFTER_SEND: "false",
  STATE_FILE: "./state.json",
  AUTO_UPDATE: "true",
  AGENT_MANIFEST_URL: "https://tiful360.com/agent/manifest.json",
  UPDATE_CHECK_INTERVAL_MS: "3600000",
};

const PROMPT_DEFAULTS = {
  EMPLOYEE_CODE_PREFIX: "EMP-",
  CLOCK_HOST: "10.0.0.114",
};

function readExistingEnv() {
  const out = {};
  if (!fs.existsSync(ENV_PATH)) return out;
  for (const line of fs.readFileSync(ENV_PATH, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function rl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(question, def) {
  return new Promise((resolve) => {
    const r = rl();
    const hint = def ? ` [${def}]` : "";
    r.question(`${question}${hint}: `, (ans) => {
      r.close();
      const v = (ans || "").trim();
      resolve(v || def || "");
    });
  });
}

async function askChoice(question, choices) {
  console.log(`\n${question}`);
  choices.forEach((c, i) => console.log(`  ${i + 1}. ${c.label}`));
  const ans = await ask("בחר מספר", "1");
  const idx = parseInt(ans, 10) - 1;
  return choices[idx] || choices[0];
}

function checkPort(host, port, timeoutMs = 2500) {
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

async function fetchCompanies(funcUrl, token) {
  const res = await fetch(`${funcUrl}/list-companies-for-agent`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.companies || [];
}

function writeEnv(values) {
  const order = [
    "ATTENDANCE_INGEST_TOKEN",
    "SUPABASE_FUNCTIONS_URL",
    "COMPANY_ID",
    "EMPLOYEE_CODE_PREFIX",
    "BATCH_SIZE",
    "HARD_MIN_DATE",
    "DEFAULT_SINCE",
    "CLOCK_HOST",
    "CLOCK_PORT",
    "CLOCK_INPORT",
    "CLOCK_TIMEOUT",
    "CLOCK_PROTOCOL",
    "FORCE_TCP",
    "POLL_INTERVAL_MS",
    "CLEAR_AFTER_SEND",
    "STATE_FILE",
    "AUTO_UPDATE",
    "AGENT_MANIFEST_URL",
    "UPDATE_CHECK_INTERVAL_MS",
  ];
  const lines = ["# נוצר על ידי npm run setup", ""];
  for (const k of order) lines.push(`${k}=${values[k] ?? ""}`);
  fs.writeFileSync(ENV_PATH, lines.join("\n") + "\n", "utf-8");
}

(async function main() {
  console.log("=== Attendance Agent — Setup ===\n");
  const existing = readExistingEnv();
  const v = { ...FIXED_DEFAULTS, ...existing };

  // 1) Token
  v.ATTENDANCE_INGEST_TOKEN = await ask(
    "ATTENDANCE_INGEST_TOKEN (טוקן מהענן)",
    existing.ATTENDANCE_INGEST_TOKEN || ""
  );
  if (!v.ATTENDANCE_INGEST_TOKEN) {
    console.error("✗ חובה להזין טוקן. עצירה.");
    process.exit(1);
  }

  // 2) FUNCTIONS_URL — בדרך כלל לא משתנה
  v.SUPABASE_FUNCTIONS_URL = existing.SUPABASE_FUNCTIONS_URL || FIXED_DEFAULTS.SUPABASE_FUNCTIONS_URL;

  // 3) COMPANY_ID — אפשר Enter כדי לבחור מרשימה
  const currentCompany = existing.COMPANY_ID || "";
  const companyAns = await ask(
    "COMPANY_ID (Enter כדי לבחור מרשימה)",
    currentCompany
  );
  if (companyAns && companyAns !== "" && companyAns === currentCompany) {
    v.COMPANY_ID = companyAns;
  } else if (companyAns && companyAns.length >= 30) {
    v.COMPANY_ID = companyAns;
  } else {
    console.log("\nטוען רשימת חברות מהענן...");
    try {
      const companies = await fetchCompanies(v.SUPABASE_FUNCTIONS_URL, v.ATTENDANCE_INGEST_TOKEN);
      if (!companies.length) {
        console.error("✗ לא נמצאו חברות. בדוק את הטוקן.");
        process.exit(1);
      }
      const choice = await askChoice(
        "בחר חברה:",
        companies.map((c) => ({ label: `${c.name}  (${c.id})`, value: c.id }))
      );
      v.COMPANY_ID = choice.value;
      console.log(`✓ נבחרה: ${choice.label}`);
    } catch (e) {
      console.error("✗ נכשלה משיכת רשימת חברות:", e.message || e);
      process.exit(1);
    }
  }

  // 4) Clock host
  v.CLOCK_HOST = await ask(
    "CLOCK_HOST (כתובת IP של השעון)",
    existing.CLOCK_HOST || PROMPT_DEFAULTS.CLOCK_HOST
  );

  // 5) Employee prefix
  v.EMPLOYEE_CODE_PREFIX = await ask(
    "EMPLOYEE_CODE_PREFIX (קידומת לקוד עובד)",
    existing.EMPLOYEE_CODE_PREFIX ?? PROMPT_DEFAULTS.EMPLOYEE_CODE_PREFIX
  );

  // 6) בדיקת חיבור לשעון
  console.log(`\nבודק חיבור TCP ל-${v.CLOCK_HOST}:${v.CLOCK_PORT} ...`);
  const ok = await checkPort(v.CLOCK_HOST, parseInt(v.CLOCK_PORT, 10));
  if (ok) console.log("✓ השעון זמין ברשת.");
  else console.log("⚠️  השעון לא ענה (ממשיך בכל זאת — אפשר לתקן אחר כך).");

  // 7) כתיבת .env
  writeEnv(v);
  console.log(`\n✓ נכתב ${ENV_PATH}`);

  // 8) התקנת Service (Windows בלבד)
  if (process.platform === "win32") {
    const ans = await ask("להתקין כ-Windows Service עכשיו? (y/N)", "N");
    if (/^y(es)?$/i.test(ans)) {
      console.log("\nמריץ npm run service:install ...");
      const r = spawnSync("npm", ["run", "service:install"], {
        cwd: __dirname, stdio: "inherit", shell: true,
      });
      if (r.status !== 0) console.error("⚠️  התקנת Service נכשלה. הרץ ידנית כ-Administrator.");
    } else {
      console.log("דלג על התקנת Service. להפעלה ידנית: npm start");
    }
  } else {
    console.log("הסתיים. להפעלה: npm start");
  }
})();
