const { spawn } = require('child_process');
const path = require('path');

const scripts = ['kick-monitor.js', 'youtube-monitor.js', 'tiktok-monitor.js'];
const children = new Map();
const restartAttempts = new Map();
const restartDelayMs = 5000;
const maxRestartDelayMs = 60000;
let shuttingDown = false;

function startMonitor(script) {
  if (shuttingDown) return;

  const child = spawn(process.execPath, [path.join(__dirname, script)], {
    stdio: 'inherit',
  });
  children.set(script, child);
  console.log('▶️ ' + script + ' başlatıldı');

  child.on('error', (error) => {
    console.error('❌ ' + script + ' başlatılamadı: ' + error.message);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (children.get(script) === child) children.delete(script);

    const attempt = (restartAttempts.get(script) || 0) + 1;
    restartAttempts.set(script, attempt);
    const delay = Math.min(maxRestartDelayMs, restartDelayMs * Math.pow(2, Math.min(attempt - 1, 4)));
    console.error('❌ ' + script + ' durdu (kod: ' + (code ?? 'yok') + ', sinyal: ' + (signal ?? 'yok') + '). ' + (delay / 1000) + ' saniye sonra yeniden başlatılacak.');

    const timer = setTimeout(() => startMonitor(script), delay);
    if (timer.unref) timer.unref();
    const resetTimer = setTimeout(() => restartAttempts.set(script, 0), 60000);
    if (resetTimer.unref) resetTimer.unref();
  });
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.values()) {
    if (!child.killed) child.kill();
  }
  children.clear();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
for (const script of scripts) startMonitor(script);
