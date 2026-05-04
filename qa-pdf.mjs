// QA: render real PDFs from our build* functions
import { buildHandoverPdf } from "./src/lib/pdf/buildHandoverPdf.ts";
import { buildOffboardingPdf } from "./src/lib/pdf/buildOffboardingPdf.ts";
import fs from "fs";

// shim fetch for /templates and /fonts
const origFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (typeof url === "string" && url.startsWith("/")) {
    const p = "./public" + url;
    const buf = fs.readFileSync(p);
    return new Response(buf);
  }
  return origFetch(url, opts);
};

const handover = await buildHandoverPdf({
  company_name: "אשל הירדן",
  employee_name: "ישראל ישראלי",
  employee_department: "מערכות מידע",
  date: new Date().toISOString(),
  assets: [
    { asset_name: "מחשב נייד", asset_code: "LAP-001", manufacturer_model: "Dell Latitude 5540", condition: "new" },
    { asset_name: "עכבר", asset_code: "MOU-12", manufacturer_model: "Logitech MX", condition: "good" },
  ],
  receiver_signature: null,
});
fs.writeFileSync("/tmp/handover-test.pdf", new Uint8Array(await handover.arrayBuffer()));

const handoverMulti = await buildHandoverPdf({
  company_name: "אשל הירדן",
  employee_name: "ישראל ישראלי",
  employee_department: "מערכות מידע",
  date: new Date().toISOString(),
  assets: Array.from({ length: 7 }, (_, i) => ({
    asset_name: `פריט ${i + 1}`, asset_code: `A-${100 + i}`, manufacturer_model: `Model X${i}`, condition: "good",
  })),
  receiver_signature: null,
});
fs.writeFileSync("/tmp/handover-multi.pdf", new Uint8Array(await handoverMulti.arrayBuffer()));

const off = await buildOffboardingPdf({
  company_name: "אשל הירדן",
  employee_name: "דנה כהן",
  employee_department: "תפעול",
  date: new Date().toISOString(),
  end_date: new Date().toISOString(),
  form_index: 1,
  assets: [
    { asset_id: "1", asset_name: "מחשב נייד", asset_code: "LAP-7", manufacturer_model: "HP EliteBook", condition_at_return: "good", notes: "" },
    { asset_id: "2", asset_name: "טלפון", asset_code: "PH-3", manufacturer_model: "iPhone 14", condition_at_return: "damaged", notes: "מסך סדוק" },
  ],
  general_notes: "מסך הטלפון סדוק ויש לבדוק. בקשה מוכרת.",
});
fs.writeFileSync("/tmp/offboarding-test.pdf", new Uint8Array(await off.arrayBuffer()));

console.log("ok");
