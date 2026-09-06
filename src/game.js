/* Cube — single-page 3D Rubik's Cube game. Hand-rolled WebGL, zero libraries.
 *
 * Sections: math · geometry · shaders · renderer · cube state · input ·
 *           animation · solver glue · modes · HUD · audio · boot.
 */
'use strict';

/* ============================== math ==================================== */
function mat4Identity() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
function mat4Multiply(a, b) { // a * b (column-major)
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  }
  return o;
}
function mat4Perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
}
function mat4Translate(x, y, z) { const m = mat4Identity(); m[12]=x; m[13]=y; m[14]=z; return m; }
function mat4Scale(x, y, z) { const m = mat4Identity(); m[0]=x; m[5]=y; m[10]=z; return m; }
function mat4RotX(a) { const c=Math.cos(a), s=Math.sin(a); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); }
function mat4RotY(a) { const c=Math.cos(a), s=Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); }
function mat4RotZ(a) { const c=Math.cos(a), s=Math.sin(a); return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); }
function mat4Invert(m) {
  const inv = new Float32Array(16), o = m;
  inv[0]=o[5]*o[10]*o[15]-o[5]*o[11]*o[14]-o[9]*o[6]*o[15]+o[9]*o[7]*o[14]+o[13]*o[6]*o[11]-o[13]*o[7]*o[10];
  inv[4]=-o[4]*o[10]*o[15]+o[4]*o[11]*o[14]+o[8]*o[6]*o[15]-o[8]*o[7]*o[14]-o[12]*o[6]*o[11]+o[12]*o[7]*o[10];
  inv[8]=o[4]*o[9]*o[15]-o[4]*o[11]*o[13]-o[8]*o[5]*o[15]+o[8]*o[7]*o[13]+o[12]*o[5]*o[11]-o[12]*o[7]*o[9];
  inv[12]=-o[4]*o[9]*o[14]+o[4]*o[10]*o[13]+o[8]*o[5]*o[14]-o[8]*o[6]*o[13]-o[12]*o[5]*o[10]+o[12]*o[6]*o[9];
  inv[1]=-o[1]*o[10]*o[15]+o[1]*o[11]*o[14]+o[9]*o[2]*o[15]-o[9]*o[3]*o[14]-o[13]*o[2]*o[11]+o[13]*o[3]*o[10];
  inv[5]=o[0]*o[10]*o[15]-o[0]*o[11]*o[14]-o[8]*o[2]*o[15]+o[8]*o[3]*o[14]+o[12]*o[2]*o[11]-o[12]*o[3]*o[10];
  inv[9]=-o[0]*o[9]*o[15]+o[0]*o[11]*o[13]+o[8]*o[1]*o[15]-o[8]*o[3]*o[13]-o[12]*o[1]*o[11]+o[12]*o[3]*o[9];
  inv[13]=o[0]*o[9]*o[14]-o[0]*o[10]*o[13]-o[8]*o[1]*o[14]+o[8]*o[2]*o[13]+o[12]*o[1]*o[10]-o[12]*o[2]*o[9];
  inv[2]=o[1]*o[6]*o[15]-o[1]*o[7]*o[14]-o[5]*o[2]*o[15]+o[5]*o[3]*o[14]+o[13]*o[2]*o[7]-o[13]*o[3]*o[6];
  inv[6]=-o[0]*o[6]*o[15]+o[0]*o[7]*o[14]+o[4]*o[2]*o[15]-o[4]*o[3]*o[14]-o[12]*o[2]*o[7]+o[12]*o[3]*o[6];
  inv[10]=o[0]*o[5]*o[15]-o[0]*o[7]*o[13]-o[4]*o[1]*o[15]+o[4]*o[3]*o[13]+o[12]*o[1]*o[7]-o[12]*o[3]*o[5];
  inv[14]=-o[0]*o[5]*o[14]+o[0]*o[6]*o[13]+o[4]*o[1]*o[14]-o[4]*o[2]*o[13]-o[12]*o[1]*o[6]+o[12]*o[2]*o[5];
  inv[3]=-o[1]*o[6]*o[11]+o[1]*o[7]*o[10]+o[5]*o[2]*o[11]-o[5]*o[3]*o[10]-o[9]*o[2]*o[7]+o[9]*o[3]*o[6];
  inv[7]=o[0]*o[6]*o[11]-o[0]*o[7]*o[10]-o[4]*o[2]*o[11]+o[4]*o[3]*o[10]+o[8]*o[2]*o[7]-o[8]*o[3]*o[6];
  inv[11]=-o[0]*o[5]*o[11]+o[0]*o[7]*o[9]+o[4]*o[1]*o[11]-o[4]*o[3]*o[9]-o[8]*o[1]*o[7]+o[8]*o[3]*o[5];
  inv[15]=o[0]*o[5]*o[10]-o[0]*o[6]*o[9]-o[4]*o[1]*o[10]+o[4]*o[2]*o[9]+o[8]*o[1]*o[6]-o[8]*o[2]*o[5];
  let det = o[0]*inv[0] + o[1]*inv[4] + o[2]*inv[8] + o[3]*inv[12];
  if (!det) return mat4Identity();
  det = 1 / det;
  for (let i = 0; i < 16; i++) inv[i] *= det;
  return inv;
}
function vec3Cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function vec3Dot(a, b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function vec3Norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; }
function vec3Scale(a, s) { return [a[0]*s, a[1]*s, a[2]*s]; }
function vec3Add(a, b) { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function vec3Sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }

// Exact integer quarter-turn about world axis. q ∈ {-1, 1, 2}.
// +1 = one clockwise step viewed from +axis (matches solver's rotVec).
function axisQuarters(axis, q) {
  const steps = q === 2 ? 2 : Math.abs(q);
  const dir = q < 0 ? -1 : 1;
  let m = [[1,0,0],[0,1,0],[0,0,1]]; // columns
  for (let s = 0; s < steps; s++) {
    const rot = (v) => {
      if (axis === 0) return dir > 0 ? [v[0], v[2], -v[1]] : [v[0], -v[2], v[1]];
      if (axis === 1) return dir > 0 ? [-v[2], v[1], v[0]] : [v[2], v[1], -v[0]];
      return dir > 0 ? [v[1], -v[0], v[2]] : [-v[1], v[0], v[2]];
    };
    m = [rot(m[0]), rot(m[1]), rot(m[2])];
  }
  return m;
}
function mat3To4(m) {
  return new Float32Array([ m[0][0],m[0][1],m[0][2],0, m[1][0],m[1][1],m[1][2],0, m[2][0],m[2][1],m[2][2],0, 0,0,0,1 ]);
}
function mat3MulVec(m, v) {
  return [ m[0][0]*v[0]+m[1][0]*v[1]+m[2][0]*v[2],
           m[0][1]*v[0]+m[1][1]*v[1]+m[2][1]*v[2],
           m[0][2]*v[0]+m[1][2]*v[1]+m[2][2]*v[2] ];
}
function mat3Mul(a, b) { // a*b (columns)
  const o = [[0,0,0],[0,0,0],[0,0,0]];
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++)
    o[c][r] = a[0][r]*b[c][0] + a[1][r]*b[c][1] + a[2][r]*b[c][2];
  return o;
}
function mat3Transpose(m) { return [[m[0][0],m[1][0],m[2][0]],[m[0][1],m[1][1],m[2][1]],[m[0][2],m[1][2],m[2][2]]]; }

/* ============================ geometry ================================== */
function roundedQuadGeom(radius) {
  const pos = [0, 0, 0], nrm = [0, 0, 1];
  const N = 4;
  for (let corner = 0; corner < 4; corner++) {
    const cx = (corner === 1 || corner === 2) ? 0.5 - radius : -0.5 + radius;
    const cy = (corner >= 2) ? -0.5 + radius : 0.5 - radius;
    const startAng = [90, 0, 270, 180][corner] * Math.PI / 180;
    for (let i = 0; i <= N; i++) {
      const a = startAng + (-90) * (i / N) * Math.PI / 180;
      pos.push(cx + radius * Math.cos(a), cy + radius * Math.sin(a), 0);
      nrm.push(0, 0, 1);
    }
  }
  const idx = [], per = N + 1, total = 4 * per;
  // ring winds clockwise on screen, so flip winding to keep CCW front faces
  for (let i = 0; i < total; i++) idx.push(0, 1 + (i + 1) % total, 1 + i);
  return { pos, nrm, idx };
}
function boxGeom() {
  const p = [], n = [], idx = [];
  const faces = [
    [[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[0,0,1]],
    [[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[0,0,-1]],
    [[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[1,0,0]],
    [[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-1,0,0]],
    [[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5],[0,1,0]],
    [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5],[0,-1,0]]
  ];
  faces.forEach((f, fi) => {
    const base = fi * 4;
    for (let i = 0; i < 4; i++) { p.push(...f[i]); n.push(...f[4]); }
    idx.push(base, base+1, base+2, base, base+2, base+3);
  });
  return { pos: p, nrm: n, idx };
}
function discGeom(segments) {
  const pos = [0,0,0], idx = [];
  for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2;
    pos.push(Math.cos(a), 0, Math.sin(a));
  }
  for (let i = 1; i <= segments; i++) idx.push(0, i, i + 1);
  return { pos, idx };
}

/* ============================= shaders ================================== */
const VS = `
attribute vec3 aPos; attribute vec3 aNrm;
uniform mat4 uProj, uView, uModel;
varying vec3 vNrm; varying vec3 vWorld;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNrm = mat3(uModel) * aNrm;
  gl_Position = uProj * uView * w;
}`;
const FS = `
precision mediump float;
varying vec3 vNrm; varying vec3 vWorld;
uniform vec3 uColor; uniform vec3 uCamPos;
uniform float uHintAmt; uniform float uSticker;
void main() {
  vec3 n = normalize(vNrm);
  vec3 v = normalize(uCamPos - vWorld);
  // warm key + cool fill + bounce, studio style
  vec3 l1 = normalize(vec3(0.45, 0.95, 0.55));
  vec3 l2 = normalize(vec3(-0.65, 0.15, -0.55));
  float d = max(dot(n, l1), 0.0) * 0.92 + max(dot(n, l2), 0.0) * 0.30;
  // soft ground bounce so the bottom face is never flat-dead
  d += max(dot(n, normalize(vec3(-0.2, -0.9, 0.2))), 0.0) * 0.16;
  // Blinn-Phong specular from BOTH lights so every side catches a reflection
  vec3 h1 = normalize(l1 + v);
  vec3 h2 = normalize(l2 + v);
  float shin = uSticker > 0.5 ? 56.0 : 20.0;
  float s1 = pow(max(dot(n, h1), 0.0), shin) * (uSticker > 0.5 ? 0.50 : 0.09);
  float s2 = pow(max(dot(n, h2), 0.0), shin) * (uSticker > 0.5 ? 0.26 : 0.05);
  // camera-aligned gloss: guarantees a visible highlight on EVERY face,
  // whichever side is turned toward the viewer
  float sheen = pow(max(dot(n, v), 0.0), 16.0) * (uSticker > 0.5 ? 0.45 : 0.12);
  float rim = pow(1.0 - abs(dot(n, v)), 3.0) * 0.12;
  // saturate the base color BEFORE lighting so shadow sides keep their chroma
  vec3 colored = uColor;
  if (uSticker > 0.5) {
    float gl = dot(colored, vec3(0.299, 0.587, 0.114));
    colored = clamp(mix(vec3(gl), colored, 1.35), 0.0, 1.0);
  }
  // bright studio exposure so the hero reads at full saturation
  vec3 base = colored * (0.62 + 0.55 * d);
  vec3 c = base + vec3(1.0, 0.98, 0.92) * (s1 + s2 + sheen) + rim;
  c = pow(clamp(c, 0.0, 1.0), vec3(0.94));
  if (uHintAmt > 0.0 && uSticker > 0.5) {
    float pulse = 0.5 + 0.5 * sin(uHintAmt * 6.2832 * 2.0);
    c = mix(c, vec3(1.0, 0.85, 0.25), pulse * 0.55 * uHintAmt);
  }
  gl_FragColor = vec4(c, 1.0);
}`;
const SHADOW_VS = `
attribute vec3 aPos;
uniform mat4 uProj, uView, uModel;
varying vec2 vUV;
void main() { vUV = aPos.xz; gl_Position = uProj * uView * uModel * vec4(aPos, 1.0); }`;
const SHADOW_FS = `
precision mediump float;
varying vec2 vUV;
uniform float uAlpha;
void main() {
  float r = length(vUV);
  float a = uAlpha * smoothstep(1.0, 0.2, r);
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}`;

/* ============================= renderer ================================= */
function makeProgram(gl, vsSrc, fsSrc) {
  function sh(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

/* ============================ face tables =============================== */
const FACE_COLORS = {
  U: [0.97, 0.97, 0.97], D: [0.98, 0.80, 0.10], F: [0.16, 0.72, 0.36],
  B: [0.16, 0.46, 0.92], R: [0.92, 0.18, 0.16], L: [0.96, 0.53, 0.10]
};
const FACE_NORMAL = { U:[0,1,0], D:[0,-1,0], R:[1,0,0], L:[-1,0,0], F:[0,0,1], B:[0,0,-1] };
const MOVE_TABLE = { U: [1, 1], D: [1, -1], R: [0, 1], L: [0, -1], F: [2, 1], B: [2, -1] };
const MOVE_OF = {}; Object.keys(MOVE_TABLE).forEach(f => { MOVE_OF[MOVE_TABLE[f].join()] = f; });

// "R" -> { axis, layer, quarters } where quarters is the render-angle sign:
// +1 = angle 0→+90° with slice matrix Rot_axis(-angle) (CW viewed from +axis).
function moveToAxis(move) {
  const [axis, layer] = MOVE_TABLE[move[0]];
  const base = layer > 0 ? 1 : -1;              // U/R/F = +1, D/L/B = -1
  const quarters = move.length > 1 ? (move[1] === '2' ? 2 : -base) : base;
  return { axis, layer, quarters };
}
function axisLayerQuartersToMove(axis, layer, quarters) {
  const f = MOVE_OF[[axis, layer].join()];
  if (!f) return null;
  if (Math.abs(quarters) === 2) return f + '2';
  const base = layer > 0 ? 1 : -1;
  return quarters === base ? f : f + "'";
}
function invertMove(m) {
  if (m.length > 1 && m[1] === '2') return m;
  return m.length > 1 ? m[0] : m + "'";
}
// solver-frame face letter for a solver-frame normal
function letterOfNormal(n) {
  for (const f in FACE_NORMAL) {
    const m = FACE_NORMAL[f];
    if (m[0] === n[0] && m[1] === n[1] && m[2] === n[2]) return f;
  }
  return null;
}
// solver facelet-string slot for a solver-frame (position, normal) pair
const SLOT_VIEW = {
  U: { n: [0,1,0], up: [0,0,-1], right: [1,0,0] },
  R: { n: [1,0,0], up: [0,1,0], right: [0,0,-1] },
  F: { n: [0,0,1], up: [0,1,0], right: [1,0,0] },
  D: { n: [0,-1,0], up: [0,0,1], right: [1,0,0] },
  L: { n: [-1,0,0], up: [0,1,0], right: [0,0,1] },
  B: { n: [0,0,-1], up: [0,1,0], right: [-1,0,0] }
};
function faceletSlotIndex(pos, dir) {
  const f = letterOfNormal(dir);
  const v = SLOT_VIEW[f];
  const rel = [pos[0] - v.n[0], pos[1] - v.n[1], pos[2] - v.n[2]];
  const col = rel[0]*v.right[0] + rel[1]*v.right[1] + rel[2]*v.right[2];
  const row = -(rel[0]*v.up[0] + rel[1]*v.up[1] + rel[2]*v.up[2]);
  return 'URFDLB'.indexOf(f) * 9 + (row + 1) * 3 + (col + 1);
}

/* =============================== game =================================== */
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { antialias: true, alpha: true });
    if (!this.gl) throw new Error('WebGL unavailable');
    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    this.prog = makeProgram(gl, VS, FS);
    this.progShadow = makeProgram(gl, SHADOW_VS, SHADOW_FS);
    this.loc = n => gl.getUniformLocation(this.prog, n);
    this.aPos = gl.getAttribLocation(this.prog, 'aPos');
    this.aNrm = gl.getAttribLocation(this.prog, 'aNrm');

    this.mesh = {
      box: this.makeMesh(boxGeom()),
      st: this.makeMesh(roundedQuadGeom(0.09)),
      disc: this.makeMesh(discGeom(48))
    };

    this.resetCubies();
    this.facelets = CubeSolver.solvedFacelets();
    // Corner-forward isometric default (matches Cube Lab framing): a corner faces
    // the viewer so three faces — U + two sides — are visible. dist tuned so the
    // cube fills the frame like the bar's hero.
    this.cam = { yaw: -0.785, pitch: 0.55, dist: 6.9, distT: 6.9, yawV: 0, pitchV: 0, sx: 0.038 };
    this.userZoomed = false;
    this.anim = null;
    this.queue = [];
    this.undoStack = [];
    this.moveCount = 0;
    this.mode = 'free';
    this.timer = { running: false, start: 0, value: 0 };
    this.scrambled = false;
    this.solvedFlag = true;
    this.busy = false;
    this.hint = { axis: 0, layer: 0, amt: 0 };
    this.idleT = 0; this.lastInteract = performance.now();
    this.solveSpin = 0;
    this.fps = 60; this._ft = [];
    this.bindInput();
    this.resize();
    requestAnimationFrame(t => this.frame(t));
  }

  makeMesh(g) {
    const gl = this.gl;
    const mk = (data, target) => {
      const b = gl.createBuffer();
      gl.bindBuffer(target, b);
      gl.bufferData(target, data, gl.STATIC_DRAW);
      return b;
    };
    return {
      pos: mk(new Float32Array(g.pos), gl.ARRAY_BUFFER),
      nrm: g.nrm ? mk(new Float32Array(g.nrm), gl.ARRAY_BUFFER) : null,
      idx: mk(new Uint16Array(g.idx), gl.ELEMENT_ARRAY_BUFFER),
      n: g.idx.length
    };
  }

  resetCubies() {
    // solver-frame -> world-frame rotation (whole-cube holding orientation).
    // Identity until a middle-slice turn shifts the centers.
    this.orient = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    this.cubies = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const stickers = {};
      // dir = the sticker's FIXED direction in cubie-local space. It never
      // changes; world direction is ori·dir. (Recomputing it from the face key
      // after turns placed stickers on the wrong side -> black squares.)
      if (y === 1) stickers.U = { color: FACE_COLORS.U, dir: [0, 1, 0] };
      if (y === -1) stickers.D = { color: FACE_COLORS.D, dir: [0, -1, 0] };
      if (x === 1) stickers.R = { color: FACE_COLORS.R, dir: [1, 0, 0] };
      if (x === -1) stickers.L = { color: FACE_COLORS.L, dir: [-1, 0, 0] };
      if (z === 1) stickers.F = { color: FACE_COLORS.F, dir: [0, 0, 1] };
      if (z === -1) stickers.B = { color: FACE_COLORS.B, dir: [0, 0, -1] };
      this.cubies.push({ pos: [x, y, z], ori: [[1,0,0],[0,1,0],[0,0,1]], stickers });
    }
  }

  /* ------------------------- camera & frame ---------------------------- */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth | 0, h = this.canvas.clientHeight | 0;
    if (this.canvas.width !== ((w * dpr) | 0) || this.canvas.height !== ((h * dpr) | 0)) {
      this.canvas.width = (w * dpr) | 0; this.canvas.height = (h * dpr) | 0;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    // Keep the whole cube in frame on portrait without fighting user zoom:
    // pull the camera back a touch so the cube never crops at the bottom.
    if (!this.userZoomed) {
      const aspect = w / Math.max(1, h);
      const base = this._baseDist || (this._baseDist = this.cam.dist);
      this.cam.distT = aspect < 0.8 ? base * 1.3 : (aspect < 1.2 ? base * 1.08 : base);
    }
  }
  camEye() {
    const { yaw, pitch, dist } = this.cam;
    const cp = Math.cos(pitch);
    return [Math.sin(yaw) * cp * dist, Math.sin(pitch) * dist, Math.cos(yaw) * cp * dist];
  }
  viewMatrix() {
    const e = this.camEye();
    const z = vec3Norm(e);
    const x = vec3Norm(vec3Cross([0,1,0], z));
    const y = vec3Cross(z, x);
    return new Float32Array([ x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
      -vec3Dot(x,e), -vec3Dot(y,e), -vec3Dot(z,e), 1 ]);
  }
  projMatrix() {
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const m = mat4Perspective(0.72, aspect, 0.5, 60);
    // small NDC shift to optically center the corner-forward projection
    m[12] += this.cam.sx || 0;
    return m;
  }

  frame(t) {
    requestAnimationFrame(tt => this.frame(tt));
    this.resize();
    const dt = Math.min(0.05, (t - (this.lastT || t)) / 1000); this.lastT = t;
    this._ft.push(t);
    while (this._ft.length && this._ft[0] < t - 1000) this._ft.shift();
    this.fps = this._ft.length;

    const c = this.cam;
    c.yaw += c.yawV * dt; c.pitch += c.pitchV * dt;
    c.yawV *= Math.pow(0.02, dt); c.pitchV *= Math.pow(0.02, dt);
    c.pitch = clamp(c.pitch, -1.35, 1.35);
    c.dist += (c.distT - c.dist) * Math.min(1, dt * 10);

    if (t - this.lastInteract > 5000 && !this.anim && !this.queue.length && !this.busy) this.idleT += dt;
    else this.idleT = 0;

    this.hint.amt = Math.max(0, this.hint.amt - dt * 0.7);
    this.solveSpin = Math.max(0, this.solveSpin - dt * 0.9);
    this.stepAnim(dt);

    if (this.timer.running) {
      this.timer.value = performance.now() - this.timer.start;
      updateTimerHUD(this.timer.value);
    }
    this.draw(t);
  }

  stepAnim(dt) {
    if (this.anim) {
      const a = this.anim;
      if (!a.live) {
        a.t += dt * 1000;
        const k = Math.min(1, a.t / a.duration);
        a.angle = a.from + (a.to - a.from) * easeOutCubic(k);
        if (k >= 1) this.commitAnim();
      }
    } else if (this.queue.length) {
      this.startAnim(this.queue.shift());
    }
  }

  startAnim(job) {
    const dir = job.quarters > 0 ? 1 : -1;
    this.anim = {
      axis: job.axis, layer: job.layer,
      from: 0, to: dir * Math.abs(job.quarters) * Math.PI / 2,
      t: 0, duration: job.duration || 170,
      quarters: job.quarters, meta: job.meta || null,
      snapBack: false, angle: 0, live: false
    };
    if (!(job.meta && job.meta.silent) || job.meta.sound) audio.turn();
  }

  commitAnim() {
    const a = this.anim; this.anim = null;
    const q = Math.round(a.to / (Math.PI / 2));
    if (q === 0) return;                     // snap back, no logical change
    const qq = ((q % 4) + 4) % 4;            // 1, 2, 3
    const M = axisQuarters(a.axis, qq === 3 ? -1 : qq);
    for (const cu of this.cubies) {
      if (cu.pos[a.axis] !== a.layer) continue;
      cu.pos = mat3MulVec(M, cu.pos).map(Math.round);
      cu.ori = mat3Mul(M, cu.ori);
    }
    if (a.meta && a.meta.slice) {
      // Middle-slice turn: the centers move, so the cube is now held
      // differently — track the solver frame via this.orient.
      this.orient = mat3Mul(M, this.orient);
    }
    // Facelets are re-derived from the cubies (ground truth) in the solver
    // frame — guaranteed consistent for face turns and slice turns alike,
    // with no letter/sign convention risk.
    this.facelets = this.faceletsFromCubies();
    if (!(a.meta && a.meta.silent)) {
      if (!(a.meta && a.meta.undo)) {
        this.undoStack.push({ axis: a.axis, layer: a.layer, quarters: q });
        this.moveCount++; updateMoveHUD(this.moveCount);
      }
      if (!this.timer.running && this.mode === 'speed' && this.scrambled) startTimer();
    }
    this.checkSolved();
  }

  faceletsFromCubies() {
    const oT = mat3Transpose(this.orient);
    const str = new Array(54).fill('');
    for (const cu of this.cubies) {
      const sPos = mat3MulVec(oT, cu.pos);
      for (const face in cu.stickers) {
        const wDir = mat3MulVec(cu.ori, cu.stickers[face].dir);
        const sDir = mat3MulVec(oT, wDir);
        str[faceletSlotIndex(sPos, sDir)] = face;
      }
    }
    return str.join('');
  }

  doMove(move, opts) {
    if (this.busy || (this.anim && this.anim.live)) return;
    const { axis, layer, quarters } = moveToAxis(move);
    this.queue.push({ axis, layer, quarters, duration: opts && opts.duration, meta: Object.assign({ move }, opts) });
  }

  /* ------------------------------ drawing ------------------------------ */
  draw(t) {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const proj = this.projMatrix(), view = this.viewMatrix(), eye = this.camEye();
    const bob = Math.sin(t / 900) * 0.045;

    // ground shadow (multiplicative blend)
    gl.useProgram(this.progShadow);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    const sLoc = n => gl.getUniformLocation(this.progShadow, n);
    gl.uniformMatrix4fv(sLoc('uProj'), false, proj);
    gl.uniformMatrix4fv(sLoc('uView'), false, view);
    gl.uniformMatrix4fv(sLoc('uModel'), false,
      mat4Multiply(mat4Translate(0.35, -2.62 - bob * 0.5, -0.1), mat4Scale(5.4, 1, 5.4)));
    gl.uniform1f(sLoc('uAlpha'), 0.55);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.mesh.disc.pos);
    const aPosS = gl.getAttribLocation(this.progShadow, 'aPos');
    gl.vertexAttribPointer(aPosS, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aPosS);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.mesh.disc.idx);
    gl.drawElements(gl.TRIANGLES, this.mesh.disc.n, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // cube
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc('uProj'), false, proj);
    gl.uniformMatrix4fv(this.loc('uView'), false, view);
    gl.uniform3fv(this.loc('uCamPos'), eye);

    const spin = this.solveSpin > 0 ? easeOutCubic(1 - this.solveSpin) * Math.PI * 2 : 0;
    const idleYaw = this.idleT > 0 ? this.idleT * 0.22 : 0;
    const worldM = mat4Multiply(mat4RotY(spin + idleYaw), mat4Translate(0, bob, 0));

    let sliceM = null;
    if (this.anim) {
      const a = this.anim;
      const R = a.axis === 0 ? mat4RotX(-a.angle) : a.axis === 1 ? mat4RotY(-a.angle) : mat4RotZ(-a.angle);
      sliceM = mat4Multiply(R, worldM);
    }

    for (const cu of this.cubies) {
      const inSlice = sliceM && cu.pos[this.anim.axis] === this.anim.layer;
      const M = mat4Multiply(inSlice ? sliceM : worldM,
        mat4Multiply(mat4Translate(cu.pos[0], cu.pos[1], cu.pos[2]),
          mat4Multiply(mat3To4(cu.ori), mat4Scale(0.985, 0.985, 0.985))));
      const hinted = this.hint.amt > 0 && cu.pos[this.hint.axis] === this.hint.layer ? this.hint.amt : 0;
      this.drawMesh(this.mesh.box, M, [0.045, 0.047, 0.056], 0, 0);
      for (const face in cu.stickers) {
        const st = cu.stickers[face];
        const local = st.dir; // fixed cubie-local direction
        // offset must exceed the scaled box half-extent (0.985/2) once M's
        // scale is applied: 0.504 * 0.985 = 0.4964 > 0.4925 ✓ floats above.
        const off = 0.504;
        const S = mat4Multiply(M, mat4Multiply(
          mat4Translate(local[0]*off, local[1]*off, local[2]*off),
          mat4Multiply(orientZto(local), mat4Scale(0.90, 0.90, 1))));
        this.drawMesh(this.mesh.st, S, st.color, 1, hinted);
      }
    }
  }

  drawMesh(mesh, model, color, sticker, hintAmt) {
    const gl = this.gl;
    gl.uniformMatrix4fv(this.loc('uModel'), false, model);
    gl.uniform3fv(this.loc('uColor'), color);
    gl.uniform1f(this.loc('uSticker'), sticker);
    gl.uniform1f(this.loc('uHintAmt'), hintAmt || 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this.aPos);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nrm);
    gl.vertexAttribPointer(this.aNrm, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this.aNrm);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
    gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
  }

  /* ------------------------------- input ------------------------------- */
  bindInput() {
    const cv = this.canvas;
    cv.style.touchAction = 'none';
    const pointers = new Map();
    const self = this;
    let drag = null;

    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      self.lastInteract = performance.now(); self.idleT = 0;
      audio.ensure();
      if (pointers.size === 2) {
        if (drag && drag.type === 'turn' && self.anim && self.anim.live) self.cancelLiveTurn();
        drag = { type: 'orbit' };
        return;
      }
      if (pointers.size > 1) return;
      const pick = self.pickSticker(e.clientX, e.clientY);
      if (pick) {
        // freeze camera inertia so the turn decision happens under a still camera
        self.cam.yawV = 0; self.cam.pitchV = 0;
        drag = { type: 'turn', pick, x0: e.clientX, y0: e.clientY, decided: false };
      }
      else drag = { type: 'orbit', x: e.clientX, y: e.clientY, pinch: 0 };
    });

    cv.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      self.lastInteract = performance.now(); self.idleT = 0;
      if (!drag) return;
      if (drag.type === 'orbit') {
        if (pointers.size === 2) {
          const pts = [...pointers.values()];
          const d = Math.hypot(pts[0][0]-pts[1][0], pts[0][1]-pts[1][1]);
          if (drag.pinch) self.cam.distT = clamp(self.cam.distT * (drag.pinch / d), 4.4, 11);
          drag.pinch = d;
          self.userZoomed = true;
        } else {
          const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
          drag.x = e.clientX; drag.y = e.clientY;
          self.cam.yaw -= dx * 0.0062;
          self.cam.pitch = clamp(self.cam.pitch + dy * 0.0062, -1.35, 1.35);
          self.cam.yawV = -dx * 0.16; self.cam.pitchV = dy * 0.16;
        }
      } else if (drag.type === 'turn') {
        if (!drag.decided) {
          if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 7) return;
          self.decideTurn(drag, e.clientX, e.clientY);
        }
        if (drag.decided) self.updateTurn(drag, e.clientX, e.clientY);
      }
    });

    const up = e => {
      pointers.delete(e.pointerId);
      if (drag && drag.type === 'turn') {
        if (drag.decided) self.finishTurn();
        drag = null;
      } else if (pointers.size === 0) drag = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);

    cv.addEventListener('wheel', e => {
      e.preventDefault();
      self.lastInteract = performance.now();
      self.cam.distT = clamp(self.cam.distT * (1 + Math.sign(e.deltaY) * 0.07), 4.4, 11);
      self.userZoomed = true;
    }, { passive: false });

    window.addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const lk = e.key.toLowerCase();
      const faces = { u: 'U', d: 'D', l: 'L', r: 'R', f: 'F', b: 'B' };
      self.lastInteract = performance.now(); self.idleT = 0;
      audio.ensure();
      if (faces[lk]) { self.doMove(faces[lk] + (e.shiftKey ? "'" : '')); e.preventDefault(); }
      else if (e.key === ' ') { self.scramble(); e.preventDefault(); }
      else if (lk === 'h') self.hintMove();
      else if (e.key === 'Enter') self.autoSolve();
      else if (lk === 'z') { self.undo(); e.preventDefault(); }
      else if (lk === 't') toggleMode();
      else if (lk === 'x') self.cam.distT = clamp(self.cam.distT * 1.12, 4.4, 11); self.userZoomed = true;
    });
  }

  cancelLiveTurn() {
    const a = this.anim;
    a.from = a.angle; a.to = 0; a.t = 0; a.duration = 110; a.snapBack = true; a.live = false;
  }

  decideTurn(drag, px, py) {
    const r0 = this.rayFromScreen(drag.x0, drag.y0);
    const r1 = this.rayFromScreen(px, py);
    const n = drag.pick.normal;
    const h0 = rayPlane(r0.ro, r0.rd, drag.pick.point, n);
    const h1 = rayPlane(r1.ro, r1.rd, drag.pick.point, n);
    if (!h0 || !h1) return;
    const d = vec3Sub(h1, h0);
    if (Math.hypot(d[0], d[1], d[2]) < 0.02) return;
    const faceAxis = n[0] ? 0 : n[1] ? 1 : 2;
    const tangents = [0, 1, 2].filter(a => a !== faceAxis);
    let ta = tangents[0];
    if (Math.abs(d[tangents[1]]) > Math.abs(d[tangents[0]])) ta = tangents[1];
    const rotAxis = 3 - faceAxis - ta;
    drag.dvec = vec3Norm(d);
    drag.rotAxis = rotAxis;
    drag.layer = clamp(Math.round(drag.pick.point[rotAxis]), -1, 1);
    const axisVec = [0, 0, 0]; axisVec[rotAxis] = 1;
    // Render rotates by Rot_axis(-angle): positive angle = RH-negative turn.
    // Sticker must follow the cursor, so flip the RH-velocity sign.
    const vel = vec3Cross(axisVec, drag.pick.point);
    drag.angleSign = -Math.sign(vec3Dot(vel, drag.dvec)) || 1;
    drag.p0 = drag.pick.point;
    drag.decided = true;
    this.anim = { axis: rotAxis, layer: drag.layer, from: 0, to: 0, t: 0,
      duration: 1e9, quarters: 0, meta: { drag: true }, angle: 0, live: true };
  }

  updateTurn(drag, px, py) {
    if (!this.anim || !this.anim.live) return;
    const r = this.rayFromScreen(px, py);
    const h = rayPlane(r.ro, r.rd, drag.p0, drag.pick.normal);
    if (!h) return;
    const dist = vec3Dot(vec3Sub(h, drag.p0), drag.dvec);
    const ang = drag.angleSign * dist * (Math.PI / 2) / 1.45;
    this.anim.to = ang;
    this.anim.angle = ang;
  }

  finishTurn() {
    const a = this.anim;
    if (!a || !a.live) return;
    let quarters = Math.round(a.to / (Math.PI / 2));
    if (Math.abs(a.to / (Math.PI / 2) - quarters) > 0.32) quarters += Math.sign(a.to);
    quarters = clamp(quarters, -2, 2);
    a.from = a.angle;
    if (quarters !== 0) {
      // face slices AND middle slices both commit — middle layers are real
      // moves on a cube (handled logically in commitAnim via this.orient).
      a.to = quarters * Math.PI / 2;
      a.duration = 140 + Math.abs(a.to - a.from) * 100;
      a.meta = { slice: a.layer === 0 };
    } else {
      a.to = 0;
      a.snapBack = true;
      a.duration = 130;
      a.meta = {};
    }
    a.t = 0;
    a.live = false;
  }

  /* --------------------------- solver glue ----------------------------- */
  ensureReady() {
    if (CubeSolver.isReady()) return Promise.resolve();
    return CubeSolver.warm();
  }
  scramble() {
    if (this.busy) return;
    this.ensureReady();
    this.busy = true;
    this.undoStack.length = 0;
    this.moveCount = 0; updateMoveHUD(0);
    resetTimer(); this.scrambled = true; this.solvedFlag = false;
    this.hint.amt = 0;
    const scr = CubeSolver.randomScramble(22);
    toast('Scrambling…');
    scr.forEach(m => this.queue.push({ ...moveToAxis(m), duration: 85, meta: { move: m, silent: true, sound: true } }));
    const wait = setInterval(() => {
      if (!this.anim && !this.queue.length) {
        clearInterval(wait); this.busy = false;
        toast(this.mode === 'speed' ? 'Speed: timer starts on your first turn' : 'Go!');
      }
    }, 60);
  }
  async autoSolve() {
    if (this.busy) return;
    this.busy = true;
    toast('Solving…');
    await this.ensureReady();
    await nextFrame();
    if (this.facelets === CubeSolver.solvedFacelets()) { this.busy = false; toast('Already solved'); return; }
    const t0 = performance.now();
    let sol;
    try { sol = CubeSolver.solve(this.facelets, { timeBudgetMs: 5000 }); }
    catch (e) { this.busy = false; toast('Solver failed'); console.error(e); return; }
    const ms = Math.round(performance.now() - t0);
    toast(`${sol.length}-move solution · ${ms}ms`);
    if (this.timer.running) stopTimer(false);
    this.undoStack.length = 0;
    this.scrambled = false;
    sol.moves.forEach(m => {
      // solver-frame letter -> world slice to turn (orientation-aware):
      // the solver axis maps through this.orient; if the mapped axis is the
      // negative of the letter's home axis, both layer and rotation sign flip.
      const t = moveToAxis(m);
      const e = [0, 0, 0]; e[t.axis] = 1;
      const v = mat3MulVec(this.orient, e);
      const axis = v[0] !== 0 ? 0 : v[1] !== 0 ? 1 : 2;
      const sign = v[axis];
      this.queue.push({ axis, layer: t.layer * sign, quarters: t.quarters * sign,
        duration: 110, meta: { move: m, silent: true, sound: true } });
    });
    const wait = setInterval(() => {
      if (!this.anim && !this.queue.length) {
        clearInterval(wait); this.busy = false;
        // solved-state HUD: the computer's solution is not the player's moves
        this.moveCount = 0; updateMoveHUD(0);
        this.undoStack.length = 0;
        this.solveSpin = 1; audio.solved(); this.checkSolved();
      }
    }, 60);
  }
  async hintMove() {
    if (this.busy || this.anim) return;
    await this.ensureReady();
    if (this.facelets === CubeSolver.solvedFacelets()) { toast('Already solved'); return; }
    toast('Thinking…');
    await nextFrame();
    const t0 = performance.now();
    let sol;
    try { sol = CubeSolver.solve(this.facelets, { timeBudgetMs: 2500 }); }
    catch (e) { toast('No hint found'); return; }
    if (!sol.moves.length) { toast('Already solved'); return; }
    const mv = sol.moves[0];
    // solver-frame letter -> world slice for the highlight (sign transfer as in autoSolve)
    const t = moveToAxis(mv);
    const e = [0, 0, 0]; e[t.axis] = 1;
    const v = mat3MulVec(this.orient, e);
    const axis = v[0] !== 0 ? 0 : v[1] !== 0 ? 1 : 2;
    const sign = v[axis];
    this.hint.axis = axis;
    this.hint.layer = t.layer * sign;
    this.hint.amt = 1;
    toast(`Hint: ${mv}  ·  ${Math.round(performance.now() - t0)}ms`);
    audio.hint();
  }
  undo() {
    const entry = this.undoStack.pop();
    if (!entry) { toast('Nothing to undo'); return; }
    // entries are world-frame tuples; inverting quarters re-commits through
    // the same logic (face letters or slice decomposition) — slices also
    // restore the whole-cube orientation.
    this.queue.push({ axis: entry.axis, layer: entry.layer, quarters: -entry.quarters,
      duration: 130, meta: { silent: true, sound: true, undo: true, slice: entry.layer === 0 } });
    this.moveCount = Math.max(0, this.moveCount - 1);
    updateMoveHUD(this.moveCount);
    this.scrambled = true;
  }

  checkSolved() {
    const solved = this.facelets === CubeSolver.solvedFacelets();
    if (solved && !this.solvedFlag) {
      this.solvedFlag = true;
      if (this.timer.running) stopTimer(true);
      else if (!this.busy) { this.solveSpin = 1; audio.solved(); toast('Solved!'); }
    } else if (!solved) this.solvedFlag = false;
  }

  /* --------------------------- ray helpers ----------------------------- */
  rayFromScreen(px, py) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (px - rect.left) / rect.width, y = (py - rect.top) / rect.height;
    const inv = mat4Invert(mat4Multiply(this.projMatrix(), this.viewMatrix()));
    const ro = transform(inv, x*2-1, 1-y*2, -1);
    const far = transform(inv, x*2-1, 1-y*2, 1);
    return { ro, rd: vec3Norm(vec3Sub(far, ro)) };
  }
  pickSticker(px, py) {
    const { ro, rd } = this.rayFromScreen(px, py);
    const slab = [[-1.5, 1.5], [-1.5, 1.5], [-1.5, 1.5]];
    let tmin = -Infinity, tmax = Infinity, axisHit = -1, signHit = 0;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(rd[a]) < 1e-9) {
        if (ro[a] < slab[a][0] || ro[a] > slab[a][1]) return null;
        continue;
      }
      let t1 = (slab[a][0] - ro[a]) / rd[a], t2 = (slab[a][1] - ro[a]) / rd[a], s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; axisHit = a; signHit = s; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    if (tmax < 0 || tmin < 0) return null;
    const hit = vec3Add(ro, vec3Scale(rd, tmin));
    const nrm = [0, 0, 0]; nrm[axisHit] = signHit;
    return { point: hit, normal: nrm };
  }
}

/* ---------------------------- small helpers ----------------------------- */
function orientZto(v) {
  const z = vec3Norm(v);
  const up = Math.abs(z[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const x = vec3Norm(vec3Cross(up, z));
  const y = vec3Cross(z, x);
  return new Float32Array([ x[0],x[1],x[2],0, y[0],y[1],y[2],0, z[0],z[1],z[2],0, 0,0,0,1 ]);
}
function transform(m, x, y, z) {
  const w = m[3]*x + m[7]*y + m[11]*z + m[15];
  return [ (m[0]*x + m[4]*y + m[8]*z + m[12]) / w,
           (m[1]*x + m[5]*y + m[9]*z + m[13]) / w,
           (m[2]*x + m[6]*y + m[10]*z + m[14]) / w ];
}
function rayPlane(ro, rd, pOnPlane, n) {
  const denom = vec3Dot(rd, n);
  if (Math.abs(denom) < 1e-8) return null;
  const t = vec3Dot(vec3Sub(pOnPlane, ro), n) / denom;
  if (t < 0) return null;
  return vec3Add(ro, vec3Scale(rd, t));
}
function easeOutCubic(k) { return 1 - Math.pow(1 - k, 3); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function nextFrame() { return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }

/* -------------------------------- audio --------------------------------- */
const audio = {
  ctx: null, muted: localStorage.getItem('cube_muted') === '1',
  ensure() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } },
  beep(freq, dur, type, gain) {
    if (!this.ctx || this.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(gain || 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur);
  },
  turn() { this.beep(185 + Math.random() * 50, 0.055, 'square', 0.025); },
  hint() { this.beep(720, 0.12, 'sine', 0.05); },
  solved() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, 0.18, 'sine', 0.06), i * 90)); },
  toggle() { this.muted = !this.muted; localStorage.setItem('cube_muted', this.muted ? '1' : '0'); return this.muted; }
};

/* --------------------------------- HUD ---------------------------------- */
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2400);
}
function fmt(ms) {
  const s = Math.floor(ms/1000) % 60, m = Math.floor(ms/60000), cs = Math.floor(ms/10) % 100;
  return `${m}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}
function updateTimerHUD(ms) { document.getElementById('timer').textContent = fmt(ms); }
function updateMoveHUD(n) { document.getElementById('moves').textContent = n; }
function startTimer() { game.timer.running = true; game.timer.start = performance.now() - game.timer.value; }
function resetTimer() { game.timer.running = false; game.timer.value = 0; updateTimerHUD(0); }
function stopTimer(record) {
  game.timer.running = false;
  const ms = game.timer.value;
  if (record) {
    const best = +(localStorage.getItem('cube_best_ms') || 0);
    if (!best || ms < best) {
      localStorage.setItem('cube_best_ms', String(ms));
      updateBestHUD();
      toast(`Solved in ${fmt(ms)} — new best!`);
    } else toast(`Solved in ${fmt(ms)}`);
  }
}
function updateBestHUD() {
  const best = +(localStorage.getItem('cube_best_ms') || 0);
  document.getElementById('best').textContent = best ? fmt(best) : '—';
}
function toggleMode() {
  game.mode = game.mode === 'free' ? 'speed' : 'free';
  document.getElementById('mode').textContent = game.mode.toUpperCase();
  resetTimer(); game.scrambled = false;
  toast(game.mode === 'speed' ? 'Speed mode — timer starts on your first turn' : 'Free mode');
}

function bindHUD(g) {
  const on = (id, fn) => document.getElementById(id).addEventListener('click', () => { audio.ensure(); fn(); });
  on('btnScramble', () => g.scramble());
  on('btnSolve', () => g.autoSolve());
  on('btnHint', () => g.hintMove());
  on('btnUndo', () => g.undo());
  on('btnMode', () => toggleMode());
  const muteBtn = document.getElementById('btnMute');
  const setIcon = () => { muteBtn.textContent = audio.muted ? '🔇' : '🔊'; };
  on('btnMute', () => { audio.toggle(); setIcon(); });
  setIcon();
  updateBestHUD();
  updateTimerHUD(0);
}

/* --------------------------------- boot --------------------------------- */
let game;
function boot() {
  try {
    game = new Game(document.getElementById('c'));
    window.game = game; // exposed for tests
  } catch (e) {
    document.getElementById('nogl').style.display = 'flex';
    console.error(e);
    return;
  }
  bindHUD(game);
  // touch-aware onboarding copy
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (coarse) {
    document.getElementById('help').innerHTML =
      'drag a face to turn · drag background to orbit · pinch to zoom';
    game._readyMsg = 'Ready — drag a face to turn';  }
  setTimeout(() => {
    game.ensureReady().then(() => toast(game._readyMsg || 'Ready — drag a face, or press Space to scramble'));
  }, 60);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
