// Modelo de cancha, sillas, reglas FIPFA y jugadas tipo.
// Unidades: metros. Eje x = largo de la cancha (0 = arco del equipo A), eje y = ancho.
// Ángulo en grados: 0 = mirando hacia la derecha (hacia el arco del equipo B).

export const COURT_PRESETS = [
  { id: 'std', label: '28 × 15 m (estándar)', L: 28, W: 15 },
  { id: 'max', label: '30 × 18 m (máximo)', L: 30, W: 18 },
  { id: 'min', label: '25 × 14 m (mínimo)', L: 25, W: 14 },
];

// FIPFA Reglas de Juego 2019, Regla 1
export const GOAL_AREA = { w: 8, d: 5 };
export const GOAL_WIDTH = 6;
export const PENALTY_DIST = 3.5;
export const CORNER = 1;
// Regla 11: 2 contra 1 dentro de 3 m del balón
export const RULE_RADIUS = 3;
// Regla 2: balón de 33 cm
export const BALL_R = 0.165;

// Huella aproximada de una silla tipo Strike Force con parachoques (vista superior)
export const CHAIR = { back: -0.42, front: 0.76, half: 0.38 };

export const PLAYER_IDS = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'];

export const defaultRoster = () => ({
  A1: { team: 'A', gk: true, num: 1, name: 'Arquero' },
  A2: { team: 'A', gk: false, num: 2, name: 'Defensor' },
  A3: { team: 'A', gk: false, num: 3, name: 'Volante' },
  A4: { team: 'A', gk: false, num: 4, name: 'Delantero' },
  B1: { team: 'B', gk: true, num: 1, name: 'Arquero' },
  B2: { team: 'B', gk: false, num: 2, name: 'Rival 2' },
  B3: { team: 'B', gk: false, num: 3, name: 'Rival 3' },
  B4: { team: 'B', gk: false, num: 4, name: 'Rival 4' },
});

export const defaultColors = () => ({
  A: { name: 'Nosotros', field: '#1f6feb', gk: '#16a34a' },
  B: { name: 'Rival', field: '#e11d48', gk: '#f5b301' },
});

export const uid = () => Math.random().toString(36).slice(2, 9);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- Geometría ----------
export function distToChair(px, py, c) {
  const r = (c.a * Math.PI) / 180;
  const dx = px - c.x, dy = py - c.y;
  const lx = dx * Math.cos(r) + dy * Math.sin(r);
  const ly = -dx * Math.sin(r) + dy * Math.cos(r);
  const cx = clamp(lx, CHAIR.back, CHAIR.front);
  const cy = clamp(ly, -CHAIR.half, CHAIR.half);
  return Math.hypot(lx - cx, ly - cy);
}

export function inOwnArea(team, p, court) {
  const y0 = court.W / 2 - GOAL_AREA.w / 2, y1 = court.W / 2 + GOAL_AREA.w / 2;
  if (p.y < y0 || p.y > y1) return false;
  return team === 'A' ? p.x <= GOAL_AREA.d : p.x >= court.L - GOAL_AREA.d;
}

// ---------- Reglas de ubicación (Regla 11) ----------
export function analyze(frame, roster, court) {
  const warnings = [];
  const flagged = new Set();
  const ball = frame.ball;
  const near = { A: [], B: [] };
  for (const id of PLAYER_IDS) {
    const p = frame.players[id];
    if (!p || p.hidden) continue;
    const info = roster[id];
    const d = distToChair(ball.x, ball.y, p) - BALL_R;
    if (d <= RULE_RADIUS) {
      const gkInArea = info.gk && inOwnArea(info.team, p, court);
      near[info.team].push({ id, gkInArea });
    }
  }
  for (const t of ['A', 'B']) {
    const o = t === 'A' ? 'B' : 'A';
    const mine = near[t].filter((n) => !n.gkInArea);
    if (mine.length >= 2 && near[o].length >= 1) {
      mine.forEach((n) => flagged.add(n.id));
      warnings.push({
        type: '2v1', team: t,
        ids: mine.map((n) => n.id),
        text: `Posible 2 contra 1: ${mine.length} jugadores del mismo equipo y ${near[o].length} rival a menos de 3 m del balón.`,
        hint: 'Sólo es falta si el segundo jugador interviene activamente en la jugada.',
      });
    }
  }
  for (const t of ['A', 'B']) {
    const inside = PLAYER_IDS.filter((id) => {
      const p = frame.players[id];
      return p && !p.hidden && roster[id].team === t && inOwnArea(t, p, court);
    });
    if (inside.length >= 3) {
      inside.forEach((id) => flagged.add(id));
      warnings.push({
        type: 'area', team: t, ids: inside,
        text: `${inside.length} jugadores dentro de su propia área de gol.`,
        hint: 'Es falta si 3 o más participan activamente al mismo tiempo con el balón en juego.',
      });
    }
  }
  return { warnings, flagged };
}

// ---------- Interpolación para animar pasos ----------
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * t;
};
export function lerpFrame(f1, f2, t) {
  const players = {};
  for (const id of PLAYER_IDS) {
    const a = f1.players[id], b = f2.players[id];
    if (!a || !b) { players[id] = (t < 0.5 ? a : b) || a || b; continue; }
    players[id] = {
      x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), a: lerpAngle(a.a, b.a, t),
      hidden: t < 0.5 ? a.hidden : b.hidden,
    };
  }
  return {
    ...f1,
    players,
    ball: { x: lerp(f1.ball.x, f2.ball.x, t), y: lerp(f1.ball.y, f2.ball.y, t) },
  };
}

export function mirrorFrame(f, court) {
  const players = {};
  for (const id of PLAYER_IDS) {
    const p = f.players[id];
    players[id] = p && { ...p, x: court.L - p.x, a: (180 - p.a + 360) % 360 };
  }
  return {
    ...f,
    players,
    ball: { x: court.L - f.ball.x, y: f.ball.y },
    arrows: f.arrows.map((a) => ({ ...a, x1: court.L - a.x1, x2: court.L - a.x2 })),
  };
}

// ---------- Jugadas tipo (definidas sobre cancha 28 × 15) ----------
function F(A, B, ball, arrows = [], note = '') {
  const players = {};
  ['A1', 'A2', 'A3', 'A4'].forEach((id, i) => (players[id] = { x: A[i][0], y: A[i][1], a: A[i][2] ?? 0 }));
  ['B1', 'B2', 'B3', 'B4'].forEach((id, i) => (players[id] = { x: B[i][0], y: B[i][1], a: B[i][2] ?? 180 }));
  return {
    id: uid(), note, players,
    ball: { x: ball[0], y: ball[1] },
    arrows: arrows.map(([kind, x1, y1, x2, y2]) => ({ id: uid(), kind, x1, y1, x2, y2 })),
  };
}

export function scaleFrame(f, court) {
  const sx = court.L / 28, sy = court.W / 15;
  const players = {};
  for (const id of PLAYER_IDS) {
    const p = f.players[id];
    players[id] = p && { ...p, x: p.x * sx, y: p.y * sy };
  }
  return {
    ...f, id: uid(), players,
    ball: { x: f.ball.x * sx, y: f.ball.y * sy },
    arrows: f.arrows.map((a) => ({ ...a, id: uid(), x1: a.x1 * sx, x2: a.x2 * sx, y1: a.y1 * sy, y2: a.y2 * sy })),
  };
}

export const blankFrame = () =>
  F(
    [[1.6, 7.5, 0], [7, 7.5, 0], [11, 4.5, 0], [11, 10.5, 0]],
    [[26.4, 7.5, 180], [21, 7.5, 180], [17, 4.5, 180], [17, 10.5, 180]],
    [14, 7.5],
    [],
    'Posiciones base. Arrastrá las sillas para armar tu jugada.'
  );

export function presetPlays() {
  return [
    {
      id: uid(), preset: true, free: true, name: 'Pizarra libre',
      description: 'Posiciones base para armar tus propias jugadas.',
      frames: [blankFrame()],
    },
  ];
}

// ---------- Archivos de jugadas (descargar / subir) ----------
export const FILE_APP = 'pizarra-powerchair';

export function buildExport({ plays, court, roster, colors }) {
  return {
    app: FILE_APP,
    version: 1,
    exportedAt: new Date().toISOString(),
    court, roster, colors,
    // eslint-disable-next-line no-unused-vars
    plays: plays.map(({ preset, free, ...p }) => p),
  };
}

const num = (v, d = 0) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
};
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

function cleanRoster(r) {
  if (!r || typeof r !== 'object') return null;
  const out = {};
  for (const id of PLAYER_IDS) {
    const p = r[id];
    if (!p || (p.team !== 'A' && p.team !== 'B')) return null;
    out[id] = { team: id[0], gk: !!p.gk, num: str(String(p.num ?? ''), 3), name: str(p.name, 40) };
  }
  for (const t of ['A', 'B']) {
    const ids = PLAYER_IDS.filter((id) => id[0] === t);
    if (ids.filter((id) => out[id].gk).length !== 1) ids.forEach((id, i) => (out[id].gk = i === 0));
  }
  return out;
}

function cleanColors(c) {
  if (!c || typeof c !== 'object') return null;
  const out = {};
  for (const t of ['A', 'B']) {
    const x = c[t];
    if (!x || !isHex(x.field) || !isHex(x.gk)) return null;
    out[t] = { name: str(x.name, 40) || (t === 'A' ? 'Nosotros' : 'Rival'), field: x.field, gk: x.gk };
  }
  return out;
}

// Lee un archivo de jugadas, lo valida y adapta las posiciones al tamaño de cancha actual.
export function parseImport(text, court) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('El archivo no es un archivo de jugadas válido (JSON).'); }
  const rawPlays = Array.isArray(data) ? data : Array.isArray(data?.plays) ? data.plays : data?.frames ? [data] : null;
  if (!rawPlays || !rawPlays.length) throw new Error('El archivo no tiene jugadas.');
  const src = data?.court && num(data.court.L) > 0 && num(data.court.W) > 0
    ? { L: num(data.court.L), W: num(data.court.W) } : court;
  const sx = court.L / src.L, sy = court.W / src.W;
  const base = scaleFrame(blankFrame(), court);
  const plays = [];
  for (const p of rawPlays.slice(0, 200)) {
    if (!p || !Array.isArray(p.frames) || !p.frames.length) continue;
    const frames = p.frames.slice(0, 60).map((f) => {
      const players = {};
      for (const id of PLAYER_IDS) {
        const q = f?.players?.[id];
        const b = base.players[id];
        players[id] = q
          ? { x: clamp(num(q.x, b.x / sx) * sx, -1, court.L + 1), y: clamp(num(q.y, b.y / sy) * sy, -1, court.W + 1), a: num(q.a, b.a), ...(q.hidden ? { hidden: true } : {}) }
          : { ...b };
      }
      return {
        id: uid(),
        note: str(f?.note, 500),
        players,
        ball: { x: clamp(num(f?.ball?.x, src.L / 2) * sx, -1, court.L + 1), y: clamp(num(f?.ball?.y, src.W / 2) * sy, -1, court.W + 1) },
        arrows: (Array.isArray(f?.arrows) ? f.arrows : [])
          .filter((a) => a && (a.kind === 'move' || a.kind === 'pass'))
          .slice(0, 50)
          .map((a) => ({ id: uid(), kind: a.kind, x1: num(a.x1) * sx, y1: num(a.y1) * sy, x2: num(a.x2) * sx, y2: num(a.y2) * sy })),
      };
    });
    plays.push({
      id: uid(),
      name: str(p.name, 80).trim() || 'Jugada importada',
      description: str(p.description, 2000),
      frames,
    });
  }
  if (!plays.length) throw new Error('No encontré jugadas válidas en el archivo.');
  return { plays, roster: cleanRoster(data?.roster), colors: cleanColors(data?.colors) };
}
