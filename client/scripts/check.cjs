const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ejs = require('ejs');

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules','coverage'].includes(entry.name)) return [];
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : [filename];
  });
}
let checked = 0;
for (const filename of files(path.join(__dirname, '..'))) {
  if (filename.endsWith('.ejs')) {
    ejs.compile(fs.readFileSync(filename, 'utf8'), { filename });
    checked++;
  } else if (/\.c?js$/.test(filename)) {
    new vm.Script(fs.readFileSync(filename, 'utf8'), { filename });
    checked++;
  }
}
console.log(`PASS: ${checked} client templates and JavaScript files compile.`);
