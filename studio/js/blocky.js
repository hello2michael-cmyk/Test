// Blocky avatar story scenes ("story3d"): block-figure characters acting out a narrated story in small 3D sets,
// in the style of game-avatar story shorts. Drawn with the software-3D engine (klasse6/js/engine3d.js): a pure
// function of (scene description, time), so every frame renders identically in the browser and in the factory.
//
// Characters are original block figures (a cube head, a box torso, box limbs): no game assets are used.
//
// Scene description (storyboard visual, kind "story3d"):
//   set      'street' | 'classroom' | 'park' | 'home' | 'stage' | 'void'
//   time     'day' | 'sunset' | 'night'
//   camera   { azimuth, elevation, distance, target:[x,y,z], fov, move: 'none'|'push'|'pull'|'orbit'|'pan' }
//   actors   [{ id, look:{skin, shirt, pants, hair, hairColor, hat}, pos:[x,z], yaw (degrees), action, face, say,
//               keys:[{ at, action, to:[x,z], dur, yaw, face, say }] }]
//   props    [{ type, pos:[x,z], yaw, text, color, size }]
//   headline optional big text at the top of the frame
import { ease, smooth, outBack, outCubic, clamp01, rgba, mix, shade } from '../../klasse6/js/engine3d.js';

export const STORY_SETS = ['street', 'classroom', 'park', 'home', 'stage', 'void', 'bedroom', 'woods', 'cabin', 'black'];
export const STORY_ACTIONS = ['idle', 'walk', 'run', 'sit', 'point', 'cheer', 'wave', 'sad', 'think', 'talk', 'jump', 'angry', 'dance', 'shrug', 'lie', 'sleep', 'pray', 'cry', 'knock', 'swing', 'possessed', 'hold', 'offer', 'scared', 'raise'];
export const STORY_FACES = ['neutral', 'happy', 'sad', 'surprised', 'angry', 'wink', 'laugh', 'scared', 'evil', 'blank'];
export const STORY_PROPS = ['sign', 'bench', 'chair', 'desk', 'table', 'tree', 'crate', 'car', 'lamp', 'podium', 'bed', 'board', 'fence', 'bush', 'ball', 'stand', 'text', 'photo', 'book', 'stain', 'door', 'axe', 'candle', 'dust', 'sofa'];
export const STORY_ITEMS = ['cup', 'book', 'photo', 'axe', 'candle', 'phone'];
export const STORY_HAIR = ['short', 'long', 'bald', 'cap', 'bun', 'spiky'];

export const SKINS = { light: '#f3c9a4', tan: '#d9a070', brown: '#9c6540', dark: '#5a3a24', yellow: '#f5d442', pale: '#f8dfc6' };
export const OUTFITS = {
  blue: { shirt: '#2f7cf6', pants: '#223049' }, red: { shirt: '#e74c3c', pants: '#2c3e50' }, green: { shirt: '#27ae60', pants: '#34495e' },
  yellow: { shirt: '#f4c20d', pants: '#2b2b2b' }, purple: { shirt: '#8e44ad', pants: '#1f1f2e' }, orange: { shirt: '#f39c12', pants: '#2c3e50' },
  pink: { shirt: '#ff6fa3', pants: '#3a2a3f' }, teal: { shirt: '#1abc9c', pants: '#1e2d3a' }, white: { shirt: '#f2f2f2', pants: '#2c2c2c' },
  black: { shirt: '#222222', pants: '#444444' }, police: { shirt: '#1d3f8a', pants: '#13233f' }, suit: { shirt: '#2b2b35', pants: '#2b2b35' },
};
const HAIR_COLORS = { brown: '#5a3a1e', black: '#1a1a1a', blonde: '#e3c25a', red: '#b8431c', grey: '#b0b0b0', white: '#eeeeee', blue: '#3b6cff', pink: '#ff7bc4', green: '#3bb55a' };

const STUD = 0.3;                      // one block unit; a character is 5 studs (1.5 world units) tall
const SEAT = 0.42;                     // seat height of chairs and benches: a sitting figure's hips rest here
const TAU = Math.PI * 2;
const deg = d => (Number(d) || 0) * Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const col = (c, fallback) => { if (!c) return fallback; const s = String(c); if (/^#[0-9a-f]{6}$/i.test(s)) return s; return SKINS[s] || HAIR_COLORS[s] || (OUTFITS[s] && OUTFITS[s].shirt) || fallback; };

// ---------- tiny rigid transforms: { m: 3x3 (row-major), t: [x,y,z] } ----------
const I = () => ({ m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] });
const T = (x, y, z) => ({ m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [x, y, z] });
const Rx = a => { const c = Math.cos(a), s = Math.sin(a); return { m: [1, 0, 0, 0, c, -s, 0, s, c], t: [0, 0, 0] }; };
const Ry = a => { const c = Math.cos(a), s = Math.sin(a); return { m: [c, 0, s, 0, 1, 0, -s, 0, c], t: [0, 0, 0] }; };
const Rz = a => { const c = Math.cos(a), s = Math.sin(a); return { m: [c, -s, 0, s, c, 0, 0, 0, 1], t: [0, 0, 0] }; };
const mulM = (A, B) => { const r = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return r; };
const apM = (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[3] * p[0] + m[4] * p[1] + m[5] * p[2], m[6] * p[0] + m[7] * p[1] + m[8] * p[2]];
/** compose(A, B): apply B first, then A. */
const compose = (A, B) => { const t = apM(A.m, B.t); return { m: mulM(A.m, B.m), t: [t[0] + A.t[0], t[1] + A.t[1], t[2] + A.t[2]] }; };
const chain = (...xs) => xs.reduce((a, b) => compose(a, b));
const apply = (X, p) => { const q = apM(X.m, p); return [q[0] + X.t[0], q[1] + X.t[1], q[2] + X.t[2]]; };
/** Rotation about an axis-aligned pivot: move pivot to the origin, rotate, move back. */
const about = (pivot, R) => chain(T(pivot[0], pivot[1], pivot[2]), R, T(-pivot[0], -pivot[1], -pivot[2]));

const BOX_FACES = [[0, 1, 2, 3, [0, 0, -1]], [5, 4, 7, 6, [0, 0, 1]], [4, 0, 3, 7, [-1, 0, 0]], [1, 5, 6, 2, [1, 0, 0]], [3, 2, 6, 7, [0, 1, 0]], [4, 5, 1, 0, [0, -1, 0]]];
/** A box under a rigid transform; faces away from the camera are skipped. zbias pulls it forward in the depth sort (face details). */
function box(S, X, c, h, color, opts = {}, zbias = 0) {
  const [x, y, z] = c, [a, b, d] = h;
  const V = [[-a, -b, -d], [a, -b, -d], [a, b, -d], [-a, b, -d], [-a, -b, d], [a, -b, d], [a, b, d], [-a, b, d]].map(v => apply(X, [x + v[0], y + v[1], z + v[2]]));
  const camPos = S.cam.pos;
  for (const f of BOX_FACES) {
    const n = apM(X.m, f[4]);
    const fc = apply(X, [x + f[4][0] * a, y + f[4][1] * b, z + f[4][2] * d]);
    if (n[0] * (camPos[0] - fc[0]) + n[1] * (camPos[1] - fc[1]) + n[2] * (camPos[2] - fc[2]) <= 0) continue;
    const before = S.items.length;
    S.face([V[f[0]], V[f[1]], V[f[2]], V[f[3]]], color, opts);
    if (zbias && S.items.length > before) S.items[S.items.length - 1].z -= zbias;
  }
}
/** One flat quad (world points), skipped when it faces away; used for walls, windows and floor details. */
function quad(S, pts, color, opts = {}, zbias = 0) {
  const before = S.items.length;
  S.face(pts, color, opts);
  if (zbias && S.items.length > before) S.items[S.items.length - 1].z -= zbias;
}
/** Soft contact shadow on the ground, depth-sorted with the 3D items. */
function shadow(S, x, z, r, alpha = 0.28) {
  const q = S.cam.project([x, 0.004, z]); if (q.z <= 0.1) return;
  const ctx = S.ctx;
  S.items.push({ z: q.z + 0.02, fn: () => {
    ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(q.x, q.y, r * q.s, r * q.s * Math.max(0.12, Math.sin(Math.atan2(S.cam.pos[1], Math.hypot(S.cam.pos[0] - x, S.cam.pos[2] - z)))), 0, 0, TAU); ctx.fill(); ctx.restore();
  } });
}

// ---------- the character ----------
const FACES = {
  neutral: { mouth: [0.16, 0.035], smile: 0, eyes: 1, brows: 0 },
  happy: { mouth: [0.2, 0.04], smile: 1, eyes: 1, brows: 0 },
  laugh: { mouth: [0.22, 0.11], smile: 1, eyes: 0.35, brows: 0 },
  sad: { mouth: [0.16, 0.035], smile: -1, eyes: 1, brows: -1 },
  surprised: { mouth: [0.1, 0.12], smile: 0, eyes: 1.3, brows: 1 },
  angry: { mouth: [0.18, 0.035], smile: -0.6, eyes: 0.8, brows: -2 },
  wink: { mouth: [0.2, 0.04], smile: 1, eyes: 1, brows: 0, wink: true },
  scared: { mouth: [0.11, 0.15], smile: 0, eyes: 1.5, brows: 1 },
  evil: { mouth: [0.24, 0.05], smile: 1, eyes: 0.9, brows: -2, red: true },
  blank: { mouth: [0.12, 0.02], smile: 0, eyes: 0.5, brows: 0 },
};

/**
 * Pose for an action at time t (seconds): limb pitches (radians, negative = forward/up), rolls, body offsets.
 * phase: walking phase in radians (advances with distance travelled).
 */
function pose(action, t, phase, seed = 0) {
  const p = { la: 0, ra: 0, ll: 0, rl: 0, laRoll: 0, raRoll: 0, headPitch: 0, headRoll: 0, headYaw: 0, bodyPitch: 0, y: 0, sit: false, lie: false, bob: 0 };
  const s = Math.sin, c = Math.cos;
  switch (action) {
    case 'walk': { p.ll = 0.55 * s(phase); p.rl = -0.55 * s(phase); p.la = -0.45 * s(phase); p.ra = 0.45 * s(phase); p.y = 0.025 * Math.abs(s(phase)); p.bodyPitch = 0.04; break; }
    case 'run': { p.ll = 0.95 * s(phase); p.rl = -0.95 * s(phase); p.la = -0.9 * s(phase); p.ra = 0.9 * s(phase); p.laRoll = 0.15; p.raRoll = -0.15; p.y = 0.07 * Math.abs(s(phase)); p.bodyPitch = 0.22; break; }
    case 'sit': { p.sit = true; p.ll = p.rl = -Math.PI / 2; p.la = p.ra = -0.35; p.headPitch = 0.04 * s(t * 1.3); break; }
    case 'lie': case 'sleep': { p.lie = true; p.la = p.ra = 0.2; break; }
    case 'point': { p.ra = -Math.PI / 2 - 0.08 * s(t * 2.1); p.raRoll = -0.08; p.la = 0.1; p.headPitch = -0.05; break; }
    case 'cheer': { const j = Math.abs(s(t * 5.2)); p.la = -Math.PI + 0.25 * s(t * 5.2); p.ra = -Math.PI - 0.25 * s(t * 5.2); p.laRoll = 0.35; p.raRoll = -0.35; p.y = 0.16 * j; p.headPitch = -0.15; break; }
    case 'jump': { const j = Math.abs(s(t * 3.6)); p.y = 0.45 * j; p.ll = p.rl = 0.35 * j; p.la = p.ra = -2.6; p.laRoll = 0.4; p.raRoll = -0.4; break; }
    case 'wave': { p.ra = -2.9; p.raRoll = -0.35 + 0.3 * s(t * 8.5); p.headRoll = 0.08; break; }
    case 'sad': { p.headPitch = 0.42; p.la = p.ra = 0.15; p.bodyPitch = 0.1; break; }
    case 'think': { p.ra = -2.35; p.raRoll = -0.55; p.la = 0.1; p.headRoll = 0.14; p.headPitch = -0.05; p.headYaw = 0.1 * s(t * 0.8); break; }
    case 'talk': { p.ra = -0.9 + 0.25 * s(t * 5 + seed); p.la = -0.5 + 0.2 * s(t * 4.3 + 1); p.raRoll = -0.2; p.laRoll = 0.2; p.headPitch = 0.04 * s(t * 6); p.headYaw = 0.06 * s(t * 2.2); break; }
    case 'angry': { p.la = -1.35; p.ra = -1.35; p.laRoll = 0.95; p.raRoll = -0.95; p.headPitch = 0.12; p.bodyPitch = 0.06; p.y = 0.01 * s(t * 14); break; }
    case 'dance': { p.la = -1.6 + 1.1 * s(t * 6.3); p.ra = -1.6 - 1.1 * s(t * 6.3); p.laRoll = 0.5; p.raRoll = -0.5; p.y = 0.06 * Math.abs(s(t * 6.3)); p.headRoll = 0.15 * s(t * 3.15); p.ll = 0.2 * s(t * 6.3); p.rl = -0.2 * s(t * 6.3); break; }
    case 'pray': { p.la = -1.25; p.ra = -1.25; p.laRoll = -0.42; p.raRoll = 0.42; p.headPitch = 0.3; p.y = 0.004 * s(t * 3); break; }
    case 'cry': { p.sit = true; p.floor = true; p.ll = p.rl = -Math.PI / 2; p.la = p.ra = -2.3; p.laRoll = -0.5; p.raRoll = 0.5; p.headPitch = 0.42; p.y = 0.02 * Math.abs(s(t * 7)); p.bodyPitch = 0.15; break; }
    case 'knock': { p.ra = -1.45 + 0.3 * Math.max(0, s(t * 12)); p.raRoll = -0.1; break; }
    case 'raise': { p.ra = -2.7 + 0.04 * s(t * 13); p.raRoll = -0.12; p.la = -1.3; p.laRoll = 0.3; p.headRoll = 0.35; p.headPitch = 0.05; p.bodyPitch = -0.06; p.y = 0.006 * s(t * 21); break; }
    case 'swing': { const u = smooth((t - 0.9) / 0.35); p.ra = lerp(-2.7, -0.4, u); p.la = -0.6; p.raRoll = -0.1; p.bodyPitch = lerp(-0.12, 0.25, u); p.headPitch = lerp(-0.1, 0.2, u); break; }
    case 'possessed': { p.la = -1.5 + 0.05 * s(t * 17); p.ra = -1.45 + 0.05 * c(t * 19); p.headRoll = 0.4; p.headPitch = 0.1; p.bodyPitch = 0.12; p.y = 0.008 * s(t * 23); p.ll = 0.1 * s(t * 9); p.rl = -0.1 * s(t * 9); break; }
    case 'hold': { p.ra = -1.2; p.raRoll = -0.15; p.la = 0.05; p.headPitch = 0.1; break; }
    case 'offer': { p.ra = -1.4; p.raRoll = -0.1; p.la = -0.3; p.laRoll = 0.1; p.headPitch = 0.05; break; }
    case 'scared': { p.la = -2.2 + 0.08 * s(t * 15); p.ra = -2.2 - 0.08 * s(t * 15); p.laRoll = 0.5; p.raRoll = -0.5; p.headPitch = -0.1; p.bodyPitch = -0.1; p.y = 0.01 * s(t * 21); break; }
    case 'shrug': { const u = 0.5 + 0.5 * s(t * 2.5); p.la = -0.6; p.ra = -0.6; p.laRoll = 0.9 * u; p.raRoll = -0.9 * u; p.headRoll = 0.18 * u; break; }
    default: { p.y = 0.012 * s(t * 1.9 + seed); p.la = 0.06 * s(t * 1.9 + seed); p.ra = -0.06 * s(t * 1.9 + seed); p.headYaw = 0.05 * s(t * 0.7 + seed); }
  }
  return p;
}

/** Draws one block figure. root: world transform of the feet centre (facing +z before yaw). */
export function drawFigure(S, look, action, t, phase, root, face = 'neutral', seed = 0) {
  const s = STUD, P = pose(action, t, phase, seed);
  const skin = col(look.skin, SKINS.light), shirt = col(look.shirt, OUTFITS.blue.shirt), pants = col(look.pants, OUTFITS.blue.pants);
  const hairColor = col(look.hairColor, HAIR_COLORS.brown), hair = STORY_HAIR.includes(look.hair) ? look.hair : 'short';
  const hipY = 2 * s, shoulderY = 4 * s, headBase = 4.05 * s;
  if (look.scale && look.scale !== 1) { const k = Math.max(0.4, Math.min(1.6, Number(look.scale))); root = compose(root, { m: [k, 0, 0, 0, k, 0, 0, 0, k], t: [0, 0, 0] }); }
  let body = chain(root, T(0, P.y, 0));
  if (P.lie) body = chain(root, T(0, 0.5 * s, 0), Rx(-Math.PI / 2), T(0, -0.2, 0));
  else if (P.sit) body = chain(root, T(0, (P.floor ? 0.02 : SEAT) - hipY, 0));
  const torsoX = chain(body, about([0, hipY, 0], Rx(P.bodyPitch)));
  // legs
  box(S, chain(body, about([0, hipY, 0], Rx(P.ll))), [-0.5 * s, 1 * s, 0], [0.49 * s, 1 * s, 0.49 * s], pants, { edge: false });
  box(S, chain(body, about([0, hipY, 0], Rx(P.rl))), [0.5 * s, 1 * s, 0], [0.49 * s, 1 * s, 0.49 * s], pants, { edge: false });
  // shoes
  box(S, chain(body, about([0, hipY, 0], Rx(P.ll))), [-0.5 * s, 0.12 * s, 0.05 * s], [0.5 * s, 0.12 * s, 0.56 * s], shade(pants, 0.55), { edge: false }, 0.002);
  box(S, chain(body, about([0, hipY, 0], Rx(P.rl))), [0.5 * s, 0.12 * s, 0.05 * s], [0.5 * s, 0.12 * s, 0.56 * s], shade(pants, 0.55), { edge: false }, 0.002);
  // torso
  box(S, torsoX, [0, 3 * s, 0], [1 * s, 1 * s, 0.5 * s], shirt, { edge: false });
  if (look.logo) box(S, torsoX, [0, 3.2 * s, 0.5 * s], [0.3 * s, 0.3 * s, 0.01 * s], col(look.logo, '#fff'), { edge: false }, 0.01);
  // arms (shoulder pivot at the top of the arm)
  const armL = chain(torsoX, about([-1.5 * s, shoulderY, 0], chain(Rz(-P.laRoll), Rx(P.la))));
  const armR = chain(torsoX, about([1.5 * s, shoulderY, 0], chain(Rz(P.raRoll), Rx(P.ra))));
  const sleeve = look.sleeves === 'long';
  box(S, armL, [-1.5 * s, 3 * s, 0], [0.49 * s, 1 * s, 0.49 * s], sleeve ? shirt : skin, { edge: false });
  box(S, armR, [1.5 * s, 3 * s, 0], [0.49 * s, 1 * s, 0.49 * s], sleeve ? shirt : skin, { edge: false });
  if (!sleeve) { box(S, armL, [-1.5 * s, 3.55 * s, 0], [0.5 * s, 0.45 * s, 0.5 * s], shirt, { edge: false }, 0.003); box(S, armR, [1.5 * s, 3.55 * s, 0], [0.5 * s, 0.45 * s, 0.5 * s], shirt, { edge: false }, 0.003); }
  // something in the right hand (the hand is at the bottom of the arm, [1.5s, 2s, 0] in the arm's frame)
  const hold = STORY_ITEMS.includes(look.hold) ? look.hold : null;
  if (hold) {
    const hx = 1.5 * s, hy = 2.05 * s;
    if (hold === 'cup') { box(S, armR, [hx, hy, 0.3 * s], [0.14 * s, 0.17 * s, 0.14 * s], '#f3f3f3', { edge: false }, 0.01); box(S, armR, [hx, hy + 0.17 * s, 0.3 * s], [0.11 * s, 0.015 * s, 0.11 * s], '#b5651d', { edge: false }, 0.02); }
    else if (hold === 'book') { box(S, armR, [hx, hy - 0.05 * s, 0.45 * s], [0.3 * s, 0.05 * s, 0.4 * s], '#5a2d0c', { edge: false }, 0.01); box(S, armR, [hx, hy + 0.01 * s, 0.45 * s], [0.27 * s, 0.015 * s, 0.37 * s], '#f1e8d0', { edge: false }, 0.02); }
    else if (hold === 'photo') { box(S, armR, [hx, hy + 0.2 * s, 0.4 * s], [0.32 * s, 0.26 * s, 0.03 * s], '#3a2a1a', { edge: false }, 0.01); box(S, armR, [hx, hy + 0.2 * s, 0.44 * s], [0.26 * s, 0.2 * s, 0.01 * s], '#d9d2c0', { edge: false }, 0.02); }
    else if (hold === 'phone') { box(S, armR, [hx, hy, 0.35 * s], [0.14 * s, 0.26 * s, 0.03 * s], '#1b1b1b', { edge: false }, 0.01); }
    else if (hold === 'candle') { box(S, armR, [hx, hy + 0.25 * s, 0.3 * s], [0.06 * s, 0.3 * s, 0.06 * s], '#f3ead0', { edge: false }, 0.01); box(S, armR, [hx, hy + 0.66 * s, 0.3 * s], [0.07 * s, (0.08 + 0.03 * Math.sin(t * 23)) * s, 0.07 * s], '#ffb830', { edge: false, lumBias: 0.8 }, 0.02); }
    else if (hold === 'axe') { // held across the hand: with the arm raised the axe points up, with the arm down it points forward
      box(S, armR, [hx, hy, 1.7 * s], [0.11 * s, 0.11 * s, 2.0 * s], '#5a3a1e', { edge: false }, 0.01);
      box(S, armR, [hx, hy + 0.3 * s, 3.3 * s], [0.1 * s, 0.9 * s, 0.6 * s], '#9aa1a8', { edge: false }, 0.02);
      box(S, armR, [hx, hy + 0.3 * s, 3.95 * s], [0.11 * s, 1.0 * s, 0.09 * s], '#eef1f4', { edge: false }, 0.03);
    }
  }
  // head
  const headX = chain(torsoX, about([0, headBase, 0], chain(Ry(P.headYaw), Rz(P.headRoll), Rx(P.headPitch))));
  const hh = 0.55 * s, hc = [0, headBase + hh, 0];
  box(S, headX, hc, [hh, hh, hh], skin, { edge: false });
  // face on the front (+z)
  const F = FACES[face] || FACES.neutral, fz = hh + 0.004;
  const eyeH = 0.1 * s * F.eyes, eyeY = hc[1] + 0.12 * s;
  const eyeC = F.red ? '#d81616' : '#1b1b1b';
  box(S, headX, [-0.2 * s, eyeY, fz], [0.085 * s, eyeH, 0.004], eyeC, { edge: false }, 0.05);
  if (F.wink) box(S, headX, [0.2 * s, eyeY, fz], [0.11 * s, 0.02 * s, 0.004], '#1b1b1b', { edge: false }, 0.05);
  else box(S, headX, [0.2 * s, eyeY, fz], [0.085 * s, eyeH, 0.004], eyeC, { edge: false }, 0.05);
  if (F.brows) { // brows: inner ends lowered for angry, raised for surprise, outer lowered for sad
    const tilt = F.brows === -2 ? 0.35 : F.brows === -1 ? -0.25 : 0, lift = F.brows === 1 ? 0.3 * s : F.brows === -2 ? 0.2 * s : 0.26 * s;
    box(S, chain(headX, about([-0.2 * s, eyeY + lift, fz], Rz(-tilt))), [-0.2 * s, eyeY + lift, fz], [0.12 * s, 0.025 * s, 0.004], '#1b1b1b', { edge: false }, 0.05);
    box(S, chain(headX, about([0.2 * s, eyeY + lift, fz], Rz(tilt))), [0.2 * s, eyeY + lift, fz], [0.12 * s, 0.025 * s, 0.004], '#1b1b1b', { edge: false }, 0.05);
  }
  const mouthY = hc[1] - 0.22 * s;
  box(S, headX, [0, mouthY, fz], [F.mouth[0] * s, F.mouth[1] * s, 0.004], F.mouth[1] > 0.08 ? '#4a1d1d' : '#1b1b1b', { edge: false }, 0.05);
  if (F.smile) { const dy = F.smile > 0 ? 0.05 * s : -0.05 * s; for (const sx of [-1, 1]) box(S, headX, [sx * (F.mouth[0] + 0.03) * s, mouthY + dy, fz], [0.035 * s, 0.06 * s, 0.004], '#1b1b1b', { edge: false }, 0.05); }
  // hair / hat
  if (look.hat) {
    const hatC = col(look.hat === true ? 'red' : look.hat, '#c0392b');
    box(S, headX, [0, hc[1] + hh + 0.12 * s, 0], [0.62 * s, 0.14 * s, 0.62 * s], hatC, { edge: false }, 0.004);
    box(S, headX, [0, hc[1] + hh + 0.3 * s, 0], [0.42 * s, 0.1 * s, 0.42 * s], hatC, { edge: false }, 0.004);
  } else if (hair === 'cap') {
    box(S, headX, [0, hc[1] + hh + 0.1 * s, 0], [0.6 * s, 0.12 * s, 0.6 * s], hairColor, { edge: false }, 0.004);
    box(S, headX, [0, hc[1] + hh - 0.02 * s, 0.7 * s], [0.5 * s, 0.03 * s, 0.3 * s], hairColor, { edge: false }, 0.004);
  } else if (hair !== 'bald') {
    box(S, headX, [0, hc[1] + hh + 0.08 * s, -0.04 * s], [0.6 * s, 0.14 * s, 0.6 * s], hairColor, { edge: false }, 0.004);
    if (hair === 'spiky') for (let i = -1; i <= 1; i++) box(S, headX, [i * 0.3 * s, hc[1] + hh + 0.36 * s, -0.05 * s], [0.1 * s, 0.16 * s, 0.1 * s], hairColor, { edge: false }, 0.004);
    if (hair === 'bun') box(S, headX, [0, hc[1] + hh + 0.3 * s, -0.25 * s], [0.22 * s, 0.14 * s, 0.22 * s], hairColor, { edge: false }, 0.004);
    if (hair === 'long' || hair === 'bun') { // sides and back
      box(S, headX, [0, hc[1] - 0.1 * s, -0.5 * s], [0.6 * s, 0.6 * s, 0.14 * s], hairColor, { edge: false }, 0.004);
      for (const sx of [-1, 1]) box(S, headX, [sx * 0.6 * s, hc[1] - 0.05 * s, -0.1 * s], [0.1 * s, 0.55 * s, 0.5 * s], hairColor, { edge: false }, 0.004);
    } else { // short: a fringe and sides
      box(S, headX, [0, hc[1] + 0.35 * s, 0.5 * s], [0.6 * s, 0.14 * s, 0.14 * s], hairColor, { edge: false }, 0.004);
      for (const sx of [-1, 1]) box(S, headX, [sx * 0.6 * s, hc[1] + 0.25 * s, -0.1 * s], [0.08 * s, 0.3 * s, 0.5 * s], hairColor, { edge: false }, 0.004);
    }
  }
  if (look.glasses) {
    const fc = '#2b2b2b', gz = fz + 0.012, rim = 0.022 * s;
    for (const sx of [-1, 1]) {
      box(S, headX, [sx * 0.2 * s, eyeY + 0.16 * s, gz], [0.16 * s, rim, 0.004], fc, { edge: false }, 0.06);
      box(S, headX, [sx * 0.2 * s, eyeY - 0.16 * s, gz], [0.16 * s, rim, 0.004], fc, { edge: false }, 0.06);
      box(S, headX, [sx * 0.36 * s, eyeY, gz], [rim, 0.17 * s, 0.004], fc, { edge: false }, 0.06);
      box(S, headX, [sx * 0.04 * s, eyeY, gz], [rim, 0.17 * s, 0.004], fc, { edge: false }, 0.06);
    }
  }
  // the position of the head top in world space, for speech bubbles
  return apply(headX, [0, hc[1] + hh + 0.45 * s, 0]);
}

// ---------- actor state over time ----------
function actorState(a, t) {
  let pos = [Number(a.pos?.[0]) || 0, Number(a.pos?.[1]) || 0], yaw = deg(a.yaw), action = a.action || 'idle', face = a.face || 'happy', say = null, dist = 0, hold, y = Number(a.y) || 0;
  const keys = Array.isArray(a.keys) ? [...a.keys].sort((x, y) => (Number(x.at) || 0) - (Number(y.at) || 0)) : [];
  let start = pos;
  for (const k of keys) {
    const at = Number(k.at) || 0;
    if (t < at) break;
    const moving = Array.isArray(k.to) && (k.action === 'walk' || k.action === 'run' || !k.action);
    if (moving) {
      const to = [Number(k.to[0]) || 0, Number(k.to[1]) || 0];
      const dur = Math.max(0.1, Number(k.dur) || Math.hypot(to[0] - start[0], to[1] - start[1]) / (k.action === 'run' ? 2.6 : 1.4));
      const p = clamp01((t - at) / dur);
      pos = [lerp(start[0], to[0], p), lerp(start[1], to[1], p)];
      const dx = to[0] - start[0], dz = to[1] - start[1];
      if (Math.hypot(dx, dz) > 0.01) yaw = Math.atan2(dx, dz);
      dist = Math.hypot(dx, dz) * p;
      action = p < 1 ? (k.action || 'walk') : (k.then || 'idle');
      if (p >= 1) { start = to; if (k.yaw != null) yaw = deg(k.yaw); }
    } else {
      if (k.action) action = k.action;
      if (k.yaw != null) yaw = deg(k.yaw);
      start = pos;
    }
    if (k.face) face = k.face;
    if (k.hold !== undefined) hold = k.hold;
    if (k.y != null) y = Number(k.y) || 0;
    say = k.say !== undefined ? k.say : say;
    if (k.pos) { pos = [Number(k.pos[0]) || 0, Number(k.pos[1]) || 0]; start = pos; }
  }
  if (!keys.length && a.say) say = a.say;
  return { pos, yaw, action, face, say, dist, hold, y };
}

// ---------- sets ----------
const SKY = {
  day: { top: '#5aa9ff', bottom: '#cfe9ff', sun: '#fff3a6', ground: { street: '#8e9196', park: '#6fbf4a', classroom: '#d7c3a1', home: '#c89a63', stage: '#4a3f5c', void: '#3a7bd5', bedroom: '#b58a5a', woods: '#2e4a24', cabin: '#5a3d26', black: '#000000' } },
  sunset: { top: '#3d3a8c', bottom: '#ff9f6e', sun: '#ffb347', ground: { street: '#6f6a76', park: '#5c9b3f', classroom: '#cdb48f', home: '#b88a58', stage: '#3f3550', void: '#5b3f8c', bedroom: '#a37c50', woods: '#2a4020', cabin: '#4f3521', black: '#000000' } },
  night: { top: '#0a1230', bottom: '#2a3b6b', sun: '#e8ecff', ground: { street: '#3e4250', park: '#2f5a2a', classroom: '#9f8f73', home: '#8a6742', stage: '#2a2338', void: '#15204a', bedroom: '#6e5236', woods: '#121c0f', cabin: '#3a2718', black: '#000000' } },
};

function sky(S, time, set) {
  const { ctx, w, h } = S, k = SKY[time] || SKY.day;
  const interior = set === 'classroom' || set === 'home' || set === 'bedroom' || set === 'cabin' || set === 'black';
  const g = ctx.createLinearGradient(0, 0, 0, h);
  const wallTop = { classroom: '#f1ead6', home: '#e9dcc8', bedroom: time === 'night' ? '#4a3d35' : '#d9c9b8', cabin: time === 'night' ? '#2a1c12' : '#4a3220', black: '#000000' }[set] || '#e9dcc8';
  const wallBot = { classroom: '#d9cfb8', home: '#d2c0a8', bedroom: time === 'night' ? '#3a2f29' : '#c7b5a2', cabin: time === 'night' ? '#1f140d' : '#3b2719', black: '#000000' }[set] || '#d2c0a8';
  if (interior) { g.addColorStop(0, wallTop); g.addColorStop(1, wallBot); }
  else { g.addColorStop(0, k.top); g.addColorStop(1, k.bottom); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // horizon: everything below it is ground
  const cam = S.cam, f = [cam.fwd[0], 0, cam.fwd[2]], l = Math.hypot(f[0], f[2]) || 1;
  const far = cam.project([cam.pos[0] + f[0] / l * 1000, cam.pos[1], cam.pos[2] + f[2] / l * 1000]);
  const hy = far.y;
  if (!interior) {
    const sunX = w * (time === 'sunset' ? 0.72 : 0.22), sunY = time === 'sunset' ? hy - h * 0.06 : h * 0.1, r = S.u(time === 'night' ? 44 : 70);
    const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, r * 3);
    sg.addColorStop(0, rgba(k.sun, 0.9)); sg.addColorStop(0.35, rgba(k.sun, 0.35)); sg.addColorStop(1, rgba(k.sun, 0));
    ctx.fillStyle = sg; ctx.fillRect(sunX - r * 3, sunY - r * 3, r * 6, r * 6);
    ctx.fillStyle = k.sun; ctx.beginPath(); ctx.arc(sunX, sunY, r, 0, TAU); ctx.fill();
    if (time === 'night') { ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 60; i++) { const x = ((i * 7919) % 1000) / 1000 * w, y = ((i * 104729) % 1000) / 1000 * hy * 0.9; ctx.fillRect(x, y, S.u(2.5), S.u(2.5)); } }
    // clouds, slowly drifting
    ctx.fillStyle = time === 'night' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 5; i++) {
      const cx = ((i * 0.23 + S.cloudShift * 0.02) % 1.2 - 0.1) * w, cy = hy * (0.12 + 0.14 * i), cw = S.u(180 + 60 * (i % 3)), ch = S.u(44);
      ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, ch / 2); ctx.roundRect(cx + cw * 0.25, cy - ch * 0.5, cw * 0.45, ch, ch / 2); ctx.fill();
    }
  }
  const gg = ctx.createLinearGradient(0, hy, 0, h);
  const ground = k.ground[set] || k.ground.void;
  gg.addColorStop(0, shade(ground, interior ? 0.95 : 0.8)); gg.addColorStop(1, shade(ground, 1.08));
  ctx.fillStyle = gg; ctx.fillRect(0, hy - 1, w, h - hy + 1);
}

/** A strip on the ground between x0..x1 and z0..z1 (thin prism). */
const strip = (S, x0, x1, z0, z1, color, y = 0.01, hgt = 0.01, opts = {}) => S.prism([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y, hgt, color, { edge: false, ...opts });

function building(S, x, z, w, h, d, color, windows = true, seed = 0) {
  const X = I();
  box(S, X, [x, h / 2, z], [w / 2, h / 2, d / 2], color, { edge: false });
  box(S, X, [x, h + 0.08, z], [w / 2 + 0.06, 0.08, d / 2 + 0.06], shade(color, 0.7), { edge: false });
  if (!windows) return;
  const cols = Math.max(1, Math.floor(w / 0.9)), rows = Math.max(1, Math.floor((h - 1.4) / 1.0));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const wx = x - w / 2 + (c + 0.5) * (w / cols), wy = 1.6 + r * 1.0, lit = ((r * 7 + c * 3 + seed) % 5) < 2;
    const fz = z + d / 2 + 0.01;
    quad(S, [[wx - 0.28, wy - 0.3, fz], [wx + 0.28, wy - 0.3, fz], [wx + 0.28, wy + 0.3, fz], [wx - 0.28, wy + 0.3, fz]], lit ? '#ffe9a8' : '#8fc7ff', { edge: false, lumBias: 0.25 }, 0.02);
  }
}

function tree(S, x, z, size = 1, seed = 0) {
  const X = I(), h = 0.9 * size;
  box(S, X, [x, h / 2, z], [0.12 * size, h / 2, 0.12 * size], '#7a4e2a', { edge: false });
  const g = ['#3f9f3a', '#48b043', '#2f8a33'];
  box(S, X, [x, h + 0.55 * size, z], [0.62 * size, 0.5 * size, 0.62 * size], g[seed % 3], { edge: false });
  box(S, X, [x + 0.15 * size, h + 1.2 * size, z - 0.1 * size], [0.42 * size, 0.32 * size, 0.42 * size], g[(seed + 1) % 3], { edge: false });
  shadow(S, x, z, 0.5 * size, 0.18);
}

function bench(S, x, z, yaw, color = '#b5793f') {
  const X = chain(T(x, 0, z), Ry(yaw));
  for (let i = 0; i < 3; i++) box(S, X, [0, 0.42, -0.18 + i * 0.16], [0.75, 0.025, 0.07], color, { edge: false });
  for (let i = 0; i < 2; i++) box(S, X, [0, 0.72 + i * 0.16, -0.3], [0.75, 0.06, 0.03], color, { edge: false });
  for (const sx of [-1, 1]) { box(S, X, [sx * 0.65, 0.2, 0], [0.04, 0.2, 0.26], '#333', { edge: false }); box(S, X, [sx * 0.65, 0.62, -0.3], [0.04, 0.22, 0.03], '#333', { edge: false }); }
  shadow(S, x, z, 0.8, 0.18);
}
function chair(S, x, z, yaw, color = '#3b6cff') {
  const X = chain(T(x, 0, z), Ry(yaw));
  box(S, X, [0, 0.4, 0], [0.26, 0.03, 0.26], color, { edge: false });
  box(S, X, [0, 0.7, -0.24], [0.26, 0.26, 0.03], color, { edge: false });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(S, X, [sx * 0.22, 0.19, sz * 0.22], [0.03, 0.19, 0.03], '#555', { edge: false });
}
function desk(S, x, z, yaw, color = '#d9a55e', w = 0.6) {
  const X = chain(T(x, 0, z), Ry(yaw));
  box(S, X, [0, 0.72, 0], [w, 0.03, 0.35], color, { edge: false });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(S, X, [sx * (w - 0.06), 0.35, sz * 0.3], [0.03, 0.35, 0.03], '#666', { edge: false });
  shadow(S, x, z, w * 0.9, 0.15);
}
function signPost(S, x, z, yaw, text, color = '#2ecc71', textColor = '#fff') {
  const X = chain(T(x, 0, z), Ry(yaw));
  box(S, X, [0, 0.95, 0], [0.04, 0.95, 0.04], '#4a4a4a', { edge: false });
  const lines = String(text || '').split('\n').filter(Boolean);
  const H = 0.28 * Math.max(1, lines.length) + 0.12;
  box(S, X, [0, 1.9 + H / 2, 0.02], [0.9, H / 2, 0.03], color, { edge: false });
  lines.forEach((ln, i) => S.label(apply(X, [0, 1.9 + H - 0.2 - i * 0.28, 0.06]), ln, { above: 0, strong: true, color: textColor, bg: 'rgba(0,0,0,0)', size: S.u(30) }));
  shadow(S, x, z, 0.25, 0.2);
}
function board(S, x, z, yaw, text, color = '#1f5a3a') {
  const X = chain(T(x, 0, z), Ry(yaw));
  box(S, X, [0, 1.65, 0], [1.6, 0.75, 0.04], color, { edge: true, edgeColor: 'rgba(255,255,255,0.5)' });
  const lines = String(text || '').split('\n').filter(Boolean);
  lines.forEach((ln, i) => S.label(apply(X, [0, 2.05 - i * 0.3, 0.08]), ln, { above: 0, strong: true, color: '#fff', bg: 'rgba(0,0,0,0)', size: S.u(32) }));
}
function car(S, x, z, yaw, color = '#e74c3c') {
  const X = chain(T(x, 0, z), Ry(yaw));
  box(S, X, [0, 0.45, 0], [1.3, 0.25, 0.6], color, { edge: false });
  box(S, X, [-0.1, 0.9, 0], [0.7, 0.22, 0.55], shade(color, 0.9), { edge: false });
  quad(S, [[-0.75, 0.72, -0.56], [0.55, 0.72, -0.56], [0.55, 1.08, -0.56], [-0.75, 1.08, -0.56]].map(p => apply(X, p)), '#8fd3ff', { edge: false, lumBias: 0.2 }, 0.02);
  quad(S, [[-0.75, 0.72, 0.56], [0.55, 0.72, 0.56], [0.55, 1.08, 0.56], [-0.75, 1.08, 0.56]].map(p => apply(X, p)), '#8fd3ff', { edge: false, lumBias: 0.2 }, 0.02);
  for (const [sx, sz] of [[-0.85, -0.62], [0.85, -0.62], [-0.85, 0.62], [0.85, 0.62]]) box(S, X, [sx, 0.22, sz], [0.22, 0.22, 0.08], '#1f1f1f', { edge: false });
  shadow(S, x, z, 1.4, 0.22);
}
function lamp(S, x, z, time) {
  const X = I();
  box(S, X, [x, 1.4, z], [0.05, 1.4, 0.05], '#3c3c3c', { edge: false });
  box(S, X, [x, 2.85, z], [0.2, 0.12, 0.2], time === 'night' ? '#fff2b0' : '#dddddd', { edge: false, lumBias: time === 'night' ? 0.5 : 0 });
}
function podium(S, x, z, yaw, color = '#7a4a2a') {
  const X = chain(T(x, 0, z), Ry(yaw));
  box(S, X, [0, 0.55, 0], [0.45, 0.55, 0.3], color, { edge: false });
  box(S, X, [0, 1.14, -0.05], [0.5, 0.04, 0.38], shade(color, 0.8), { edge: false });
  shadow(S, x, z, 0.5, 0.2);
}
function bed(S, x, z, yaw, color = '#3b7dd8') {
  const X = chain(T(x, 0, z), Ry(yaw));
  box(S, X, [0, 0.25, 0], [0.7, 0.25, 1.1], '#8a5a30', { edge: false });
  box(S, X, [0, 0.55, 0.1], [0.68, 0.08, 0.95], color, { edge: false });
  box(S, X, [0, 0.58, -0.85], [0.5, 0.1, 0.2], '#fff', { edge: false });
  box(S, X, [0, 0.8, -1.1], [0.72, 0.5, 0.05], '#6e4522', { edge: false });
  shadow(S, x, z, 1.1, 0.2);
}
function crate(S, x, z, yaw, color = '#c48a3f', size = 0.35, y = 0) {
  const X = chain(T(x, y, z), Ry(yaw));
  box(S, X, [0, size, 0], [size, size, size], color, { edge: true, edgeColor: 'rgba(0,0,0,0.25)' });
  if (!y) shadow(S, x, z, size * 1.2, 0.2);
}
function fence(S, x, z, yaw, len = 3, color = '#e8e3d6') {
  const X = chain(T(x, 0, z), Ry(yaw));
  const n = Math.max(2, Math.round(len / 0.4));
  for (let i = 0; i <= n; i++) box(S, X, [-len / 2 + i * (len / n), 0.45, 0], [0.04, 0.45, 0.04], color, { edge: false });
  box(S, X, [0, 0.3, 0], [len / 2, 0.03, 0.02], color, { edge: false }); box(S, X, [0, 0.65, 0], [len / 2, 0.03, 0.02], color, { edge: false });
}
function bush(S, x, z, size = 0.4, seed = 0) { box(S, I(), [x, size * 0.8, z], [size, size * 0.8, size * 0.9], seed % 2 ? '#3f9f3a' : '#2f8a33', { edge: false }); shadow(S, x, z, size, 0.15); }
function ball(S, x, z, t, color = '#ff6b35', y0 = 0) { const y = y0 + 0.22 + (y0 ? 0 : 0.3 * Math.abs(Math.sin(t * 3))); box(S, I(), [x, y, z], [0.2, 0.2, 0.2], color, { edge: false }); if (!y0) shadow(S, x, z, 0.22, 0.2); }
function stand(S, x, z, yaw, text, color = '#2ecc71') {   // a market stall with an awning
  const X = chain(T(x, 0, z), Ry(yaw));
  box(S, X, [0, 0.45, 0], [1.1, 0.45, 0.45], '#a66a3b', { edge: false });
  box(S, X, [0, 0.92, 0], [1.15, 0.03, 0.5], '#c48a3f', { edge: false });
  for (const sx of [-1, 1]) box(S, X, [sx * 1.05, 1.4, -0.4], [0.04, 0.5, 0.04], '#555', { edge: false });
  box(S, X, [0, 1.95, 0], [1.25, 0.05, 0.6], color, { edge: false });
  for (let i = 0; i < 5; i++) box(S, X, [-1.0 + i * 0.5, 1.82, 0.58], [0.25, 0.1, 0.02], i % 2 ? '#fff' : color, { edge: false }, 0.01);
  for (let i = 0; i < 6; i++) box(S, X, [-0.8 + i * 0.32, 1.05, 0.05], [0.11, 0.1, 0.11], ['#e74c3c', '#f4c20d', '#2ecc71', '#ff8c42', '#9b59b6', '#e74c3c'][i], { edge: false });
  if (text) S.label(apply(X, [0, 2.25, 0.2]), text, { above: 0, strong: true, color: '#fff', bg: rgba(shade(color, 0.6), 0.9), size: S.u(30) });
  shadow(S, x, z, 1.3, 0.2);
}

/** Faint lines on the ground near the actors, so the floor reads as a surface (kept well in front of the camera). */
function groundLines(S, color, step = 1, x0 = -10, x1 = 10, z0 = -1, z1 = 3.6, alpha = 0.18) {
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) S.line([x, 0.002, z0], [x, 0.002, z1], color, 0.012, alpha, null, 0.001);
  for (let z = Math.ceil(z0 / step) * step; z <= z1; z += step) S.line([x0, 0.002, z], [x1, 0.002, z], color, 0.012, alpha, null, 0.001);
}
function drawSet(S, set, time, t) {
  const X = I();
  switch (set) {
    case 'street': {
      // pavement in front (z 0..1.6 is where actors stand), road behind the kerb towards the camera? No: road at the back,
      // shops behind the road, so characters act on the wide pavement in front.
      strip(S, -14, 14, -1.9, -1.1, '#5b5e66', 0.005, 0.012);          // road
      for (let i = -7; i < 7; i++) strip(S, i * 2 + 0.3, i * 2 + 1.1, -1.53, -1.47, '#f1f1f1', 0.02, 0.005);   // dashes
      strip(S, -14, 14, -1.1, -1.0, '#c9c9c9', 0.0, 0.06);              // kerb
      groundLines(S, '#ffffff', 1, -10, 10, -0.9, 3.6, 0.14);           // pavement slabs
      // buildings along the far side of the road
      const B = [[-6.5, 2.6, 3.2, '#f28c8c'], [-3.2, 3.4, 4.6, '#f6d365'], [0.3, 3.2, 3.8, '#8ecae6'], [3.8, 3.0, 5.2, '#b5ead7'], [7.2, 3.2, 3.4, '#ffb4a2']];
      B.forEach(([x, w, h, c], i) => building(S, x, -3.9, w, h, 2.4, c, true, i));
      // shop fronts: doors and awnings
      B.forEach(([x, w, h, c], i) => {
        quad(S, [[x - 0.4, 0, -2.69], [x + 0.4, 0, -2.69], [x + 0.4, 1.1, -2.69], [x - 0.4, 1.1, -2.69]], '#5b3a1c', { edge: false }, 0.02);
        box(S, X, [x, 1.3, -2.45], [w / 2 - 0.15, 0.04, 0.3], ['#e74c3c', '#2ecc71', '#3498db', '#f39c12', '#9b59b6'][i], { edge: false });
      });
      for (const x of [-4.8, 1.8, 5.6]) lamp(S, x, -0.6, time);
      for (const x of [-7.5, 8]) tree(S, x, -0.4, 0.9, 1);
      break;
    }
    case 'park': {
      strip(S, -14, 14, -2.6, -1.8, '#d8c7a3', 0.005, 0.012);           // path
      for (let i = -5; i < 5; i++) strip(S, i * 2, i * 2 + 1, -1.7, 3.8, '#000000', 0.001, 0.001, { alpha: 0.05 });   // mown stripes
      const trees = [[-5, -4.5, 1.3], [-2.2, -5, 1.1], [1.5, -4.6, 1.4], [4.6, -5.2, 1.0], [7.5, -4.2, 1.2], [-7.8, -3.5, 1.0], [9, -2.8, 0.9]];
      trees.forEach(([x, z, s], i) => tree(S, x, z, s, i));
      for (const [x, z] of [[-3.5, -3.1], [3.2, -3.2], [6.5, -2.9]]) bush(S, x, z, 0.4, x > 0 ? 1 : 0);
      fence(S, 0, -6.4, 0, 20, '#e8e3d6');
      break;
    }
    case 'classroom': {
      // back wall and side walls (large quads), a board on the back wall, a window on the left
      quad(S, [[-8, 0, -4], [8, 0, -4], [8, 3.6, -4], [-8, 3.6, -4]], '#efe6cf', { edge: false });
      quad(S, [[-8, 0, 6], [-8, 0, -4], [-8, 3.6, -4], [-8, 3.6, 6]], '#e6dcc3', { edge: false });
      quad(S, [[8, 0, -4], [8, 0, 6], [8, 3.6, 6], [8, 3.6, -4]], '#e6dcc3', { edge: false });
      quad(S, [[-7.99, 1.2, -1.5], [-7.99, 1.2, 1.5], [-7.99, 3.0, 1.5], [-7.99, 3.0, -1.5]], time === 'night' ? '#1b2b55' : '#bfe4ff', { edge: false, lumBias: 0.3 }, 0.02);
      strip(S, -8, 8, -4, -3.9, '#8a6a46', 0, 0.12);
      groundLines(S, '#000000', 0.8, -8, 8, -3.8, 3.8, 0.08);
      // desks in two rows, chairs behind them
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { const x = -2.4 + c * 2.4, z = -1.9 + r * 1.7; desk(S, x, z, 0); chair(S, x, z + 0.75, 0, ['#3b6cff', '#e74c3c', '#f4c20d'][c]); }
      desk(S, 0, -3.1, 0, '#8a5a30', 0.9);
      break;
    }
    case 'home': {
      quad(S, [[-8, 0, -4], [8, 0, -4], [8, 3.4, -4], [-8, 3.4, -4]], '#d9c9b8', { edge: false });
      quad(S, [[-8, 0, 6], [-8, 0, -4], [-8, 3.4, -4], [-8, 3.4, 6]], '#cdbba9', { edge: false });
      quad(S, [[8, 0, -4], [8, 0, 6], [8, 3.4, 6], [8, 3.4, -4]], '#cdbba9', { edge: false });
      quad(S, [[-1.2, 1.3, -3.99], [1.4, 1.3, -3.99], [1.4, 2.9, -3.99], [-1.2, 2.9, -3.99]], time === 'night' ? '#1b2b55' : '#bfe4ff', { edge: false, lumBias: 0.3 }, 0.02);
      groundLines(S, '#000000', 0.6, -8, 8, -3.8, 3.8, 0.1);
      strip(S, -3.5, 3.5, -2.6, 0.4, '#b23a48', 0.004, 0.012);          // rug
      // sofa
      sofa(S, -3.2, -2.8, 0, '#4e6fb3');
      // TV on a stand
      box(S, X, [3.4, 0.3, -3.3], [0.9, 0.3, 0.3], '#5a3b20', { edge: false }); box(S, X, [3.4, 1.15, -3.35], [0.8, 0.5, 0.05], '#1b1b1b', { edge: false });
      quad(S, [[2.68, 0.72, -3.29], [4.12, 0.72, -3.29], [4.12, 1.58, -3.29], [2.68, 1.58, -3.29]], '#3fa9ff', { edge: false, lumBias: 0.35 }, 0.02);
      box(S, X, [-3.2, 0.42, -1.2], [0.5, 0.03, 0.3], '#8a5a30', { edge: false });
      box(S, X, [0.4, 0.8, -3.6], [0.5, 0.05, 0.25], '#8a5a30', { edge: false });   // shelf
      break;
    }
    case 'stage': {
      box(S, X, [0, 0.25, -1.5], [6, 0.25, 3], '#6b4a2b', { edge: false });
      quad(S, [[-9, 0, -4.6], [9, 0, -4.6], [9, 4.2, -4.6], [-9, 4.2, -4.6]], '#8f1d2c', { edge: false });
      for (let i = -8; i <= 8; i++) box(S, X, [i * 1.05, 2.1, -4.5], [0.3, 2.1, 0.08], i % 2 ? '#a3222f' : '#7a1522', { edge: false });
      for (const sx of [-1, 1]) box(S, X, [sx * 6.3, 2.1, -2.4], [0.35, 2.1, 1.9], '#9b2030', { edge: false });
      for (let i = -2; i <= 2; i++) box(S, X, [i * 2.2, 4.0, -2], [0.14, 0.14, 0.14], '#fff6c8', { edge: false, lumBias: 0.6 });
      break;
    }
    case 'bedroom': {
      const wt = time === 'night' ? '#4a3d35' : '#d9c9b8', ws = time === 'night' ? '#3d322c' : '#cdbba9';
      quad(S, [[-8, 0, -4], [8, 0, -4], [8, 3.2, -4], [-8, 3.2, -4]], wt, { edge: false });
      quad(S, [[-8, 0, 6], [-8, 0, -4], [-8, 3.2, -4], [-8, 3.2, 6]], ws, { edge: false });
      quad(S, [[8, 0, -4], [8, 0, 6], [8, 3.2, 6], [8, 3.2, -4]], ws, { edge: false });
      quad(S, [[-3.6, 1.3, -3.99], [-1.6, 1.3, -3.99], [-1.6, 2.7, -3.99], [-3.6, 2.7, -3.99]], time === 'night' ? '#101a3a' : '#bfe4ff', { edge: false, lumBias: 0.3 }, 0.02);
      if (time === 'night') { // moonlight through the window
        box(S, X, [-2.6, 2.0, -3.96], [1.0, 0.04, 0.02], '#7d7363', { edge: false }, 0.03); box(S, X, [-2.6, 2.0, -3.96], [0.04, 0.7, 0.02], '#7d7363', { edge: false }, 0.03);
      }
      groundLines(S, '#000000', 0.6, -8, 8, -3.8, 3.8, 0.1);
      bed(S, -2.4, -2.4, 0, '#6b4e8c');
      box(S, X, [-0.5, 0.3, -3.4], [0.3, 0.3, 0.3], '#5a3b20', { edge: false });   // nightstand
      door(S, 3.2, -3.98, 0, false, '#4a2e17');
      break;
    }
    case 'woods': {
      // a dark forest with a path to a small hut
      strip(S, -0.6, 0.6, -2.6, 4, '#3d3326', 0.004, 0.01);
      const ts = [[-6.5, -4.2, 1.5], [-4.2, -5.5, 1.3], [-2.6, -3.6, 1.2], [2.6, -3.8, 1.3], [4.4, -5.4, 1.5], [6.6, -4.0, 1.2], [-8, -2.4, 1.1], [8.2, -2.2, 1.3], [-5.2, -1.2, 0.9], [5.6, -0.9, 1.0], [-7.5, 0.6, 1.0], [7.8, 0.9, 1.0]];
      ts.forEach(([x, z, k], i) => darkTree(S, x, z, k, i));
      hut(S, 0, -3.8);
      break;
    }
    case 'cabin': {
      const wt = time === 'night' ? '#2a1c12' : '#4a3220', ws = time === 'night' ? '#22160e' : '#3f2a1b';
      quad(S, [[-8, 0, -4], [8, 0, -4], [8, 3.0, -4], [-8, 3.0, -4]], wt, { edge: false });
      quad(S, [[-8, 0, 6], [-8, 0, -4], [-8, 3.0, -4], [-8, 3.0, 6]], ws, { edge: false });
      quad(S, [[8, 0, -4], [8, 0, 6], [8, 3.0, 6], [8, 3.0, -4]], ws, { edge: false });
      for (let y = 0.5; y < 3; y += 0.5) quad(S, [[-8, y, -3.99], [8, y, -3.99], [8, y + 0.03, -3.99], [-8, y + 0.03, -3.99]], '#1a100a', { edge: false }, 0.02);   // log seams
      groundLines(S, '#000000', 0.5, -8, 8, -3.8, 3.8, 0.16);
      quad(S, [[2.2, 1.2, -3.99], [3.4, 1.2, -3.99], [3.4, 2.1, -3.99], [2.2, 2.1, -3.99]], '#0a1024', { edge: false, lumBias: 0.1 }, 0.02);   // a black window
      door(S, -3.0, -3.98, 0, false, '#2e1c0f');
      break;
    }
    case 'black': break;
    default: {
      // void: a wide platform with a soft grid, for abstract moments
      S.floor(0.001, 8, 10);
    }
  }
}

function sofa(S, x, z, yaw, color = '#4e6fb3') {
  const X = chain(T(x, 0, z), Ry(yaw));
  box(S, X, [0, SEAT / 2, 0], [1.2, SEAT / 2, 0.5], color, { edge: false }); box(S, X, [0, 0.72, -0.4], [1.2, 0.32, 0.12], color, { edge: false });
  for (const sx of [-1, 1]) box(S, X, [sx * 1.2, 0.36, 0], [0.12, 0.26, 0.5], shade(color, 0.8), { edge: false });
  shadow(S, x, z, 1.4, 0.18);
}
function door(S, x, z, yaw, open = false, color = '#4a2e17') {
  const X = chain(T(x, 0, z), Ry(yaw));
  box(S, X, [0, 1.1, 0.0], [0.62, 1.1, 0.05], shade(color, 0.6), { edge: false }, 0.01);            // frame
  const panel = open ? chain(X, about([-0.55, 0, 0.08], Ry(-1.2))) : X;
  box(S, panel, [0, 1.05, 0.08], [0.55, 1.05, 0.03], color, { edge: false }, 0.02);
  box(S, panel, [0.4, 1.05, 0.13], [0.05, 0.05, 0.03], '#c9a24a', { edge: false }, 0.03);           // knob
}
function darkTree(S, x, z, size = 1, seed = 0) {
  const X = I(), h = 1.4 * size;
  box(S, X, [x, h / 2, z], [0.14 * size, h / 2, 0.14 * size], '#2a1c12', { edge: false });
  const g = ['#15301a', '#1b3a1e', '#102614'];
  box(S, X, [x, h + 0.6 * size, z], [0.7 * size, 0.55 * size, 0.7 * size], g[seed % 3], { edge: false });
  box(S, X, [x + 0.1 * size, h + 1.35 * size, z - 0.1 * size], [0.45 * size, 0.35 * size, 0.45 * size], g[(seed + 1) % 3], { edge: false });
}
function hut(S, x, z) {
  const X = I();
  box(S, X, [x, 0.9, z], [1.4, 0.9, 1.1], '#3a2a1a', { edge: false });
  box(S, X, [x, 1.95, z], [1.65, 0.16, 1.35], '#241810', { edge: false });
  box(S, X, [x, 2.3, z], [1.1, 0.22, 0.95], '#2c1d13', { edge: false });
  quad(S, [[x - 0.35, 0, z + 1.11], [x + 0.35, 0, z + 1.11], [x + 0.35, 1.3, z + 1.11], [x - 0.35, 1.3, z + 1.11]], '#120b06', { edge: false }, 0.02);
  quad(S, [[x + 0.6, 0.8, z + 1.11], [x + 1.1, 0.8, z + 1.11], [x + 1.1, 1.3, z + 1.11], [x + 0.6, 1.3, z + 1.11]], '#ffcf5a', { edge: false, lumBias: 0.7 }, 0.02);
  shadow(S, x, z, 1.8, 0.25);
}
function photo(S, x, z, yaw, y = 0.9, color = '#3a2a1a') {
  const X = chain(T(x, y, z), Ry(yaw));
  box(S, X, [0, 0.3, 0], [0.34, 0.3, 0.03], color, { edge: false }, 0.01);
  box(S, X, [0, 0.3, 0.035], [0.27, 0.23, 0.005], '#d9d2c0', { edge: false }, 0.02);
  // two tiny figures in the picture
  box(S, X, [-0.08, 0.26, 0.042], [0.05, 0.12, 0.004], '#8e44ad', { edge: false }, 0.03); box(S, X, [-0.08, 0.42, 0.042], [0.04, 0.04, 0.004], '#f3c9a4', { edge: false }, 0.03);
  box(S, X, [0.09, 0.25, 0.042], [0.05, 0.13, 0.004], '#2f7cf6', { edge: false }, 0.03); box(S, X, [0.09, 0.42, 0.042], [0.04, 0.04, 0.004], '#d9a070', { edge: false }, 0.03);
}
function book(S, x, z, yaw, y = 0, color = '#5a2d0c', open = false) {
  const X = chain(T(x, y, z), Ry(yaw));
  box(S, X, [0, 0.04, 0], [0.32, 0.04, 0.42], color, { edge: false }, 0.01);
  box(S, X, [0, 0.085, 0], [0.29, 0.008, 0.39], '#efe4c8', { edge: false }, 0.02);
  if (open) for (let i = 0; i < 5; i++) box(S, X, [-0.1 + (i % 2) * 0.1, 0.1, -0.14 + i * 0.07], [0.09 + (i % 3) * 0.03, 0.002, 0.006], '#3a1a1a', { edge: false }, 0.03);
}
function stain(S, x, z, size = 0.5, color = '#5e0a0a') {
  S.prism([[x - size, z - size * 0.6], [x + size * 0.8, z - size * 0.9], [x + size, z + size * 0.5], [x - size * 0.3, z + size * 0.9]], 0.003, 0.004, color, { edge: false });
  S.prism([[x + size * 0.9, z + size * 0.5], [x + size * 1.3, z + size * 0.3], [x + size * 1.2, z + size * 0.9]], 0.003, 0.004, color, { edge: false });
}
function axeProp(S, x, z, yaw) {
  const X = chain(T(x, 0, z), Ry(yaw));
  box(S, X, [0, 0.05, 0], [0.5, 0.03, 0.03], '#6b4a2a', { edge: false }); box(S, X, [0.45, 0.14, 0], [0.12, 0.14, 0.02], '#9aa0a6', { edge: false });
}
function candle(S, x, z, t, y = 0) {
  const X = I();
  box(S, X, [x, y + 0.14, z], [0.04, 0.14, 0.04], '#f3ead0', { edge: false }, 0.01);
  box(S, X, [x, y + 0.34, z], [0.045, 0.06 + 0.02 * Math.sin(t * 23), 0.045], '#ffb830', { edge: false, lumBias: 0.8 }, 0.02);
}
function dust(S, x, z, size = 0.6) {
  for (let i = 0; i < 9; i++) { const a = i * 2.4, r = size * (0.2 + 0.08 * (i % 4)); box(S, I(), [x + Math.cos(a) * r, 0.05 + 0.02 * (i % 3), z + Math.sin(a) * r * 0.7], [0.07 + 0.02 * (i % 3), 0.05, 0.06], i % 2 ? '#8a8378' : '#6f685e', { edge: false }); }
}
function drawProp(S, p, t, time) {
  const x = Number(p.pos?.[0]) || 0, z = Number(p.pos?.[1]) || 0, yaw = deg(p.yaw), c = col(p.color, null);
  switch (p.type) {
    case 'sign': return signPost(S, x, z, yaw, p.text, c || '#2ecc71', col(p.textColor, '#fff'));
    case 'bench': return bench(S, x, z, yaw, c || '#b5793f');
    case 'chair': return chair(S, x, z, yaw, c || '#3b6cff');
    case 'desk': return desk(S, x, z, yaw, c || '#d9a55e');
    case 'table': return desk(S, x, z, yaw, c || '#8a5a30', 0.8);
    case 'tree': return tree(S, x, z, Number(p.size) || 1, Math.round(x * 3) & 3);
    case 'crate': return crate(S, x, z, yaw, c || '#c48a3f', Number(p.size) || 0.35, Number(p.y) || 0);
    case 'car': return car(S, x, z, yaw, c || '#e74c3c');
    case 'lamp': return lamp(S, x, z, time);
    case 'podium': return podium(S, x, z, yaw, c || '#7a4a2a');
    case 'bed': return bed(S, x, z, yaw, c || '#3b7dd8');
    case 'board': return board(S, x, z, yaw, p.text, c || '#1f5a3a');
    case 'fence': return fence(S, x, z, yaw, Number(p.size) || 3, c || '#e8e3d6');
    case 'bush': return bush(S, x, z, Number(p.size) || 0.4, Math.round(x * 3) & 1);
    case 'ball': return ball(S, x, z, t, c || '#ff6b35', Number(p.y) || 0);
    case 'stand': return stand(S, x, z, yaw, p.text, c || '#2ecc71');
    case 'text': return S.label([x, Number(p.y) || 1.6, z], p.text || '', { above: 0, strong: true, color: col(p.textColor, '#fff'), bg: c ? rgba(c, 0.92) : 'rgba(0,0,0,0.75)', size: S.u(Number(p.size) ? 30 * Number(p.size) : 34) });
    case 'photo': return photo(S, x, z, yaw, Number(p.y) || 0.9, c || '#3a2a1a');
    case 'book': return book(S, x, z, yaw, Number(p.y) || 0, c || '#5a2d0c', !!p.open);
    case 'stain': return stain(S, x, z, Number(p.size) || 0.5, c || '#5e0a0a');
    case 'door': return door(S, x, z, yaw, !!p.open, c || '#4a2e17');
    case 'axe': return axeProp(S, x, z, yaw);
    case 'candle': return candle(S, x, z, t, Number(p.y) || 0);
    case 'dust': return dust(S, x, z, Number(p.size) || 0.6);
    case 'sofa': return sofa(S, x, z, yaw, c || '#4e6fb3');
  }
}

/** Camera options for the engine Scene, for this visual at local time t (with the optional slow move). */
export function storyCamera(v, t, duration, portrait) {
  const c = (v && v.camera) || {};
  let azimuth = Number.isFinite(Number(c.azimuth)) ? Number(c.azimuth) : -0.35;
  let elevation = Number.isFinite(Number(c.elevation)) ? Number(c.elevation) : 0.2;
  let distance = Number.isFinite(Number(c.distance)) ? Number(c.distance) : (portrait ? 7.5 : 6);
  const target = Array.isArray(c.target) && c.target.length === 3 ? c.target.map(Number) : [0, 0.75, 0];
  const p = clamp01(t / Math.max(0.5, duration));
  switch (c.move) {
    case 'push': distance *= 1 - 0.12 * p; break;
    case 'pull': distance *= 1 + 0.14 * p; break;
    case 'orbit': azimuth += 0.22 * (p - 0.5); break;
    case 'pan': target[0] += 0.9 * (p - 0.5); break;
    case 'rise': elevation += 0.12 * p; break;
  }
  // the vertical field of view is fixed, so a portrait frame needs a wider one to keep the set in view
  const fov = Number.isFinite(Number(c.fov)) ? Number(c.fov) : (portrait ? 1.05 : 0.8);
  return { azimuth, elevation, distance, target, fov };
}

/** Draws one story frame into an engine Scene S (sky and ground directly, then the depth-sorted 3D items). Call S.flush() after. */
export function drawStory(S, v, t, duration) {
  const set = STORY_SETS.includes(v.set) ? v.set : 'street', time = ['day', 'sunset', 'night'].includes(v.time) ? v.time : 'day';
  S.cloudShift = t;
  sky(S, time, set);
  drawSet(S, set, time, t);
  for (const p of v.props || []) if (p && STORY_PROPS.includes(p.type)) drawProp(S, p, t, time);
  const actors = v.actors || [];
  actors.forEach((a, i) => {
    const st = actorState(a, t);
    const look = st.hold !== undefined ? { ...(a.look || {}), hold: st.hold } : (a.look || {});
    const root = chain(T(st.pos[0], st.y, st.pos[1]), Ry(st.yaw));
    const phase = st.dist * TAU / 1.1 + (st.action === 'walk' || st.action === 'run' ? 0 : 0);
    const walkingInPlace = (st.action === 'walk' || st.action === 'run') && st.dist === 0;
    const ph = walkingInPlace ? t * (st.action === 'run' ? 11 : 7) : phase;
    if (set !== 'black') shadow(S, st.pos[0], st.pos[1], (st.action === 'lie' || st.action === 'sleep' ? 0.9 : 0.42) * (look.scale || 1), 0.3);
    const top = drawFigure(S, look, st.action, t, ph, root, st.face, i * 1.7);
    if (st.say) S.label(top, st.say, { above: 0.1, strong: true, color: '#1b1b1b', bg: 'rgba(255,255,255,0.95)', size: S.u(30) });
  });
  S.storyOverlay = { tint: v.tint || null, tintAlpha: v.tintAlpha, vignette: !!v.vignette, flash: v.flash };
  // keep speech bubbles and sign text inside the frame
  const ctx = S.ctx;
  for (const l of S.labels) {
    const px = (l.size || S.u(l.strong ? 36 : 28)) * clamp01(0.6 + 2.2 / Math.max(1, l.q.z / 3));
    ctx.font = S.font(px, 700);
    const half = ctx.measureText(l.text).width / 2 + px * 0.55 + S.u(12);
    l.q.x = Math.min(S.w - half, Math.max(half, l.q.x));
    l.q.y = Math.max(px, l.q.y);
  }
}

// ---------- sanitiser: keeps a storyboard visual inside the limits the renderer handles ----------
const str = (v, n) => v == null ? null : String(v).replace(/\s+/g, ' ').trim().slice(0, n) || null;
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const vec2 = (v, d = [0, 0]) => Array.isArray(v) && v.length >= 2 ? [num(v[0], 0, -14, 14), num(v[1], 0, -6, 4)] : d;
function cleanLook(l) {
  l = l && typeof l === 'object' ? l : {};
  const outfit = OUTFITS[l.outfit] || null;
  return { skin: str(l.skin, 16), shirt: str(l.shirt, 16) || (outfit && outfit.shirt), pants: str(l.pants, 16) || (outfit && outfit.pants), hair: STORY_HAIR.includes(l.hair) ? l.hair : 'short',
    hairColor: str(l.hairColor, 16), hat: l.hat === true ? true : str(l.hat, 16), glasses: !!l.glasses, sleeves: l.sleeves === 'long' ? 'long' : null, logo: str(l.logo, 16), scale: l.scale != null ? num(l.scale, 1, 0.4, 1.6) : undefined, hold: STORY_ITEMS.includes(l.hold) ? l.hold : (l.hold === null ? null : undefined) };
}
export function cleanStory(v) {
  const out = { set: STORY_SETS.includes(v.set) ? v.set : 'street', time: ['day', 'sunset', 'night'].includes(v.time) ? v.time : 'day', headline: str(v.headline, 40), actors: [], props: [], camera: null,
    tint: str(v.tint, 16), tintAlpha: v.tintAlpha != null ? num(v.tintAlpha, 0.18, 0, 0.6) : undefined, vignette: !!v.vignette, flash: v.flash != null ? num(v.flash, 0, 0, 600) : undefined };
  const c = v.camera && typeof v.camera === 'object' ? v.camera : null;
  if (c) out.camera = { azimuth: c.azimuth != null ? num(c.azimuth, -0.35, -1.4, 1.4) : undefined, elevation: c.elevation != null ? num(c.elevation, 0.2, 0.02, 1.2) : undefined, distance: c.distance != null ? num(c.distance, 7, 2.5, 20) : undefined,
    target: Array.isArray(c.target) && c.target.length === 3 ? [num(c.target[0], 0, -14, 14), num(c.target[1], 0.75, 0, 4), num(c.target[2], 0, -6, 4)] : undefined, fov: c.fov != null ? num(c.fov, 0.9, 0.4, 1.5) : undefined,
    move: ['none', 'push', 'pull', 'orbit', 'pan', 'rise'].includes(c.move) ? c.move : undefined };
  for (const a of (Array.isArray(v.actors) ? v.actors : []).slice(0, 12)) {
    if (!a || typeof a !== 'object') continue;
    out.actors.push({ id: str(a.id, 24), look: cleanLook(a.look), pos: vec2(a.pos), y: a.y != null ? num(a.y, 0, 0, 3) : undefined, yaw: num(a.yaw, 0, -360, 360), action: STORY_ACTIONS.includes(a.action) ? a.action : 'idle',
      face: STORY_FACES.includes(a.face) ? a.face : 'happy', say: str(a.say, 40),
      keys: (Array.isArray(a.keys) ? a.keys : []).slice(0, 16).filter(k => k && typeof k === 'object').map(k => ({ at: num(k.at, 0, 0, 600), action: STORY_ACTIONS.includes(k.action) ? k.action : undefined, then: STORY_ACTIONS.includes(k.then) ? k.then : undefined,
        to: Array.isArray(k.to) ? vec2(k.to) : undefined, pos: Array.isArray(k.pos) ? vec2(k.pos) : undefined, dur: k.dur != null ? num(k.dur, 1, 0.1, 60) : undefined, y: k.y != null ? num(k.y, 0, 0, 3) : undefined, yaw: k.yaw != null ? num(k.yaw, 0, -360, 360) : undefined,
        face: STORY_FACES.includes(k.face) ? k.face : undefined, hold: k.hold === null ? null : (STORY_ITEMS.includes(k.hold) ? k.hold : undefined), say: k.say === null ? null : (k.say !== undefined ? str(k.say, 40) : undefined) })) });
  }
  for (const p of (Array.isArray(v.props) ? v.props : []).slice(0, 14)) {
    if (!p || typeof p !== 'object' || !STORY_PROPS.includes(p.type)) continue;
    out.props.push({ type: p.type, pos: vec2(p.pos), yaw: num(p.yaw, 0, -360, 360), text: p.text != null ? String(p.text).split('\n').slice(0, 3).map(l => l.trim().slice(0, 24)).filter(Boolean).join('\n') || null : null, color: str(p.color, 16), textColor: str(p.textColor, 16), size: p.size != null ? num(p.size, 1, 0.2, 4) : undefined, y: p.y != null ? num(p.y, 0, 0, 3) : undefined, open: !!p.open });
  }
  return out;
}

/** 2D finish after S.flush(): colour tint, vignette, a white flash at `flash` seconds (for a horror beat). */
export function storyFinish(S, t) {
  const o = S.storyOverlay; if (!o) return;
  const { ctx, w, h } = S;
  if (o.tint) { ctx.save(); ctx.fillStyle = rgba(col(o.tint, '#ff0000'), Math.min(0.6, Number(o.tintAlpha) || 0.18)); ctx.fillRect(0, 0, w, h); ctx.restore(); }
  if (o.vignette) { const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.82)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
  if (Number.isFinite(Number(o.flash))) { const d = t - Number(o.flash); if (d >= 0 && d < 0.5) { ctx.fillStyle = `rgba(255,255,255,${(1 - d / 0.5) * 0.9})`; ctx.fillRect(0, 0, w, h); } }
}
