import { PDFDocument, rgb } from "pdf-lib";
import fs from "fs";

async function mark(srcPath, outPath, boxes) {
  const bytes = fs.readFileSync(srcPath);
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(0);
  for (const [x, y, w, h, label] of boxes) {
    page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0, 0.6, 0), borderWidth: 1 });
    page.drawText(label, { x: x + 2, y: y + h + 2, size: 7, color: rgb(0, 0.6, 0) });
  }
  fs.writeFileSync(outPath, await pdf.save());
}

// Receive: signature boxes from visual: right ~455-555/210-285, left ~170-275/210-285
await mark("/dev-server/public/templates/receive-template.pdf", "/tmp/receive-cal.pdf", [
  [455, 555, 100, 73, "sigR"],   // x=455, y=555, w=100, h=73 — wait y is wrong, need lower
]);

// pixel y=830 in 1287px image → y_pdf = (1287-830) * 841.92/1287 = 457 * 0.654 = 299. 
// pixel y=940 → y_pdf = 347*0.654 = 227. So box y_pdf = 227, height = 72.
// Wait that gives box at top y=299, bottom y=227. In pdf-lib box is drawn from bottom-left so y=227, h=72.
await mark("/dev-server/public/templates/receive-template.pdf", "/tmp/receive-cal.pdf", [
  [455, 232, 105, 75, "sigR (חתימת המושך)"],
  [168, 232, 110, 75, "sigL (אישור גורם מנפק)"],
]);

// Return: pixel y top=720 → y_pdf=371, bottom=830 → y_pdf=299. box y=299, h=72.
await mark("/dev-server/public/templates/return-template.pdf", "/tmp/return-cal.pdf", [
  [455, 305, 110, 80, "sigR (חתימת העובד)"],
  [168, 305, 110, 80, "sigL (חתימת נציג)"],
]);
console.log("ok");
