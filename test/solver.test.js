/* Node test harness for src/solver.js — run: node test/solver.test.js */
'use strict';
const CS = require('../src/solver.js');
const I = CS._internal;

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra ? '  ' + extra : '')); }
}

// ---------- 1. identity round trip ----------
{
  const fs = CS.solvedFacelets();
  ok(fs.length === 54 && new Set(fs).size === 6, 'solved facelets string');
  const s = CS.faceletsToState(fs);
  ok(CS.stateToFacelets(s) === fs, 'facelets->state->facelets identity (solved)');
}

// ---------- 2. known single-move effects on facelets ----------
// NOTE: when a column of stickers wraps over an edge its order reverses.
{
  const faceIdx = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
  const col = (fs, face, ns) => ns.map(k => fs[faceIdx[face] * 9 + k - 1]).join('');
  const row = (fs, face, ns) => ns.map(k => fs[faceIdx[face] * 9 + k - 1]).join('');
  const mkSolved = CS.solvedFacelets();
  let fs = CS.applyMoves(mkSolved, ['R']);
  ok(col(fs, 'U', [3,6,9]) === col(mkSolved, 'F', [3,6,9]), 'R: U right col = old F right col (in order)');
  fs = CS.applyMoves(mkSolved, ['U']);
  ok(row(fs, 'F', [1,2,3]) === row(mkSolved, 'R', [1,2,3]), 'U: F top row = old R top row');
  fs = CS.applyMoves(mkSolved, ['F']);
  ok(col(fs, 'R', [1,4,7]) === row(mkSolved, 'U', [7,8,9]), 'F: R left col = old U bottom row (in order)');
  // Pin the remaining three faces' rotation signs.
  fs = CS.applyMoves(mkSolved, ['D']);
  ok(row(fs, 'R', [7,8,9]) === row(mkSolved, 'F', [7,8,9]), 'D: R bottom row = old F bottom row');
  fs = CS.applyMoves(mkSolved, ['L']);
  ok(col(fs, 'F', [1,4,7]) === col(mkSolved, 'U', [7,4,1]), 'L: F left col = old U left col (reversed)');
  fs = CS.applyMoves(mkSolved, ['B']);
  ok(col(fs, 'L', [1,4,7]) === col(mkSolved, 'U', [3,2,1]), 'B: L left col = old U top row (reversed)');
}

// ---------- 3. move order / inverses ----------
{
  const solved = CS.solvedFacelets();
  for (const m of ['U', 'D', 'R', 'L', 'F', 'B']) {
    let f = solved;
    for (let i = 0; i < 4; i++) f = CS.applyMoves(f, [m]);
    ok(f === solved, `${m} applied 4x = solved`);
    ok(CS.applyMoves(CS.applyMoves(solved, [m]), [m + "'"]) === solved, `${m} then ${m}' = solved`);
  }
  let f = solved;
  for (let i = 0; i < 6; i++) f = CS.applyMoves(f, ["R", "U", "R'", "U'"]);
  ok(f === solved, 'sexy move x6 = solved');

  // Non-vacuous checks: every move must actually change the cube, and a half
  // turn must differ from both the quarter and the identity.
  for (const m of ['U','D','R','L','F','B']) {
    const q1 = CS.applyMoves(solved, [m]);
    const h = CS.applyMoves(solved, [m + '2']);
    ok(q1 !== solved, `${m} changes solved cube`);
    ok(h !== solved && h !== q1, `${m}2 distinct from solved and ${m}`);
    const prime = CS.applyMoves(solved, [m + "'"]);
    ok(prime !== solved && prime !== q1 && prime !== h, `${m}' distinct from solved/${m}/${m}2`);
  }
}

// ---------- 4. structural invariants on random states (no remembered sequences) ----------
{
  const inv = m => m.length > 1 && m[1] === '2' ? m : (m.length > 1 ? m[0] : m + "'");
  const faces = 'URFDLB';
  let scrambleInverseOk = true, invariantsOk = true;
  for (let t = 0; t < 30; t++) {
    const scr = [];
    let last = '';
    while (scr.length < 25) {
      const f = faces[(Math.random() * 6) | 0];
      if (f === last) continue;
      scr.push(f + ['', '2', "'"][(Math.random() * 3) | 0]); last = f;
    }
    const fs = CS.applyMoves(CS.solvedFacelets(), scr);
    const back = CS.applyMoves(fs, scr.slice().reverse().map(inv));
    if (back !== CS.solvedFacelets()) scrambleInverseOk = false;
    // validity invariants: twist sum %3, flip sum %2, matching parities
    const s = CS.faceletsToState(fs);
    const tw = s.co.reduce((a, b) => a + b, 0) % 3;
    const fl = s.eo.reduce((a, b) => a + b, 0) % 2;
    const par = p => { let v = 0; for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) v++; return v & 1; };
    if (tw !== 0 || fl !== 0 || par(s.cp) !== par(s.ep)) invariantsOk = false;
  }
  ok(scrambleInverseOk, 'scramble + inverse = solved (30 random 25-move scrambles)');
  ok(invariantsOk, 'random states satisfy twist/flip/parity invariants');
}

// ---------- 5. move tables are bijections ----------
{
  I.buildMoveTables();
  const MT = { t: null };
  // quick check through public path: apply each move then its inverse on random states
  const moves = I.ALL_MOVES;
  let allOk = true;
  for (let trial = 0; trial < 50; trial++) {
    let s = I.solvedState();
    for (let k = 0; k < 8; k++) CS.applyMove(s, moves[(Math.random() * 18) | 0]);
    const before = CS.stateToFacelets(s);
    const m = moves[(Math.random() * 18) | 0];
    const inv = m.length > 1 && m[1] === '2' ? m : (m.length > 1 ? m[0] : m + "'");
    CS.applyMove(s, m); CS.applyMove(s, inv);
    if (CS.stateToFacelets(s) !== before) { allOk = false; break; }
  }
  ok(allOk, 'random move + inverse restores state');
}

// ---------- 6. the big one: warm tables + solve random scrambles ----------
(async () => {
  console.log('warming tables…');
  const t0 = Date.now();
  await CS.warm(msg => process.stdout.write('  ' + msg + '\n'));
  console.log(`tables ready in ${Date.now() - t0}ms`);

  // superflip solve
  {
    const fs = CS.applyMoves(CS.solvedFacelets(), "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2".split(' '));
    const t1 = Date.now();
    const sol = CS.solve(fs);
    const back = CS.applyMoves(fs, sol.moves);
    ok(back === CS.solvedFacelets(), 'superflip solved & verified', `len=${sol.length} ${Date.now() - t1}ms`);
    console.log(`  superflip: ${sol.length} moves in ${Date.now() - t1}ms -> ${sol.moves.join(' ')}`);
  }

  const N = parseInt(process.argv[2] || '100', 10);
  let maxLen = 0, sumLen = 0, maxTime = 0, sumTime = 0, allVerified = true, over22 = 0;
  const lens = {};
  for (let i = 0; i < N; i++) {
    const scr = CS.randomScramble(22);
    const fs = CS.applyMoves(CS.solvedFacelets(), scr);
    const t1 = Date.now();
    let sol;
    try { sol = CS.solve(fs); } catch (e) { allVerified = false; console.log('FAIL  solve threw', e.message, scr.join(' ')); break; }
    const dt = Date.now() - t1;
    const back = CS.applyMoves(fs, sol.moves);
    if (back !== CS.solvedFacelets()) { allVerified = false; console.log('FAIL  verify', scr.join(' ')); break; }
    maxLen = Math.max(maxLen, sol.length); sumLen += sol.length;
    maxTime = Math.max(maxTime, dt); sumTime += dt;
    lens[sol.length] = (lens[sol.length] || 0) + 1;
    if (sol.length > 22) over22++;
  }
  console.log(`\n${N} random scrambles:`);
  console.log(`  verified: ${allVerified}`);
  console.log(`  max len: ${maxLen}  avg: ${(sumLen / N).toFixed(1)}  over22: ${over22}`);
  console.log(`  max time: ${maxTime}ms  avg: ${(sumTime / N).toFixed(0)}ms`);
  console.log('  length histogram:', JSON.stringify(lens));
  ok(allVerified, 'all solutions verified');
  ok(maxLen <= 22, 'max solution length <= 22', `max=${maxLen}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
