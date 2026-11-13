/* ===== Core: state, persistence, parsing, detection, profiles, math ===== */
'use strict';
const APP = { name: 'VibeScope', version: '3.0', date: '2026-11-13' };
const G0 = 9.80665;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (v, d = 3) => (v == null || !isFinite(v)) ? '–' : (Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 10 ? v.toFixed(2) : v.toPrecision(d));
const fmtF = v => (v == null || !isFinite(v)) ? '–' : (v >= 1000 ? v.toFixed(0) : v >= 100 ? v.toFixed(1) : v.toFixed(2));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Test kinds (predefined test slots) ---------- */
const AXES = ['Z', 'X', 'Y'];
const KINDS = [
  { id: 'sig', name: 'Signature sweep', type: 'sine', short: 'Signature', order: 0 },
  { id: 'lowsine', name: 'Low level sine', type: 'sine', short: 'LL sine', order: 1, matrix: true, lowLevel: true },
  { id: 'sinesurvey', name: 'Sine survey (other band)', type: 'sine', short: 'Sine survey', order: 2 },
  { id: 'sineq', name: 'Sine qualification', type: 'sine', short: 'Sine qual', order: 3, matrix: true },
  { id: 'lowrand', name: 'Low level random', type: 'random', short: 'LL random', order: 4, matrix: true, lowLevel: true },
  { id: 'rand-6', name: 'Random -6 dB', type: 'random', short: 'Rand -6 dB', order: 5, db: -6, matrix: true },
  { id: 'rand-3', name: 'Random -3 dB', type: 'random', short: 'Rand -3 dB', order: 6, db: -3, matrix: true },
  { id: 'rand0', name: 'Random full level', type: 'random', short: 'Rand 0 dB', order: 7, db: 0, matrix: true },
  { id: 'srs', name: 'Shock SRS', type: 'srs', short: 'SRS', order: 8, matrix: true },
  { id: 'custom', name: 'Custom test', type: 'any', short: 'Custom', order: 99 },
];
const kindById = id => KINDS.find(k => k.id === id) || KINDS[KINDS.length - 1];
const SENSOR_COLORS = ['#1f56d6', '#d9480f', '#2b8a3e', '#9b59b6', '#e0a100', '#0b7285', '#c2255c', '#5c940d', '#845ef7', '#f76707', '#1098ad', '#a61e4d', '#2f9e44', '#e8590c', '#364fc7', '#862e9c', '#3bc9db', '#f08c00'];
const PARTS = ['payload', 'telescope', 'fixture', 'table', 'other'];

/* ---------- Default requirement profiles (editable in Settings) ---------- */
function defaultProfiles() {
  return {
    lowsine: { f1: 5, f2: 2000, g: 0.25, rate: 2 },
    // generic starting points (GEVS-style random qualification, simple sine); a site file or the Settings tab replaces them
    sine_oop: { rate: 2, segs: [[5, 20, 'disp', 10], [20, 100, 'g', 2.5]] },
    sine_ip: { rate: 2, segs: [[5, 20, 'disp', 10], [20, 100, 'g', 2.0]] },
    random: { bp: [[20, 0.026], [50, 0.16], [800, 0.16], [2000, 0.026]], durationFull: 120, durationInt: 30 },
    ...(SITE.profiles || {}),
    lowrand: { grms: 1.0, duration: 30 },
    /* Profile library: every random or SRS profile a test can be run against. A test picks one (test.profile = id); without one a random test
       uses the full-level PSD above at the level of its kind. Limits are the controller's channel (auto-notch) limits: input, level, band. */
    library: defaultLibrary(),
    srsRequirementId: SITE.srsRequirementId,
    tol: { sineAlarmPct: 10, sineAbortPct: 20, randAlarmDb: 3, randAbortDb: 6, srsTolDb: 3 },
    bands: [[20, 100], [100, 700], [700, 2000]],
    peakThreshold: 2.0,
    signature: { shiftLimitPct: 5, ampLimitDb: 3, peakThreshold: 2.0, matchWindowPct: 10, shiftMinT: 4 },
  };
}

function defaultLibrary() { return siteLibrary(); }
const libProfile = id => (P?.profiles?.library || []).find(p => p.id === id) || null;
const libFor = (type, axis) => (P?.profiles?.library || []).filter(p => p.type === type && (!axis || !p.axis || p.axis === axis));

/* ---------- Project state ---------- */
let P = null; // project
let UI = { tab: 'overview', sessionId: null, testId: null, compare: { tests: [], mode: 'inaxis', norm: true }, chan: {}, theme: null, plotScale: { x: 'log', y: 'log' }, sel: new Set(), selAnchor: null, clip: [] };

function newProject() {
  return { version: 1, app: APP.name + ' ' + APP.version, name: 'Vibration test data', profiles: defaultProfiles(), sessions: [], tests: [], files: [], campaigns: [], v25: true, v27: true, v272: true };
}
/* A sensor: one triax (or single axis) accelerometer.
   ch = controller input number per sensor axis (X, Y, Z; C for the control channel).
   sens = sensitivity in mV/g per axis (for the record; the controller already applied it).
   orient = which test axis each sensor axis points along, if known ('+X', '-Y', ...). Empty = let the data decide.
   p3 = position for the 3D view in cylinder coordinates about the fixture centre (r mm, angle deg from +X, z mm above the table). */
function newSensor(n, o = {}) {
  return Object.assign({ id: uid(), pos: n, name: 'Sensor ' + n, part: 'payload', brand: '', serial: '', color: SENSOR_COLORS[(n - 1) % SENSOR_COLORS.length], sens: { X: null, Y: null, Z: null }, ch: { X: null, Y: null, Z: null }, orient: { X: '', Y: '', Z: '' }, p3: { r: 170, angle: 0, z: 300 }, note: '' }, o);
}
function controlSensor() { return { id: 'CTRL', pos: 0, name: 'Control', part: 'table', brand: '', serial: '', color: '#444c56', sens: {}, ch: { C: 1 }, orient: {}, p3: { r: 345, angle: 90, z: -1 }, note: 'Controller control accelerometer on the shaker table' }; }
function newSession(name, date, article = 'Test article', opts = {}) {
  const s = { id: uid(), name, date, article, notes: '', show3D: true, model3d: opts.model3d || 'fixture', sensors: [controlSensor()], v: 2 };
  if (opts.sensors) s.sensors.push(...opts.sensors);
  else s.sensors.push(newSensor(1, { name: 'Sensor 1', part: 'fixture', ch: { X: 2, Y: 3, Z: 4 }, p3: { r: Math.min(176, FIX.plateX / 2 - 40), angle: 90, z: FIX.ringTop } }));
  return s;
}
const SENSOR_TEMPLATES = [
  ...SITE_TEMPLATES,
  { id: 'one', name: 'One triax on the fixture or plate (edit later)', make: () => [newSensor(1, { name: 'Sensor 1', part: 'fixture', ch: { X: 2, Y: 3, Z: 4 }, p3: { r: Math.min(176, FIX.plateX / 2 - 40), angle: 90, z: FIX.ringTop } })], model3d: 'fixture' },
];
function sensorTemplates() { return [...(P?.sensorTemplates || []).map(t => ({ ...t, user: true, make: () => JSON.parse(JSON.stringify(t.sensors)).map(x => ({ ...x, id: uid() })) })), ...SENSOR_TEMPLATES]; }
/* Bring a v1 session (sensors with place/angle and an explicit chmap) to the v2 sensor model. Safe to call repeatedly. */
function migrateSession(s) {
  if (!s || !Array.isArray(s.sensors)) return s;
  const PL = { ring: { z: 165, r: 176 }, plate: { z: 20, r: 250 }, table: { z: -1, r: 345 }, boss: { z: 165, r: 176 } };
  s.sensors.forEach((x, i) => {
    if (!x.ch) { x.ch = {}; for (const [ch, m] of Object.entries(s.chmap || {})) if (m.sensor === x.id) x.ch[m.axis] = +ch; }
    if (!x.p3) { const pl = PL[x.place] || PL.ring; x.p3 = { r: pl.r, angle: x.angle || 0, z: pl.z }; }
    if (x.pos == null) x.pos = x.id === 'CTRL' ? 0 : i + (s.sensors[0]?.id === 'CTRL' ? 0 : 1);
    if (!x.part) x.part = x.id === 'CTRL' ? 'table' : (x.place === 'table' ? 'table' : 'fixture');
    if (!x.sens) x.sens = {}; if (!x.orient) x.orient = {}; if (x.brand == null) x.brand = ''; if (x.serial == null) x.serial = '';
    if (!x.color) x.color = SENSOR_COLORS[i % SENSOR_COLORS.length];
  });
  if (!s.sensors.some(x => x.id === 'CTRL')) s.sensors.unshift(controlSensor());
  if (!s.model3d) s.model3d = SITE.telescope && /sqm|payload|telescope|unit/i.test(s.article || '') ? 'fixture+telescope' : 'fixture';
  s.v = 2; delete s.chmap; delete s._map;
  return s;
}
/* Channel map derived from the sensors: input number -> {sensor, axis}. Cached on the session until the sensors change. */
function chmapOf(s) {
  if (!s) return {};
  const key = JSON.stringify(s.sensors.map(x => [x.id, x.ch]));
  if (s._mapKey === key && s._map) return s._map;
  const m = {};
  for (const x of s.sensors) for (const [ax, ch] of Object.entries(x.ch || {})) if (ch != null && ch !== '') m[+ch] = { sensor: x.id, axis: ax };
  Object.defineProperty(s, '_map', { value: m, enumerable: false, writable: true, configurable: true });
  Object.defineProperty(s, '_mapKey', { value: key, enumerable: false, writable: true, configurable: true });
  return m;
}
const sensorsOf = s => (s?.sensors || []).filter(x => x.id !== 'CTRL').slice().sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
/* Channels of one sensor under the map in force for the test being rendered (respects the relabelled in-plane map). */
function sensorChannels(sess, x) { const m = mapFor(sess); const out = []; for (const [ch, v] of Object.entries(m || {})) if (v.sensor === x.id && v.axis !== 'C') out.push({ axis: v.axis, ch: +ch }); return out.sort((a, b) => 'XYZ'.indexOf(a.axis) - 'XYZ'.indexOf(b.axis)); }
const sensorLabel = x => x ? (x.id === 'CTRL' ? 'Control' : `#${x.pos} ${x.name}`) : '';
function newTest(sessionId, axis, kindId, run = null, name = null) {
  const k = kindById(kindId);
  return { id: uid(), sessionId, axis, kind: kindId, name: name || k.name, run, notes: '', fileIds: [], status: '', hidden: false, profile: 'full', levelDb: null, order: null, created: Date.now() };
}

/* ---------- IndexedDB persistence (per browser; a project file is the shareable form) ---------- */
const DB = { name: 'vibescope', store: 'kv' };
function idb() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB.name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(DB.store);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function idbGet(key) { try { const d = await idb(); return await new Promise((res, rej) => { const t = d.transaction(DB.store).objectStore(DB.store).get(key); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); } catch (e) { return undefined; } }
async function idbSet(key, val) { try { const d = await idb(); return await new Promise((res, rej) => { const t = d.transaction(DB.store, 'readwrite').objectStore(DB.store).put(val, key); t.onsuccess = () => res(true); t.onerror = () => rej(t.error); }); } catch (e) { return false; } }
let saveTimer = null;
function persist(opts = {}) {
  if (!opts.noHistory) historyNote();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    setStatus('Saving…');
    const ok = await idbSet('project', P);
    setStatus(ok ? 'Saved locally ' + new Date().toLocaleTimeString() : 'Local save unavailable (private window?)');
  }, 400);
}
function setStatus(s) { const el = $('#status'); if (el) el.textContent = s; }

/* ---------- Undo / redo ----------
   Every persist() records the project's structure (sessions, tests, profiles, file assignments) if it changed. The measured data
   itself is never copied: file objects are kept by reference, so a snapshot is a few hundred kB at most. Ctrl+Z / Ctrl+Y. */
const HIST = { current: null, undo: [], redo: [], max: 60 };
function structSnapshot() {
  const sessions = P.sessions.map(s => { const c = { ...s }; delete c.collapsed; return c; });
  const key = JSON.stringify([sessions, P.tests, P.profiles, P.name, P.files.map(f => [f.id, f.testId, f.sessionId])]);
  return { key, fileRefs: P.files.slice() };
}
function historyInit() { HIST.current = structSnapshot(); HIST.undo = []; HIST.redo = []; updateHistoryButtons(); }
function historyNote() {
  if (!P) return;
  const snap = structSnapshot();
  if (HIST.current && HIST.current.key === snap.key) { HIST.current.fileRefs = snap.fileRefs; return; }
  if (HIST.current) { HIST.undo.push(HIST.current); if (HIST.undo.length > HIST.max) HIST.undo.shift(); HIST.redo = []; }
  HIST.current = snap; updateHistoryButtons();
}
function historyRestore(snap) {
  const [sessions, tests, profiles, name, fileMeta] = JSON.parse(snap.key);
  const collapsed = Object.fromEntries(P.sessions.map(s => [s.id, s.collapsed]));
  P.sessions = sessions.map(s => { s.collapsed = collapsed[s.id] ?? false; return migrateSession(s); }); P.tests = tests; P.profiles = profiles; P.name = name;
  const meta = new Map(fileMeta.map(m => [m[0], m])); P.files = snap.fileRefs.slice();
  for (const f of P.files) { const m = meta.get(f.id); if (m) { f.testId = m[1]; f.sessionId = m[2]; } }
  if (!P.sessions.some(s => s.id === UI.sessionId)) UI.sessionId = P.sessions[0]?.id || null;
  if (UI.testId && !P.tests.some(t => t.id === UI.testId)) { UI.testId = null; if (UI.tab === 'test') UI.tab = 'overview'; }
  UI.compare.tests = UI.compare.tests.filter(id => P.tests.some(t => t.id === id)); UI.sel.clear();
  LF_CACHE.clear(); M_CACHE.clear(); if (typeof SIG_CACHE !== 'undefined') SIG_CACHE.clear();
  HIST.current = snap; persist({ noHistory: true }); updateHistoryButtons(); render();
}
function undo() { if (!HIST.undo.length) { toast('Nothing to undo'); return; } const snap = HIST.undo.pop(); HIST.redo.push(HIST.current); historyRestore(snap); toast('Undone'); }
function redo() { if (!HIST.redo.length) { toast('Nothing to redo'); return; } const snap = HIST.redo.pop(); HIST.undo.push(HIST.current); historyRestore(snap); toast('Redone'); }
function updateHistoryButtons() { const u = $('#btn-undo'), r = $('#btn-redo'); if (u) u.disabled = !HIST.undo.length; if (r) r.disabled = !HIST.redo.length; }

/* ---------- File parsing ---------- */
// A parsed file: {id,name,kind,xUnit,yUnit,x:[],cols:[{label,ch,role,data:[]}],coef,detected:{},testId,sessionId}
/* Any table with a header and numeric columns: the first column is frequency (Hz) or time (s or ms), the others are channels.
   Controller exports (Econ: 'Coef:9.8, input1(f)...' with a units row 'X (Hz), Y (g)') and generic CSV or Excel layouts are both read:
   metadata lines above the header are skipped, an optional units row under the header is used, and columns without an input number are
   numbered in order (the first one is the control unless a column is called control, ctrl, drive or reference). */
const isNumCell = v => typeof v === 'number' ? isFinite(v) : (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v.trim())));
function parseTable(rows, name) {
  if (!rows || rows.length < 3) throw new Error('Not enough rows');
  const ds = rows.findIndex((r, i) => r && isNumCell(r[0]) && r.filter(isNumCell).length >= 2 && rows[i + 1] && isNumCell(rows[i + 1][0]));
  if (ds < 1) throw new Error('No header row followed by numeric data');
  const str = r => (r || []).map(v => String(v ?? '').trim());
  const looksUnits = r => { const c = str(r).filter(Boolean); return c.length > 0 && c.every(v => /^(x|y)\s*[([]/i.test(v) || /^[([]?\s*(hz|s|sec|ms|g|gpk|g\s*pk|grms|g\^?2\/hz|g²\/hz|g2\/hz|m\/s\^?2|m\/s²|-)\s*[)\]]?$/i.test(v)); };
  const textRow = r => (r || []).some(v => v != null && String(v).trim() !== '' && !isNumCell(v));
  let hdr, units, dataStart = ds;
  if (ds >= 2 && textRow(rows[ds - 2]) && looksUnits(rows[ds - 1])) { hdr = str(rows[ds - 2]); units = str(rows[ds - 1]); }
  else { hdr = str(rows[ds - 1]); units = hdr.map(() => ''); }
  while (hdr.length < (rows[ds] || []).length) hdr.push('');
  const unitOf = (i) => { const u = units[i] || ''; if (u) return u; const m = /[([]\s*([^)\]]+)\s*[)\]]\s*$/.exec(hdr[i] || ''); return m ? m[1] : ''; };
  const coef = parseFloat((hdr[0].match(/coef\s*:?\s*([\d.]+)/i) || [])[1]) || null;
  const x0 = (units[0] + ' ' + hdr[0]).toLowerCase();
  let xUnit = /\bms\b|\(ms\)|\[ms\]|millisec/.test(x0) ? 'ms' : /hz|freq/.test(x0) ? 'Hz' : /\(s\)|\[s\]|\bs\b|sec|time/.test(x0) ? 's' : null;
  if (!xUnit) { const lastX = [...rows].reverse().find(r => r && isNumCell(r[0])); xUnit = lastX && +lastX[0] < 20 ? 's' : 'Hz'; }
  const yUnit = unitOf(1);
  const cols = [];
  for (let c = 1; c < hdr.length; c++) {
    const label = hdr[c] || (rows[ds][c] != null && isNumCell(rows[ds][c]) ? 'Column ' + (c + 1) : ''); if (!label) continue;
    const m = label.match(/(?:input|ch(?:annel)?|acc(?:el)?)\s*#?\s*(\d+)/i);
    const isCtl = /\b(control|ctrl|drive|reference|ref)\b/i.test(label);
    let ch = m ? parseInt(m[1], 10) : (isCtl ? 1 : null);
    const role = isCtl ? 'control' : 'response';
    const sub = /abs\s*max|maximax|srs/i.test(label) ? 'srs' : /rms\s*\(t\)/i.test(label) ? 'rms' : /\(t\)/i.test(label) ? 'time' : 'spec';
    cols.push({ label, ch, role, sub, unit: unitOf(c), srcCol: c, data: [] });
  }
  // columns without an input number are numbered in order after the numbered ones
  const generic = !cols.some(c => /input\s*\d+/i.test(c.label)) && !coef;
  if (cols.some(c => c.ch == null)) { let next = Math.max(0, ...cols.map(c => c.ch || 0)) + 1; if (!cols.some(c => c.role === 'control') && !cols.some(c => c.ch === 1)) next = 1; for (const c of cols) if (c.ch == null) c.ch = next++; }
  const x = [];
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue;
    const xv = typeof row[0] === 'number' ? row[0] : parseFloat(row[0]);
    if (!isFinite(xv)) continue;
    x.push(xv);
    for (const col of cols) { const v = typeof row[col.srcCol] === 'number' ? row[col.srcCol] : parseFloat(row[col.srcCol]); col.data.push(isFinite(v) ? +v.toPrecision(5) : null); }
  }
  if (xUnit === 'ms') { for (let i = 0; i < x.length; i++) x[i] = x[i] / 1000; xUnit = 's'; }
  cols.forEach(c => delete c.srcCol);
  let kind;
  const sub0 = cols[0]?.sub; const allText = (name + ' ' + hdr.join(' ') + ' ' + units.join(' ')).toLowerCase();
  if (xUnit === 'Hz') kind = /(2|²)\s*\/\s*hz|\bpsd\b|\basd\b/.test((yUnit + ' ' + allText).toLowerCase()) ? 'psd' : (sub0 === 'srs' || /\bsrs\b|shock response|maximax/.test(allText) ? 'srs' : 'sine');
  else kind = (sub0 === 'rms' || /rms/i.test(cols[0]?.label || '') || /rms\s*history|grms\s*vs\s*time/.test(allText)) ? 'rms' : 'time';
  // a second control column (some exports repeat it) is kept but hidden
  cols.filter(c => c.role === 'control').slice(1).forEach(c => { c.role = 'control-dup'; if (c.ch == null) c.ch = 1; });
  // no column named Control: input 1 is the control accelerometer (Econ convention; random exports named 'All Signals' and RMS histories carry it as input1)
  if (!cols.some(c => c.role === 'control')) { const c1 = cols.find(c => c.ch === 1); if (c1) c1.role = 'control'; }
  if (kind === 'time' && cols.some(c => c.role === 'control' && c.ch == null)) { const c1 = cols.find(c => c.ch === 1); const ctl = cols.find(c => c.role === 'control' && c.ch == null); if (c1 && ctl) { ctl.ch = 1; ctl.role = 'control-dup'; } }
  const f = { id: uid(), name, kind, xUnit, yUnit, coef, x, cols, generic, detected: detectFromName(name, kind), testId: null, sessionId: null, imported: Date.now() };
  splitLimitColumns(f); if (kind === 'rms') cleanHistory(f);
  return f;
}
/* Controller limit lines ("Limit 4-Abort(f)") exported next to the PSD are not responses: keep them apart as f.limitLines. */
function splitLimitColumns(f) {
  const lim = f.cols.filter(c => /^limit\s*\d+/i.test(c.label || '')); if (!lim.length) return f;
  f.limitLines = (f.limitLines || []).concat(lim.map(c => ({ ch: parseInt(c.label.match(/^limit\s*(\d+)/i)[1], 10), label: c.label, abort: /abort/i.test(c.label), data: c.data })));
  f.cols = f.cols.filter(c => !lim.includes(c)); return f;
}
/* RMS history: the controller pre-fills zeros and sometimes keeps an aborted ramp before the real one; start at the last ramp. Some exports
   carry a control column that is not an RMS (negative values): hide it. */
function cleanHistory(f) {
  const resp = f.cols.filter(c => c.role === 'response'); const x = f.x; if (!x.length) return f;
  for (const c of f.cols) if (c.role === 'control' && c.data.some(v => v != null && v < 0)) { c.role = 'control-dup'; f.note = 'The control column in this history export is not an RMS (it has negative values), so it is hidden.'; }
  const live = i => resp.some(c => (c.data[i] || 0) > 1e-6);
  let first = x.findIndex((_, i) => live(i)); if (first < 0) return f;
  let lastLive = x.length - 1; while (lastLive > first && !live(lastLive)) lastLive--;
  let lastGap = -1; for (let i = first; i < lastLive; i++) if (!live(i)) lastGap = i;
  const start = Math.max(0, (lastGap >= 0 ? lastGap + 1 : first) - 5);
  if (start > 0) { x.splice(0, start); f.cols.forEach(c => c.data.splice(0, start)); }
  return f;
}

function bufToB64(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
function b64ToBlob(b64, mime) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: mime }); }
const REPORT_MIME = { doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdf: 'application/pdf' };
async function parseFile(file) {
  const name = file.name;
  const buf = await file.arrayBuffer();
  const ext = (name.match(/\.(\w+)$/) || [])[1]?.toLowerCase();
  if (REPORT_MIME[ext]) return { id: uid(), name, kind: 'report', ext, mime: REPORT_MIME[ext], size: buf.byteLength, b64: bufToB64(buf), detected: detectFromName(name, 'report'), testId: null, sessionId: null, imported: Date.now() };
  let rows;
  if (/\.(xlsx|xlsm|xls)$/i.test(name)) {
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  } else {
    const txt = new TextDecoder().decode(buf);
    const sep = txt.includes('\t') ? '\t' : (txt.split('\n')[0].includes(';') ? ';' : ',');
    rows = txt.split(/\r?\n/).filter(l => l.trim() && !/^\s*[#%]/.test(l)).map(l => l.split(sep).map(v => { const t = v.trim().replace(/^"(.*)"$/, '$1'); const n = Number(t); return t !== '' && isFinite(n) ? n : t; }));
  }
  return parseTable(rows, name);
}

/* ---------- Detection from file name ---------- */
function detectFromName(name, kind) {
  const base = name.replace(/\.[^.]+$/, '');
  const d = { run: null, article: null, axis: null, type: null, f1: null, f2: null, level: null, db: null, dur: null, pulses: null, suffix: null, kindId: null, confidence: 0, reasons: [] };
  let m;
  if ((m = base.match(/^(\d{1,4})[_\- ]/))) d.run = parseInt(m[1], 10);
  if ((m = base.match(/\b(fixture|sqm|qm|payload|edu|table|bare)\b/i))) d.article = m[1];
  if ((m = base.match(/(?:^|[_\- ])([XYZ])(?:[_\- ]|$)/i))) d.axis = m[1].toUpperCase();
  if ((m = base.match(/\b(sine|random|srs|shock|classical)\b/i))) d.type = { sine: 'sine', random: 'random', srs: 'srs', shock: 'srs', classical: 'srs' }[m[1].toLowerCase()];
  if ((m = base.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*hz/i))) { d.f1 = parseFloat(m[1]); d.f2 = parseFloat(m[2]); }
  if ((m = base.match(/(-?\d+(?:\.\d+)?)\s*db/i))) d.db = parseFloat(m[1]);
  if ((m = base.match(/(\d+(?:\.\d+)?)\s*g(?:rms)?(?![a-z])/i))) d.level = parseFloat(m[1]);
  if ((m = base.match(/(\d+)\s*sec/i))) d.dur = parseInt(m[1], 10);
  if ((m = base.match(/(\d+)\s*pulse/i))) d.pulses = parseInt(m[1], 10);
  if ((m = base.match(/(\d+(?:\.\d+)?)\s*oct[\s\-_]*min/i))) d.rate = parseFloat(m[1]);
  if (/history/i.test(base)) d.suffix = 'history'; else if (/_time\b/i.test(base)) d.suffix = 'time';
  // classify
  const type = d.type || (kind === 'psd' || kind === 'rms' ? 'random' : kind === 'srs' || kind === 'time' ? 'srs' : kind === 'sine' ? 'sine' : null);
  d.type = type;
  if (type === 'sine') {
    if (d.level != null && d.level <= 0.5 && d.f1 != null && d.f1 >= 200) { d.kindId = 'sinesurvey'; d.confidence = 0.9; d.reasons.push('Low level sweep that does not start near 5 Hz; kept as a separate survey test'); }
    else if (d.level != null && d.level <= 0.5 && d.f2 != null && d.f2 <= 600) { d.kindId = 'sig'; d.confidence = 0.9; d.reasons.push('Low level sweep over a short band: treated as a signature sweep (pre/post comparison)'); }
    else if (d.level != null && d.level <= 0.5) { d.kindId = 'lowsine'; d.confidence = 0.95; }
    else if (d.level != null && d.level > 0.5) { d.kindId = 'sineq'; d.confidence = 0.9; }
    else if (d.f1 != null && d.f2 <= 200) { d.kindId = 'sineq'; d.confidence = 0.6; }
    else if (d.f1 != null && d.f2 >= 1000) { d.kindId = 'lowsine'; d.confidence = 0.6; }
  } else if (type === 'random') {
    if (d.db != null) { d.kindId = d.db <= -5 ? 'rand-6' : d.db <= -2 ? 'rand-3' : 'rand0'; d.confidence = 0.95; }
    else if (d.level != null && d.level <= 2) { d.kindId = 'lowrand'; d.confidence = 0.9; }
    else if (d.level != null) { d.kindId = 'rand0'; d.confidence = 0.5; d.reasons.push('No dB level in name, assumed full level'); }
    else { d.reasons.push('No level in the name: goes into the planned random slot of the axis, or is assumed full level'); }
  } else if (type === 'srs') { d.kindId = 'srs'; d.confidence = d.level ? 0.9 : 0.7; }
  if (!d.axis) { d.confidence = Math.min(d.confidence, 0.3); d.reasons.push('Axis not found in file name'); }
  if (!d.kindId) { d.reasons.push('Test type could not be classified'); }
  return d;
}

/* ---------- Profiles as curves ---------- */
function dispToG(mmPkPk, f) { return (mmPkPk / 1000 / 2) * Math.pow(2 * Math.PI * f, 2) / G0; }
function sineProfileCurve(test) {
  const pr = P.profiles; const k = test.kind;
  const pts = [];
  if (k === 'lowsine' || k === 'sinesurvey' || k === 'sig') {
    // level and band from the file name when present (for example 0.15 g or 0.25 g), else the profile setting
    const f = (test.fileIds || []).map(id => P.files.find(q => q.id === id)).find(q => q && q.kind === 'sine');
    const d = f?.detected || {}; const p = pr.lowsine;
    const g = test.level ?? d.level ?? p.g; const f1 = d.f1 ?? (f ? f.x[0] : p.f1); const f2 = d.f2 ?? (f ? f.x[f.x.length - 1] : p.f2);
    return { x: [f1, f2], y: [g, g], label: `Profile ${g} g` };
  }
  if (k === 'sineq') {
    const p = test.axis === 'Z' ? pr.sine_oop : pr.sine_ip;
    for (const [f1, f2, t, v] of p.segs) {
      if (t === 'disp') { const n = 24; for (let i = 0; i <= n; i++) { const f = f1 * Math.pow(f2 / f1, i / n); pts.push([f, dispToG(v, f)]); } }
      else { pts.push([f1, v]); pts.push([f2, v]); }
    }
    return { x: pts.map(p => p[0]), y: pts.map(p => p[1]), label: 'Profile (' + (test.axis === 'Z' ? 'out of plane' : 'in plane') + ')' };
  }
  return null;
}
function logInterp(bp, f) { // bp sorted [[f,v]]; log-log interpolation; null outside
  if (f < bp[0][0] || f > bp[bp.length - 1][0]) return null;
  for (let i = 0; i < bp.length - 1; i++) { const [f1, v1] = bp[i], [f2, v2] = bp[i + 1]; if (f >= f1 && f <= f2) { if (f1 === f2) return v2; const t = Math.log(f / f1) / Math.log(f2 / f1); return Math.exp(Math.log(v1) + t * (Math.log(v2) - Math.log(v1))); } }
  return null;
}
function psdGrms(bp, f1 = null, f2 = null) { // integrate log-log segments analytically
  let a = 0;
  for (let i = 0; i < bp.length - 1; i++) {
    let [fa, va] = bp[i], [fb, vb] = bp[i + 1];
    if (f1 != null) { if (fb <= f1) continue; if (fa < f1) { va = logInterp(bp, f1); fa = f1; } }
    if (f2 != null) { if (fa >= f2) continue; if (fb > f2) { vb = logInterp(bp, f2); fb = f2; } }
    if (fa >= fb) continue;
    const n = Math.log(vb / va) / Math.log(fb / fa);
    a += Math.abs(n + 1) < 1e-9 ? va * fa * Math.log(fb / fa) : va / (n + 1) * (fb * Math.pow(fb / fa, n) - fa);
  }
  return Math.sqrt(a);
}
/* Which PSD a random test was run against: the full-level profile (default) or the notched profile of its axis (test.profile = 'notched'),
   and at which schedule level in dB (test.levelDb; the test kind's level when not set). */
function testLevelDb(test) { if (test.levelDb != null && test.levelDb !== '') return +test.levelDb; const k = kindById(test.kind); return k.db != null ? k.db : 0; }
function baseRandomProfile(test) { const lp = test.profile && test.profile !== 'full' ? libProfile(test.profile) : null; return (lp && lp.type === 'random') ? { ...lp, custom: true } : { id: 'full', bp: P.profiles.random.bp, name: 'Full-level profile', short: 'full', limits: [], custom: false }; }
function randomScale(test) {
  const pr = P.profiles; const full = psdGrms(pr.random.bp);
  if (test.kind === 'lowrand') return Math.pow(pr.lowrand.grms / full, 2);
  return Math.pow(10, testLevelDb(test) / 10);
}
function randomProfileCurve(test) {
  const base = baseRandomProfile(test); const s = randomScale(test); const db = test.kind === 'lowrand' ? null : testLevelDb(test);
  const bp = base.bp.map(([f, v]) => [f, v * s]);
  const g = psdGrms(bp);
  const limits = (base.limits || []).map(l => ({ ...l, max: l.max * s }));
  return { x: bp.map(p => p[0]), y: bp.map(p => p[1]), bp, grms: g, notched: base.custom, custom: base.custom, id: base.id, name: base.name, short: base.short || (base.custom ? 'custom' : 'full'), limits, db, label: `${base.custom ? base.name : 'Profile'} ${g.toFixed(2)} gRMS${db != null && db !== 0 ? ' (' + db + ' dB)' : ''}` };
}
/* Hidden tests and sessions (check runs, runs done wrong, faulty sets) stay in the project but are left out of the tree, the Overview and the
   Signatures candidates unless "Show hidden" is on. */
const isHidden = o => !!(o && o.hidden);
const visibleTests = ts => UI.showHidden ? ts : ts.filter(t => !t.hidden);
const visibleSessions = () => UI.showHidden ? P.sessions : P.sessions.filter(s => !s.hidden);
/* Tree order: a manual position (set by dragging in the left panel) first, then run number, then kind, then creation time. */
const byRun = (a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || (a.run ?? 9999) - (b.run ?? 9999) || kindById(a.kind).order - kindById(b.kind).order || (a.created || 0) - (b.created || 0);
/* SRS: the profile the test was run against (test.profile, else the first SRS profile in the library) and the requirement. */
function srsCurveOf(p, label) { return p ? { x: p.bp.map(b => b[0]), y: p.bp.map(b => b[1]), bp: p.bp, label: label || p.name, name: p.name, pulses: p.pulses } : null; }
function srsProfileFor(test) { const lp = test?.profile ? libProfile(test.profile) : null; return srsCurveOf(lp && lp.type === 'srs' ? lp : libFor('srs').find(p => p.id !== P.profiles.srsRequirementId) || null); }
function srsRequirement() { return srsCurveOf(libProfile(P.profiles.srsRequirementId), null); }
/* Channel limits for a test: the profile's limits, or, better, the limit lines the controller exported with the PSD ("Limit N-Abort(f)"),
   which carry the abort line (limit + abort dB) over the band that was entered. */
function limitsOf(test, f = null) {
  f = f || specFileOf(test); const out = []; const prof = f?.kind === 'psd' ? randomProfileCurve(test) : null; const abortDb = P.profiles.tol.limitAbortDb ?? 6;
  // the limit lines the controller exported are what was actually entered: when there are any, they replace the profile's list
  if (!(f?.limitLines || []).length) for (const l of prof?.limits || []) out.push({ ...l, source: 'profile' });
  for (const L of f?.limitLines || []) {
    const idx = L.data.map((v, i) => v > 0 ? i : -1).filter(i => i >= 0); if (!idx.length) continue;
    // 'Limit 4-Abort(f)' carries the abort line (limit + abort dB); 'Limit 4(f)' carries the limit itself
    const isAbort = L.abort ?? /abort/i.test(L.label || ''); const v = Math.max(...idx.map(i => L.data[i])); const lim = { ch: L.ch, max: +(isAbort ? v / Math.pow(10, abortDb / 10) : v).toPrecision(3), lo: f.x[idx[0]], hi: f.x[idx[idx.length - 1]], abort: isAbort ? v : null, source: 'export' };
    const k = out.findIndex(o => o.ch === L.ch); if (k >= 0) out[k] = lim; else out.push(lim);
  }
  return out;
}

/* ---------- Math helpers ---------- */
function trapzGrms(x, y, f1 = null, f2 = null) {
  let a = 0;
  for (let i = 0; i < x.length - 1; i++) {
    let xa = x[i], xb = x[i + 1], ya = y[i], yb = y[i + 1];
    if (ya == null || yb == null) continue;
    if (f1 != null && xb <= f1) continue; if (f2 != null && xa >= f2) continue;
    if (f1 != null && xa < f1) { ya = ya + (yb - ya) * (f1 - xa) / (xb - xa); xa = f1; }
    if (f2 != null && xb > f2) { yb = ya + (yb - ya) * (f2 - xa) / (xb - xa); xb = f2; }
    a += (ya + yb) / 2 * (xb - xa);
  }
  return Math.sqrt(a);
}
function argmax(arr, lo = 0, hi = arr.length) { let bi = -1, bv = -Infinity; for (let i = lo; i < hi; i++) { const v = arr[i]; if (v != null && v > bv) { bv = v; bi = i; } } return bi; }
function smooth(y, w = 3) { if (w <= 1) return y; const out = new Array(y.length); const h = Math.floor(w / 2); for (let i = 0; i < y.length; i++) { let s = 0, n = 0; for (let j = i - h; j <= i + h; j++) { if (j >= 0 && j < y.length && y[j] != null) { s += y[j]; n++; } } out[i] = n ? s / n : null; } return out; }
function findPeaks(x, y, thr = 2, maxN = 6, minF = 0) {
  // local maxima of y above thr with prominence; returns [{f, v, q, i}]
  const ys = smooth(y, 3); const peaks = [];
  for (let i = 2; i < ys.length - 2; i++) {
    if (x[i] < minF) continue;
    const v = ys[i]; if (v == null || v < thr) continue;
    if (v > ys[i - 1] && v >= ys[i + 1] && v > ys[i - 2] && v >= ys[i + 2]) {
      // prominence: lowest value between this and higher neighbors within a window
      let lo = v; for (let j = i - 1; j >= 0 && j > i - 60; j--) { if (ys[j] > v) break; lo = Math.min(lo, ys[j]); }
      let hi = v; for (let j = i + 1; j < ys.length && j < i + 60; j++) { if (ys[j] > v) break; hi = Math.min(hi, ys[j]); }
      const prom = v - Math.max(lo, hi);
      if (prom < v * 0.3) continue;
      // half power bandwidth
      const hp = v / Math.SQRT2; let a = i, b = i;
      while (a > 0 && ys[a] > hp) a--; while (b < ys.length - 1 && ys[b] > hp) b++;
      const q = (x[b] - x[a]) > 0 ? x[i] / (x[b] - x[a]) : null;
      peaks.push({ f: x[i], v: y[i], q, i, prom });
    }
  }
  peaks.sort((p, q) => q.v - p.v);
  return peaks.slice(0, maxN).sort((p, q) => p.f - q.f);
}
function ratioSeries(x, num, den, sqrt = false) {
  return num.map((v, i) => { const d = den[i]; if (v == null || d == null || d <= 0) return null; const r = v / d; return sqrt ? Math.sqrt(r) : r; });
}
// Shock response spectrum from a time history (Smallwood ramp invariant, absolute acceleration, Q = 10)
function computeSRS(t, a, freqs, Q = 10) {
  const dt = (t[t.length - 1] - t[0]) / (t.length - 1); const zeta = 1 / (2 * Q);
  const out = [];
  for (const fn of freqs) {
    const wn = 2 * Math.PI * fn, wd = wn * Math.sqrt(1 - zeta * zeta), E = Math.exp(-zeta * wn * dt), K = wd * dt;
    const C = E * Math.cos(K), S = E * Math.sin(K), Sp = S / K;
    const b0 = 1 - Sp, b1 = 2 * (Sp - C), b2 = E * E - Sp, a1 = -2 * C, a2 = E * E;
    let y1 = 0, y2 = 0, x1 = 0, x2 = 0, mx = 0;
    for (let i = 0; i < a.length; i++) { const x0 = a[i] || 0; const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; if (Math.abs(y0) > mx) mx = Math.abs(y0); x2 = x1; x1 = x0; y2 = y1; y1 = y0; }
    out.push(mx);
  }
  return out;
}
// Same filter, keeping the positive, negative and maximax response separately (a shaker SRS should meet the profile both ways)
function computeSRSpn(t, a, freqs, Q = 10) {
  const dt = (t[t.length - 1] - t[0]) / (t.length - 1); const zeta = 1 / (2 * Q);
  const pos = [], neg = [], mm = [];
  for (const fn of freqs) {
    const wn = 2 * Math.PI * fn, wd = wn * Math.sqrt(1 - zeta * zeta), E = Math.exp(-zeta * wn * dt), K = wd * dt;
    const C = E * Math.cos(K), S = E * Math.sin(K), Sp = S / K;
    const b0 = 1 - Sp, b1 = 2 * (Sp - C), b2 = E * E - Sp, a1 = -2 * C, a2 = E * E;
    let y1 = 0, y2 = 0, x1 = 0, x2 = 0, hi = 0, lo = 0;
    for (let i = 0; i < a.length; i++) { const x0 = a[i] || 0; const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; if (y0 > hi) hi = y0; if (y0 < lo) lo = y0; x2 = x1; x1 = x0; y2 = y1; y1 = y0; }
    pos.push(hi); neg.push(-lo); mm.push(Math.max(hi, -lo));
  }
  return { pos, neg, mm };
}
function octaveFreqs(f1, f2, perOct = 6) { const o = []; for (let f = f1; f <= f2 * 1.0001; f *= Math.pow(2, 1 / perOct)) o.push(f); return o; }

/* ---------- Channel helpers ---------- */
let MAP_AXIS = null; // axis of the test being rendered; picks the in-plane channel map when a session has one
function withAxis(axis, fn) { const prev = MAP_AXIS; MAP_AXIS = axis; try { return fn(); } finally { MAP_AXIS = prev; } }
function mapFor(sess, axis = MAP_AXIS) { return (axis && axis !== 'Z' && sess?.useInPlaneMap && sess?.chmapInPlane) ? sess.chmapInPlane : chmapOf(sess); }
function chInfo(sess, ch) {
  const m = mapFor(sess)?.[ch]; if (!m) return { sensorId: null, axis: null, sensor: null, name: ch == null ? 'Control' : 'Ch ' + ch };
  const sensor = sess.sensors.find(s => s.id === m.sensor);
  return { sensorId: m.sensor, axis: m.axis, sensor, name: sensor ? `${sensorLabel(sensor)} ${m.axis === 'C' ? '' : m.axis}`.trim() : 'Ch ' + ch };
}
function colStyle(sess, col) {
  if (col.role === 'control' || col.role === 'control-dup') return { color: currentThemeIsDark() ? '#f2f4f7' : '#111827', dash: 'solid', width: 2.2 };
  const info = chInfo(sess, col.ch);
  const color = info.sensor?.color || '#888';
  const dash = { X: 'solid', Y: 'dash', Z: 'dot' }[info.axis] || 'solid';
  return { color, dash, width: 1.4 };
}
function colLabel(sess, col) {
  if (col.role === 'control') return 'Control';
  if (col.role === 'control-dup') return 'Control (dup)';
  const info = chInfo(sess, col.ch);
  return `${info.name} (ch${col.ch})`;
}

/* ---------- Low-frequency channel check ----------
   Below the first mode the article moves as a rigid body with the table, so each channel's ratio to control at low frequency
   is the direction cosine between that sensor axis and the drive axis. For each sensor this gives: which channel carries the
   drive (the "drive channel"), how far the sensor is rotated from the drive axis, and whether the readings are physical at all
   (a channel that reads several times the control on all three axes is noise, a bad sensitivity or a loose cable). */
function lfBand(f) {
  if (f.kind === 'psd') return [Math.max(f.x[0], 20), 40];
  if (f.kind === 'sine') { const lo = Math.max(f.x[0] * 1.3, 8); return [lo, Math.min(20, lo * 2.5)]; }
  return null;
}
function medianBand(x, y, lo, hi) { const v = []; for (let i = 0; i < x.length; i++) if (x[i] >= lo && x[i] <= hi && y[i] != null && isFinite(y[i])) v.push(y[i]); if (!v.length) return null; v.sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; }
const LF_CACHE = new Map();
function lfCheck(t) { return withAxis(t.axis, () => lfCheckInner(t)); }
function lfCheckInner(t) {
  const sess = sessionOf(t); const f = specFileOf(t); if (!f || !sess) return null;
  const key = t.id + '|' + f.id + '|' + JSON.stringify(sess.sensors.map(x => [x.id, x.ch, x.orient]));
  if (LF_CACHE.has(key)) return LF_CACHE.get(key);
  const band = lfBand(f); const ctl = controlCol(f);
  const out = { band, usable: !!(band && ctl && band[1] > band[0] && f.x[0] <= band[0] * 1.01), sensors: new Map(), file: f };
  const sq = f.kind === 'psd';
  const cm = ctl && band ? medianBand(f.x, ctl.data, band[0], band[1]) : null;
  for (const x of sensorsOf(sess)) {
    const r = { sensor: x, ratio: {}, mag: null, dom: null, tilt: null, status: 'nodata', note: '' };
    const chans = sensorChannels(sess, x);
    for (const { axis: ax, ch } of chans) {
      const c = f.cols.find(q => q.ch === ch && q.role === 'response'); if (!c) continue;
      if (out.usable && cm > 0) { const m = medianBand(f.x, c.data, band[0], band[1]); if (m != null) { const v = m / cm; r.ratio[ax] = sq ? Math.sqrt(v) : v; } }
      else r.ratio[ax] = null;
    }
    const vals = Object.entries(r.ratio).filter(([, v]) => v != null);
    if (!vals.length) { r.status = chans.length ? (out.usable ? 'nodata' : 'noband') : 'unmapped'; out.sensors.set(x.id, r); continue; }
    r.mag = Math.sqrt(vals.reduce((a, [, v]) => a + v * v, 0));
    vals.sort((a, b) => b[1] - a[1]); r.dom = vals[0][0]; const domV = vals[0][1];
    const minV = Math.min(...vals.map(v => v[1]));
    r.tilt = r.mag > 0 ? Math.acos(clamp(domV / r.mag, 0, 1)) * 180 / Math.PI : null;
    // declared orientation wins for the drive channel
    const declared = Object.entries(x.orient || {}).find(([, o]) => o && o.replace(/^[+-]/, '').toUpperCase() === t.axis);
    r.declared = declared ? declared[0] : null;
    // random: content below the profile band (down to the first PSD line) should be near zero; a channel with far more than the control there is noise
    if (sq && f.x[0] < band[0] - 1) {
      const co = trapzGrms(f.x, ctl.data, f.x[0], band[0]);
      const oob = chans.map(({ ch }) => { const c = f.cols.find(q => q.ch === ch && q.role === 'response'); return c ? trapzGrms(f.x, c.data, f.x[0], band[0]) : null; }).filter(v => v != null);
      if (co > 0 && oob.length) { r.oob = Math.min(...oob) / co; r.oobMax = Math.max(...oob); }
    }
    if (vals.length >= 2 && minV > 1.2 && r.mag > 2) { r.status = 'noisy'; r.note = 'All axes read above the control at low frequency: not a physical motion. Check sensitivity, coupling, cable.'; }
    else if (r.oob != null && r.oob > 5) { r.status = 'noisy'; r.note = `Below ${fmtF(band[0])} Hz every axis carries ${fmt(r.oob, 2)}× the control (up to ${fmt(r.oobMax)} gRMS), which is noise, not motion. Check sensitivity, coupling, cable.`; }
    else if (r.mag > 2.5) { r.status = 'high'; r.note = 'Reads far above the control below the first mode. Check the sensitivity entered in the controller.'; }
    else if (r.mag < 0.5) { r.status = 'low'; r.note = 'Reads far below the control. Sensitivity too high in the controller, sensor loose, or no signal.'; }
    else if (r.declared && r.declared !== r.dom) { r.status = 'mismatch'; r.note = `Declared drive axis is ${r.declared} but ${r.dom} carries the motion.`; }
    else if (r.tilt != null && r.tilt > 25) { r.status = 'tilted'; r.note = `Drive is spread over two sensor axes (${fmt(r.tilt, 2)}° from ${r.dom}). Normal for a sensor mounted at an angle; the drive channel is ${r.dom}.`; }
    else r.status = 'ok';
    out.sensors.set(x.id, r);
  }
  LF_CACHE.set(key, out); if (LF_CACHE.size > 200) LF_CACHE.delete(LF_CACHE.keys().next().value);
  return out;
}
const LF_STATUS = { ok: ['good', 'OK'], tilted: ['good', 'OK, angled'], noisy: ['bad', 'Noisy'], high: ['bad', 'Too high'], low: ['warn', 'Low'], mismatch: ['bad', 'Axis mismatch'], nodata: ['', 'No data'], noband: ['', 'No LF band'], unmapped: ['', 'Unmapped'] };
/* Which sensor axis carries the drive for this test: declared orientation first, then the data. */
function driveAxisOf(sess, sensor, t, lf = null) {
  if (!sensor || sensor.id === 'CTRL') return null;
  const declared = Object.entries(sensor.orient || {}).find(([, o]) => o && o.replace(/^[+-]/, '').toUpperCase() === t.axis);
  if (declared) return declared[0];
  const r = (lf || lfCheck(t))?.sensors.get(sensor.id);
  if (r && r.dom && ['ok', 'tilted', 'mismatch'].includes(r.status)) return r.dom;
  // fall back to the label: sensor axes aligned with the test axes (bare fixture style)
  return sensorChannels(sess, sensor).some(c => c.axis === t.axis) ? t.axis : null;
}
