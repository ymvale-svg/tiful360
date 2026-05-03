// הסרת ה-agent כ-Windows Service
// הרצה: npm run service:uninstall  (חובה cmd כ-Administrator)

const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name: 'Tiful360 Attendance Agent',
  script: path.join(__dirname, 'index.js'),
});

svc.on('uninstall', () => {
  console.log('✓ ה-Service הוסר.');
  console.log('  קיים: ' + (svc.exists ? 'כן' : 'לא'));
});

svc.on('error', (err) => {
  console.error('✗ שגיאה:', err);
});

console.log('מסיר Windows Service...');
svc.uninstall();
