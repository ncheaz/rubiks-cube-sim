#!/usr/bin/env node
/* Build: inline solver + game + CSS into a single self-contained cube.html */
'use strict';
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const tpl = read('src/template.html');
const css = read('src/style.css');
const solver = read('src/solver.js');
const game = read('src/game.js');

// Guard: </script> inside inlined JS would break the document.
for (const [name, src] of [['solver', solver], ['game', game]]) {
  if (/<\/script/i.test(src)) throw new Error(`${name} contains </script>`);
}

const out = tpl.replace('{{CSS}}', () => css).replace('{{SOLVER}}', () => solver).replace('{{GAME}}', () => game);
const dest = path.join(root, 'cube.html');
fs.writeFileSync(dest, out);
console.log(`cube.html: ${(fs.statSync(dest).size / 1024).toFixed(1)} KB`);
