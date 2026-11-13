/* ===== Metrics and plotting helpers ===== */
const sessionOf = t => P.sessions.find(s => s.id === (t?.sessionId ?? t));
const testFiles = t => t.fileIds.map(id => P.files.find(f => f.id === id)).filter(Boolean);
const testsOfSession = sid => P.tests.filter(t => t.sessionId === sid);
function testTitle(t) { const k = kindById(t.kind); return `${t.axis} · ${t.name}${t.run != null ? ' · run ' + t.run : ''}`; }
function fileLabelKind(k) { return { sine: 'Sine sweep', psd: 'Random PSD', rms: 'RMS history', srs: 'SRS', time: 'Time history', report: 'Report' }[k] || k; }
function reportsOf(t) { return testFiles(t).filter(f => f.kind === 'report'); }
async function openReport(f) {
  const blob = b64ToBlob(f.b64, f.mime);
  if (window.claude && typeof window.claude.use === 'function') { try { const dl = await window.claude.use('downloads'); if (dl) { await dl.save({ filename: f.name, data: blob }); return; } } catch (e) { if (e?.code !== 'declined') toast('Could not hand over the report: ' + (e?.message || e), true); return; } }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function specFileOf(t) { const fs = testFiles(t); return fs.find(f => f.kind === 'sine') || fs.find(f => f.kind === 'psd') || fs.find(f => f.kind === 'srs') || derivedSrsOf(timeFileOf(t)) || null; }
// A shock test can hold several pulses (one time history each); the selected one drives the spectrum and checks
function pulsesOf(t) { return testFiles(t).filter(f => f.kind === 'time'); }
function timeFileOf(t) { const ps = pulsesOf(t); if (!ps.length) return null; const i = (UI.pulse && UI.pulse[t.id]) || 0; return ps[Math.min(i, ps.length - 1)]; }
// Controllers that export only the shock time history (no SRS spectrum): compute the SRS of every channel once and use it as the test's spectrum.
const SRS_DERIVED = new WeakMap();
function derivedSrsOf(tf) {
  if (!tf || !tf.x || tf.x.length < 16) return null; let d = SRS_DERIVED.get(tf); if (d) return d;
  const fr = octaveFreqs(100, 5000, 12);
  d = { id: tf.id + ':srs', name: tf.name, kind: 'srs', derived: true, sessionId: tf.sessionId, testId: tf.testId, x: fr, time: tf, cols: tf.cols.map(c => { const r = computeSRSpn(tf.x, c.data, fr); return { ...c, data: r.mm, pos: r.pos, neg: r.neg }; }) };
  SRS_DERIVED.set(tf, d); return d;
}
// Pseudo velocity from an SRS in g: PV = SRS * g0 / (2 pi f), m/s
function pseudoVel(x, y) { return y.map((v, i) => v == null ? null : v * G0 / (2 * Math.PI * x[i])); }
/* Shock checks for a test with a shock time history: how well the control met the SRS profile (maximax, positive, negative),
   the control pulse itself (peaks, effective duration, velocity and displacement over the frame), and per channel numbers. */
function shockMetrics(t, tfIn) { return withAxis(t.axis, () => {
  const tf = tfIn || timeFileOf(t); const f = tfIn ? derivedSrsOf(tfIn) : specFileOf(t); if (!f || f.kind !== 'srs' || !tf) return null;
  const sess = sessionOf(t); const prof = srsProfileFor(t); const tolDb = P.profiles.tol.srsTolDb;
  const ctlS = controlCol(f); const ctlT = controlCol(tf); if (!ctlS || !ctlT) return null;
  const out = { prof, tolDb, band: prof ? [prof.x[0], prof.x[prof.x.length - 1]] : null, dev: null, tolStats: null, pulse: null, rows: [] };
  if (prof) {
    const fx = [], mm = [], pos = [], neg = [];
    f.x.forEach((fq, i) => { if (fq < out.band[0] * 0.999 || fq > out.band[1] * 1.001) return; const pv = logInterp(prof.bp, fq); if (!pv) return; fx.push(fq); mm.push(20 * Math.log10(ctlS.data[i] / pv)); if (ctlS.pos) { pos.push(20 * Math.log10(Math.max(ctlS.pos[i], 1e-9) / pv)); neg.push(20 * Math.log10(Math.max(ctlS.neg[i], 1e-9) / pv)); } });
    out.dev = { x: fx, mm, pos: pos.length ? pos : null, neg: neg.length ? neg : null };
    const st = arr => { if (!arr || !arr.length) return null; let hi = -1e9, hiF = 0, lo = 1e9, loF = 0, inn = 0; arr.forEach((v, i) => { if (v > hi) { hi = v; hiF = fx[i]; } if (v < lo) { lo = v; loF = fx[i]; } if (Math.abs(v) <= tolDb + 1e-9) inn++; }); return { hi, hiF, lo, loF, pct: 100 * inn / arr.length, n: arr.length, inn, above: 100 * arr.filter(v => v >= -0.05).length / arr.length }; };
    out.tolStats = { mm: st(mm), pos: st(out.dev.pos), neg: st(out.dev.neg) };
  }
  // the control pulse
  const x = tf.x, a = ctlT.data.map(v => v || 0); const dt = (x[x.length - 1] - x[0]) / (x.length - 1);
  let pk = 0, pkI = 0, mx = -1e9, mxI = 0, mn = 1e9, mnI = 0; a.forEach((v, i) => { if (v > mx) { mx = v; mxI = i; } if (v < mn) { mn = v; mnI = i; } if (Math.abs(v) > pk) { pk = Math.abs(v); pkI = i; } });
  let i0 = -1, i1 = -1; a.forEach((v, i) => { if (Math.abs(v) >= pk / 3) { if (i0 < 0) i0 = i; i1 = i; } });
  let v = 0, d = 0, vMax = 0, dMax = 0; const vel = [0];
  for (let i = 1; i < a.length; i++) { v += (a[i] + a[i - 1]) / 2 * G0 * dt; vel.push(v); if (Math.abs(v) > vMax) vMax = Math.abs(v); }
  for (let i = 1; i < vel.length; i++) { d += (vel[i] + vel[i - 1]) / 2 * dt; if (Math.abs(d) > dMax) dMax = Math.abs(d); }
  const e = a.map(q => q * q); const etot = e.reduce((p, q) => p + q, 0); let acc = 0, t10 = null, t90 = null; e.forEach((q, i) => { acc += q; if (t10 == null && acc >= 0.05 * etot) t10 = x[i]; if (t90 == null && acc >= 0.95 * etot) t90 = x[i]; });
  out.pulse = { pos: mx, posT: x[mxI], neg: mn, negT: x[mnI], peak: pk, peakT: x[pkI], te: i0 >= 0 ? x[i1] - x[i0] : null, t90: t10 != null && t90 != null ? t90 - t10 : null, dv: v, vMax, dEnd: d, dMax, frame: x[x.length - 1] - x[0], fs: 1 / dt, ratioPN: mn !== 0 ? mx / -mn : null };
  // per channel
  for (const c of f.cols) {
    if (c.role === 'control-dup') continue; const isC = c.role === 'control'; const tc = tf.cols.find(q => q.ch === c.ch && q.role === c.role) || (isC ? ctlT : null); if (!tc) continue;
    let tp = 0, tpI = 0; tc.data.forEach((q, i) => { if (q != null && Math.abs(q) > tp) { tp = Math.abs(q); tpI = i; } });
    const pv = pseudoVel(f.x, c.data); let pvm = 0, pvF = null; pv.forEach((q, i) => { if (q > pvm) { pvm = q; pvF = f.x[i]; } });
    let sm = 0, smF = null; c.data.forEach((q, i) => { if (q > sm) { sm = q; smF = f.x[i]; } });
    let am = null, amF = null; if (!isC) c.data.forEach((q, i) => { const r = ctlS.data[i] > 0 ? q / ctlS.data[i] : null; if (r != null && (am == null || r > am)) { am = r; amF = f.x[i]; } });
    const info = isC ? null : chInfo(sess, c.ch);
    out.rows.push({ isControl: isC, ch: c.ch, label: colLabel(sess, c), style: colStyle(sess, c), sensor: info?.sensor || null, axis: info?.axis || null, tpeak: tp, tpeakT: x[tpI], srs: sm, srsF: smF, amp: am, ampF: amF, pv: pvm, pvF });
  }
  out.rows.sort((p, q) => (p.isControl ? -1 : q.isControl ? 1 : 0) || ((p.sensor?.pos ?? 99) - (q.sensor?.pos ?? 99)) || (p.ch - q.ch));
  return out;
}); }
function fileOfKind(t, k) { return testFiles(t).find(f => f.kind === k) || null; }
function controlCol(f) { return f.cols.find(c => c.role === 'control') || null; }
function responseCols(f) { return f.cols.filter(c => c.role === 'response'); }

const M_CACHE = new Map();
function computeMetrics(t) { return withAxis(t.axis, () => computeMetricsInner(t)); }
function computeMetricsInner(t) {
  const sess = sessionOf(t); const f = specFileOf(t);
  const key = f ? [t.id, f.id, t.axis, t.kind, t.level, JSON.stringify(sess?.sensors.map(x => [x.id, x.ch, x.orient, x.color])), JSON.stringify(P.profiles), sess?.useInPlaneMap, JSON.stringify(sess?.chmapInPlane || null), currentThemeIsDark()].join('|') : null;
  if (key && M_CACHE.has(key)) return M_CACHE.get(key);
  const out = { rows: [], peaks: [], kind: null, profile: null, control: null, perSensor: [], lf: null };
  if (!f) return out;
  out.kind = f.kind; const ctl = controlCol(f); const pr = P.profiles;
  const range = f.kind === 'psd' ? [Math.max(f.x[0], 20), f.x[f.x.length - 1]] : [f.x[0], f.x[f.x.length - 1]];
  if (f.kind === 'psd') out.profile = randomProfileCurve(t);
  else if (f.kind === 'sine') out.profile = sineProfileCurve(t);
  const lf = lfCheck(t); out.lf = lf;
  if (ctl) {
    const r = colMetrics(f, ctl, ctl, range, sess, t, lf); r.isControl = true; out.control = r; out.rows.push(r);
  }
  const BAD = ['noisy', 'high', 'low'];
  for (const c of responseCols(f)) { const r = colMetrics(f, c, ctl, range, sess, t, lf); r.flagged = !!(r.sensorId && BAD.includes(lf?.sensors.get(r.sensorId)?.status)); out.rows.push(r); if (r.peaks) r.peaks.forEach(p => out.peaks.push({ ...p, col: r.label, color: r.style.color, ch: c.ch, axis: r.axis, sensor: r.sensorName, inAxis: r.inAxis })); }
  out.peaks.sort((a, b) => b.v - a.v);
  // one row per sensor: its highest channel, its drive channel, and the low-frequency check
  const vkey = f.kind === 'psd' ? 'grms' : 'peak';
  for (const x of sensorsOf(sess)) {
    const rows = out.rows.filter(r => !r.isControl && r.sensorId === x.id); if (!rows.length) continue;
    const best = rows.slice().sort((a, b) => (b[vkey] || 0) - (a[vkey] || 0))[0];
    const bestT = rows.filter(r => r.tmax != null).sort((a, b) => b.tmax - a.tmax)[0] || null;
    const drive = rows.find(r => r.inAxis) || null; const chk = lf?.sensors.get(x.id) || null;
    out.perSensor.push({ sensor: x, rows, best, bestT, drive, chk, driveAxis: drive?.axis || null });
  }
  if (key) { M_CACHE.set(key, out); if (M_CACHE.size > 120) M_CACHE.delete(M_CACHE.keys().next().value); }
  return out;
}
function colMetrics(f, c, ctl, range, sess, test, lf) {
  const info = chInfo(sess, c.ch); test = test || P.tests.find(t => t.fileIds.includes(f.id));
  const drive = test && info.sensor ? driveAxisOf(sess, info.sensor, test, lf) : null;
  const r = { label: colLabel(sess, c), ch: c.ch, axis: info.axis, sensorId: info.sensorId, sensor: info.sensor, sensorName: info.sensor ? sensorLabel(info.sensor) : '', part: info.sensor?.part || '', inAxis: test ? (drive ? info.axis === drive : info.axis === test.axis) : false, style: colStyle(sess, c) };
  const x = f.x, y = c.data;
  if (f.kind === 'sine') {
    const i = argmax(y); r.peak = y[i]; r.peakF = x[i];
    if (ctl && c !== ctl) { const tr = ratioSeries(x, y, ctl.data); const j = argmax(tr); r.tmax = tr[j]; r.tmaxF = x[j]; r.peaks = findPeaks(x, tr, P.profiles.peakThreshold, 6, Math.max(x[0], 5)); r.tr = tr; }
  } else if (f.kind === 'psd') {
    r.grms = trapzGrms(x, y, range[0], range[1]);
    r.bands = P.profiles.bands.map(([a, b]) => trapzGrms(x, y, a, b));
    const i = argmax(y.map((v, k) => x[k] >= range[0] ? v : null)); r.peak = y[i]; r.peakF = x[i];
    r.sigma3 = 3 * r.grms;
    if (ctl && c !== ctl) { const tr = ratioSeries(x, y, ctl.data, true); const j = argmax(tr.map((v, k) => x[k] >= range[0] ? v : null)); r.tmax = tr[j]; r.tmaxF = x[j]; r.peaks = findPeaks(x, tr, P.profiles.peakThreshold, 6, range[0]); r.tr = tr; const cg = trapzGrms(x, ctl.data, range[0], range[1]); r.grmsRatio = cg > 0 ? r.grms / cg : null; }
  } else if (f.kind === 'srs') {
    const i = argmax(y); r.peak = y[i]; r.peakF = x[i];
    if (ctl && c !== ctl) { const tr = ratioSeries(x, y, ctl.data); const j = argmax(tr); r.tmax = tr[j]; r.tmaxF = x[j]; r.tr = tr; }
  }
  return r;
}
function historyMetrics(t) { return withAxis(t.axis, () => {
  const sess = sessionOf(t); const f = fileOfKind(t, 'rms'); if (!f) return null;
  const n = f.x.length, tail = Math.max(3, Math.floor(n * 0.1));
  return { file: f, rows: f.cols.map(c => { const d = c.data.filter(v => v != null); const last = d.slice(-tail); const mean = last.reduce((a, b) => a + b, 0) / (last.length || 1); return { label: colLabel(sess, c), style: colStyle(sess, c), final: mean, max: Math.max(...d), ch: c.ch, role: c.role }; }) };
}); }
function timeMetrics(t) { return withAxis(t.axis, () => {
  const sess = sessionOf(t); const f = timeFileOf(t); if (!f) return null;
  const ctl = controlCol(f);
  return { file: f, rows: f.cols.filter(c => c.role !== 'control-dup').map(c => { let mx = 0, mi = 0; c.data.forEach((v, i) => { if (v != null && Math.abs(v) > mx) { mx = Math.abs(v); mi = i; } }); return { label: colLabel(sess, c), style: colStyle(sess, c), peak: mx, peakT: f.x[mi], ch: c.ch, role: c.role }; }) };
}); }

/* ---------- Plotly helpers ---------- */
function plotTheme() {
  const cs = getComputedStyle(document.documentElement);
  return { bg: cs.getPropertyValue('--plot-bg').trim(), grid: cs.getPropertyValue('--plot-grid').trim(), fg: cs.getPropertyValue('--plot-fg').trim(), fg3: cs.getPropertyValue('--fg3').trim(), line: cs.getPropertyValue('--line').trim() };
}
function baseLayout(opts = {}) {
  const th = plotTheme();
  return {
    paper_bgcolor: th.bg, plot_bgcolor: th.bg, font: { family: 'IBM Plex Sans, system-ui, sans-serif', size: 12, color: th.fg },
    margin: { l: 62, r: 16, t: 28, b: 46 + (opts.legendRows === 2 ? 20 : 0) }, hovermode: 'x unified', hoverlabel: { font: { family: 'IBM Plex Mono, monospace', size: 11 } },
    legend: { orientation: 'h', y: -0.18, x: 0, font: { size: 11 } }, showlegend: !(opts.legendRows > 2),
    /* ticksuffix with showticksuffix 'last' puts the unit into the unified hover header ("631 Hz") while the tick labels stay clean */
    xaxis: { title: { text: opts.xTitle || 'Frequency (Hz)', standoff: 6 }, type: opts.xType || 'log', range: opts.xRange && (opts.xType || 'log') === 'log' ? [Math.log10(opts.xRange[0]), Math.log10(opts.xRange[1])] : (opts.xRange || undefined), gridcolor: th.grid, zeroline: false, linecolor: th.line, tickfont: { family: 'IBM Plex Mono, monospace', size: 11 }, exponentformat: 'none', ticks: 'outside', showline: true, mirror: true, ticksuffix: opts.xUnit != null ? opts.xUnit : (/time/i.test(opts.xTitle || '') ? ' s' : ' Hz'), showticksuffix: 'last', hoverformat: (opts.xType || 'log') === 'log' ? '.4~r' : '' },
    yaxis: { title: { text: opts.yTitle || '', standoff: 6 }, type: opts.yType || 'log', gridcolor: th.grid, zeroline: false, linecolor: th.line, tickfont: { family: 'IBM Plex Mono, monospace', size: 11 }, exponentformat: 'power', ticks: 'outside', showline: true, mirror: true },
    title: opts.title ? { text: opts.title, x: 0.02, xanchor: 'left', font: { size: 13 } } : undefined,
    shapes: opts.shapes || [], annotations: opts.annotations || [],
    uirevision: 'keep-' + (opts.xType || 'log') + (opts.yType || 'log') + (opts.rev || ''),
  };
}
const PLOT_CONFIG = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'], toImageButtonOptions: { format: 'png', scale: 2, filename: 'vibescope-plot' } };
const livePlots = new Map();
/* With many channels Plotly's unified hover box grows taller than the plot and gets cut off. Above HOVER_LIST_MIN lines the values go into
   a scrollable list beside the plot instead, sorted from highest to lowest, with a vertical cursor line across the plot. */
const HOVER_LIST_MIN = 9;
function drawPlot(id, traces, layout) {
  const el = document.getElementById(id); if (!el) return;
  const data = traces.filter(t => t.hoverinfo !== 'skip' && t.hovertemplate);
  const listMode = layout.hovermode === 'x unified' && data.length > HOVER_LIST_MIN;
  if (listMode) {
    for (const t of data) { const m = /%\{y[^}]*\}([^<]*)</.exec(t.hovertemplate) || []; const nm = (/<extra>(.*)<\/extra>/.exec(t.hovertemplate) || [])[1] || t.name || ''; t.meta = { unit: (m[1] || '').trim(), name: nm.replace(/<[^>]+>/g, '') }; t.hoverinfo = 'none'; delete t.hovertemplate; }
    const th = plotTheme(); layout.hovermode = 'x'; layout.hoverdistance = -1; layout.spikedistance = -1;
    Object.assign(layout.xaxis, { showspikes: true, spikemode: 'across', spikesnap: 'cursor', spikethickness: 1, spikedash: 'dot', spikecolor: th.fg3 });
  }
  const pr = Plotly.react(el, traces, layout, PLOT_CONFIG);
  livePlots.set(id, el);
  el._hoverList = listMode;
  if (!listMode) hideHoverList(el);
  Promise.resolve(pr).then(() => { if (!el._hlBound && el.on) { el._hlBound = true; bindHoverList(el); } declutterAnnotations(el); }).catch(e => console.error(e));
  if (!el._ro) { el._ro = new ResizeObserver(() => { if (!document.body.contains(el) || !el.offsetWidth) return; try { Plotly.Plots.resize(el).catch(() => { }); } catch (e) { } }); el._ro.observe(el.parentElement); }
}
function hoverListBox(el) {
  const box = el.parentElement; if (!box) return null; if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
  let hl = box.querySelector(':scope > .hoverlist'); if (!hl) { hl = document.createElement('div'); hl.className = 'hoverlist'; box.appendChild(hl); hl.onmouseleave = e => { if (!el._hlPinned && !el.contains(e.relatedTarget)) hl.style.display = 'none'; }; }
  return hl;
}
function hideHoverList(el) { el._hlPinned = false; const hl = el.parentElement?.querySelector(':scope > .hoverlist'); if (hl) { hl.style.display = 'none'; hl.classList.remove('pinned'); } }
function bindHoverList(el) {
  const fill = (hl, pts, pinned) => {
    const xt = el._fullLayout?.xaxis?.title?.text || ''; const xu = /time/i.test(xt) ? ' s' : ' Hz'; const x0 = pts[0].x;
    hl.innerHTML = `<div class="hl-h"><span>${fmt(x0, 4)}${xu} · ${pts.length} lines, highest first</span>${pinned ? '<button class="hl-x" title="Release (or click the plot again)">✕</button>' : ''}</div><div class="hl-tip">${pinned ? 'Pinned: move the mouse here to scroll, or click the plot to release.' : 'Scroll the mouse wheel to see the whole list · click the plot to pin it'}</div><div class="hl-b ${pts.length > 28 ? 'cols' : ''}">${pts.map(p => `<div class="hl-r"><span class="sw" style="background:${p.color}${p.dash && p.dash !== 'solid' ? ';opacity:.6' : ''}"></span><span class="hl-n" title="${esc(p.name)}">${esc(p.name)}</span><span class="hl-v">${fmt(p.y, 4)}${esc(p.unit ? ' ' + p.unit.replace(/^\s+/, '') : '')}</span></div>`).join('')}</div>`;
    const bx = hl.querySelector('.hl-x'); if (bx) bx.onclick = e => { e.stopPropagation(); el._hlPinned = false; hl.style.display = 'none'; hl.classList.remove('pinned'); };
  };
  el.on?.('plotly_hover', e => {
    if (!el._hoverList || el._hlPinned || !e.points?.length) return; const hl = hoverListBox(el); if (!hl) return;
    const pts = e.points.filter(p => p.data && p.data.meta && p.y != null && isFinite(p.y)).map(p => ({ name: p.data.meta.name || p.data.name, unit: p.data.meta.unit, y: p.y, x: p.x, color: p.data.line?.color || p.data.marker?.color || '#888', dash: p.data.line?.dash })).sort((a, b) => b.y - a.y);
    if (!pts.length) return; el._hlPts = pts;
    const keep = hl.style.display === 'block' ? hl.scrollTop : 0; fill(hl, pts, false); hl.scrollTop = keep;
    // the list stays on one side (right) and only moves when the cursor is over that part of the plot
    const fl = el._fullLayout; const xpx = fl.xaxis.l2p(fl.xaxis.type === 'log' ? Math.log10(pts[0].x) : pts[0].x) + fl.xaxis._offset;
    const W = el.clientWidth; const side = el._hlSide || 'right'; const listW = hl.offsetWidth || 300;
    if (side === 'right' && xpx > W - fl.margin.r - listW - 30) el._hlSide = 'left'; else if (side === 'left' && xpx < fl.margin.l + listW + 30) el._hlSide = 'right';
    const left = el._hlSide === 'left';
    hl.style.display = 'block'; hl.style.left = left ? (fl.margin.l + 8) + 'px' : ''; hl.style.right = left ? '' : (fl.margin.r + 8) + 'px'; hl.style.top = (fl.margin.t + 4) + 'px'; hl.style.maxHeight = Math.max(120, el.clientHeight - fl.margin.t - fl.margin.b - 8) + 'px';
  });
  // click pins the list where it is so the mouse can go into it; click again (or ✕) releases it
  // Plotly puts a cover over the page while the button is down, so the release is caught on the document
  el.addEventListener('pointerdown', e => {
    const x0 = e.clientX, y0 = e.clientY;
    const up = ev => {
      document.removeEventListener('pointerup', up, true); if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 4) return;
      if (!el._hoverList || !el._hlPts) return; const hl = hoverListBox(el); if (!hl) return;
      el._hlPinned = !el._hlPinned; hl.classList.toggle('pinned', el._hlPinned); if (el._hlPts) fill(hl, el._hlPts, el._hlPinned); hl.style.display = 'block';
    };
    document.addEventListener('pointerup', up, true);
  }, true);
  // the mouse wheel over the plot scrolls the list instead of the page while the list is showing
  el.addEventListener('wheel', e => { const hl = el.parentElement?.querySelector(':scope > .hoverlist'); if (!el._hoverList || !hl || hl.style.display !== 'block' || hl.scrollHeight <= hl.clientHeight) return; e.preventDefault(); hl.scrollTop += e.deltaY; }, { passive: false });
  el.addEventListener('mouseleave', e => { if (el._hlPinned || e.relatedTarget?.classList?.contains('dragcover')) return; const hl = el.parentElement?.querySelector(':scope > .hoverlist'); if (hl && !hl.contains(e.relatedTarget)) hl.style.display = 'none'; });
}
/* Peak labels drawn as annotations are spread out so they do not sit on top of each other: each label tries a few positions around its peak
   (highest peaks first) and takes the first that is free and inside the plot. A label that finds no room is dropped; its marker stays. */
function declutterAnnotations(el) {
  const fl = el._fullLayout; if (!fl || !fl.annotations?.length) return;
  const anns = (el.layout.annotations || []).map(a => ({ ...a })); const idx = anns.map((a, i) => i).filter(i => anns[i].showarrow && anns[i].xref !== 'paper' && anns[i].yref !== 'paper');
  if (idx.length < 2) return;
  const xa = fl.xaxis, ya = fl.yaxis; const W = el.clientWidth, H = el.clientHeight;
  const px = a => xa.l2p(a.x) + xa._offset, py = a => ya.l2p(a.y) + ya._offset;
  const plot = { l: xa._offset, r: xa._offset + xa._length, t: ya._offset, b: ya._offset + ya._length };
  const placed = []; const ov = (p, q) => !(p.r < q.l || p.l > q.r || p.b < q.t || p.t > q.b);
  idx.sort((i, j) => py(anns[i]) - py(anns[j]));
  const cands = [[0, -24], [0, -42], [26, -30], [-26, -30], [0, -60], [44, -48], [-44, -48], [0, -78], [0, 26], [60, -66], [-60, -66], [0, -96], [0, 44]];
  // markers themselves are obstacles too
  for (const i of idx) { const x = px(anns[i]), y = py(anns[i]); placed.push({ l: x - 4, r: x + 4, t: y - 4, b: y + 4 }); }
  for (const i of idx) {
    const a = anns[i]; const x = px(a), y = py(a); if (!isFinite(x) || !isFinite(y)) continue;
    const w = String(a.text || '').replace(/<[^>]+>/g, '').length * ((a.font?.size || 10) * 0.6) + 8, h = (a.font?.size || 10) + 6;
    let ok = false;
    for (const [ax, ay] of cands) { const cx = x + ax, cy = y + ay; const b = { l: cx - w / 2, r: cx + w / 2, t: cy - h / 2, b: cy + h / 2 }; if (b.l < plot.l || b.r > plot.r || b.t < plot.t || b.b > plot.b) continue; if (placed.some(q => ov(q, b))) continue; placed.push(b); a.ax = ax; a.ay = ay; a.visible = true; ok = true; break; }
    if (!ok) a.visible = false;
  }
  Plotly.relayout(el, { annotations: anns });
}
function purgePlots() { for (const [id, el] of livePlots) { if (!document.body.contains(el)) { try { el._ro?.disconnect(); Plotly.purge(el); } catch (e) { } livePlots.delete(id); } } }
function tolTraces(profile, kind) {
  const tol = P.profiles.tol; if (!profile) return [];
  const mk = (f, name, dash, color) => ({ x: profile.x, y: profile.y.map(v => v * f), name, mode: 'lines', line: { dash, width: 1, color }, hoverinfo: 'skip', showlegend: false, legendgroup: 'tol' });
  if (kind === 'psd') { const a = Math.pow(10, tol.randAlarmDb / 10), b = Math.pow(10, tol.randAbortDb / 10); return [mk(a, `+${tol.randAlarmDb} dB alarm`, 'dot', '#e0a100'), mk(1 / a, '', 'dot', '#e0a100'), mk(b, `+${tol.randAbortDb} dB abort`, 'dash', '#d6336c'), mk(1 / b, '', 'dash', '#d6336c')]; }
  if (kind === 'sine') { const a = 1 + tol.sineAlarmPct / 100, b = 1 + tol.sineAbortPct / 100; return [mk(a, 'alarm', 'dot', '#e0a100'), mk(1 / a, '', 'dot', '#e0a100'), mk(b, 'abort', 'dash', '#d6336c'), mk(1 / b, '', 'dash', '#d6336c')]; }
  if (kind === 'srs') { const a = Math.pow(10, tol.srsTolDb / 20); return [mk(a, `+${tol.srsTolDb} dB`, 'dot', '#e0a100'), mk(1 / a, '', 'dot', '#e0a100')]; }
  return [];
}
function profileTrace(profile, color = '#19a974') { return { x: profile.x, y: profile.y, name: profile.label, mode: 'lines', line: { color, width: 2 }, hovertemplate: '%{y:.3g}' + (profile.grms != null ? ' g²/Hz' : ' g') + '<extra>' + esc(profile.label) + '</extra>', legendgroup: 'prof' }; }
/* Unit written after the hover value: the file's own y unit unless the caller plots a derived quantity (transmissibility, ratio). */
function fileUnit(f) { return f.kind === 'psd' ? ' g²/Hz' : f.kind === 'rms' ? ' g' : f.kind === 'srs' ? ' g' : f.kind === 'time' ? ' g' : ' g'; }
function traceFor(f, c, sess, opts = {}) {
  const st = colStyle(sess, c); const name = opts.name || colLabel(sess, c); const unit = opts.unit != null ? opts.unit : fileUnit(f);
  return { x: f.x, y: opts.y || c.data, name, mode: 'lines', line: { color: st.color, dash: st.dash, width: opts.width || st.width }, connectgaps: false, hovertemplate: '%{y:.4g}' + unit + '<extra>' + name + '</extra>' };
}
function chanKey(c) { return c.role === 'control' ? 'ctl' : c.ch; }
/* Default channel selection: with many sensors start with the drive channel of each sensor plus control, otherwise everything. */
function defaultChanSel(t, f) {
  const sess = sessionOf(t); const sel = {}; const many = sensorsOf(sess).length > 4;
  if (!many) return sel;
  return withAxis(t.axis, () => { const lf = lfCheck(t); for (const c of f.cols) { if (c.role === 'control-dup') continue; if (c.role === 'control') { sel.ctl = true; continue; } const info = chInfo(sess, c.ch); const d = info.sensor ? driveAxisOf(sess, info.sensor, t, lf) : null; sel[c.ch] = d ? info.axis === d : true; } return sel; });
}
function chanSel(t, f) { if (!UI.chan[t.id]) UI.chan[t.id] = defaultChanSel(t, f); return UI.chan[t.id]; }
function visibleCols(f, t) {
  const sel = chanSel(t, f);
  return f.cols.filter(c => c.role !== 'control-dup' && sel[chanKey(c)] !== false);
}
