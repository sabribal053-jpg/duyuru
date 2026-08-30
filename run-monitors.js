const { spawn } = require('child_process');
const path = require('path');

const scripts = ['kick-monitor.js', 'youtube-monitor.js'];
const children = scripts.map((script) => {
  const child = spawn(process.execPath, [path.join(__dirname, script)], {
    stdio: 'inherit',
  });

  console.log(`▶️ ${script} başlatıldı`);
  return { child, script };
});

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const { child } of children) {
    if (!child.killed) child.kill();
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

for (const { child, script } of children) {
  child.on('error', (error) => {
    console.error(`❌ ${script} başlatılamadı: ${error.message}`);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;

    if (code !== 0) {
      console.error(`❌ ${script} durdu (kod: ${code ?? 'yok'}, sinyal: ${signal ?? 'yok'})`);
      shutdown();
      process.exitCode = code || 1;
    }
  });
}
