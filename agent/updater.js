// Auto-updater for the Attendance Agent.
// בודק מניפסט בכתובת פומבית, מוריד קבצים חדשים ל-staging,
// ואז עוצר את התהליך כדי שה-Windows Service יפעיל מחדש עם הקוד החדש.

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");

const DEFAULT_MANIFEST_URL = "https://tiful360.com/agent/manifest.json";
const CHECK_INTERVAL_MS = parseInt(process.env.UPDATE_CHECK_INTERVAL_MS || String(60 * 60 * 1000), 10);
const MANIFEST_URL = process.env.AGENT_MANIFEST_URL || DEFAULT_MANIFEST_URL;
const AUTO_UPDATE = (process.env.AUTO_UPDATE || "true").toLowerCase() !== "false";

function fetchJson(url) {
  return fetchBuffer(url).then((buf) => JSON.parse(buf.toString("utf-8")));
}

function fetchBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https:") ? https : http;
    const req = mod.get(url, { timeout: 15000, headers: { "Cache-Control": "no-cache" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 3) {
        res.resume();
        return resolve(fetchBuffer(res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

function cmpVersion(a, b) {
  const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0, db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

async function checkAndApplyUpdate(currentVersion) {
  if (!AUTO_UPDATE) return false;
  try {
    const manifest = await fetchJson(MANIFEST_URL + "?t=" + Date.now());
    if (!manifest || !manifest.version || !Array.isArray(manifest.files)) {
      console.warn("⚠️  עדכון אוטומטי: מניפסט לא תקין");
      return false;
    }
    if (cmpVersion(manifest.version, currentVersion) <= 0) {
      return false;
    }
    console.log(`⬆️  זמינה גרסה חדשה: ${manifest.version} (מותקנת: ${currentVersion}). מוריד...`);

    const stagingDir = path.join(__dirname, ".update-staging");
    if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });

    for (const f of manifest.files) {
      if (!f.name || !f.url) continue;
      // הגנה: לא יוצאים מהתיקייה
      const safeName = path.normalize(f.name).replace(/^[/\\]+/, "");
      if (safeName.includes("..")) throw new Error(`שם קובץ לא תקין: ${f.name}`);
      const buf = await fetchBuffer(f.url + (f.url.includes("?") ? "&" : "?") + "t=" + Date.now());
      if (f.sha256) {
        const hash = crypto.createHash("sha256").update(buf).digest("hex");
        if (hash.toLowerCase() !== String(f.sha256).toLowerCase()) {
          throw new Error(`SHA256 לא תואם ל-${f.name}`);
        }
      }
      const target = path.join(stagingDir, safeName);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buf);
      console.log(`   • הורד ${f.name} (${buf.length} bytes)`);
    }

    // העתקה אטומית מ-staging לתיקיית הסוכן + גיבוי
    const backupDir = path.join(__dirname, ".update-backup");
    if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true });
    fs.mkdirSync(backupDir, { recursive: true });

    const copied = [];
    for (const f of manifest.files) {
      const safeName = path.normalize(f.name).replace(/^[/\\]+/, "");
      const src = path.join(stagingDir, safeName);
      const dst = path.join(__dirname, safeName);
      if (fs.existsSync(dst)) {
        const bk = path.join(backupDir, safeName);
        fs.mkdirSync(path.dirname(bk), { recursive: true });
        fs.copyFileSync(dst, bk);
      }
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      copied.push(safeName);
    }
    fs.rmSync(stagingDir, { recursive: true, force: true });

    // סימון לוג + יציאה כדי שה-Service יפעיל מחדש
    try {
      fs.writeFileSync(
        path.join(__dirname, "last-update.json"),
        JSON.stringify({ at: new Date().toISOString(), from: currentVersion, to: manifest.version, files: copied }, null, 2)
      );
    } catch {}

    console.log(`✅ עודכן לגרסה ${manifest.version}. מבצע restart לסוכן...`);
    // השהיה קצרה כדי שהלוג ייכתב, ואז יציאה — node-windows יפעיל מחדש אוטומטית.
    setTimeout(() => process.exit(0), 1500);
    return true;
  } catch (e) {
    console.warn("⚠️  עדכון אוטומטי נכשל:", e.message || e);
    return false;
  }
}

function startUpdaterLoop(currentVersion) {
  if (!AUTO_UPDATE) {
    console.log("ℹ️  עדכון אוטומטי כבוי (AUTO_UPDATE=false)");
    return;
  }
  console.log(`🔄 עדכון אוטומטי פעיל — בדיקה כל ${Math.round(CHECK_INTERVAL_MS / 60000)} דק׳ מ-${MANIFEST_URL}`);
  // בדיקה ראשונית בעוד 30 שניות (לאחר חיבור ראשון לשעון)
  setTimeout(() => checkAndApplyUpdate(currentVersion), 30000);
  setInterval(() => checkAndApplyUpdate(currentVersion), CHECK_INTERVAL_MS);
}

module.exports = { checkAndApplyUpdate, startUpdaterLoop };
