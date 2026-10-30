const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', '.git', 'uploads', 'coverage'].includes(entry.name)) return [];
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? files(name) : [name];
  });
}
let checked = 0;
for (const filename of files(path.join(__dirname, '..'))) {
  if (/\.(?:c?js)$/.test(filename)) {
    const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
    checked++;
  }
}
console.log(`PASS: ${checked} server JavaScript files compile.`);
