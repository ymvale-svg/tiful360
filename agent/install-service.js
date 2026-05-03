// התקנת ה-agent כ-Windows Service
// הרצה: npm run service:install  (חובה cmd כ-Administrator)

const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name: 'Tiful360 Attendance Agent',
  description: 'מושך פאנצ\'ים משעון ZKTeco ושולח ל-Lovable Cloud',
  script: path.join(__dirname, 'index.js'),
  nodeOptions: [],
  // אסטרטגיית restart אוטומטי אם נפל
  wait: 2,
  grow: 0.5,
  maxRestarts: 40,
  // מעביר משתני סביבה אם תרצה — אנחנו טוענים מ-.env בקוד עצמו
  workingDirectory: __dirname,
});

svc.on('install', () => {
  console.log('✓ ה-Service הותקן בהצלחה.');
  console.log('  מפעיל אותו עכשיו...');
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('ℹ ה-Service כבר מותקן. אין צורך להתקין שוב.');
  console.log('  כדי להפעיל מחדש: services.msc → "Tiful360 Attendance Agent"');
});

svc.on('start', () => {
  console.log('✓ ה-Service פועל ברקע.');
  console.log('  לצפייה/עצירה: הקלד services.msc ב-Run');
  console.log('  לוגים: ' + path.join(__dirname, 'daemon'));
});

svc.on('error', (err) => {
  console.error('✗ שגיאה:', err);
});

console.log('מתקין Windows Service...');
console.log('(אם זה נכשל — וודא שאתה מריץ cmd כ-Administrator)');
svc.install();
