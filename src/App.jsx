import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  COURT_PRESETS, GOAL_AREA, GOAL_WIDTH, PENALTY_DIST, CORNER, RULE_RADIUS, BALL_R,
  PLAYER_IDS, defaultRoster, defaultColors, uid, clamp, analyze, lerpFrame, mirrorFrame,
  presetPlays, scaleFrame, blankFrame, parseImport, buildExport,
} from './model.js';

const STORE_KEY = 'pcf-pizarra-v1';
const M = 1.6; // margen alrededor de la cancha (área de autoridades)
const SEG_MS = 1500;

const STORE_VERSION = 2;
function loadStore() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
  // Se eliminan las jugadas tipo de ejemplo; quedan la Pizarra libre y las jugadas propias
  if (s && Array.isArray(s.plays)) {
    const before = s.plays.length;
    s.plays = s.plays.filter((p) => p.free || p.name === 'Pizarra libre' || !p.preset);
    if (s.plays.length !== before) s.playId = null;
    if (!s.plays.length) s.plays = null;
  }
  return s;
}
function saveStore(data) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* sin almacenamiento */ }
}
const clone = (o) => JSON.parse(JSON.stringify(o));
// Pone la "Pizarra libre" primera en la lista
function freeFirst(ps) {
  const i = ps.findIndex((p) => p.free || p.name === 'Pizarra libre');
  if (i <= 0) return ps;
  return [ps[i], ...ps.slice(0, i), ...ps.slice(i + 1)];
}
// Descarga un texto como archivo en la computadora
function downloadFile(fileName, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const safeName = (s) => (s || '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'jugadas-powerchair';
const pasos = (n) => `${n} ${n === 1 ? 'paso' : 'pasos'}`;

// ---------------- Cancha ----------------
function Court({ L, W }) {
  const ga0 = W / 2 - GOAL_AREA.w / 2;
  const g0 = W / 2 - GOAL_WIDTH / 2, g1 = W / 2 + GOAL_WIDTH / 2;
  const line = { stroke: '#fff', strokeWidth: 0.06, fill: 'none' };
  const X = (x, y) => (
    <g stroke="#fff" strokeWidth={0.06}>
      <line x1={x - 0.15} y1={y - 0.15} x2={x + 0.15} y2={y + 0.15} />
      <line x1={x - 0.15} y1={y + 0.15} x2={x + 0.15} y2={y - 0.15} />
    </g>
  );
  const planks = [];
  for (let y = 0.6; y < W; y += 0.6) planks.push(<line key={y} x1={0} y1={y} x2={L} y2={y} stroke="rgba(90,50,20,.10)" strokeWidth={0.02} />);
  const post = (x, y) => <circle cx={x} cy={y} r={0.14} fill="#ff6a00" stroke="#7a2e00" strokeWidth={0.03} />;
  return (
    <g>
      <rect x={-M} y={-M} width={L + 2 * M} height={W + 2 * M} fill="#3c4f45" />
      <rect x={0} y={0} width={L} height={W} fill="url(#wood)" />
      {planks}
      <rect x={0} y={0} width={L} height={W} {...line} />
      <line x1={L / 2} y1={0} x2={L / 2} y2={W} {...line} />
      {X(L / 2, W / 2)}
      <rect x={0} y={ga0} width={GOAL_AREA.d} height={GOAL_AREA.w} {...line} fill="rgba(255,255,255,.06)" />
      <rect x={L - GOAL_AREA.d} y={ga0} width={GOAL_AREA.d} height={GOAL_AREA.w} {...line} fill="rgba(255,255,255,.06)" />
      {X(PENALTY_DIST, W / 2)}
      {X(L - PENALTY_DIST, W / 2)}
      <path d={`M0 ${CORNER} L${CORNER} 0 M${L - CORNER} 0 L${L} ${CORNER} M0 ${W - CORNER} L${CORNER} ${W} M${L - CORNER} ${W} L${L} ${W - CORNER}`} {...line} />
      <line x1={0} y1={g0} x2={0} y2={g1} stroke="#ff6a00" strokeWidth={0.1} />
      <line x1={L} y1={g0} x2={L} y2={g1} stroke="#ff6a00" strokeWidth={0.1} />
      {post(0, g0)}{post(0, g1)}{post(L, g0)}{post(L, g1)}
    </g>
  );
}

// ---------------- Silla ----------------
function Chair({ id, p, info, color, guard, selected, flagged, showName, onDown, onRotDown }) {
  const hx = p.x + Math.cos((p.a * Math.PI) / 180) * 1.15;
  const hy = p.y + Math.sin((p.a * Math.PI) / 180) * 1.15;
  return (
    <g className="chair">
      <g transform={`translate(${p.x} ${p.y}) rotate(${p.a})`} onPointerDown={(e) => onDown(e, id)} style={{ cursor: 'grab' }}>
        {flagged && <circle r={0.9} fill="rgba(255,138,0,.18)" stroke="#ff8a00" strokeWidth={0.07} strokeDasharray="0.22 0.12" />}
        {selected && <rect x={-0.55} y={-0.52} width={1.45} height={1.04} rx={0.15} fill="none" stroke="#fff" strokeWidth={0.05} strokeDasharray="0.15 0.1" />}
        <rect x={-0.4} y={-0.33} width={1.1} height={0.72} rx={0.12} fill="rgba(0,0,0,.25)" transform="translate(0.05 0.07)" />
        {/* ruedas motrices */}
        <rect x={-0.38} y={-0.43} width={0.44} height={0.11} rx={0.04} fill="#15181c" />
        <rect x={-0.38} y={0.32} width={0.44} height={0.11} rx={0.04} fill="#15181c" />
        {/* ruedas delanteras */}
        <rect x={0.17} y={-0.34} width={0.14} height={0.07} rx={0.03} fill="#2a2e34" />
        <rect x={0.17} y={0.27} width={0.14} height={0.07} rx={0.03} fill="#2a2e34" />
        {/* chasis */}
        <rect x={-0.4} y={-0.31} width={0.74} height={0.62} rx={0.1} fill="#30353d" />
        {/* asiento con color de camiseta */}
        <rect x={-0.33} y={-0.25} width={0.52} height={0.5} rx={0.1} fill={color} stroke="rgba(0,0,0,.4)" strokeWidth={0.025} />
        {/* respaldo */}
        <rect x={-0.41} y={-0.26} width={0.09} height={0.52} rx={0.03} fill="#14161a" />
        {/* joystick */}
        <circle cx={0.13} cy={0.3} r={0.045} fill="#0d0f12" />
        {/* parachoques (footguard) rectangular de caño */}
        <path d="M0.3,-0.37 L0.72,-0.37 L0.72,0.37 L0.3,0.37" fill="none" stroke={guard} strokeWidth={0.07} strokeLinejoin="miter" strokeLinecap="square" />
        <line x1={0.53} y1={-0.37} x2={0.53} y2={0.37} stroke={guard} strokeWidth={0.04} />
        <path d="M0.3,-0.37 L0.72,-0.37 L0.72,0.37 L0.3,0.37" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth={0.015} strokeLinejoin="miter" />
        <rect x={-0.46} y={-0.46} width={1.3} height={0.92} fill="transparent" />
      </g>
      <text x={p.x - 0.07} y={p.y + 0.01} className="num" pointerEvents="none">{info.num}</text>
      {showName && <text x={p.x} y={p.y + 0.85} className="pname" pointerEvents="none">{info.name}</text>}
      {selected && (
        <g>
          <line x1={p.x} y1={p.y} x2={hx} y2={hy} stroke="#fff" strokeWidth={0.04} />
          <circle cx={hx} cy={hy} r={0.2} fill="#fff" stroke="#111" strokeWidth={0.04}
            style={{ cursor: 'crosshair' }} onPointerDown={(e) => onRotDown(e, id)} />
          <path d={`M${hx - 0.09} ${hy} a0.09 0.09 0 1 1 0.09 0.09`} fill="none" stroke="#111" strokeWidth={0.03} pointerEvents="none" />
        </g>
      )}
    </g>
  );
}

function Arrow({ a, selected, onDown }) {
  const isPass = a.kind === 'pass';
  const col = selected ? '#ff8a00' : isPass ? '#ffffff' : '#0f172a';
  return (
    <g onPointerDown={(e) => onDown(e, a.id)} style={{ cursor: 'pointer' }}>
      <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="transparent" strokeWidth={0.5} />
      <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={col} strokeWidth={isPass ? 0.08 : 0.07}
        strokeDasharray={isPass ? 'none' : '0.3 0.18'} markerEnd={`url(#ah-${selected ? 'sel' : a.kind})`} />
    </g>
  );
}

// ---------------- App ----------------
export default function App() {
  const stored = useMemo(loadStore, []);
  const [court, setCourt] = useState(stored?.court || { L: 28, W: 15 });
  const [roster, setRoster] = useState(stored?.roster || defaultRoster());
  const [colors, setColors] = useState(stored?.colors || defaultColors());
  const [plays, setPlays] = useState(() => freeFirst(stored?.plays || presetPlays()));
  const [playId, setPlayId] = useState(null); // siempre arranca en la primera: Pizarra libre
  const [frameIdx, setFrameIdx] = useState(0);
  const [selected, setSelected] = useState(null); // {type:'player'|'ball'|'arrow', id}
  const tool = 'select'; // siempre en modo mover (sin herramientas de flechas)
  const [opts, setOpts] = useState(stored?.opts || { radius: true, names: true, warnings: true });
  const [playing, setPlaying] = useState(false);
  const [animFrame, setAnimFrame] = useState(null);
  const [modal, setModal] = useState(null); // 'export' | 'import' | 'help'
  const [confirmDel, setConfirmDel] = useState(false);
  const [draftArrow, setDraftArrow] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [loadedFile, setLoadedFile] = useState(stored?.loadedFile || null); // último archivo subido
  const svgRef = useRef(null);
  const drag = useRef(null);
  const history = useRef([]);
  const future = useRef([]);

  const play = plays.find((p) => p.id === playId) || plays[0];
  const frames = play.frames;
  const fIdx = clamp(Number.isFinite(frameIdx) ? frameIdx : 0, 0, frames.length - 1);
  const frame = frames[fIdx];
  const shown = animFrame || frame;

  useEffect(() => { if (!playId && plays[0]) setPlayId(plays[0].id); }, [playId, plays]);
  // Lleva la jugada activa a la vista dentro de la lista con scroll
  useEffect(() => {
    const ul = document.querySelector('.plays'), li = ul?.querySelector('li.on');
    if (!ul || !li) return;
    if (li.offsetTop < ul.scrollTop) ul.scrollTop = li.offsetTop;
    else if (li.offsetTop + li.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = li.offsetTop + li.offsetHeight - ul.clientHeight;
  }, [play.id, plays.length]);
  useEffect(() => {
    saveStore({ v: STORE_VERSION, court, roster, colors, plays, playId, opts, loadedFile });
    setSavedAt(new Date());
  }, [court, roster, colors, plays, playId, opts, loadedFile]);

  // ----- historial -----
  const pushHistory = useCallback(() => {
    history.current.push(clone(plays));
    if (history.current.length > 60) history.current.shift();
    future.current = [];
  }, [plays]);
  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    future.current.push(clone(plays));
    setPlays(prev);
  };
  const redo = () => {
    const nxt = future.current.pop();
    if (!nxt) return;
    history.current.push(clone(plays));
    setPlays(nxt);
  };

  const updatePlay = (fn) => setPlays((ps) => ps.map((p) => (p.id === play.id ? fn(p) : p)));
  const updateFrame = (fn) =>
    updatePlay((p) => ({ ...p, frames: p.frames.map((f, i) => (i === fIdx ? fn(f) : f)) }));
  const setPlayer = (id, patch) =>
    updateFrame((f) => ({ ...f, players: { ...f.players, [id]: { ...f.players[id], ...patch } } }));

  // ----- análisis de reglas -----
  const { warnings, flagged } = useMemo(() => analyze(shown, roster, court), [shown, roster, court]);

  // ----- coordenadas -----
  const toCourt = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  };
  const clampPos = (x, y) => ({ x: clamp(x, -1, court.L + 1), y: clamp(y, -1, court.W + 1) });

  // ----- interacción -----
  // Captura el puntero sin romper la app si el navegador la rechaza
  const capture = (e) => {
    try { svgRef.current?.setPointerCapture?.(e.pointerId); } catch { /* sin captura */ }
  };
  const startDrag = (e, d) => {
    if (playing) return;
    e.stopPropagation();
    capture(e);
    drag.current = { ...d, pushed: false };
  };
  // Corta cualquier arrastre que haya quedado colgado
  const cancelDrag = () => { drag.current = null; setDraftArrow(null); };
  const ensurePushed = () => {
    if (drag.current && !drag.current.pushed) { pushHistory(); drag.current.pushed = true; }
  };

  const onChairDown = (e, id) => {
    if (tool !== 'select') return onCourtDown(e);
    setSelected({ type: 'player', id });
    const pt = toCourt(e);
    const p = frame.players[id];
    startDrag(e, { kind: 'player', id, dx: p.x - pt.x, dy: p.y - pt.y });
  };
  const onRotDown = (e, id) => { setSelected({ type: 'player', id }); startDrag(e, { kind: 'rotate', id }); };
  const onBallDown = (e) => {
    if (tool !== 'select') return onCourtDown(e);
    setSelected({ type: 'ball' });
    const pt = toCourt(e);
    startDrag(e, { kind: 'ball', dx: frame.ball.x - pt.x, dy: frame.ball.y - pt.y });
  };
  const onArrowDown = (e, aid) => {
    if (tool !== 'select') return onCourtDown(e);
    setSelected({ type: 'arrow', id: aid });
    e.stopPropagation();
  };
  function onCourtDown(e) {
    if (playing) return;
    if (tool === 'select') { setSelected(null); return; }
    e.stopPropagation();
    const pt = toCourt(e);
    capture(e);
    drag.current = { kind: 'newArrow', x1: pt.x, y1: pt.y };
    setDraftArrow({ kind: tool, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
  }
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    // Si el botón ya no está apretado, el arrastre quedó colgado: se corta
    if (e.pointerType === 'mouse' && e.buttons === 0) { onUp(); return; }
    const pt = toCourt(e);
    if (d.kind === 'player') {
      ensurePushed();
      setPlayer(d.id, clampPos(pt.x + d.dx, pt.y + d.dy));
    } else if (d.kind === 'ball') {
      ensurePushed();
      updateFrame((f) => ({ ...f, ball: clampPos(pt.x + d.dx, pt.y + d.dy) }));
    } else if (d.kind === 'rotate') {
      ensurePushed();
      const p = frame.players[d.id];
      let a = (Math.atan2(pt.y - p.y, pt.x - p.x) * 180) / Math.PI;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      setPlayer(d.id, { a: Math.round(a) });
    } else if (d.kind === 'newArrow') {
      setDraftArrow((da) => da && { ...da, x2: pt.x, y2: pt.y });
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'newArrow' && draftArrow) {
      const len = Math.hypot(draftArrow.x2 - draftArrow.x1, draftArrow.y2 - draftArrow.y1);
      if (len > 0.4) {
        pushHistory();
        const na = { ...draftArrow, id: uid() };
        updateFrame((f) => ({ ...f, arrows: [...f.arrows, na] }));
        setSelected({ type: 'arrow', id: na.id });
      }
      setDraftArrow(null);
    }
  };

  // rueda del mouse para girar la silla seleccionada
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const h = (e) => {
      if (selected?.type !== 'player') return;
      e.preventDefault();
      const step = e.shiftKey ? 5 : 15;
      const p = frame.players[selected.id];
      setPlayer(selected.id, { a: Math.round(p.a + Math.sign(e.deltaY) * step) });
    };
    svg.addEventListener('wheel', h, { passive: false });
    return () => svg.removeEventListener('wheel', h);
  });

  const rotateSelected = (deg) => {
    if (selected?.type !== 'player') return;
    pushHistory();
    setPlayer(selected.id, { a: Math.round(frame.players[selected.id].a + deg) });
  };
  const deleteSelected = () => {
    if (!selected) return;
    pushHistory();
    if (selected.type === 'arrow') {
      updateFrame((f) => ({ ...f, arrows: f.arrows.filter((a) => a.id !== selected.id) }));
      setSelected(null);
    } else if (selected.type === 'player') {
      setPlayer(selected.id, { hidden: true });
      setSelected(null);
    }
  };

  // teclado
  useEffect(() => {
    const h = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (e.key === 'Escape') { cancelDrag(); setSelected(null); setModal(null); return; }
      if (e.key === 'q' || e.key === 'Q') return rotateSelected(e.shiftKey ? -5 : -15);
      if (e.key === 'e' || e.key === 'E') return rotateSelected(e.shiftKey ? 5 : 15);
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return deleteSelected(); }
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (arrows && selected && selected.type !== 'arrow') {
        e.preventDefault();
        const s = e.shiftKey ? 0.5 : 0.1;
        pushHistory();
        if (selected.type === 'ball') updateFrame((f) => ({ ...f, ball: clampPos(f.ball.x + arrows[0] * s, f.ball.y + arrows[1] * s) }));
        else { const p = frame.players[selected.id]; setPlayer(selected.id, clampPos(p.x + arrows[0] * s, p.y + arrows[1] * s)); }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  // ----- animación de pasos -----
  useEffect(() => {
    if (!playing) return;
    const segs = frames.length - 1;
    if (segs < 1) { setPlaying(false); return; }
    let raf;
    let t0 = null; // se toma del primer cuadro: el reloj del navegador puede venir unas milésimas atrasado
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const step = (now) => {
      try {
        if (t0 === null) t0 = now;
        const el = Math.max(0, (now - t0) / SEG_MS);
        if (el >= segs) { setAnimFrame(null); setFrameIdx(segs); setPlaying(false); return; }
        const s = clamp(Math.floor(el), 0, segs - 1);
        const t = clamp((el - s) / 0.8, 0, 1);
        setFrameIdx(s);
        setAnimFrame(lerpFrame(frames[s], frames[s + 1], ease(t)));
        raf = requestAnimationFrame(step);
      } catch (err) {
        // Si algo falla, se corta la animación sin bloquear la pizarra
        console.error('[Pizarra] Animación:', err);
        setAnimFrame(null); setPlaying(false);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // ----- jugadas y pasos -----
  const selectPlay = (id) => { setPlaying(false); setAnimFrame(null); setPlayId(id); setFrameIdx(0); setSelected(null); setConfirmDel(false); };
  const newPlay = () => {
    pushHistory();
    const p = { id: uid(), name: 'Nueva jugada', description: '', frames: [scaleFrame(blankFrame(), court)] };
    setPlays((ps) => [...ps, p]);
    selectPlay(p.id);
  };
  const duplicatePlay = () => {
    pushHistory();
    const p = { ...clone(play), id: uid(), name: play.name + ' (copia)', preset: false };
    setPlays((ps) => [...ps, p]);
    selectPlay(p.id);
  };
  const deletePlay = () => {
    if (plays.length <= 1) return;
    pushHistory();
    const rest = plays.filter((p) => p.id !== play.id);
    setPlays(rest);
    selectPlay(rest[0].id);
  };
  const addFrame = () => {
    pushHistory();
    const nf = { ...clone(frame), id: uid(), arrows: [], note: '' };
    updatePlay((p) => { const fr = [...p.frames]; fr.splice(fIdx + 1, 0, nf); return { ...p, frames: fr }; });
    setFrameIdx(fIdx + 1);
  };
  const removeFrame = () => {
    if (frames.length <= 1) return;
    pushHistory();
    updatePlay((p) => ({ ...p, frames: p.frames.filter((_, i) => i !== fIdx) }));
    setFrameIdx(Math.max(0, fIdx - 1));
  };
  const mirror = () => { pushHistory(); updateFrame((f) => mirrorFrame(f, court)); };
  const clearArrows = () => { pushHistory(); updateFrame((f) => ({ ...f, arrows: [] })); };
  const resetPositions = () => {
    pushHistory();
    const b = scaleFrame(blankFrame(), court);
    updateFrame((f) => ({ ...f, players: b.players, ball: b.ball }));
  };

  const changeCourt = (c) => {
    pushHistory();
    const sx = c.L / court.L, sy = c.W / court.W;
    const sc = (f) => ({
      ...f,
      players: Object.fromEntries(Object.entries(f.players).map(([k, p]) => [k, p && { ...p, x: p.x * sx, y: p.y * sy }])),
      ball: { x: f.ball.x * sx, y: f.ball.y * sy },
      arrows: f.arrows.map((a) => ({ ...a, x1: a.x1 * sx, x2: a.x2 * sx, y1: a.y1 * sy, y2: a.y2 * sy })),
    });
    setPlays((ps) => ps.map((p) => ({ ...p, frames: p.frames.map(sc) })));
    setCourt({ L: c.L, W: c.W });
  };

  // Suma (o reemplaza) jugadas que vienen de un archivo
  const importPlays = ({ plays: incoming, mode, roster: r, colors: c, fileName }) => {
    pushHistory();
    let base = plays;
    if (mode === 'replace') {
      base = plays.filter((p) => p.free || p.name === 'Pizarra libre').slice(0, 1);
      if (!base.length) {
        const free = presetPlays()[0];
        base = [{ ...free, frames: free.frames.map((f) => scaleFrame(f, court)) }];
      }
    }
    const names = new Set(base.map((p) => p.name));
    const fixed = incoming.map((p) => {
      let n = p.name, k = 2;
      while (names.has(n)) n = `${p.name} (${k++})`;
      names.add(n);
      return { ...p, name: n, ...(fileName ? { source: fileName } : {}) };
    });
    setPlays([...base, ...fixed]);
    if (fileName) setLoadedFile(fileName);
    if (r) setRoster(r);
    if (c) setColors(c);
    selectPlay(fixed[0].id);
    setModal(null);
  };

  const setGK = (id) => {
    const t = roster[id].team;
    setRoster((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.team === t ? { ...v, gk: k === id } : v])));
  };

  // ----- render -----
  const vb = `${-M} ${-M} ${court.L + 2 * M} ${court.W + 2 * M}`;
  const selPlayer = selected?.type === 'player' ? selected.id : null;
  const hiddenPlayers = PLAYER_IDS.filter((id) => frame.players[id]?.hidden);
  const colorOf = (id) => { const r = roster[id]; return r.gk ? colors[r.team].gk : colors[r.team].field; };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">⚽</span>
          <div>
            <h1>Pizarra táctica · Powerchair Football</h1>
            <small>Cancha FIPFA a escala · {court.L} × {court.W} m</small>
          </div>
        </div>
        <div className="tools">
          <div className="seg">
            <button onClick={undo} title="Deshacer (Ctrl+Z)">↶</button>
            <button onClick={redo} title="Rehacer (Ctrl+Shift+Z)">↷</button>
          </div>
          <button className="ghost" onClick={() => setModal('help')}>? Ayuda</button>
        </div>
      </header>

      <div className="main">
        {/* -------- Jugadas -------- */}
        <aside className="side left">
          <section>
            <h2>Jugadas</h2>
            <ul className="plays">
              {plays.map((p) => (
                <li key={p.id} className={p.id === play.id ? 'on' : ''} onClick={() => selectPlay(p.id)}>
                  <span>{p.name}</span>
                  <em>{p.frames.length} {p.frames.length === 1 ? 'paso' : 'pasos'}</em>
                </li>
              ))}
            </ul>
            <div className="row wrap">
              <button onClick={newPlay}>+ Nueva</button>
              <button onClick={duplicatePlay}>Duplicar</button>
              {!confirmDel
                ? <button className="danger" disabled={plays.length <= 1} onClick={() => setConfirmDel(true)}>Eliminar</button>
                : <button className="danger solid" onClick={() => { deletePlay(); setConfirmDel(false); }}>¿Seguro?</button>}
            </div>
            <p className="muted saved">✓ Se guarda solo en este navegador{savedAt ? ` · ${savedAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}</p>
          </section>
          <section>
            <h2>Detalle</h2>
            {play.source && <p className="muted source">📄 Del archivo: <b>{play.source}</b></p>}
            <label className="fld">Nombre
              <input value={play.name} onChange={(e) => updatePlay((p) => ({ ...p, name: e.target.value }))} />
            </label>
            <label className="fld">Objetivo de la jugada
              <textarea rows={10} className="objective" value={play.description} onChange={(e) => updatePlay((p) => ({ ...p, description: e.target.value }))} />
            </label>
          </section>
        </aside>

        {/* -------- Cancha -------- */}
        <section className="center">
          <div className={`courtwrap tool-${tool}`}>
            <svg ref={svgRef} viewBox={vb} preserveAspectRatio="xMidYMid meet"
              onPointerDown={onCourtDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onUp}>
              <defs>
                <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#d9a46a" />
                  <stop offset="1" stopColor="#c98e55" />
                </linearGradient>
                {[['move', '#0f172a'], ['pass', '#ffffff'], ['sel', '#ff8a00']].map(([k, c]) => (
                  <marker key={k} id={`ah-${k}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                    <path d="M0 0 L10 5 L0 10 z" fill={c} />
                  </marker>
                ))}
              </defs>
              <Court L={court.L} W={court.W} />
              {opts.radius && (
                <circle cx={shown.ball.x} cy={shown.ball.y} r={RULE_RADIUS + BALL_R} fill="rgba(255,255,255,.07)"
                  stroke="rgba(255,255,255,.75)" strokeWidth={0.04} strokeDasharray="0.25 0.18" pointerEvents="none" />
              )}
              {shown.arrows.map((a) => <Arrow key={a.id} a={a} selected={selected?.type === 'arrow' && selected.id === a.id} onDown={onArrowDown} />)}
              {draftArrow && <Arrow a={{ ...draftArrow, id: 'draft' }} selected={false} onDown={() => {}} />}
              {PLAYER_IDS.filter((id) => shown.players[id] && !shown.players[id].hidden).map((id) => (
                <Chair key={id} id={id} p={shown.players[id]} info={roster[id]} color={colorOf(id)}
                  guard={colors[roster[id].team].field}
                  selected={selPlayer === id && !playing} flagged={opts.warnings && flagged.has(id)}
                  showName={opts.names} onDown={onChairDown} onRotDown={onRotDown} />
              ))}
              <g onPointerDown={onBallDown} style={{ cursor: 'grab' }}>
                <circle cx={shown.ball.x} cy={shown.ball.y} r={0.45} fill="transparent" />
                <circle cx={shown.ball.x + 0.03} cy={shown.ball.y + 0.04} r={BALL_R} fill="rgba(0,0,0,.3)" />
                <circle cx={shown.ball.x} cy={shown.ball.y} r={BALL_R} fill="#fff" stroke="#111" strokeWidth={0.03} />
                <circle cx={shown.ball.x} cy={shown.ball.y} r={0.06} fill="#111" />
                {selected?.type === 'ball' && <circle cx={shown.ball.x} cy={shown.ball.y} r={0.3} fill="none" stroke="#fff" strokeWidth={0.04} strokeDasharray="0.1 0.07" />}
              </g>
            </svg>
          </div>

          {/* Pasos */}
          <div className="steps">
            <div className="row">
              <button className="play" onClick={() => { setSelected(null); setPlaying((v) => !v); if (playing) setAnimFrame(null); }} disabled={frames.length < 2}>
                {playing ? '■ Detener' : '▶ Reproducir'}
              </button>
              <div className="dots">
                {frames.map((f, i) => (
                  <button key={f.id} className={i === fIdx ? 'on' : ''} onClick={() => { setPlaying(false); setAnimFrame(null); setFrameIdx(i); }}>
                    Paso {i + 1}
                  </button>
                ))}
              </div>
              <button className="addstep" onClick={addFrame} title="Copia este paso para mover desde acá">＋ Agregar paso</button>
              <button className="danger" onClick={removeFrame} disabled={frames.length <= 1}>Quitar paso</button>
            </div>
            <input className="note" placeholder="Nota del paso: qué tiene que hacer cada jugador…" value={frame.note || ''}
              onChange={(e) => updateFrame((f) => ({ ...f, note: e.target.value }))} />
          </div>
        </section>

        {/* -------- Panel derecho -------- */}
        <aside className="side right">
          <section className="sel">
            <h2>Selección</h2>
            {!selected && <p className="muted">Tocá una silla, el balón o una flecha. Arrastrá para mover; usá el círculo blanco para girar.</p>}
            {selPlayer && (() => {
              const r = roster[selPlayer], p = frame.players[selPlayer];
              return (
                <div>
                  <div className="chip" style={{ background: colorOf(selPlayer) }}>{colors[r.team].name} · #{r.num}{r.gk ? ' · Arquero' : ''}</div>
                  <div className="row">
                    <label className="fld sm">N.º<input type="number" min={0} max={99} value={r.num}
                      onChange={(e) => setRoster((ro) => ({ ...ro, [selPlayer]: { ...r, num: e.target.value } }))} /></label>
                    <label className="fld grow">Nombre<input value={r.name}
                      onChange={(e) => setRoster((ro) => ({ ...ro, [selPlayer]: { ...r, name: e.target.value } }))} /></label>
                  </div>
                  <label className="chk"><input type="checkbox" checked={!!r.gk} onChange={() => setGK(selPlayer)} disabled={r.gk} /> Es el arquero del equipo</label>
                  <div className="fld">Orientación: {((Math.round(p.a) % 360) + 360) % 360}°</div>
                  <div className="row">
                    <button onClick={() => rotateSelected(-45)}>⟲ 45°</button>
                    <button onClick={() => rotateSelected(-15)}>⟲ 15°</button>
                    <button onClick={() => rotateSelected(15)}>15° ⟳</button>
                    <button onClick={() => rotateSelected(45)}>45° ⟳</button>
                  </div>
                  <input type="range" min={-180} max={180} value={(((Math.round(p.a) + 180) % 360) + 360) % 360 - 180}
                    onPointerDown={pushHistory} onChange={(e) => setPlayer(selPlayer, { a: +e.target.value })} />
                  <button className="danger wide" onClick={deleteSelected}>Sacar de la cancha en este paso</button>
                </div>
              );
            })()}
            {selected?.type === 'ball' && <p className="muted">Balón (33 cm). El círculo punteado marca los 3 m de la regla de 2 contra 1.</p>}
            {selected?.type === 'arrow' && <button className="danger wide" onClick={deleteSelected}>Borrar flecha</button>}
            {hiddenPlayers.length > 0 && (
              <div className="hidden-list">
                <h3>Fuera de la cancha</h3>
                {hiddenPlayers.map((id) => (
                  <button key={id} onClick={() => { pushHistory(); setPlayer(id, { hidden: false }); }}>
                    <i style={{ background: colorOf(id) }} /> #{roster[id].num} {roster[id].name} — volver
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2>Reglamento en vivo</h2>
            <label className="chk"><input type="checkbox" checked={opts.warnings} onChange={(e) => setOpts({ ...opts, warnings: e.target.checked })} /> Avisos de ubicación (Regla 11)</label>
            {opts.warnings && (warnings.length === 0
              ? <p className="ok">✓ Sin situaciones de 2 contra 1 ni 3 en el área.</p>
              : warnings.map((w, i) => (
                <div key={i} className="warn">
                  <b style={{ color: colors[w.team].field }}>{colors[w.team].name}</b> — {w.text}
                  <div className="muted">{w.ids.map((id) => '#' + roster[id].num).join(', ')} · {w.hint}</div>
                </div>
              )))}
          </section>

          <section>
            <h2>Vista</h2>
            <label className="chk"><input type="checkbox" checked={opts.radius} onChange={(e) => setOpts({ ...opts, radius: e.target.checked })} /> Radio de 3 m del balón</label>
            <label className="chk"><input type="checkbox" checked={opts.names} onChange={(e) => setOpts({ ...opts, names: e.target.checked })} /> Nombres</label>
            <div className="row wrap">
              <button onClick={mirror} title="Da vuelta el paso de izquierda a derecha">⇋ Espejar</button>
              <button onClick={clearArrows}>Borrar flechas</button>
              <button onClick={resetPositions}>Posiciones base</button>
            </div>
            <label className="fld">Cancha
              <select value={`${court.L}x${court.W}`} onChange={(e) => { const c = COURT_PRESETS.find((c) => `${c.L}x${c.W}` === e.target.value); if (c) changeCourt(c); }}>
                {COURT_PRESETS.map((c) => <option key={c.id} value={`${c.L}x${c.W}`}>{c.label}</option>)}
                {!COURT_PRESETS.some((c) => c.L === court.L && c.W === court.W) && <option value={`${court.L}x${court.W}`}>{court.L} × {court.W} m</option>}
              </select>
            </label>
          </section>

          <section>
            <h2>Equipos</h2>
            {['A', 'B'].map((t) => (
              <div key={t} className="team">
                <input className="tname" value={colors[t].name} onChange={(e) => setColors({ ...colors, [t]: { ...colors[t], name: e.target.value } })} />
                <label title="Camiseta de jugadores de campo"><input type="color" value={colors[t].field} onChange={(e) => setColors({ ...colors, [t]: { ...colors[t], field: e.target.value } })} /> Campo</label>
                <label title="Camiseta del arquero"><input type="color" value={colors[t].gk} onChange={(e) => setColors({ ...colors, [t]: { ...colors[t], gk: e.target.value } })} /> Arquero</label>
              </div>
            ))}
          </section>

          <section className="filesec">
            <h2>Archivos</h2>
            <div className="filebtns">
              <button className="iconbtn" onClick={() => setModal('import')} title="Cargar jugadas desde un archivo">
                <span className="ico">⬆</span><span className="lbl">Subir archivo</span>
              </button>
              <button className="play iconbtn" onClick={() => setModal('export')} title="Guardar jugadas en un archivo">
                <span className="ico">💾</span><span className="lbl">Guardar jugadas</span>
              </button>
            </div>
            {loadedFile && <div className="filename" title={`Último archivo subido: ${loadedFile}`}>📄 {loadedFile}</div>}
          </section>
        </aside>
      </div>

      {modal && (
        <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            {modal === 'help' && <Help onClose={() => setModal(null)} />}
            {modal === 'export' && <DownloadBox plays={plays} currentId={play.id} court={court} roster={roster} colors={colors} onClose={() => setModal(null)} />}
            {modal === 'import' && <UploadBox court={court} onImport={importPlays} onClose={() => setModal(null)} />}
          </div>
        </div>
      )}
    </div>
  );
}

function Help({ onClose }) {
  return (
    <div>
      <h2>Cómo usar la pizarra</h2>
      <ul className="help">
        <li><b>Mover una silla:</b> arrastrala. Con flechas del teclado la movés 10 cm (Shift: 50 cm).</li>
        <li><b>Girar:</b> arrastrá el círculo blanco que aparece al seleccionarla, o usá la rueda del mouse, o <kbd>Q</kbd>/<kbd>E</kbd> (15°; con Shift, 5°). El parachoques marca hacia dónde mira.</li>
        <li><b>Pasos:</b> “+ Paso” copia la posición actual para que muevas a partir de ahí. “Reproducir” anima la jugada completa.</li>
        <li><b>Reglamento en vivo:</b> se marca en naranja cuando hay 2 jugadores del mismo equipo y un rival a menos de 3 m del balón (no cuenta el arquero dentro de su área), o 3 jugadores en su propia área. Es un aviso: el árbitro sólo sanciona si el jugador interviene activamente.</li>
        <li><b>Guardar:</b> todo se guarda solo en este navegador. Con “Guardar jugadas” (abajo a la derecha) las guardás en un archivo .json; con “Subir archivo” las cargás en otra computadora o se las pasás a tu equipo.</li>
        <li><kbd>Supr</kbd> saca la silla seleccionada (o borra una flecha de las jugadas tipo). <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshace.</li>
      </ul>
      <p className="muted">Medidas según Reglas de Juego FIPFA 2019: área de gol 8 × 5 m, arco de 6 m, punto penal a 3,5 m, córner de 1 m, balón de 33 cm.</p>
      <button onClick={onClose}>Entendido</button>
    </div>
  );
}

// ---------- Descargar jugadas a un archivo ----------
function DownloadBox({ plays, currentId, court, roster, colors, onClose }) {
  const [sel, setSel] = useState(() => new Set([currentId]));
  const today = new Date().toISOString().slice(0, 10);
  const [fname, setFname] = useState(`jugadas-powerchair-${today}`);
  const [msg, setMsg] = useState('');
  const chosen = plays.filter((p) => sel.has(p.id));
  const all = sel.size === plays.length;
  const text = () => JSON.stringify(buildExport({ plays: chosen, court, roster, colors }), null, 1);
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const count = `${chosen.length} ${chosen.length === 1 ? 'jugada' : 'jugadas'}`;
  return (
    <div>
      <h2>Guardar jugadas</h2>
      <p className="muted">Elegí qué jugadas guardar en un archivo. Lo podés subir en otra computadora o pasárselo a tu equipo. El archivo también guarda los nombres de los jugadores y los colores.</p>
      <label className="chk"><input type="checkbox" checked={all} onChange={() => setSel(all ? new Set() : new Set(plays.map((p) => p.id)))} /> <b>Todas las jugadas</b></label>
      <div className="picklist">
        {plays.map((p) => (
          <label key={p.id} className="chk">
            <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} /> {p.name}
            <em className="muted">· {pasos(p.frames.length)}</em>
          </label>
        ))}
      </div>
      <label className="fld">Nombre del archivo
        <div className="row" style={{ marginTop: 0 }}>
          <input value={fname} onChange={(e) => setFname(e.target.value)} />
          <span className="muted">.json</span>
        </div>
      </label>
      <div className="row wrap">
        <button className="play" disabled={!chosen.length} onClick={() => {
          try { downloadFile(safeName(fname) + '.json', text()); setMsg(`Guardado: ${count} ✓ (el archivo está en tu carpeta de Descargas)`); }
          catch { setMsg('Este navegador no permitió la descarga. Usá “Copiar como texto”.'); }
        }}>💾 Guardar {chosen.length ? count : ''}</button>
        <button disabled={!chosen.length} onClick={async () => {
          try { await navigator.clipboard.writeText(text()); setMsg('Copiado como texto ✓'); } catch { setMsg('No se pudo copiar.'); }
        }}>Copiar como texto</button>
        <button className="ghost" onClick={onClose}>Cerrar</button>
      </div>
      {msg && <p className="ok">{msg}</p>}
    </div>
  );
}

// ---------- Subir jugadas desde un archivo ----------
function UploadBox({ court, onImport, onClose }) {
  const [parsed, setParsed] = useState(null); // { plays, roster, colors, fileName }
  const [sel, setSel] = useState(new Set());
  const [mode, setMode] = useState('add');
  const [useStyle, setUseStyle] = useState(false);
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const [txt, setTxt] = useState('');

  const load = (text, fileName) => {
    setErr('');
    try {
      const r = parseImport(text, court);
      setParsed({ ...r, fileName });
      setSel(new Set(r.plays.map((p) => p.id)));
    } catch (e) { setParsed(null); setErr(e.message); }
  };
  const readFile = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setErr('El archivo es demasiado grande (máximo 5 MB).'); return; }
    file.text().then((t) => load(t, file.name)).catch(() => setErr('No se pudo leer el archivo.'));
  };
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const chosen = parsed ? parsed.plays.filter((p) => sel.has(p.id)) : [];

  return (
    <div>
      <h2>Subir jugadas</h2>
      <label className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); readFile(e.dataTransfer.files[0]); }}>
        <input type="file" accept=".json,application/json" onChange={(e) => { readFile(e.target.files[0]); e.target.value = ''; }} />
        <b>⬆ Elegí un archivo de jugadas (.json)</b>
        <span className="muted">o arrastralo hasta acá</span>
      </label>
      <details className="paste">
        <summary className="muted">O pegá un texto copiado</summary>
        <textarea rows={5} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Pegá acá el texto…" />
        <button onClick={() => load(txt, 'Texto pegado')} disabled={!txt.trim()}>Leer texto</button>
      </details>
      {err && <p className="err">{err}</p>}
      {parsed && (
        <div>
          <h3>{parsed.fileName} · {parsed.plays.length} {parsed.plays.length === 1 ? 'jugada' : 'jugadas'}</h3>
          <div className="picklist">
            {parsed.plays.map((p) => (
              <label key={p.id} className="chk">
                <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} /> {p.name}
                <em className="muted">· {pasos(p.frames.length)}</em>
              </label>
            ))}
          </div>
          <label className="chk"><input type="radio" name="mode" checked={mode === 'add'} onChange={() => setMode('add')} /> Agregar a mis jugadas</label>
          <label className="chk"><input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Reemplazar mis jugadas (queda la Pizarra libre; se puede deshacer con ↶)</label>
          {(parsed.roster || parsed.colors) && (
            <label className="chk"><input type="checkbox" checked={useStyle} onChange={(e) => setUseStyle(e.target.checked)} /> Usar también los nombres de jugadores y colores del archivo</label>
          )}
        </div>
      )}
      <div className="row">
        <button className="play" disabled={!chosen.length} onClick={() => onImport({
          plays: chosen, mode,
          roster: useStyle ? parsed.roster : null,
          colors: useStyle ? parsed.colors : null,
          fileName: parsed.fileName,
        })}>Cargar {chosen.length ? `${chosen.length} ${chosen.length === 1 ? 'jugada' : 'jugadas'}` : ''}</button>
        <button className="ghost" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}
