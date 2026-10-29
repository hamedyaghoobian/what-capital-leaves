// What Capital Leaves: the punctuation of Capital I–III painted as a sea.
// Every mark is a point drawn in WebGL. Far away it is a brushstroke drifting on a current;
// close up it settles into its glyph, in reading order. Words rise when the viewer is still.

const TYPES = [".", ",", ";", ":", "—", "-", "’", "“", "”", "(", ")", "[", "]", "?", "!", "…"];
const T = Object.fromEntries(TYPES.map((c, i) => [c, i]));
const OPEN_Q = T["“"], CLOSE_Q = T["”"];

// per type: [brightness, tint amount, size, stroke angle], and the tint itself
const LOOK = [
  [0.55, 0.30, 0.85, 0.0], [1.05, 0.10, 1.00, 0.6], [1.00, 0.45, 1.00, 1.1], [1.00, 0.40, 1.00, 1.57],
  [0.80, 0.20, 1.45, 0.0], [0.90, 0.00, 0.70, 0.0], [0.90, 0.00, 0.60, 0.8], [1.40, 0.70, 1.70, 0.0],
  [1.40, 0.70, 1.70, 0.0], [1.00, 0.60, 1.10, 1.3], [1.00, 0.60, 1.10, -1.3], [1.00, 0.60, 1.00, 1.57],
  [1.00, 0.60, 1.00, 1.57], [1.10, 0.80, 1.40, 0.4], [1.10, 0.80, 1.40, 0.4], [0.90, 0.40, 1.10, 0.0],
];
const TINT = [
  [0.45, 0.02, 0.05], [1.0, 0.40, 0.40], [1.0, 0.35, 0.12], [1.0, 0.50, 0.20],
  [0.40, 0.02, 0.05], [1.0, 1.00, 1.00], [1.0, 1.00, 1.00], [1.0, 0.86, 0.80],
  [1.0, 0.86, 0.80], [0.95, 0.08, 0.12], [0.95, 0.08, 0.12], [0.90, 0.62, 0.30],
  [0.90, 0.62, 0.30], [1.0, 0.25, 0.35], [1.0, 0.25, 0.35], [0.70, 0.15, 0.10],
];

const ASPECT = 1.35;          // The Slave Ship is 91 × 123 cm
const CELL_W = 0.6;           // a mark's cell is 0.6 wide, 1 tall (world units)
const PARA_GAP = 3;           // empty cells between paragraphs
const MAX_CELL_PX = 56;       // closest zoom: a cell this many CSS pixels tall
const IDLE_MS = 2600;         // stillness before the words come back
const STORE = "what-capital-leaves:labour";
const FADE_STEP_MS = 240;      // a trace loses 1/255 of its red this often: gone in about a minute
const STRIKE_MS = 9000;        // how long a strike leaves the painting with nothing to live on

const canvas = document.getElementById("sea");
const frame = document.getElementById("frame");
const ghostLayer = document.getElementById("ghosts");
const panel = document.getElementById("panel");
const fmt = new Intl.NumberFormat("en");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const Q = new URLSearchParams(location.search);
// Two palettes, one per theme. Dark (Ember): the voices glow pale. Light (Bone): ink on paper.
// In both, the only red is what the viewer's pointer takes in.
const PALETTES = {
  dark: { sky: [0.05, 0.05, 0.05], low: [0.20, 0.19, 0.19], sun: [0.55, 0.53, 0.50], corner: [0.04, 0.04, 0.04],
          sea: [0.16, 0.155, 0.15], deep: [0.02, 0.02, 0.02], streak: [0.34, 0.33, 0.31], dim: [0.45, 0.2],
          lum: 0.75, quote: [0.95, 0.90, 0.84], quoteLum: 1.2, stroke: 1, touch: [1.0, 0.18, 0.16],
          line: [0.9, 0.85, 0.8], clear: [0.02, 0.02, 0.02], glow: true },
  light: { sky: [0.84, 0.81, 0.75], low: [0.93, 0.91, 0.86], sun: [0.99, 0.98, 0.95], corner: [0.80, 0.77, 0.71],
           sea: [0.88, 0.85, 0.80], deep: [0.70, 0.67, 0.62], streak: [0.97, 0.95, 0.90], dim: [1.0, 1.0],
           lum: 0.3, quote: [0.30, 0.26, 0.24], quoteLum: 0.4, stroke: 0.5, touch: [0.75, 0.06, 0.08],
           line: [0.3, 0.25, 0.2], clear: [0.93, 0.91, 0.87], glow: false },
};
const theme = () => document.documentElement.dataset.theme === "light" ? "light" : "dark";
let PAL = PALETTES[theme()];

// which layer each mark type sits on when the painting is taken apart
const LSET = {
  types: [1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1], gap: 0.36,
  names: ["I · ground|a sea after Turner, 1840", "II · marks|all the punctuation",
          "III · voices|the quotation marks", "IV · ghosts|the words taken out"],
};
const GHOST_Z = LSET.names.length - 1;

let data, chapters = [];
let N = 0, COLS = 0, ROWS = 0, W = 0, H = 0;
let grid;                      // cell -> mark index, -1 if empty
let markType, markChapter, markLocal, markVertex;
let touch, touchDirty = false, touchedCount = 0, traced = [];
let quoteStart = 0;            // vertices from here on are quotation marks
let horizon = 0.41;

// ---------- layout: reading order, wrapped into a painting ----------

function layout() {
  let cells = 0, n = 0;
  for (const ch of chapters) {
    for (const m of ch.marks) m === "\n" ? (cells += PARA_GAP) : (cells++, n++);
    cells += PARA_GAP;
  }
  N = n;
  COLS = Math.round(Math.sqrt(cells * ASPECT / CELL_W));
  ROWS = Math.ceil(cells / COLS);
  W = COLS * CELL_W;
  H = ROWS;
  grid = new Int32Array(COLS * ROWS).fill(-1);
  markType = new Uint8Array(N);
  markChapter = new Uint16Array(N);
  markLocal = new Uint32Array(N);
  const homeX = new Float32Array(N), homeY = new Float32Array(N);

  let cell = 0, k = 0;
  chapters.forEach((ch, ci) => {
    if (ch.volStart && ch.vol === "II") horizon = Math.floor(cell / COLS) / ROWS;
    let open = true;
    for (let i = 0; i < ch.marks.length; i++) {
      const c = ch.marks[i];
      if (c === "\n") { cell += PARA_GAP; open = true; continue; }
      let t;
      if (c === '"') { t = open ? OPEN_Q : CLOSE_Q; open = !open; }
      else if (c === "'") t = T["’"];
      else t = T[c];
      markType[k] = t;
      markChapter[k] = ci;
      markLocal[k] = i;
      homeX[k] = (cell % COLS + 0.5) * CELL_W;
      homeY[k] = Math.floor(cell / COLS) + 0.5;
      grid[cell] = k;
      cell++; k++;
    }
    cell += PARA_GAP;
  });

  // vertex order: everything else first, then the quotation marks, which are drawn as light
  const order = [];
  for (let i = 0; i < N; i++) if (markType[i] !== OPEN_Q && markType[i] !== CLOSE_Q) order.push(i);
  quoteStart = order.length;
  for (let i = 0; i < N; i++) if (markType[i] === OPEN_Q || markType[i] === CLOSE_Q) order.push(i);

  markVertex = new Uint32Array(N);
  const verts = new Float32Array(N * 4);   // x, y, type, phase
  order.forEach((m, v) => {
    markVertex[m] = v;
    verts[v * 4] = homeX[m];
    verts[v * 4 + 1] = homeY[m];
    verts[v * 4 + 2] = markType[m];
    verts[v * 4 + 3] = (m * 0.61803) % 1;
  });
  touch = new Uint8Array(N);
  return verts;
}

// ---------- WebGL ----------

const GROUND = `
uniform float uHorizon;
uniform vec3 uSkyTop, uSkyLow, uSun, uCorner, uSeaTop, uSeaDeep, uStreak;
vec3 ground(vec2 uv) {
  float h = uHorizon;
  vec2 sun = vec2(0.6, h - 0.13);
  float n = sin(uv.x * 23.0 + sin(uv.y * 17.0) * 2.0) * 0.5 + sin(uv.y * 41.0 + uv.x * 7.0) * 0.5;
  vec3 col;
  if (uv.y < h) {
    float t = uv.y / h;
    col = mix(uSkyTop, uSkyLow, pow(t, 1.3));
    float d = length((uv - sun) * vec2(1.0, 1.7));
    col = mix(col, uSun, exp(-d * d * 26.0));
    col = mix(col, uCorner, smoothstep(0.3, 0.7, abs(uv.x - 0.6)) * (1.0 - t) * 0.75);
  } else {
    float t = (uv.y - h) / (1.0 - h);
    col = mix(uSeaTop, uSeaDeep, pow(t, 0.7));
    col = mix(col, uStreak, exp(-pow((uv.x - 0.6) * 5.0, 2.0)) * (1.0 - t) * 0.6);
    col = mix(col, uSeaDeep * 0.6, smoothstep(0.55, 1.0, uv.x) * smoothstep(0.3, 1.0, t) * 0.5);
  }
  return col * (0.9 + 0.12 * n);
}
vec3 drain(vec3 c, float life) {
  float l = dot(c, vec3(0.3, 0.5, 0.2));
  return mix(vec3(l * 0.75, l * 0.7, l * 0.7), c, life);
}
// flat on the wall, or taken apart into layers seen from above (uExplode 0..1)
uniform float uExplode, uYaw, uPitch, uExScale, uGap, uZMid;
vec2 place(vec2 p, float z, vec2 res, vec2 off, float scale, vec2 world, out float k) {
  vec2 flat2 = off + p * scale;
  vec3 q = vec3(p - world * 0.5, (z - uZMid) * uGap);
  float cy = cos(uYaw), sy = sin(uYaw);
  q = vec3(cy * q.x + sy * q.z, q.y, -sy * q.x + cy * q.z);
  float cp = cos(uPitch), sp = sin(uPitch);
  q = vec3(q.x, cp * q.y - sp * q.z, sp * q.y + cp * q.z);
  float D = world.y * 3.0;
  float f = D / (D - q.z);
  vec2 ex = res * vec2(0.42, 0.5) + q.xy * f * uExScale;
  k = mix(1.0, f * uExScale / scale, uExplode);
  return mix(flat2, ex, uExplode);
}`;

const MARK_VS = `#version 300 es
precision highp float;
in vec4 aMark;            // home x, home y, type, phase
in float aTouch;
uniform vec2 uRes, uOff, uWorld, uMouse;
uniform float uScale, uTime, uDrift, uStir, uStirR, uLife, uDpr, uGlyph;
uniform vec4 uLook[16];
uniform vec3 uTint[16];
uniform float uLayer[16];
uniform float uAsk;
uniform vec3 uTouchCol;
out vec3 vColor;
out float vAlpha, vAngle, vType;
${GROUND}
vec2 flow(vec2 p, float t) {
  float a = sin(p.x * 0.031 + t * 0.21) + sin(p.y * 0.047 - t * 0.17) + sin((p.x + p.y) * 0.019 + t * 0.11);
  float b = cos(p.x * 0.027 - t * 0.15) + cos(p.y * 0.039 + t * 0.23) + sin((p.x - p.y) * 0.023 - t * 0.09);
  return vec2(a, b) / 3.0;
}
void main() {
  int t = int(aMark.z + 0.5);
  vec4 look = uLook[t];
  vec2 home = aMark.xy;
  vec2 uv = home / uWorld;
  vec2 f = flow(home, uTime);
  vec2 p = home;
  if (uv.y > uHorizon) {
    // the sea: swells travelling left to right, slower and heavier with depth
    float depth = (uv.y - uHorizon) / (1.0 - uHorizon);
    float swell = sin(home.x * 0.09 - uTime * 0.9 + home.y * 0.05) * (2.6 - depth * 1.4);
    p += uDrift * vec2(swell + f.x * 1.5, cos(home.x * 0.07 - uTime * 0.8) * 0.6 + f.y * 0.5);
  } else {
    // the sky: a slow vortex around the sun
    p += uDrift * vec2(f.x * 1.6, f.y * 1.1);
  }
  vec2 d = p - uMouse;
  float r = length(d);
  p += uStir * exp(-r * r / (uStirR * uStirR)) * (d / max(r, 0.001)) * uStirR * 0.7;

  float k;
  vec2 screen = place(p, uLayer[t], uRes, uOff, uScale, uWorld, k);
  gl_Position = vec4(screen.x / uRes.x * 2.0 - 1.0, 1.0 - screen.y / uRes.y * 2.0, 0.0, 1.0);

  bool quote = t == 7 || t == 8;
  bool asks = uAsk > 0.5 && t == 13;
  float strokePx = max(uScale * 2.5, 3.0) * look.z;
  float glyphPx = uScale * (quote ? 1.45 : 1.3);
  float size = mix(strokePx, glyphPx, uGlyph) * (1.0 + aTouch * 0.25);
  gl_PointSize = size * k * uDpr;

  vec3 g = ground(uv);
  vec3 c = mix(g * look.x, uTint[t], look.y);
  // a faint trace is dark rust; a full one is the bright red of living labour
  vec3 red = mix(uTouchCol * vec3(0.45, 0.32, 0.3), uTouchCol, smoothstep(0.15, 0.9, aTouch));
  c = mix(c, red, smoothstep(0.0, 0.35, aTouch) * 0.9);
  // lanterns are mostly dim and now and then flare, each on its own clock
  if (quote) c *= 0.14 + 1.7 * pow(0.5 + 0.5 * sin(uTime * 0.6 + aMark.w * 60.0), 10.0);
  // Marx's own questions flicker on a slower clock
  if (asks) c *= 0.35 + 2.2 * pow(0.5 + 0.5 * sin(uTime * 0.35 + aMark.w * 90.0), 6.0);
  vColor = drain(c, uLife);
  vAlpha = quote ? mix(0.5, 0.95, uGlyph) : mix(0.8, 1.0, uGlyph);
  vAngle = look.w + atan(f.y, f.x) * 0.35 * (1.0 - uGlyph);
  vType = aMark.z;
}`;

const MARK_FS = `#version 300 es
precision highp float;
in vec3 vColor;
in float vAlpha, vAngle, vType;
uniform sampler2D uAtlas;
uniform float uGlyph;
out vec4 outColor;
void main() {
  vec2 pc = gl_PointCoord - 0.5;
  int t = int(vType + 0.5);
  float stroke;
  if (t == 7 || t == 8) {
    stroke = exp(-dot(pc, pc) * 14.0);                       // a lantern
  } else {
    float c = cos(vAngle), s = sin(vAngle);
    vec2 q = vec2(c * pc.x - s * pc.y, s * pc.x + c * pc.y) * vec2(1.0, 3.2);
    float d = length(q) * 2.0;
    stroke = smoothstep(1.0, 0.45, d) * (0.72 + 0.28 * sin(q.y * 28.0 + vType * 3.0));  // bristles
  }
  vec2 cell = vec2(float(t % 4), float(t / 4));
  float glyph = texture(uAtlas, (cell + gl_PointCoord) / 4.0).a;
  float a = mix(stroke, glyph, uGlyph) * vAlpha;
  if (a < 0.01) discard;
  outColor = vec4(vColor * a, a);
}`;

const GROUND_VS = `#version 300 es
in vec2 aPos;
uniform vec2 uRes, uOff, uWorld;
uniform float uScale, uZ;
out vec2 vUv;
${GROUND}
void main() {
  vUv = aPos;
  float k;
  vec2 screen = place(aPos * uWorld, uZ, uRes, uOff, uScale, uWorld, k);
  gl_Position = vec4(screen.x / uRes.x * 2.0 - 1.0, 1.0 - screen.y / uRes.y * 2.0, 0.0, 1.0);
}`;

const GROUND_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uLife, uGlyph, uOutline;
uniform vec2 uDim;
uniform vec3 uLineCol;
out vec4 outColor;
${GROUND}
void main() {
  if (uOutline > 0.5) { outColor = vec4(uLineCol, 1.0) * 0.5; return; }
  // under the strokes: the painted ground, darker, and darker still when you read up close
  vec3 c = ground(vUv) * mix(uDim.x, uDim.y, uGlyph);
  outColor = vec4(drain(c, uLife), 1.0);
}`;

let outlineVao, gl, markProg, groundProg, markVao, groundVao, touchBuf, U = {}, UG = {};

function compile(vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

function uniforms(p) {
  const out = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, "");
    out[name] = gl.getUniformLocation(p, name);
  }
  return out;
}

function atlas() {
  const S = 64, c = document.createElement("canvas");
  c.width = c.height = S * 4;
  const x = c.getContext("2d");
  x.fillStyle = "#fff";
  x.textAlign = "center";
  x.textBaseline = "alphabetic";
  x.font = `500 ${S * 0.78}px "EB Garamond", Georgia, serif`;
  TYPES.forEach((g, i) => x.fillText(g, (i % 4 + 0.5) * S, (Math.floor(i / 4) + 0.7) * S));
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}

function setupGL(verts) {
  gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: true, alpha: false });
  if (!gl) throw new Error("WebGL2 unavailable");
  markProg = compile(MARK_VS, MARK_FS);
  groundProg = compile(GROUND_VS, GROUND_FS);
  U = uniforms(markProg);
  UG = uniforms(groundProg);

  markVao = gl.createVertexArray();
  gl.bindVertexArray(markVao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  const aMark = gl.getAttribLocation(markProg, "aMark");
  gl.enableVertexAttribArray(aMark);
  gl.vertexAttribPointer(aMark, 4, gl.FLOAT, false, 0, 0);
  touchBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, touchBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(N), gl.DYNAMIC_DRAW);
  const aTouch = gl.getAttribLocation(markProg, "aTouch");
  gl.enableVertexAttribArray(aTouch);
  gl.vertexAttribPointer(aTouch, 1, gl.UNSIGNED_BYTE, true, 0, 0);

  groundVao = gl.createVertexArray();
  gl.bindVertexArray(groundVao);
  const gb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, gb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(groundProg, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  outlineVao = gl.createVertexArray();
  gl.bindVertexArray(outlineVao);
  const ob = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, ob);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  atlas();
  gl.useProgram(markProg);
  gl.uniform1fv(U.uLayer, LSET.types);
  gl.uniform1f(U.uAsk, 0);
  gl.uniform1i(U.uAtlas, 0);
  usePalette();
}

// A palette keeps the shapes and changes what carries colour.
function usePalette() {
  PAL = PALETTES[theme()];
  gl.useProgram(markProg);
  const look = LOOK.map(l => [l[0] * PAL.lum, 0, l[2] * PAL.stroke, l[3]]);
  const tint = TINT.map(t => t.slice());
  for (const q of [7, 8]) { tint[q] = PAL.quote; look[q][1] = 0.9; look[q][0] = PAL.quoteLum; }
  gl.uniform4fv(U.uLook, look.flat());
  gl.uniform3fv(U.uTint, tint.flat());
  gl.uniform3fv(U.uTouchCol, PAL.touch);
  for (const [prog, u] of [[markProg, U], [groundProg, UG]]) {
    gl.useProgram(prog);
    gl.uniform3fv(u.uSkyTop, PAL.sky); gl.uniform3fv(u.uSkyLow, PAL.low); gl.uniform3fv(u.uSun, PAL.sun);
    gl.uniform3fv(u.uCorner, PAL.corner); gl.uniform3fv(u.uSeaTop, PAL.sea); gl.uniform3fv(u.uSeaDeep, PAL.deep);
    gl.uniform3fv(u.uStreak, PAL.streak);
  }
  gl.uniform2fv(UG.uDim, PAL.dim);
  gl.uniform3fv(UG.uLineCol, PAL.line);
}

// ---------- view: scale in CSS px per world unit, offset of the world origin ----------

const view = { s: 1, ox: 0, oy: 0 };
const target = { s: 1, ox: 0, oy: 0 };
let cw = 1, ch = 1, dpr = 1, fitS = 1;

function resize() {
  const r = canvas.getBoundingClientRect();
  cw = r.width; ch = r.height;
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  if (!cw || !ch) return;
  const was = fitS;
  fitS = Math.max(cw / W, ch / H);
  const k = fitS / was;     // keep the same part of the painting in view
  for (const v of [view, target]) { v.s *= k; v.ox *= k; v.oy *= k; }
  clamp(view); clamp(target);
}

function clamp(v) {
  v.s = Math.min(Math.max(v.s, fitS), MAX_CELL_PX);
  v.ox = Math.min(0, Math.max(cw - W * v.s, v.ox));
  v.oy = Math.min(0, Math.max(ch - H * v.s, v.oy));
}

function zoomAt(mx, my, factor) {
  const s = Math.min(Math.max(target.s * factor, fitS), MAX_CELL_PX);
  target.ox = mx - (mx - target.ox) * (s / target.s);
  target.oy = my - (my - target.oy) * (s / target.s);
  target.s = s;
  clamp(target);
}

// ---------- taking the painting apart into its layers ----------

let explode = 0, explodeTarget = Q.has("explode") ? 1 : 0;
const YAW = -0.32, PITCH = 1.02;
const zMid = (LSET.names.length - 1) / 2;
function exScale() {
  const n = LSET.names.length - 1;
  const tall = H * (Math.cos(PITCH) + n * LSET.gap * Math.sin(PITCH)) * 1.25;
  return Math.min(cw / (W * 1.35), ch / tall);
}
function project(px, py, z) {
  const fx = view.ox + px * view.s, fy = view.oy + py * view.s;
  if (explode < 0.001) return [fx, fy];
  let x = px - W / 2, y = py - H / 2, zz = (z - zMid) * LSET.gap * H;
  const cy = Math.cos(YAW), sy = Math.sin(YAW), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
  [x, zz] = [cy * x + sy * zz, -sy * x + cy * zz];
  [y, zz] = [cp * y - sp * zz, sp * y + cp * zz];
  const D = H * 3, f = D / (D - zz), e = exScale();
  return [fx + (cw * 0.42 + x * f * e - fx) * explode, fy + (ch / 2 + y * f * e - fy) * explode];
}
const labels = LSET.names.map((name, i) => {
  const el = document.createElement("span");
  el.className = "layer-label";
  const [title, sub] = name.split("|");
  el.innerHTML = `<b>${title}</b>${sub ? `<small>${sub}</small>` : ""}`;
  frame.appendChild(el);
  return el;
});
function placeLabels() {
  labels.forEach((el, i) => {
    const [x, y] = project(W, H, i);          // each label at its own plane's near corner
    el.style.opacity = explode * explode;
    el.style.transform = `translate(${x + 12}px, ${y}px) translateY(-50%)`;
  });
}
function setExplode(on) {
  explodeTarget = on ? 1 : 0;
  target.s = fitS; target.ox = 0; target.oy = 0;
  document.body.classList.toggle("exploded", on);
}

function toWorld(mx, my) { return [(mx - view.ox) / view.s, (my - view.oy) / view.s]; }

// ---------- interaction ----------

const pointers = new Map();
let lastMove = performance.now(), stir = 0, mouseW = [-1e4, -1e4], dragMoved = 0, pinch = null;

function local(e) {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

canvas.addEventListener("wheel", e => {
  e.preventDefault();
  if (explodeTarget) return;
  const [mx, my] = local(e);
  const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  zoomAt(mx, my, Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0025)));
  wake();
}, { passive: false });

canvas.addEventListener("pointerdown", e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, local(e));
  dragMoved = 0;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) };
  }
  canvas.classList.add("dragging");
  wake();
});

canvas.addEventListener("pointermove", e => {
  const p = local(e);
  const prev = pointers.get(e.pointerId);
  if (prev && !explodeTarget) {
    if (pointers.size === 1) {
      target.ox += p[0] - prev[0];
      target.oy += p[1] - prev[1];
      view.ox = target.ox; view.oy = target.oy;
      clamp(target); clamp(view);
      dragMoved += Math.abs(p[0] - prev[0]) + Math.abs(p[1] - prev[1]);
    } else if (pointers.size === 2 && pinch) {
      pointers.set(e.pointerId, p);
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch.d);
      pinch.d = d;
      dragMoved += 10;
    }
    pointers.set(e.pointerId, p);
  }
  const speed = prev ? 0 : Math.hypot(e.movementX || 0, e.movementY || 0);
  stir = Math.min(1, stir + speed * 0.02);
  mouseW = toWorld(p[0], p[1]);
  takeIn(p[0], p[1]);
  wake();
});

function release(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!pointers.size) canvas.classList.remove("dragging");
}
canvas.addEventListener("pointerup", e => {
  if (dragMoved < 6 && pointers.size === 1 && !explodeTarget) reveal(...local(e));
  release(e);
});
canvas.addEventListener("pointercancel", release);
canvas.addEventListener("pointerleave", () => { mouseW = [-1e4, -1e4]; lastBrush = null; });
canvas.addEventListener("dblclick", e => { const [x, y] = local(e); zoomAt(x, y, 3); });

document.getElementById("zoom-in").onclick = () => zoomAt(cw / 2, ch / 2, 2);
document.getElementById("zoom-out").onclick = () => zoomAt(cw / 2, ch / 2, 0.5);
const layersBtn = document.getElementById("layers");
layersBtn.onclick = () => setExplode(!explodeTarget);
document.getElementById("reset").onclick = () => { target.s = fitS; target.ox = 0; target.oy = 0; };
addEventListener("keydown", e => {
  if (e.target.closest("input, textarea")) return;
  if (e.key === "+" || e.key === "=") zoomAt(cw / 2, ch / 2, 1.6);
  else if (e.key === "-") zoomAt(cw / 2, ch / 2, 1 / 1.6);
  else if (e.key === "0") document.getElementById("reset").click();
  else return;
  wake();
});

function wake() {
  lastMove = performance.now();
  if (explodeTarget) return;
  for (const g of ghostLayer.children) g.classList.add("flee");
  document.getElementById("hint").classList.add("gone");
}

// Marks under the pointer are taken in, with a brush rather than a stamp: a soft round tip,
// a little longer along the stroke, whose edge catches some marks and misses others the way a
// dry brush does. Slow strokes are wide and heavy; fast ones thin and light. Going over a trace
// deepens it.
const BRUSH_PX = 17;           // radius of a slow stroke, in screen pixels
let lastBrush = null;          // where the previous pointer sample landed, to join the stroke up

function hash(n) {             // a fixed, per-mark random number in [0, 1)
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function takeIn(mx, my) {
  if (striking()) return;
  const now = performance.now();
  const prev = lastBrush && now - lastBrush.t < 120 ? lastBrush : null;
  if (!prev) {
    lastBrush = { x: mx, y: my, t: now, carry: 0 };
    return stamp(mx, my, 1, 0, BRUSH_PX * 0.6, 0.5);
  }
  const dx = mx - prev.x, dy = my - prev.y, len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  lastBrush = { x: mx, y: my, t: now, carry: 0 };
  const speed = len / Math.max(1, now - prev.t);                  // px per ms
  const slow = 1 / (1 + speed * 0.9);                               // 1 when still, toward 0 when fast
  const radius = BRUSH_PX * (0.35 + 0.65 * slow);
  const strength = 0.45 + 0.55 * slow;
  const ux = dx / len, uy = dy / len;
  const step = Math.max(1.5, radius * 0.35);
  // stamps keep an even spacing along the whole stroke, however short each pointer move is
  let d = step - prev.carry;
  for (; d <= len; d += step) stamp(prev.x + ux * d, prev.y + uy * d, ux, uy, radius, strength);
  lastBrush.carry = len - (d - step);
}

function stamp(mx, my, ux, uy, radius, strength) {
  const [wx, wy] = toWorld(mx, my);
  const r = radius / view.s;
  const c0 = Math.max(0, Math.floor((wx - r) / CELL_W)), c1 = Math.min(COLS - 1, Math.floor((wx + r) / CELL_W));
  const r0 = Math.max(0, Math.floor(wy - r)), r1 = Math.min(ROWS - 1, Math.floor(wy + r));
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const m = grid[row * COLS + col];
      if (m < 0) continue;
      // distance in screen pixels, stretched so the tip is longer along the stroke than across it
      const px = ((col + 0.5) * CELL_W - wx) * view.s, py = (row + 0.5 - wy) * view.s;
      const along = px * ux + py * uy, across = px * uy - py * ux;
      const d = Math.hypot(along * 0.75, across) / radius;
      if (d >= 1) continue;
      const fall = Math.pow(1 - d * d, 1.6);
      if (hash(m) > fall * 1.25) continue;                         // the ragged edge
      const v = markVertex[m];
      const add = 255 * strength * fall * (0.55 + 0.45 * hash(m + 7919));
      const was = touch[v];
      const now = Math.min(255, Math.max(was, was * 0.6 + add));     // layering deepens a trace
      if (now <= was) continue;
      if (!was) { traced.push(v); touchedCount++; strikeBtn.disabled = false; }
      touch[v] = now;
      touchDirty = true;
    }
  }
}

// ---------- what a mark came from ----------

const texts = new Map();
function loadText(key) {
  if (!texts.has(key)) texts.set(key, fetch(`data/ch/${key}.json`).then(r => r.json()));
  return texts.get(key);
}

function esc(s) {
  return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function nearest(mx, my, radiusPx, want) {
  const [wx, wy] = toWorld(mx, my);
  const r = radiusPx / view.s;
  let best = -1, bd = Infinity;
  const c0 = Math.max(0, Math.floor((wx - r) / CELL_W)), c1 = Math.min(COLS - 1, Math.floor((wx + r) / CELL_W));
  const r0 = Math.max(0, Math.floor(wy - r)), r1 = Math.min(ROWS - 1, Math.floor(wy + r));
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const m = grid[row * COLS + col];
      if (m < 0 || (want && !want(m))) continue;
      const d = ((col + 0.5) * CELL_W - wx) ** 2 + (row + 0.5 - wy) ** 2;
      if (d < bd) { bd = d; best = m; }
    }
  }
  return best;
}

const isQuote = m => markType[m] === OPEN_Q || markType[m] === CLOSE_Q;
const ABBREV = /(?:\b(?:p|pp|vol|vols|ch|chap|mr|mrs|dr|viz|ed|eds|cf|no|nos|st|sq|ibid|loc|cit|op|art|sec|ff|l|c|b|s|t|v|i\.e|e\.g|etc|&c)|\b[A-Z])$/i;

function sentenceAround(text, pos) {
  const LIMIT = 420;
  let start = Math.max(0, pos - LIMIT), end = Math.min(text.length, pos + LIMIT);
  for (let j = pos - 1; j >= Math.max(0, pos - LIMIT); j--) {
    if (text[j] === "\n") { start = j + 1; break; }
    if (".?!".includes(text[j]) && text[j + 1] === " " && /[A-Z"(\[]/.test(text[j + 2] || "") &&
        !ABBREV.test(text.slice(Math.max(0, j - 6), j))) { start = j + 2; break; }
  }
  for (let j = pos; j < Math.min(text.length, pos + LIMIT); j++) {
    if (text[j] === "\n") { end = j; break; }
    if (".?!".includes(text[j]) && text[j + 1] !== "." && (j + 1 >= text.length || /[\s"')\]]/.test(text[j + 1])) &&
        !(text[j] === "." && ABBREV.test(text.slice(Math.max(0, j - 6), j)))) {
      end = j + 1;
      while (/["')\]]/.test(text[end] || "")) end++;
      break;
    }
  }
  return [start, end];
}

// The quoted passage a quotation mark belongs to, and the source Marx gives just after it.
function passageAround(text, pos) {
  const opens = pos === 0 || /[\s(\[—]/.test(text[pos - 1]);
  let a = opens ? pos : text.lastIndexOf('"', pos - 1);
  let b = opens ? text.indexOf('"', pos + 1) : pos;
  if (a < 0 || b < 0 || b - a > 1400 || text.slice(a, b).includes("\n")) return sentenceAround(text, pos);
  b++;
  const src = text.slice(b).match(/^[.,;]?\s*\([^)]{3,160}\)/);
  if (src) b += src[0].length;
  return [a, b];
}

function markup(text, a, b, pos) {
  let out = a > 0 && text[a - 1] !== "\n" ? "…" : "";
  for (let j = a; j < b; j++) {
    const c = text[j];
    if (text.startsWith("...", j)) { out += `<b${j === pos ? ' class="here"' : ""}>…</b>`; j += 2; continue; }
    if (!'.,;:?!()[]"\'-—'.includes(c)) { out += esc(c); continue; }
    let g = c, cls = "";
    if (c === '"') { g = j === 0 || /[\s(\[—]/.test(text[j - 1]) ? "“" : "”"; cls = "q"; }
    else if (c === "'") g = "’";
    if (j === pos) cls += " here";
    out += `<b${cls ? ` class="${cls.trim()}"` : ""}>${esc(g)}</b>`;
  }
  return out;
}

let revealToken = 0, panelTimer = 0;

async function reveal(mx, my) {
  // a lantern within reach wins; otherwise the nearest mark
  let m = nearest(mx, my, 16, isQuote);
  const testimony = m >= 0;
  if (!testimony) m = nearest(mx, my, Math.max(6, view.s), null);
  if (m < 0) { panel.classList.remove("show"); return; }
  const ch = chapters[markChapter[m]];
  const my_ = ++revealToken;
  const { text, pos } = await loadText(ch.key);
  if (my_ !== revealToken) return;
  const p = pos[markLocal[m]];
  const [a, b] = testimony ? passageAround(text, p) : sentenceAround(text, p);
  document.getElementById("where").textContent =
    [`Volume ${ch.vol}`, ch.n ? `Chapter ${ch.n}` : "", ch.title].filter(Boolean).join(" · ");
  document.getElementById("sentence").innerHTML = markup(text, a, Math.min(b, a + 900), p) + (b > a + 900 ? "…" : "");
  panel.classList.toggle("testimony", testimony);
  panel.classList.add("show");
  clearTimeout(panelTimer);
  panelTimer = setTimeout(() => panel.classList.remove("show"), 14000);
}

// ---------- ghosts: the words that were taken out ----------

let lastGhost = 0;

function haunt(now) {
  if ((now - lastMove < IDLE_MS && explode < 0.5) || now - lastGhost < (reduceMotion ? 2400 : 900)) return;
  if (ghostLayer.childElementCount > 12) return;
  lastGhost = now;
  for (let tries = 0; tries < 12; tries++) {
    let x = Math.random() * cw, y = ch * (0.08 + Math.random() * 0.84);
    if (explode > 0.5) { x = view.ox + Math.random() * W * view.s; y = view.oy + Math.random() * H * view.s; }
    const m = nearest(x, y, 4, null);
    if (m < 0) continue;
    const words = chapters[markChapter[m]].ghosts;
    if (!words.length) continue;
    const g = document.createElement("span");
    g.className = "ghost";
    g.textContent = words[Math.floor(Math.random() ** 1.6 * words.length)];
    const [wx, wy] = toWorld(x, y);
    g.wx = wx; g.wy = wy;
    const [sx, sy] = project(wx, wy, GHOST_Z);
    g.style.left = sx + "px";
    g.style.top = sy + "px";
    g.style.fontSize = (15 + Math.random() * 16) * Math.min(1.6, Math.max(0.8, Math.sqrt(view.s / fitS) * 0.7)) + "px";
    g.addEventListener("animationend", () => g.remove());
    ghostLayer.appendChild(g);
    return;
  }
}

// ---------- living labour ----------

let labour = 0, life = 0.08, hiddenAt = 0;
try { labour = +localStorage.getItem(STORE) || 0; } catch (_) {}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) hiddenAt = performance.now();
  else if (hiddenAt) life = Math.max(0.08, life - (performance.now() - hiddenAt) / 25000);
});

function clock(s) {
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? `${h} h ${m} min` : m ? `${m} min ${s % 60} s` : `${s} s`;
}

// Traces fade: the red your pointer left sinks back into the grey sea. Living labour becomes dead labour.
let lastFade = 0;
function fade(now) {
  if (now - lastFade < FADE_STEP_MS || !traced.length) return;
  const steps = Math.min(8, Math.floor((now - lastFade) / FADE_STEP_MS));
  lastFade = now;
  let k = 0;
  for (const v of traced) {
    touch[v] = Math.max(0, touch[v] - steps);
    if (touch[v]) traced[k++] = v;
  }
  traced.length = k;
  touchDirty = true;
}

// Strike: withdraw your labour. The traces go, the count goes back to nothing, and for a while
// the painting has nothing to live on.
// Strike starts disabled: there is nothing to withdraw until your pointer has taken something in.
const strikeBtn = document.getElementById("strike");
let strikeUntil = 0;
const striking = () => performance.now() < strikeUntil;

function strike() {
  strikeUntil = performance.now() + STRIKE_MS;
  strikeBtn.disabled = true;
  touch.fill(0);
  traced.length = 0;
  touchDirty = true;
  touchedCount = 0;
  labour = 0;
  life = 0;
  try { localStorage.removeItem(STORE); } catch (_) {}
  document.getElementById("labour").textContent = clock(0);
  document.getElementById("touched").textContent = "0";
  const note = document.getElementById("strike-note");
  note.classList.add("show");
  setTimeout(() => note.classList.remove("show"), STRIKE_MS);
}
strikeBtn.addEventListener("click", strike);

let lastSave = 0;
function work(dt, now) {
  fade(now);
  if (document.hidden || striking()) return;
  labour += dt;
  life = Math.min(1, life + dt / 25);
  if (now - lastSave > 2000) {
    lastSave = now;
    try { localStorage.setItem(STORE, String(Math.round(labour))); } catch (_) {}
    document.getElementById("labour").textContent = clock(labour);
    document.getElementById("touched").textContent = fmt.format(touchedCount);
  }
}

// ---------- the loop ----------

let then = performance.now(), t0 = then;

function frameLoop(now) {
  const dt = Math.min(0.1, (now - then) / 1000);
  then = now;
  const k = 1 - Math.pow(0.0015, dt);       // ease toward the target view
  view.s += (target.s - view.s) * k;
  view.ox += (target.ox - view.ox) * k;
  view.oy += (target.oy - view.oy) * k;
  clamp(view);
  stir *= Math.pow(0.12, dt);
  explode += (explodeTarget - explode) * (1 - Math.pow(0.02, dt));
  if (Math.abs(explodeTarget - explode) < 0.0005) explode = explodeTarget;
  const e = explode * explode * (3 - 2 * explode);
  work(dt, now);
  haunt(now);

  const glyph = smooth(9, 18, view.s) * (1 - e);
  const drift = (reduceMotion ? 0.35 : 1) * (1 - smooth(4, 14, view.s));
  const time = (now - t0) / 1000;

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(...PAL.clear, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(groundProg);
  gl.bindVertexArray(groundVao);
  gl.uniform2f(UG.uRes, cw, ch);
  gl.uniform2f(UG.uOff, view.ox, view.oy);
  gl.uniform2f(UG.uWorld, W, H);
  gl.uniform1f(UG.uScale, view.s);
  gl.uniform1f(UG.uHorizon, horizon);
  gl.uniform1f(UG.uLife, life);
  gl.uniform1f(UG.uGlyph, glyph);
  for (const [u, prog] of [[UG, groundProg], [U, markProg]]) {
    gl.useProgram(prog);
    gl.uniform1f(u.uExplode, e); gl.uniform1f(u.uYaw, YAW); gl.uniform1f(u.uPitch, PITCH);
    gl.uniform1f(u.uExScale, exScale()); gl.uniform1f(u.uGap, LSET.gap * H); gl.uniform1f(u.uZMid, zMid);
  }
  gl.useProgram(groundProg);
  gl.uniform1f(UG.uZ, 0);
  gl.uniform1f(UG.uOutline, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  if (e > 0.01) {
    // the empty frames of the upper layers, so you can see where each one sits
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(outlineVao);
    gl.uniform1f(UG.uOutline, 1);
    for (let z = 0; z < LSET.names.length; z++) { gl.uniform1f(UG.uZ, z); gl.drawArrays(gl.LINE_LOOP, 0, 4); }
    gl.disable(gl.BLEND);
  }

  gl.useProgram(markProg);
  gl.bindVertexArray(markVao);
  if (touchDirty) {
    gl.bindBuffer(gl.ARRAY_BUFFER, touchBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, touch);
    touchDirty = false;
  }
  gl.uniform2f(U.uRes, cw, ch);
  gl.uniform2f(U.uOff, view.ox, view.oy);
  gl.uniform2f(U.uWorld, W, H);
  gl.uniform2f(U.uMouse, mouseW[0], mouseW[1]);
  gl.uniform1f(U.uScale, view.s);
  gl.uniform1f(U.uTime, time);
  gl.uniform1f(U.uDrift, drift);
  gl.uniform1f(U.uStir, stir * (1 - glyph) * (1 - e));
  gl.uniform1f(U.uStirR, 40 / view.s);
  gl.uniform1f(U.uLife, life);
  gl.uniform1f(U.uDpr, dpr);
  gl.uniform1f(U.uGlyph, glyph);
  gl.uniform1f(U.uHorizon, horizon);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);     // paint
  gl.drawArrays(gl.POINTS, 0, quoteStart);
  if (PAL.glow) gl.blendFunc(gl.ONE, gl.ONE);       // light; on paper the voices are ink
  gl.drawArrays(gl.POINTS, quoteStart, N - quoteStart);
  gl.disable(gl.BLEND);

  for (const g of ghostLayer.children) {
    if (g.wx === undefined) continue;
    const [sx, sy] = project(g.wx, g.wy, GHOST_Z);
    g.style.left = sx + "px"; g.style.top = sy + "px";
  }
  if (e > 0.001 || labels[0].style.opacity !== "0") placeLabels();

  requestAnimationFrame(frameLoop);
}

function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// ---------- light and dark ----------

const THEME_KEY = "what-capital-leaves:theme";
const themeBtn = document.getElementById("theme");
function syncThemeButton() {
  const next = theme() === "dark" ? "light" : "dark";
  themeBtn.textContent = next;
  themeBtn.setAttribute("aria-label", `Switch to ${next} mode`);
}
themeBtn.addEventListener("click", () => {
  const next = theme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
  if (gl) usePalette();
  syncThemeButton();
});
syncThemeButton();

// ---------- start ----------

async function start() {
  data = await fetch("data/marks.json").then(r => r.json());
  for (const vol of data.volumes) {
    vol.chapters.forEach((c, i) => chapters.push({ ...c, vol: vol.id, volStart: i === 0 }));
  }
  const verts = layout();
  frame.style.setProperty("--aspect", (W / H).toFixed(4));
  document.getElementById("n-marks").textContent = fmt.format(N);
  document.getElementById("n-tokens").textContent = fmt.format(data.tokens);
  document.getElementById("labour").textContent = clock(labour);

  await document.fonts.load('500 40px "EB Garamond"').catch(() => {});
  try {
    setupGL(verts);
  } catch (err) {
    console.error(err);
    frame.innerHTML = '<p class="fallback" style="padding:2rem">This painting needs WebGL 2. <a href="read/">Read it as a page instead.</a></p>';
    return;
  }
  resize();
  target.s = view.s = fitS;
  if (explodeTarget) setExplode(true);
  new ResizeObserver(resize).observe(canvas);
  requestAnimationFrame(frameLoop);
}

start();
