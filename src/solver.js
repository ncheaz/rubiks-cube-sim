/* CubeSolver — two-phase (Kociemba) solver for the 3x3x3 cube.
 *
 * Everything is DERIVED from a geometric cubie model (positions + sticker
 * normals rotated by exact integer 90° turns). No hand-copied permutation
 * tables. Round-trip tests in Node verify the derivation.
 *
 * Facelet order: U1..U9 R1..R9 F1..F9 D1..D9 L1..L9 B1..B9 (54 chars of URFDLB).
 * Coordinates: x=R(+)/L(-), y=U(+)/D(-), z=F(+)/B(-).
 *
 * Exposed API (UMD):
 *   CubeSolver.solve(facelets, opts) -> { moves: ["R","U'",...], length }
 *   CubeSolver.applyMoves(facelets, moves) -> facelets
 *   CubeSolver.warm(onProgress) -> Promise; builds all tables (once).
 *   CubeSolver.isWarming / CubeSolver.isReady
 *   CubeSolver.randomScramble(n) -> moves
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CubeSolver = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Geometry: faces, slots, normals
   * ------------------------------------------------------------------ */
  // Face order and screen conventions (standard Kociemba facelet layout):
  //   U viewed from above, B at top   D viewed from below, F at top
  //   R viewed from +x, U at top      L viewed from -x, U at top
  //   F viewed from +z, U at top      B viewed from -z, U at top
  var FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
  // For each face: view "up" vector and view "right" vector (integer vec3s).
  var FACE_VIEW = {
    U: { up: [0, 0, -1], right: [1, 0, 0], normal: [0, 1, 0] },
    R: { up: [0, 1, 0], right: [0, 0, -1], normal: [1, 0, 0] },
    F: { up: [0, 1, 0], right: [1, 0, 0], normal: [0, 0, 1] },
    D: { up: [0, 0, 1], right: [1, 0, 0], normal: [0, -1, 0] },
    L: { up: [0, 1, 0], right: [0, 0, 1], normal: [-1, 0, 0] },
    B: { up: [0, 1, 0], right: [-1, 0, 0], normal: [0, 0, -1] }
  };
  function vadd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function vscale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  // Facelet index (face, 1..9) -> world position of the sticker slot.
  function faceletPos(face, idx) {
    var v = FACE_VIEW[face], col = (idx - 1) % 3, row = Math.floor((idx - 1) / 3); // row 0 = top
    return vadd(vadd(vscale(v.normal, 1), vscale(v.right, col - 1)), vscale(v.up, 1 - row));
  }
  function key3(p) { return p[0] + ',' + p[1] + ',' + p[2]; }

  // Corner / edge positions in standard order, with their facelet triples.
  var CORNER_POS = [[1,1,1],[-1,1,1],[-1,1,-1],[1,1,-1],[1,-1,1],[-1,-1,1],[-1,-1,-1],[1,-1,-1]];
  var CORNER_NAME = ['URF','UFL','ULB','UBR','DFR','DLF','DBL','DRB'];
  var CORNER_TRIPLE = [['U9','R1','F3'],['U7','F1','L3'],['U1','L1','B3'],['U3','B1','R3'],
                       ['D3','F9','R7'],['D1','L9','F7'],['D7','B9','L7'],['D9','R9','B7']];
  var CORNER_COLOR = [['U','R','F'],['U','F','L'],['U','L','B'],['U','B','R'],
                      ['D','F','R'],['D','L','F'],['D','B','L'],['D','R','B']];
  var EDGE_POS = [[1,1,0],[0,1,1],[-1,1,0],[0,1,-1],[1,-1,0],[0,-1,1],[-1,-1,0],[0,-1,-1],
                  [1,0,1],[-1,0,1],[-1,0,-1],[1,0,-1]];
  var EDGE_NAME = ['UR','UF','UL','UB','DR','DF','DL','DB','FR','FL','BL','BR'];
  var EDGE_TRIPLE = [['U6','R2'],['U8','F2'],['U4','L2'],['U2','B2'],['D6','R8'],['D2','F8'],
                     ['D4','L8'],['D8','B8'],['F6','R4'],['F4','L6'],['B6','L4'],['B4','R6']];
  var EDGE_COLOR = [['U','R'],['U','F'],['U','L'],['U','B'],['D','R'],['D','F'],
                    ['D','L'],['D','B'],['F','R'],['F','L'],['B','L'],['B','R']];

  // Precompute normals for each slot of each position.
  function slotNormal(fl) { return FACE_VIEW[fl[0]].normal; }
  var CORNER_SLOT_NORMALS = CORNER_TRIPLE.map(function (t) { return t.map(slotNormal); });
  var EDGE_SLOT_NORMALS = EDGE_TRIPLE.map(function (t) { return t.map(slotNormal); });
  // Position key -> index
  var CORNER_IDX = {}, EDGE_IDX = {};
  CORNER_POS.forEach(function (p, i) { CORNER_IDX[key3(p)] = i; });
  EDGE_POS.forEach(function (p, i) { EDGE_IDX[key3(p)] = i; });

  /* ------------------------------------------------------------------ *
   * Exact 90° rotations of integer vectors
   * ------------------------------------------------------------------ */
  // Rotate vec v by q quarter-turns of "-90° around +axis" repeated q times
  // (i.e. one clockwise turn of the face whose outward normal is +axis).
  // For a face on the -axis, clockwise = +90° around the positive axis.
  function rotVec(v, axis, q) {
    var x = v[0], y = v[1], z = v[2], t;
    for (var i = 0; i < q; i++) {
      // Each step is -90° right-handed about +axis = clockwise viewed from +axis.
      if (axis === 0) { t = y; y = z; z = -t; }         // (y,z)->(z,-y)
      else if (axis === 1) { t = x; x = -z; z = t; }    // (x,z)->(-z,x)
      else { t = x; x = y; y = -t; }                    // (x,y)->(y,-x)
    }
    return [x, y, z];
  }
  // Quarter turns for a face letter: U=+y cw; D=-y => +90 about +y => q=3 with -90 steps.
  var MOVE_Q = { U: [1, 1], D: [1, 3], R: [0, 1], L: [0, 3], F: [2, 1], B: [2, 3] }; // face -> [axis, q]
  var MOVE_LETTER = { U: 1, D: 1, R: 0, L: 0, F: 2, B: 2 }; // face -> axis

  /* ------------------------------------------------------------------ *
   * State: cp[8], co[8], ep[12], eo[12]  (cubie id at each position)
   * co: slot index of the U/D sticker within the position's triple.
   * eo: 0 if edge's first color faces the position's first facelet.
   * ------------------------------------------------------------------ */
  function solvedState() {
    return { cp: [0,1,2,3,4,5,6,7], co: [0,0,0,0,0,0,0,0],
             ep: [0,1,2,3,4,5,6,7,8,9,10,11], eo: [0,0,0,0,0,0,0,0,0,0,0,0] };
  }
  function copyState(s) {
    return { cp: s.cp.slice(), co: s.co.slice(), ep: s.ep.slice(), eo: s.eo.slice() };
  }
  function equalState(a, b) {
    return a.cp.join() === b.cp.join() && a.co.join() === b.co.join() &&
           a.ep.join() === b.ep.join() && a.eo.join() === b.eo.join();
  }

  // Apply one move ("U", "R'", "F2", ...) to a state, in place.
  function applyMove(s, move) {
    var face = move[0], q = move.length > 1 ? (move[1] === '2' ? 2 : 3) : 1;
    var ax = MOVE_LETTER[face], baseQ = MOVE_Q[face][1];
    // q base-clockwise turns, each worth baseQ quarter-steps: total = q*baseQ (mod 4).
    // (NOT baseQ+q-1 — that made L2/D2/B2 wrap to identity.)
    var totalQ = (q * baseQ) % 4;
    var layer = (face === 'U' || face === 'R' || face === 'F') ? 1 : -1;

    var ncp = s.cp.slice(), nco = s.co.slice(), nep = s.ep.slice(), neo = s.eo.slice();
    var i, p, pk, i2, k2;
    for (i = 0; i < 8; i++) {
      p = CORNER_POS[i];
      if (p[ax] !== layer) continue;
      i2 = CORNER_IDX[key3(rotVec(p, ax, totalQ))];
      ncp[i2] = s.cp[i];
      // orientation: track where slot-k normal lands
      var nrm = CORNER_SLOT_NORMALS[i][s.co[i]];
      var rn = rotVec(nrm, ax, totalQ);
      var tri = CORNER_SLOT_NORMALS[i2];
      for (k2 = 0; k2 < 3; k2++) if (tri[k2][0] === rn[0] && tri[k2][1] === rn[1] && tri[k2][2] === rn[2]) break;
      nco[i2] = k2;
    }
    for (i = 0; i < 12; i++) {
      p = EDGE_POS[i];
      if (p[ax] !== layer) continue;
      i2 = EDGE_IDX[key3(rotVec(p, ax, totalQ))];
      nep[i2] = s.ep[i];
      var enrm = EDGE_SLOT_NORMALS[i][s.eo[i]];
      var ern = rotVec(enrm, ax, totalQ);
      var etri = EDGE_SLOT_NORMALS[i2];
      for (k2 = 0; k2 < 2; k2++) if (etri[k2][0] === ern[0] && etri[k2][1] === ern[1] && etri[k2][2] === ern[2]) break;
      neo[i2] = k2;
    }
    s.cp = ncp; s.co = nco; s.ep = nep; s.eo = neo;
    return s;
  }
  function applyMoves(s, moves) { moves.forEach(function (m) { applyMove(s, m); }); return s; }

  /* ------------------------------------------------------------------ *
   * Facelets <-> cubie state
   * ------------------------------------------------------------------ */
  function faceletsToState(fs) {
    var s = solvedState(), f = fs.split(''), i, j, k;
    var faceIdx = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
    function fl(n) { var face = n[0], num = parseInt(n.slice(1), 10); return f[faceIdx[face] * 9 + num - 1]; }
    for (i = 0; i < 8; i++) {
      var ori1 = -1;
      for (k = 0; k < 3; k++) {
        var c = fl(CORNER_TRIPLE[i][k]);
        if (c === 'U' || c === 'D') { ori1 = k; break; }
      }
      if (ori1 < 0) throw new Error('no U/D sticker on corner ' + i);
      var col1 = fl(CORNER_TRIPLE[i][ori1]),
          col2 = fl(CORNER_TRIPLE[i][(ori1 + 1) % 3]),
          col3 = fl(CORNER_TRIPLE[i][(ori1 + 2) % 3]);
      for (j = 0; j < 8; j++) {
        if (CORNER_COLOR[j][0] === col1 && CORNER_COLOR[j][1] === col2 && CORNER_COLOR[j][2] === col3) {
          s.cp[i] = j; s.co[i] = ori1; break;
        }
      }
    }
    for (i = 0; i < 12; i++) {
      var c1 = fl(EDGE_TRIPLE[i][0]), c2 = fl(EDGE_TRIPLE[i][1]);
      for (j = 0; j < 12; j++) {
        if (EDGE_COLOR[j][0] === c1 && EDGE_COLOR[j][1] === c2) { s.ep[i] = j; s.eo[i] = 0; break; }
        if (EDGE_COLOR[j][1] === c1 && EDGE_COLOR[j][0] === c2) { s.ep[i] = j; s.eo[i] = 1; break; }
      }
    }
    return s;
  }
  function stateToFacelets(s) {
    var f = new Array(54), faceIdx = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
    var fi, centers = 'URFDLB';
    for (fi = 0; fi < 6; fi++) f[fi * 9 + 4] = centers[fi]; // centers never move
    function put(n, ch) { var face = n[0], num = parseInt(n.slice(1), 10); f[faceIdx[face] * 9 + num - 1] = ch; }
    for (var i = 0; i < 8; i++)
      for (var k = 0; k < 3; k++)
        put(CORNER_TRIPLE[i][k], CORNER_COLOR[s.cp[i]][(k + 3 - s.co[i]) % 3]);
    for (var e = 0; e < 12; e++) {
      put(EDGE_TRIPLE[e][0], EDGE_COLOR[s.ep[e]][s.eo[e]]);
      put(EDGE_TRIPLE[e][1], EDGE_COLOR[s.ep[e]][1 - s.eo[e]]);
    }
    return f.join('');
  }
  function solvedFacelets() {
    var out = '';
    for (var i = 0; i < 6; i++) for (var j = 0; j < 9; j++) out += FACES[i];
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Coordinates
   * ------------------------------------------------------------------ */
  var N_TWIST = 2187, N_FLIP = 2048, N_SLICE1 = 495, N_PERM4 = 24, N_PERM8 = 40320;
  var C4 = [], C8 = [];
  (function () {
    for (var n = 0; n <= 12; n++) { C4[n] = []; for (var k = 0; k <= 4; k++) C4[n][k] = k === 0 || k === n ? 1 : (k > n ? 0 : C4[n-1][k-1] + C4[n-1][k]); }
    for (n = 0; n <= 8; n++) { C8[n] = []; for (k = 0; k <= 8; k++) C8[n][k] = k === 0 || k === n ? 1 : (k > n ? 0 : C8[n-1][k-1] + C8[n-1][k]); }
  })();

  function getTwist(s) { var v = 0; for (var i = 0; i < 7; i++) v += s.co[i] * Math.pow(3, i); return v; }
  function getFlip(s) { var v = 0; for (var i = 0; i < 11; i++) v += s.eo[i] * Math.pow(2, i); return v; }
  // Placement of slice edges (ids 8..11) among 12 positions (colex rank).
  function getSlice1(s) {
    var pos = [], i;
    for (i = 0; i < 12; i++) if (s.ep[i] >= 8) pos.push(i);
    return C4[pos[0]][1] + C4[pos[1]][2] + C4[pos[2]][3] + C4[pos[3]][4];
  }
  // Lehmer rank/unrank for permutations of n items.
  function permRank(p, n, fact) {
    var r = 0, i, j, seen = [];
    for (i = 0; i < n; i++) {
      var c = 0;
      for (j = i + 1; j < n; j++) if (p[j] < p[i]) c++;
      r += c * fact[n - 1 - i];
    }
    return r;
  }
  function permUnrank(r, n, fact) {
    var elems = [], out = [], i;
    for (i = 0; i < n; i++) elems.push(i);
    for (i = 0; i < n; i++) {
      var f = fact[n - 1 - i], idx = Math.floor(r / f); r %= f;
      out.push(elems.splice(idx, 1)[0]);
    }
    return out;
  }
  var FACT8 = [1,1,2,6,24,120,720,5040,40320], FACT4 = [1,1,2,6,24];
  // Placement coord of the solved cube — the phase-1 slice goal is this, not 0.
  var S1_SOLVED = getSlice1(solvedState());
  // Phase-2 slice perm: order of slice-edge ids at the 4 slice positions.
  function getSlicePerm(s) {
    var ids = [];
    for (var i = 0; i < 12; i++) if (s.ep[i] >= 8) ids.push(s.ep[i] - 8);
    return permRank(ids, 4, FACT4);
  }
  function setSlicePerm(s, r) {
    var ids = permUnrank(r, 4, FACT4), k = 0;
    for (var i = 0; i < 12; i++) if (s.ep[i] >= 8) s.ep[i] = 8 + ids[k++];
  }
  // Phase-2 U/D-edge perm: ids 0..7 at positions 0..7.
  function getUEdgePerm(s) {
    var p = [];
    for (var i = 0; i < 8; i++) p.push(s.ep[i]);
    return permRank(p, 8, FACT8);
  }
  function setUEdgePerm(s, r) {
    var p = permUnrank(r, 8, FACT8), k = 0;
    // Fill ONLY the non-slice slots (slice placement must already be set).
    for (var i = 0; i < 12; i++) if (s.ep[i] < 8) s.ep[i] = p[k++];
  }
  function getCPerm(s) { return permRank(s.cp, 8, FACT8); }
  function setCPerm(s, r) { s.cp = permUnrank(r, 8, FACT8); }

  /* ------------------------------------------------------------------ *
   * Move tables
   * ------------------------------------------------------------------ */
  var ALL_MOVES = [];
  'URFDLB'.split('').forEach(function (f) { ALL_MOVES.push(f, f + '2', f + "'"); });
  // Phase-2 move subset: quarter/half U D, half R L F B.
  var P2_MOVES = ['U', 'U2', "U'", 'D', 'D2', "D'", 'R2', 'L2', 'F2', 'B2'];
  var P2_IDX = P2_MOVES.map(function (m) { return ALL_MOVES.indexOf(m); });
  var AXES = ALL_MOVES.map(function (m) { return MOVE_LETTER[m[0]]; });
  var IS_HALF = ALL_MOVES.map(function (m) { return m.length > 1 && m[1] === '2'; });

  function encodeAll(s) {
    return { t: getTwist(s), f: getFlip(s), s1: getSlice1(s),
             cp: getCPerm(s), ue: getUEdgePerm(s), sp: getSlicePerm(s) };
  }
  function decodeTo(c, out) {
    out = out || solvedState();
    var i, tw = c.t, fl = c.f;
    for (i = 0; i < 7; i++) { out.co[i] = tw % 3; tw = (tw - out.co[i]) / 3; }
    out.co[7] = (3 - (out.co[0] + out.co[1] + out.co[2] + out.co[3] + out.co[4] + out.co[5] + out.co[6]) % 3) % 3;
    for (i = 0; i < 11; i++) { out.eo[i] = fl % 2; fl = (fl - out.eo[i]) / 2; }
    var eoSum = 0;
    for (i = 0; i < 11; i++) eoSum += out.eo[i];
    out.eo[11] = eoSum % 2;
    // Order matters: setSlice1 rebuilds ALL edge slots, so the U/D-edge perm
    // and the slice perm must be applied after it.
    setSlice1(out, c.s1);
    setUEdgePerm(out, c.ue);
    setSlicePermFromPlacement(out, c.sp);
    setCPerm(out, c.cp);
    return out;
  }
  // Place the four slice edges into the positions given by placement coord.
  function setSlice1(s, r) {
    // unrank colex: largest p3 with C(p3,4) <= r, etc.
    var rem = r, p = [0, 0, 0, 0], k;
    for (k = 3; k >= 0; k--) {
      var pk = 12;
      while (C4[pk][k + 1] > rem) pk--;
      p[k] = pk; rem -= C4[pk][k + 1];
    }
    var inSlice = [false, false, false, false, false, false, false, false, false, false, false, false];
    p.forEach(function (x) { inSlice[x] = true; });
    var e = 0, sl = 0;
    for (var i2 = 0; i2 < 12; i2++) s.ep[i2] = inSlice[i2] ? 8 + (sl++) : e++;
  }
  // Given placement already set, order the slice-edge ids by slice-perm coord.
  function setSlicePermFromPlacement(s, r) {
    var ids = permUnrank(r, 4, FACT4), k = 0;
    for (var i = 0; i < 12; i++) if (s.ep[i] >= 8) s.ep[i] = 8 + ids[k++];
  }

  var MT = null; // full move tables: MT.t[coord][moveIdx] etc.
  function buildMoveTables() {
    if (MT) return;
    MT = { t: [], f: [], s1: [], cp: [], ue: [], sp: [] };
    var i, m, st;
    var scratch = solvedState();

    // Phase-1 tables over all 18 moves. For each coordinate we decode a
    // canonical state (solved everywhere except the coord in question),
    // apply the move, and read the coord back. Orientation/placement coords
    // are independent, so the slice perm / perms may stay solved.
    // NOTE: decodes use the SOLVED slice placement (S1_SOLVED = 494); s1 = 0
    // would place slice edges on the U face and poison the perm tables.
    for (i = 0; i < N_TWIST; i++) {
      st = decodeTo({ t: i, f: 0, s1: S1_SOLVED, cp: 0, ue: 0, sp: 0 }, copyState(scratch));
      var row = new Array(18);
      for (m = 0; m < 18; m++) row[m] = getTwist(applyMove(copyState(st), ALL_MOVES[m]));
      MT.t.push(row);
    }
    for (i = 0; i < N_FLIP; i++) {
      st = decodeTo({ t: 0, f: i, s1: S1_SOLVED, cp: 0, ue: 0, sp: 0 }, copyState(scratch));
      var rowF = new Array(18);
      for (m = 0; m < 18; m++) rowF[m] = getFlip(applyMove(copyState(st), ALL_MOVES[m]));
      MT.f.push(rowF);
    }
    for (i = 0; i < N_SLICE1; i++) {
      st = decodeTo({ t: 0, f: 0, s1: i, cp: 0, ue: 0, sp: 0 }, copyState(scratch));
      var rowS = new Array(18);
      for (m = 0; m < 18; m++) rowS[m] = getSlice1(applyMove(copyState(st), ALL_MOVES[m]));
      MT.s1.push(rowS);
    }
    // Phase-2 tables over the 10-move subset.
    for (i = 0; i < N_PERM8; i++) {
      st = decodeTo({ t: 0, f: 0, s1: S1_SOLVED, cp: i, ue: 0, sp: 0 }, copyState(scratch));
      var rowC = new Array(10), rowU = new Array(10);
      var stU = decodeTo({ t: 0, f: 0, s1: S1_SOLVED, cp: 0, ue: i, sp: 0 }, copyState(scratch));
      for (m = 0; m < 10; m++) {
        rowC[m] = getCPerm(applyMove(copyState(st), ALL_MOVES[P2_IDX[m]]));
        rowU[m] = getUEdgePerm(applyMove(copyState(stU), ALL_MOVES[P2_IDX[m]]));
      }
      MT.cp.push(rowC); MT.ue.push(rowU);
    }
    for (i = 0; i < N_PERM4; i++) {
      st = decodeTo({ t: 0, f: 0, s1: S1_SOLVED, cp: 0, ue: 0, sp: i }, copyState(scratch));
      var rowP = new Array(10);
      for (m = 0; m < 10; m++) rowP[m] = getSlicePerm(applyMove(copyState(st), ALL_MOVES[P2_IDX[m]]));
      MT.sp.push(rowP);
    }
  }

  /* ------------------------------------------------------------------ *
   * Pruning tables (combined coordinates, BFS from goal = 0)
   * ------------------------------------------------------------------ */
  var PT = null; // {t1, f1, c2, u2}
  var P1_DEPTH = 12, P2_DEPTH = 10;

  function bfsTable(sizeX, sizeY, moveTabX, moveTabY, nMoves, goalIdx) {
    var t = new Uint8Array(sizeX * sizeY); t.fill(255);
    t[goalIdx] = 0;
    var frontier = [goalIdx], depth = 0, filled = 1;
    while (frontier.length && depth < 20) {
      var next = [];
      for (var fi = 0; fi < frontier.length; fi++) {
        var idx = frontier[fi], x = (idx / sizeY) | 0, y = idx % sizeY;
        for (var m = 0; m < nMoves; m++) {
          var nx = moveTabX[x][m], ny = moveTabY[y][m];
          var nidx = nx * sizeY + ny;
          if (t[nidx] === 255) { t[nidx] = depth + 1; next.push(nidx); filled++; }
        }
      }
      frontier = next; depth++;
    }
    return { t: t, filled: filled };
  }

  function buildPruneTables(report) {
    if (PT) return;
    buildMoveTables();
    var solvedC = encodeAll(solvedState());
    var S1_GOAL = solvedC.s1; // placement coord of the solved cube (494, not 0)
    report && report('phase-1 prune: twist×slice');
    var a = bfsTable(N_TWIST, N_SLICE1, MT.t, MT.s1, 18, 0 * N_SLICE1 + S1_GOAL);
    report && report('phase-1 prune: flip×slice');
    var b = bfsTable(N_FLIP, N_SLICE1, MT.f, MT.s1, 18, 0 * N_SLICE1 + S1_GOAL);
    report && report('phase-2 prune: corner×slice-perm');
    var c = bfsTable(N_PERM8, N_PERM4, MT.cp, MT.sp, 10, 0);
    report && report('phase-2 prune: uedge×slice-perm');
    var d = bfsTable(N_PERM8, N_PERM4, MT.ue, MT.sp, 10, 0);
    PT = { t1: a.t, f1: b.t, c2: c.t, u2: d.t, s1Goal: S1_GOAL };
    // A prune value of 255 (unreached) would poison the search — every cell
    // must be reachable from the goal.
    if (a.filled !== N_TWIST * N_SLICE1) throw new Error('twist×slice prune incomplete: ' + a.filled);
    if (b.filled !== N_FLIP * N_SLICE1) throw new Error('flip×slice prune incomplete: ' + b.filled);
    if (c.filled !== N_PERM8 * N_PERM4) throw new Error('cp×sp prune incomplete: ' + c.filled);
    if (d.filled !== N_PERM8 * N_PERM4) throw new Error('ue×sp prune incomplete: ' + d.filled);
  }

  /* ------------------------------------------------------------------ *
   * IDA* search
   * ------------------------------------------------------------------ */
  function prune1(t, f, s1) {
    var g = PT.s1Goal;
    var a = PT.t1[t * N_SLICE1 + s1], b = PT.f1[f * N_SLICE1 + s1];
    void g;
    return a > b ? a : b;
  }
  function prune2(cp, ue, sp) {
    var a = PT.c2[cp * N_PERM4 + sp], b = PT.u2[ue * N_PERM4 + sp];
    return a > b ? a : b;
  }

  // moves[depth] = move index; ordering: no same face; no same axis after a half turn.
  // ab: {deadline, n, abort} — time-bounded so a hard state can't stall the UI.
  function searchPhase1(t, f, s1, depth, maxD, moves, out, ab) {
    if (ab.abort) return;
    if ((++ab.n & 1023) === 0 && Date.now() > ab.deadline) { ab.abort = true; return; }
    if (out.length >= ab.maxSols) return;
    if (t === 0 && f === 0 && s1 === S1_SOLVED) { if (depth <= maxD) out.push(moves.slice(0, depth)); return; }
    if (depth >= maxD) return;
    var p = prune1(t, f, s1);
    if (depth + p > maxD) return;
    var prevFace = depth > 0 ? ALL_MOVES[moves[depth - 1]][0] : '';
    var prevAxis = depth > 0 ? AXES[moves[depth - 1]] : -1;
    var prevHalf = depth > 0 ? IS_HALF[moves[depth - 1]] : false;
    for (var m = 0; m < 18; m++) {
      if (depth > 0) {
        if (ALL_MOVES[m][0] === prevFace) continue;
        if (AXES[m] === prevAxis && prevHalf) continue;
      }
      moves[depth] = m;
      searchPhase1(MT.t[t][m], MT.f[f][m], MT.s1[s1][m], depth + 1, maxD, moves, out, ab);
      if (ab.abort || out.length >= ab.maxSols) return;
    }
  }

  function searchPhase2(cp, ue, sp, depth, maxD, moves, nodeBudget) { /* superseded by recorded variant */ }

  // Convert ALL_MOVES indices to strings.
  function idxToMoves(idxs) { return idxs.map(function (i) { return ALL_MOVES[i]; }); }

  var moveOrderShuffle = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17];
  function shuffled(n) {
    var a = []; for (var i = 0; i < n; i++) a.push(i);
    for (i = n - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ------------------------------------------------------------------ *
   * Public: warm / solve
   * ------------------------------------------------------------------ */
  var ready = false, warming = false;

  function warm(onProgress) {
    if (ready) return Promise.resolve();
    if (warming) return new Promise(function (res) { var iv = setInterval(function () { if (ready) { clearInterval(iv); res(); } }, 50); });
    warming = true;
    return new Promise(function (res) {
      setTimeout(function () {
        var t0 = Date.now();
        buildPruneTables(function (msg) { onProgress && onProgress(msg); });
        ready = true; warming = false;
        onProgress && onProgress('ready in ' + (Date.now() - t0) + 'ms');
        res();
      }, 16);
    });
  }

  // facelets: 54-char URFDLB string. opts: timeBudgetMs (default 5000).
  // Phased minimization: aim under 22 moves (bar), escalate only if needed.
  function solve(facelets, opts) {
    opts = opts || {};
    var budgetMs = opts.timeBudgetMs || 5000;
    var t0 = Date.now(), deadline = t0 + budgetMs;
    if (!ready) throw new Error('solver not warmed');
    var st = faceletsToState(facelets);
    var c0 = encodeAll(st);
    if (c0.t === 0 && c0.f === 0 && c0.s1 === S1_SOLVED && c0.cp === 0 && c0.ue === 0 && c0.sp === 0)
      return { moves: [], length: 0 };

    var best = null;
    var phases = [21, 22, 23];
    var share = [0.55, 0.8, 1.0];
    for (var pi = 0; pi < phases.length; pi++) {
      var tgt = phases[pi];
      if (best && best.length <= tgt) break;     // cannot improve at this phase
      var ab = { deadline: t0 + budgetMs * share[pi], n: 0, n2: 0, abort: false, maxSols: 3000 };
      var d1max = Math.min(P1_DEPTH, tgt);
      for (var d1 = 0; d1 <= d1max; d1++) {
        if (ab.abort || Date.now() > ab.deadline) break;
        if (best && d1 >= best.length) break;    // p1 alone already >= best
        var sols = [], movesBuf = new Array(24);
        searchPhase1(c0.t, c0.f, c0.s1, 0, d1, movesBuf, sols, ab);
        // shortest phase-1 prefixes first — they leave the most room for phase 2
        sols.sort(function (a, b) { return a.length - b.length; });
        for (var si = 0; si < sols.length; si++) {
          if (ab.abort) break;                   // budget gone mid-batch
          var p1 = sols[si];
          if (best && p1.length + 1 >= best.length) continue; // cannot beat best
          var st2 = copyState(st);
          for (var k = 0; k < p1.length; k++) applyMove(st2, ALL_MOVES[p1[k]]);
          var c2 = encodeAll(st2);
          if (c2.t !== 0 || c2.f !== 0 || c2.s1 !== S1_SOLVED) continue;
          var budget2 = tgt - p1.length;
          if (best && p1.length + budget2 >= best.length) budget2 = best.length - p1.length - 1;
          if (budget2 < 0) continue;
          var rec = searchPhase2Recorded(c2.cp, c2.ue, c2.sp, budget2, ab);
          if (rec) {
            var total = idxToMoves(p1).concat(rec.map(function (i) { return P2_MOVES[i]; }));
            if (!best || total.length < best.length) best = total;
          }
        }
        if (best && best.length <= 20) return { moves: best, length: best.length };
      }
      if (best && best.length <= 21) return { moves: best, length: best.length };
      if (Date.now() > deadline) break;
    }
    if (best) return { moves: best, length: best.length };
    throw new Error('no solution within budget');
  }

  // Phase-2 search that records the winning sequence. ab = shared abort
  // handle {deadline, abort, n2} so hopeless states can't blow the budget.
  function searchPhase2Recorded(cp, ue, sp, maxD, ab) {
    var path = [], winLen = -1;
    function rec(cp, ue, sp, depth, maxD, lastFace, lastAxis, lastHalf) {
      if (cp === 0 && ue === 0 && sp === 0) { winLen = depth; return true; }
      if (depth >= maxD) return false;
      if (ab) {
        if (ab.abort) return false;
        if ((++ab.n2 & 1023) === 0 && Date.now() > ab.deadline) { ab.abort = true; return false; }
      }
      var p = prune2(cp, ue, sp);
      if (depth + p > maxD) return false;
      for (var m = 0; m < 10; m++) {
        if (depth > 0) {
          if (P2_MOVES[m][0] === lastFace) continue;
          if (MOVE_LETTER[P2_MOVES[m][0]] === lastAxis && lastHalf) continue;
        }
        path[depth] = m;
        if (rec(MT.cp[cp][m], MT.ue[ue][m], MT.sp[sp][m], depth + 1, maxD,
                P2_MOVES[m][0], MOVE_LETTER[P2_MOVES[m][0]], P2_MOVES[m].length > 1 && P2_MOVES[m][1] === '2'))
          return true;
      }
      return false;
    }
    var found = rec(cp, ue, sp, 0, maxD, '', -1, false);
    // path may hold stale entries from failed deeper branches — cut at the
    // recorded winning depth.
    return found ? path.slice(0, winLen) : null;
  }

  // Facelet-level application (for tests and verification).
  function applyMovesFacelets(facelets, moves) {
    var s = faceletsToState(facelets);
    applyMoves(s, moves);
    return stateToFacelets(s);
  }

  function randomScramble(n) {
    n = n || 22;
    var out = [], lastFace = '', lastAxis = -1, lastHalf = false, faces = 'URFDLB';
    while (out.length < n) {
      var face = faces[(Math.random() * 6) | 0];
      if (face === lastFace) continue;
      var ax = MOVE_LETTER[face];
      if (ax === lastAxis && lastHalf) continue;
      var suffix = ['', '2', "'"][(Math.random() * 3) | 0];
      out.push(face + suffix);
      lastFace = face; lastAxis = ax; lastHalf = suffix === '2';
    }
    return out;
  }

  return {
    solve: solve,
    warm: warm,
    applyMoves: function (fs, ms) { return applyMovesFacelets(fs, ms); },
    faceletsToState: faceletsToState,
    stateToFacelets: stateToFacelets,
    solvedFacelets: solvedFacelets,
    applyMove: applyMove,
    applyMovesState: applyMoves,
    randomScramble: randomScramble,
    isReady: function () { return ready; },
    isWarming: function () { return warming; },
    _internal: { ALL_MOVES: ALL_MOVES, encodeAll: encodeAll, decodeTo: decodeTo, solvedState: solvedState,
                 copyState: copyState, equalState: equalState, buildMoveTables: buildMoveTables }
  };
});
