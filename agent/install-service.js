// התקנת ה-agent כ-Windows Service עם auto-restart מלא
// הרצה: npm run service:install  (חובה cmd כ-Administrator)

const { Service } = require('node-windows');
const path = require('path');
const { execSync } = require('child_process');

const SERVICE_NAME = 'Tiful360 Attendance Agent';
// שם פנימי של ה-Service ב-SCM (כפי ש-node-windows יוצר אותו)
const SCM_NAME = 'tiful360attendanceagent.exe';

const svc = new Service({
  name: SERVICE_NAME,
  description: 'מושך פאנצ\'ים משעון ZKTeco ושולח ל-Lovable Cloud (auto-restart + watchdog)',
  script: path.join(__dirname, 'index.js'),
  nodeOptions: [],
  // restart אוטומטי של node-windows כשהתהליך יוצא (קריסה / watchdog exit)
  wait: 2,           // ממתין 2s לפני הניסיון הראשון
  grow: 0.5,         // backoff מתון
  maxRestarts: 1000, // למעשה ללא הגבלה
  abortOnError: false,
  stopparentfirst: false,
  workingDirectory: __dirname,
});

function configureScmRecovery() {
  // הגדרת Windows Service Recovery — מבטיח שגם אם node-windows ייכשל,
  // SCM עצמו יפעיל מחדש את השירות אחרי 10 שניות, ללא הגבלה.
  try {
    console.log('⚙️  מגדיר Windows SCM Recovery (restart/restart/restart, 10s)...');
    execSync(`sc failure "${SCM_NAME}" reset= 86400 actions= restart/10000/restart/10000/restart/10000`, { stdio: 'inherit' });
    execSync(`sc failureflag "${SCM_NAME}" 1`, { stdio: 'inherit' });
    // הפעלה אוטומטית בעליית המחשב
    execSync(`sc config "${SCM_NAME}" start= auto`, { stdio: 'inherit' });
    console.log('✓ SCM Recovery הוגדר.');
  } catch (e) {
    console.warn('⚠️  הגדרת SCM Recovery נכשלה (לא קריטי):', e.message || e);
  }
}

svc.on('install', () => {
  console.log('✓ ה-Service הותקן בהצלחה.');
  configureScmRecovery();
  console.log('  מפעיל אותו עכשיו...');
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('ℹ ה-Service כבר מותקן. מעדכן SCM Recovery בלבד...');
  configureScmRecovery();
  console.log('  כדי להפעיל מחדש: services.msc → "' + SERVICE_NAME + '"');
});

svc.on('start', () => {
  console.log('✓ ה-Service פועל ברקע עם auto-restart מלא.');
  console.log('  לצפייה/עצירה: services.msc');
  console.log('  לוגים: ' + path.join(__dirname, 'daemon'));
});

svc.on('error', (err) => {
  console.error('✗ שגיאה:', err);
});

console.log('מתקין Windows Service...');
console.log('(אם זה נכשל — וודא שאתה מריץ cmd כ-Administrator)');
svc.install();
