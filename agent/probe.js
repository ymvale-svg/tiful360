#!/usr/bin/env node
// בדיקת נגישות מהירה לשעון: TCP + UDP על אותו host:port
// שימוש: node probe.js [host] [port]
//   ברירות מחדל מ-.env (CLOCK_HOST, CLOCK_PORT) או 10.0.0.114:4370

const net = require("net");
const dgram = require("dgram");
const path = require("path");
const fs = require("fs");

// טעינת .env פשוטה (בלי תלות חיצונית)
function loadEnv() {
  const p = path.join(__dirname, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const HOST = process.argv[2] || process.env.CLOCK_HOST || "10.0.0.114";
const PORT = Number(process.argv[3] || process.env.CLOCK_PORT || 4370);
const TIMEOUT = 3000;

// ZK CMD_CONNECT packet (UDP) — מבקש מהשעון לענות
function buildZkConnectPacket() {
  // header: command=1000 (CONNECT), checksum=0, session=0, reply=0
  const buf = Buffer.alloc(8);
  buf.writeUInt16LE(1000, 0); // CMD_CONNECT
  buf.writeUInt16LE(0, 2);    // checksum (0 for connect)
  buf.writeUInt16LE(0, 4);    // session id
  buf.writeUInt16LE(0, 6);    // reply id
  return buf;
}

function probeTcp() {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = new net.Socket();
    let done = false;
    const finish = (status, detail) => {
      if (done) return; done = true;
      try { sock.destroy(); } catch {}
      resolve({ proto: "TCP", status, detail, ms: Date.now() - start });
    };
    sock.setTimeout(TIMEOUT);
    sock.once("connect", () => finish("OK", "connection established"));
    sock.once("timeout", () => finish("TIMEOUT", `no response in ${TIMEOUT}ms`));
    sock.once("error", (e) => finish("ERROR", `${e.code || ""} ${e.message}`.trim()));
    try { sock.connect(PORT, HOST); }
    catch (e) { finish("ERROR", e.message); }
  });
}

function probeUdp() {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = dgram.createSocket("udp4");
    let done = false;
    const finish = (status, detail) => {
      if (done) return; done = true;
      try { sock.close(); } catch {}
      resolve({ proto: "UDP", status, detail, ms: Date.now() - start });
    };
    const timer = setTimeout(() => finish("TIMEOUT", `no reply in ${TIMEOUT}ms`), TIMEOUT);
    sock.once("error", (e) => { clearTimeout(timer); finish("ERROR", `${e.code || ""} ${e.message}`.trim()); });
    sock.once("message", (msg) => {
      clearTimeout(timer);
      finish("OK", `replied ${msg.length} bytes`);
    });
    try {
      sock.send(buildZkConnectPacket(), PORT, HOST, (err) => {
        if (err) { clearTimeout(timer); finish("ERROR", err.message); }
      });
    } catch (e) { clearTimeout(timer); finish("ERROR", e.message); }
  });
}

async function main() {
  const stamp = new Date().toISOString();
  console.log(`\n🔎 בדיקת נגישות לשעון ${HOST}:${PORT} (timeout ${TIMEOUT}ms) — ${stamp}`);
  const [tcp, udp] = await Promise.all([probeTcp(), probeUdp()]);
  const fmt = (r) => `${r.proto.padEnd(3)} → ${r.status.padEnd(7)} (${r.ms}ms) ${r.detail}`;
  console.log("  " + fmt(tcp));
  console.log("  " + fmt(udp));

  const verdict =
    udp.status === "OK" ? "✅ UDP זמין — הסוכן אמור לעבוד (פרוטוקול UDP)."
    : tcp.status === "OK" ? "⚠️ רק TCP זמין — שקול CLOCK_PROTOCOL=tcp או FORCE_TCP=1."
    : "❌ השעון אינו נגיש בשני הפרוטוקולים. בדוק: כתובת IP, הפעלה, חיווט רשת, firewall.";
  console.log(verdict + "\n");

  // exit code: 0 אם לפחות אחד עבר
  process.exit(udp.status === "OK" || tcp.status === "OK" ? 0 : 1);
}

main().catch((e) => { console.error("probe failed:", e); process.exit(2); });
