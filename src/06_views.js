/* ===== Test view ===== */
/* Sensor grid: one column per sensor (left to right, wrapping), with the X, Y and Z chips stacked underneath.
   Each chip shows the channel's peak (or gRMS) so the grid doubles as the peak table, and clicking toggles the channel in the overlay plots. */
function peakText(r, kind) {
  if (!r) return '';
  if (kind === 'psd') return `${fmt(r.grms)} gRMS`;
  return `${fmt(r.peak)} g @ ${fmtF(r.peakF)} Hz`;
}
function sensorPanel(t, f, m) { return withAxis(t.axis, () => sensorPanelInner(t, f, m)); }
function sensorPanelInner(t, f, m) {
  const sess = sessionOf(t); const sel = chanSel(t, f); const lf = lfCheck(t); const kind = f.kind;
  const ctl = f.cols.find(c => c.role === 'control');
  const rowOf = c => m?.rows.find(r => c.role === 'control' ? r.isControl : r.ch === c.ch);
  const chip = (c, ax, isDrive) => { const k = chanKey(c); const st = colStyle(sess, c); const on = sel[k] !== false; const r = rowOf(c); return `<span class="chip ${on ? '' : 'off'} ${isDrive ? 'drive' : ''}" data-k="${k}" title="${esc(c.label)}${isDrive ? ' · drive channel' : ''}${r?.tmax != null ? ' · max T ' + fmt(r.tmax, 3) + '× @ ' + fmtF(r.tmaxF) + ' Hz' : ''}"><span class="sw" style="background:${st.color};${st.dash === 'dash' ? 'background:repeating-linear-gradient(90deg,' + st.color + ' 0 4px,transparent 4px 6px)' : st.dash === 'dot' ? 'background:repeating-linear-gradient(90deg,' + st.color + ' 0 2px,transparent 2px 4px)' : ''}"></span><span class="ax">${ax}<span class="muted">${c.ch ?? ''}</span></span><span class="pk mono">${peakText(r, kind)}</span></span>`; };
  let cols = '';
  if (ctl) cols += `<div class="scol"><div class="sch"><span class="sw" style="background:${colStyle(sess, ctl).color}"></span><span class="sname">Control</span></div><div class="chips">${chip(ctl, 'C', false)}</div></div>`;
  const mapped = new Set();
  for (const x of sensorsOf(sess)) {
    const chs = sensorChannels(sess, x).map(({ axis: ax, ch }) => { const c = f.cols.find(q => q.ch === ch && q.role === 'response'); return c ? [ax, c] : null; }).filter(Boolean);
    if (!chs.length) continue;
    const d = driveAxisOf(sess, x, t, lf); const r = lf?.sensors.get(x.id); const [cls, lbl] = LF_STATUS[r?.status || 'nodata'];
    chs.forEach(([, c]) => mapped.add(c));
    cols += `<div class="scol" data-sensor="${x.id}"><div class="sch"><span class="sw" style="background:${x.color}"></span><span class="sname" title="${esc([x.brand, x.serial].filter(Boolean).join(' '))} · click to toggle all three">${esc(sensorLabel(x))}</span>${r && r.status !== 'nodata' && r.status !== 'noband' ? `<span class="pill ${cls}" title="${esc(r.note || '')}${r.mag != null ? ' |r| = ' + fmt(r.mag, 2) : ''}">${lbl}</span>` : ''}</div><div class="chips">${chs.map(([ax, c]) => chip(c, ax, ax === d)).join('')}</div></div>`;
  }
  const other = f.cols.filter(c => c.role === 'response' && !mapped.has(c));
  if (other.length) cols += `<div class="scol"><div class="sch"><span class="sw" style="background:#888"></span><span class="sname muted">Unmapped inputs</span></div><div class="chips">${other.map(c => chip(c, 'ch', false)).join('')}</div></div>`;
  const parts = [...new Set(sensorsOf(sess).map(x => x.part))];
  return `<div class="row" style="margin-bottom:8px"><span class="small muted">Show in the overlay</span><button class="btn small" data-q="drive" title="One channel per sensor: the one that carries the shaker motion">Drive channels</button><button class="btn small" data-q="all">All</button><button class="btn small" data-q="none">None</button>${parts.length > 1 ? '<span class="small muted" style="margin-left:6px">Part</span>' + parts.map(p => `<button class="btn small" data-part="${esc(p)}">${esc(p)}</button>`).join('') : ''}<span style="flex:1"></span><span class="small muted">${kind === 'psd' ? 'Chips show gRMS over the band' : 'Chips show the peak and where it is'} · X solid, Y dashed, Z dotted · ring = drive channel</span></div><div class="scols">${cols}</div>`;
}
function bindSensorPanel(root, t, f) {
  const sess = sessionOf(t); const sel = chanSel(t, f);
  const refresh = () => { $$('.chip[data-k]', root).forEach(ch => ch.classList.toggle('off', sel[ch.dataset.k] === false)); renderTestPlots(t); };
  // click toggles; double-click solos (only that channel, or only that sensor's channels, plus the control)
  const allKeys = $$('.chip[data-k]', root).map(c => c.dataset.k);
  const solo = keep => { for (const k of allKeys) sel[k] = keep.includes(k) || k === 'ctl'; refresh(); };
  $$('.chip[data-k]', root).forEach(ch => { ch.onclick = () => { const k = ch.dataset.k; sel[k] = sel[k] === false; refresh(); }; ch.ondblclick = e => { e.preventDefault(); solo([ch.dataset.k]); }; });
  $$('.scol .sname', root).forEach(n => { n.onclick = () => { const col = n.closest('.scol'); const ks = $$('.chip[data-k]', col).map(c => c.dataset.k); const anyOn = ks.some(k => sel[k] !== false); ks.forEach(k => sel[k] = !anyOn); refresh(); }; n.ondblclick = e => { e.preventDefault(); solo($$('.chip[data-k]', n.closest('.scol')).map(c => c.dataset.k)); }; });
  $$('[data-q]', root).forEach(b => b.onclick = () => {
    const q = b.dataset.q; const d = q === 'drive' ? defaultChanSel(t, f) : null;
    for (const c of f.cols) { if (c.role === 'control-dup') continue; const k = chanKey(c); sel[k] = q === 'all' ? true : q === 'none' ? (c.role === 'control') : (c.role === 'control' ? true : (d[k] !== undefined ? d[k] : true)); }
    if (q === 'drive' && !sensorsOf(sess).length) for (const c of f.cols) sel[chanKey(c)] = true;
    refresh();
  });
  $$('[data-part]', root).forEach(b => b.onclick = () => { const part = b.dataset.part; const d = defaultChanSel(t, f); withAxis(t.axis, () => { for (const c of f.cols) { if (c.role !== 'response') continue; const info = chInfo(sess, c.ch); sel[c.ch] = info.sensor?.part === part ? (d[c.ch] !== undefined ? d[c.ch] : true) : false; } }); refresh(); });
}
function renderTest(v) {
  const t = activeTest();
  if (!t) { v.innerHTML = `<div class="empty">Select a test in the left panel, or open one from the Overview matrix.</div>`; return; }
  const sess = sessionOf(t); const fs = testFiles(t); const k = kindById(t.kind);
  const spec = specFileOf(t); const rmsF = fileOfKind(t, 'rms'); const timeF = timeFileOf(t);
  const panelFile = spec || timeF; const m = spec ? computeMetrics(t) : null; const panelHtml = panelFile ? sensorPanel(t, panelFile, m) : '';
  const hasGrid = spec && spec.kind !== 'srs' && sensorsOf(sess).length > 0;
  const profPill = m?.profile && spec?.kind === 'psd' ? `<span class="pill ${m.profile.custom ? 'accent' : ''}" title="${esc(m.profile.custom ? m.profile.name : 'Full-level random profile')} at ${m.profile.db ?? 0} dB schedule level. Change in Edit.">${esc(m.profile.custom ? m.profile.name : 'full profile')} · ${m.profile.db ? m.profile.db + ' dB' : '0 dB'} · ${m.profile.grms.toFixed(2)} gRMS</span>` : spec?.kind === 'srs' && srsProfileFor(t) ? `<span class="pill accent" title="SRS profile the test is compared with. Change in Edit.">${esc(srsProfileFor(t).name)}${srsProfileFor(t).pulses ? ' · ' + srsProfileFor(t).pulses + ' pulses' : ''}</span>` : '';
  let html = `<div class="section-h"><h2>${esc(t.name)}</h2><span class="pill axis">${t.axis} axis</span><span class="pill">${esc(k.short)}</span>${t.run != null ? `<span class="pill">run ${t.run}</span>` : ''}${profPill}${t.status ? `<span class="pill ${t.status === 'Pass' ? 'good' : /Fail|Abort/.test(t.status) ? 'bad' : ''}">${esc(t.status)}</span>` : ''}${t.hidden ? '<span class="pill warn" title="This test is hidden from the tree and the Overview">hidden</span>' : ''}<span style="flex:1"></span><span class="sub">${esc(sess?.name || '')}</span><button class="btn small" id="t-edit">Edit</button><button class="btn small" id="t-hide">${t.hidden ? 'Unhide' : 'Hide'}</button><button class="btn small" id="t-cmp">Add to compare</button></div>`;
  const sp = isSigTest(t) ? sigPairOf(t) : loadPair(t);
  if (sp) html += `<div class="sigbar"><span class="small">${isSigTest(t) ? `This sweep is the <strong>${sp.before === t ? 'before' : 'after'}</strong> signature of ${esc(treeLabel(sp.load))}${sp.load.run != null ? ' (run ' + sp.load.run + ')' : ''}.` : `Signature sweeps around this run: run ${sp.before.run ?? '?'} before, run ${sp.after.run ?? '?'} after.`}</span><button class="btn small primary" id="t-sigpair">Compare before vs after in Signatures</button></div>`;
  html += `<div class="card" style="margin-bottom:14px"><div class="card-b"><div class="row" style="gap:16px;align-items:flex-start"><div style="flex:1;min-width:240px"><div class="small muted" style="margin-bottom:4px">Files in this test</div>${fs.length ? fs.map(f => `<div class="row small filerow"><span class="pill ${f.kind === 'sine' || f.kind === 'psd' || f.kind === 'srs' ? 'accent' : f.kind === 'report' ? 'warn' : ''}">${fileLabelKind(f.kind)}</span><span class="mono">${esc(f.name)}</span><span class="muted">${f.kind === 'report' ? (f.size / 1024).toFixed(0) + ' KB' : f.x.length + ' pts · ' + f.cols.length + ' ch'}</span>${f.kind === 'report' ? `<button class="btn small" data-report="${f.id}" title="Open the controller report (downloads the file, opens in Word or a PDF viewer)">Open report</button>` : ''}<button class="btn ghost small" data-unassign="${f.id}" title="Unassign">✕</button></div>`).join('') : '<div class="small muted">No files yet. Drag controller exports onto this test in the left panel, or assign them in the Files tab.</div>'}<div class="row small" style="margin-top:6px"><span class="muted">Report link</span><input class="input small" id="t-rlink" placeholder="SharePoint or Drive link to the controller report (optional)" value="${esc(t.reportUrl || '')}" style="flex:1;min-width:160px">${t.reportUrl ? `<a class="btn small" href="${esc(t.reportUrl)}" target="_blank" rel="noopener">Open link</a>` : ''}</div></div><div style="flex:1;min-width:240px"><div class="small muted" style="margin-bottom:4px">Notes</div><textarea class="input notes" id="t-notes" placeholder="Observations, anomalies, what changed…">${esc(t.notes || '')}</textarea></div></div></div></div>`;
  if (panelHtml) html += `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Sensors, channels and peaks</h3><span class="hint">Click a chip to show or hide that channel in the overlay plots, click a sensor name to toggle all three. Double-click a chip or a sensor name to show only that one. The per-sensor plots below always show every axis.</span></div><div class="card-b" id="t-panel">${panelHtml}</div></div>`;
  if (spec || timeF) {
    const tools = `<div class="plot-tools"><span class="small muted">Scale</span><div class="seg"><button data-sc="x:log" class="${UI.plotScale.x === 'log' ? 'active' : ''}">log f</button><button data-sc="x:linear" class="${UI.plotScale.x === 'linear' ? 'active' : ''}">lin f</button></div><div class="seg"><button data-sc="y:log" class="${UI.plotScale.y === 'log' ? 'active' : ''}">log y</button><button data-sc="y:linear" class="${UI.plotScale.y === 'linear' ? 'active' : ''}">lin y</button></div><label class="chk small"><input type="checkbox" id="p-tol" ${UI.showTol !== false ? 'checked' : ''}> tolerance lines</label><label class="chk small"><input type="checkbox" id="p-mark" ${UI.markPeaks ? 'checked' : ''}> mark peaks</label>${pulsesOf(t).length > 1 ? `<span class="small muted" style="margin-left:8px">Pulse</span><div class="seg">${pulsesOf(t).map((f, i) => `<button data-pulse="${i}" class="${((UI.pulse && UI.pulse[t.id]) || 0) === i ? 'active' : ''}" title="${esc(f.name)}">${i + 1}</button>`).join('')}</div>` : ''}${spec?.kind === 'srs' ? `<span class="small muted" style="margin-left:8px">Show</span><div class="seg"><button data-sq="g" class="${UI.srsQty !== 'pv' ? 'active' : ''}" title="Shock response spectrum, peak absolute acceleration (g)">SRS (g)</button><button data-sq="pv" class="${UI.srsQty === 'pv' ? 'active' : ''}" title="Pseudo velocity = SRS × g ÷ 2πf, a measure of shock severity: about 1.3 m/s (50 in/s) is where damage to typical equipment starts, 2.5 m/s (100 in/s) is severe">Pseudo velocity</button></div>` : ''}</div>`;
    html += `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3 id="p-main-title">Spectrum</h3>${tools}</div><div class="plotbox tall"><div class="plot" id="p-main"></div></div></div>`;
    if (spec && spec.kind !== 'srs') html += `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Transmissibility (response ÷ control)</h3><span class="hint">Peaks above ${P.profiles.peakThreshold}× are labelled with the sensor. For random this is √(PSD ratio).</span></div><div class="plotbox"><div class="plot" id="p-tr"></div></div></div>`;
    if (hasGrid) html += `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3 id="p-grid-title">Each sensor</h3><div class="plot-tools"><span class="small muted">Quantity</span><div class="seg"><button data-gq="spec" class="${UI.gridQty !== 'tr' ? 'active' : ''}">Response</button><button data-gq="tr" class="${UI.gridQty === 'tr' ? 'active' : ''}">Transmissibility</button></div><span class="small muted" style="margin-left:8px">Plot size</span><div class="seg"><button data-gh="s" class="${UI.gridH === 's' ? 'active' : ''}" title="Small: 3 plots per row">S · 3 per row</button><button data-gh="m" class="${!UI.gridH || UI.gridH === 'm' ? 'active' : ''}" title="Medium: 2 plots per row">M · 2</button><button data-gh="l" class="${UI.gridH === 'l' ? 'active' : ''}" title="Large: 1 plot per row">L · 1</button></div></div></div><div class="card-b" id="p-grid" style="padding:10px"></div></div>`;
    if (spec && spec.kind === 'srs' && timeF) html += `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Shock checks</h3><span class="hint">How well the control met the profile, and what the pulse itself looked like. A shaker SRS should be inside the tolerance band in both the positive and negative SRS, with a short effective duration and near-zero velocity and displacement at the end of the frame.</span></div><div class="card-b"><div class="row" style="gap:18px;align-items:flex-start;flex-wrap:wrap"><div id="t-shock" style="flex:1 1 520px;min-width:0;overflow-x:auto"></div><div style="flex:1 1 420px;min-width:0"><div class="plotbox" style="height:340px"><div class="plot" id="p-srsdev"></div></div></div></div></div></div>`
      + `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>SRS amplification (response SRS ÷ control SRS)</h3><span class="hint">The shock equivalent of transmissibility: where each location sees more than the input and by how much. Peaks above ${P.profiles.peakThreshold}× are labelled.</span></div><div class="plotbox"><div class="plot" id="p-srsamp"></div></div></div>`;
    if (spec && spec.kind === 'srs' && !spec.derived && timeF) html += `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>SRS computed from the time history</h3><span class="hint">Absolute acceleration, Q = 10, 1/6 octave. Compare with the controller SRS above.</span></div><div class="plotbox"><div class="plot" id="p-csrs"></div></div></div>`;
    if (rmsF) html += `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>RMS history</h3><span class="hint">Channel RMS versus time as the controller ramped up and held level.</span></div><div class="plotbox" style="height:300px"><div class="plot" id="p-hist"></div></div></div>`;
    if (timeF) html += `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Time history</h3><span class="hint">Raw acceleration versus time.</span></div><div class="plotbox" style="height:300px"><div class="plot" id="p-time"></div></div></div>`;
    html += `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Per sensor</h3><span class="hint">Highest channel of each sensor, its drive channel and the low-frequency check.</span><button class="btn small" id="t-copy0">Copy TSV</button></div><div class="card-b tbl-wrap" id="t-sensors"></div></div>`;
    html += `<div class="grid2"><div class="card"><div class="card-h"><h3>Channel metrics</h3><button class="btn small" id="t-copy1">Copy TSV</button></div><div class="card-b tbl-wrap" id="t-metrics"></div></div><div class="card"><div class="card-h"><h3>Resonances (transmissibility peaks)</h3><button class="btn small" id="t-copy2">Copy TSV</button></div><div class="card-b tbl-wrap" id="t-peaks"></div></div></div>`;
  }
  v.innerHTML = html;
  $('#t-edit').onclick = () => editTestDialog(t);
  $('#t-hide').onclick = () => { t.hidden = !t.hidden; persist(); if (t.hidden && !UI.showHidden) { UI.testId = null; UI.tab = 'overview'; toast('Test hidden. Tick "hidden" at the top of the left panel to see it again.'); } render(); };
  $('#t-cmp').onclick = () => { if (!UI.compare.tests.includes(t.id)) UI.compare.tests.push(t.id); toast('Added to compare'); };
  $('#t-notes').onchange = e => { t.notes = e.target.value; persist(); };
  $$('[data-unassign]', v).forEach(b => b.onclick = () => { const f = P.files.find(f => f.id === b.dataset.unassign); if (f) { f.testId = null; t.fileIds = t.fileIds.filter(x => x !== f.id); persist(); render(); } });
  $$('[data-sc]', v).forEach(b => b.onclick = () => { const [ax, sc] = b.dataset.sc.split(':'); UI.plotScale[ax] = sc; $$('[data-sc]', v).forEach(q => q.classList.toggle('active', q.dataset.sc === `${ax}:${UI.plotScale[ax]}` || (q.dataset.sc.split(':')[0] !== ax && q.classList.contains('active')))); renderTestPlots(t); });
  $$('[data-pulse]', v).forEach(b => b.onclick = () => { UI.pulse = UI.pulse || {}; UI.pulse[t.id] = +b.dataset.pulse; render(); });
  $$('[data-sq]', v).forEach(b => b.onclick = () => { UI.srsQty = b.dataset.sq; $$('[data-sq]', v).forEach(q => q.classList.toggle('active', q === b)); renderTestPlots(t); });
  $$('[data-gq]', v).forEach(b => b.onclick = () => { UI.gridQty = b.dataset.gq; $$('[data-gq]', v).forEach(q => q.classList.toggle('active', q === b)); renderTestPlots(t); });
  $$('[data-gh]', v).forEach(b => b.onclick = () => { UI.gridH = b.dataset.gh; $$('[data-gh]', v).forEach(q => q.classList.toggle('active', q === b)); $('#p-grid').dataset.h = UI.gridH; setTimeout(() => { for (const el of livePlots.values()) { try { Plotly.Plots.resize(el); } catch (e) { } } }, 60); });
  const tol = $('#p-tol'); if (tol) tol.onchange = e => { UI.showTol = e.target.checked; renderTestPlots(t); };
  const mk = $('#p-mark'); if (mk) mk.onchange = e => { UI.markPeaks = e.target.checked; renderTestPlots(t); };
  $$('[data-report]', v).forEach(b => b.onclick = () => { const f = P.files.find(f => f.id === b.dataset.report); if (f) openReport(f); });
  $('#t-rlink').onchange = e => { t.reportUrl = e.target.value.trim(); persist(); render(); };
  if (panelFile) bindSensorPanel($('#t-panel'), t, panelFile);
  const pg = $('#p-grid'); if (pg) pg.dataset.h = UI.gridH || 'm';
  renderTestPlots(t);
  $('#t-copy0') && ($('#t-copy0').onclick = () => copyTable($('#t-sensors table')));
  $('#t-copy1') && ($('#t-copy1').onclick = () => copyTable($('#t-metrics table')));
  $('#t-copy2') && ($('#t-copy2').onclick = () => copyTable($('#t-peaks table')));
  $('#t-sigpair') && ($('#t-sigpair').onclick = () => { const t2 = activeTest(); const p = isSigTest(t2) ? sigPairOf(t2) : loadPair(t2); if (p) openSigPair(p); });
}
function shortLabel(r) { return r.isControl ? 'Ctrl' : (r.sensor ? `#${r.sensor.pos} ${r.sensor.name} ${r.axis || ''}` : 'ch' + r.ch); }
function renderTestPlots(t) { return withAxis(t.axis, () => renderTestPlotsInner(t)); }
function renderTestPlotsInner(t) {
  const sess = sessionOf(t); const spec = specFileOf(t); const rmsF = fileOfKind(t, 'rms'); const timeF = timeFileOf(t);
  const m = computeMetrics(t); const showTol = UI.showTol !== false;
  const xT = UI.plotScale.x, yT = UI.plotScale.y;
  if (spec) {
    const cols = visibleCols(spec, t); const traces = [];
    const unit = spec.kind === 'psd' ? 'PSD (g²/Hz)' : spec.kind === 'srs' ? 'SRS (g peak)' : 'Acceleration (g peak)';
    let prof = m.profile;
    if (spec.kind === 'srs') { prof = srsProfileFor(t); const req = srsRequirement(); if (prof) traces.push(profileTrace(prof, '#19a974')); if (req && (!prof || req.name !== prof.name)) traces.push({ ...profileTrace(req, '#9b59b6'), line: { color: '#9b59b6', width: 1.5, dash: 'dashdot' } }); }
    else if (prof) traces.push(profileTrace(prof));
    if (showTol && prof) traces.push(...tolTraces(prof, spec.kind));
    for (const c of cols) traces.push(traceFor(spec, c, sess));
    const peakRows = cols.map(c => { const r = m.rows.find(r => c.role === 'control' ? r.isControl : r.ch === c.ch); return r ? { c, r } : null; }).filter(Boolean);
    const peakAnns = [];
    if (UI.markPeaks) for (const { c, r } of peakRows) { if (r.peakF == null || r.peak == null) continue; const st = colStyle(sess, c); traces.push({ x: [r.peakF], y: [r.peak], mode: 'markers', marker: { color: st.color, size: 9, symbol: 'diamond', line: { width: 1, color: plotTheme().bg } }, showlegend: false, hoverinfo: 'skip' }); peakAnns.push({ x: xT === 'log' ? Math.log10(r.peakF) : r.peakF, y: yT === 'log' ? Math.log10(Math.max(r.peak, 1e-12)) : r.peak, text: `${shortLabel(r)} · ${fmt(r.peak)} @ ${fmtF(r.peakF)} Hz`, showarrow: true, arrowhead: 0, arrowwidth: 1, arrowcolor: st.color, ax: 0, ay: -24, font: { size: 10, color: st.color, family: 'IBM Plex Mono, monospace' }, bgcolor: plotTheme().bg, opacity: 0.95 }); }
    const title = spec.kind === 'psd' ? `Random PSD · control ${fmt(m.control?.grms)} gRMS · ${cols.length} channel(s) shown` : spec.kind === 'sine' ? `Sine sweep · control peak ${fmt(m.control?.peak)} g · ${cols.length} channel(s) shown` : spec.derived ? `Shock response spectrum · computed from the time history (Q = 10, 1/12 octave) · control ${fmt(m.control?.peak)} g at ${fmtF(m.control?.peakF)} Hz` : 'Shock response spectrum';
    $('#p-main-title').textContent = title;
    const xr = plotRange(spec);
    let yTitle = unit;
    if (spec.kind === 'srs' && UI.srsQty === 'pv') {
      for (const tr of traces) { if (!tr.x || !tr.y) continue; tr.y = tr.y.map((v, i) => v == null ? null : v * G0 / (2 * Math.PI * tr.x[i])); if (tr.hovertemplate) tr.hovertemplate = tr.hovertemplate.replace(/ g</, ' m/s<').replace('%{y:.3g}', '%{y:.3g} m/s').replace(' m/s m/s', ' m/s'); }
      const x2 = [xr ? xr[0] : 90, xr ? xr[1] : 5500];
      traces.push({ x: x2, y: [1.27, 1.27], name: '1.27 m/s (50 in/s)', mode: 'lines', line: { color: '#e0a100', dash: 'dash', width: 1 }, hoverinfo: 'skip' }, { x: x2, y: [2.54, 2.54], name: '2.54 m/s (100 in/s)', mode: 'lines', line: { color: '#d6336c', dash: 'dash', width: 1 }, hoverinfo: 'skip' });
      yTitle = 'Pseudo velocity (m/s)'; $('#p-main-title').textContent = title.replace('Shock response spectrum', 'Pseudo velocity shock spectrum');
    }
    drawPlot('p-main', traces, baseLayout({ annotations: (spec.kind === 'srs' && UI.srsQty === 'pv' ? [] : peakAnns).concat(spec.kind === 'srs' && UI.srsQty === 'pv' && yT === 'log' ? [{ xref: 'paper', x: 0.995, xanchor: 'right', y: Math.log10(2.54), yanchor: 'bottom', text: '2.54 m/s (100 in/s)', showarrow: false, font: { size: 10, color: '#d6336c' } }, { xref: 'paper', x: 0.995, xanchor: 'right', y: Math.log10(1.27), yanchor: 'bottom', text: '1.27 m/s (50 in/s)', showarrow: false, font: { size: 10, color: '#e0a100' } }] : []), yTitle, xType: xT, yType: yT, xRange: xr, legendRows: Math.ceil(traces.length / 6) }));
    if (spec.kind !== 'srs') {
      const tr = []; const sh = [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 1, y1: 1, line: { color: plotTheme().fg3, width: 1, dash: 'dot' } }]; const ann = [];
      const labelled = cols.filter(c => c.role !== 'control').length <= 12;
      for (const c of cols) { if (c.role === 'control') continue; const r = m.rows.find(r => r.ch === c.ch); if (!r?.tr) continue; tr.push(traceFor(spec, c, sess, { y: r.tr, unit: '×' })); if (labelled) (r.peaks || []).slice(0, 2).forEach(p => ann.push({ x: Math.log10(p.f), y: Math.log10(p.v), text: `${shortLabel(r)} · ${fmtF(p.f)} Hz · ${fmt(p.v, 2)}×`, showarrow: true, arrowhead: 0, ax: 0, ay: -22, font: { size: 9.5, color: r.style.color } })); }
      const lay = baseLayout({ yTitle: 'Transmissibility (×)', xType: xT, yType: yT, shapes: sh, annotations: yT === 'log' && xT === 'log' ? ann : [], xRange: xr, legendRows: Math.ceil(tr.length / 6) });
      drawPlot('p-tr', tr, lay);
      if ($('#p-grid')) renderSensorGrid(t, spec, m);
    }
    if (spec.kind === 'srs' && !spec.derived && timeF) {
      const sp = srsProfileFor(t); const fmax = Math.max(5000, ...(sp ? sp.x : [])); const freqs = octaveFreqs(100, fmax, 6); const tr = sp ? [profileTrace(sp, '#19a974')] : [];
      for (const c of timeF.cols) { if (c.role === 'control-dup') continue; if (UI.chan[t.id] && UI.chan[t.id][chanKey(c)] === false) continue; const srs = computeSRS(timeF.x, c.data, freqs); tr.push({ ...traceFor(timeF, c, sess), x: freqs, y: srs }); }
      drawPlot('p-csrs', tr, baseLayout({ yTitle: 'SRS (g)', xType: 'log', yType: 'log' }));
    }
  }
  if (spec && spec.kind === 'srs' && timeF) renderShockChecks(t, spec, m);
  if (rmsF) { const tr = []; for (const c of rmsF.cols) { if (UI.chan[t.id] && UI.chan[t.id][chanKey(c)] === false) continue; tr.push(traceFor(rmsF, c, sess)); } drawPlot('p-hist', tr, baseLayout({ xTitle: 'Time (s)', yTitle: 'RMS (g)', xType: 'linear', yType: 'linear', legendRows: Math.ceil(tr.length / 6) })); }
  if (timeF) { const tr = []; for (const c of timeF.cols) { if (c.role === 'control-dup') continue; if (UI.chan[t.id] && UI.chan[t.id][chanKey(c)] === false) continue; tr.push(traceFor(timeF, c, sess)); } drawPlot('p-time', tr, baseLayout({ xTitle: 'Time (s)', yTitle: 'Acceleration (g)', xType: 'linear', yType: 'linear', legendRows: Math.ceil(tr.length / 6) })); }
  renderMetricTables(t, m);
}
function plotRange(spec) { return spec.kind === 'psd' ? [P.profiles.random.bp[0][0] * 0.9, P.profiles.random.bp[P.profiles.random.bp.length - 1][0] * 1.05] : spec.kind === 'srs' ? [90, 5500] : null; }
/* One plot per sensor, every axis in its own colour (X red, Y green, Z blue, as in the 3D axis triad), with the peak of each axis written on the plot. Independent of the overlay selection. */
const AXIS_COLORS = { X: '#d03030', Y: '#2f9e44', Z: '#1f56d6' };
function renderSensorGrid(t, spec, m) {
  const sess = sessionOf(t); const host = $('#p-grid'); if (!host) return;
  const qty = UI.gridQty === 'tr' ? 'tr' : 'spec';
  const ctl = controlCol(spec); const xT = UI.plotScale.x, yT = UI.plotScale.y; const xr = plotRange(spec);
  const unit = qty === 'tr' ? 'T (×)' : spec.kind === 'psd' ? 'g²/Hz' : 'g';
  const cells = [];
  for (const x of sensorsOf(sess)) {
    const chs = sensorChannels(sess, x).map(({ axis, ch }) => { const c = spec.cols.find(q => q.ch === ch && q.role === 'response'); return c ? { axis, c, r: m.rows.find(r => r.ch === ch) } : null; }).filter(Boolean);
    if (chs.length) cells.push({ x, chs });
  }
  $('#p-grid-title').textContent = `Each sensor · ${cells.length} sensor(s) · ${qty === 'tr' ? 'transmissibility' : spec.kind === 'psd' ? 'PSD' : 'acceleration'} · X red, Y green, Z blue`;
  const want = new Set(cells.map(c => 'p-s-' + c.x.id));
  for (const el of Array.from(host.children)) if (!want.has(el.dataset.pid)) el.remove();
  const lf = m.lf;
  for (const { x, chs } of cells) {
    const pid = 'p-s-' + x.id; let cell = host.querySelector(`[data-pid="${pid}"]`);
    const chk = lf?.sensors.get(x.id); const [cls, lbl] = LF_STATUS[chk?.status || 'nodata']; const flagged = chk && ['noisy', 'high', 'low', 'mismatch'].includes(chk.status);
    if (!cell) { cell = document.createElement('div'); cell.className = 'sgcell'; cell.dataset.pid = pid; host.appendChild(cell); }
    cell.classList.toggle('flag', !!flagged);
    const lims = spec.kind === 'psd' ? limitsOf(t, spec) : [];
    const pk = chs.map(({ axis, c, r }) => { const st = { ...colStyle(sess, c), color: AXIS_COLORS[axis] || '#888' }; const lim = lims.find(l => l.ch === c.ch); const txt = qty === 'tr' ? (r?.tmax != null ? `${fmt(r.tmax, 3)}× @ ${fmtF(r.tmaxF)} Hz` : '–') : spec.kind === 'psd' ? (r ? `${fmt(r.grms)} gRMS · pk ${fmt(r.peak)} g²/Hz @ ${fmtF(r.peakF)} Hz${lim ? ` · limit ${+lim.max.toPrecision(3)}${lim.lo != null ? ` (${fmtF(lim.lo)} to ${fmtF(lim.hi)} Hz)` : ''}` : ''}` : '–') : (r ? `${fmt(r.peak)} g @ ${fmtF(r.peakF)} Hz` : '–'); return `<span class="pkx" title="input ${c.ch}"><span class="sw" style="background:${st.color};${st.dash === 'dash' ? 'background:repeating-linear-gradient(90deg,' + st.color + ' 0 4px,transparent 4px 6px)' : st.dash === 'dot' ? 'background:repeating-linear-gradient(90deg,' + st.color + ' 0 2px,transparent 2px 4px)' : ''}"></span><b>${axis}</b> <span class="mono">${txt}</span></span>`; }).join('');
    cell.innerHTML = `<div class="sgt"><span class="sw" style="background:${x.color}"></span><strong title="${esc([x.brand, x.serial].filter(Boolean).join(' '))}">${esc(sensorLabel(x))}</strong><span class="muted small">${esc([x.brand, x.serial].filter(Boolean).join(' '))} · in ${chs.map(q => q.c.ch).join(', ')}</span>${chk && chk.status !== 'nodata' && chk.status !== 'noband' ? `<span class="pill ${cls}" title="${esc(chk.note || '')}">${lbl}</span>` : ''}</div><div class="sgk">${pk}</div><div class="sgp"><div class="plot" id="${pid}"></div></div>`;
    const traces = [];
    if (qty === 'spec') { if (m.profile && showTolOk()) traces.push({ ...profileTrace(m.profile), showlegend: false, line: { color: '#19a974', width: 1.2 } }); if (ctl) traces.push({ ...traceFor(spec, ctl, sess), showlegend: false, line: { color: colStyle(sess, ctl).color, width: 1.4 } }); }
    const yUnit = qty === 'tr' ? '×' : spec.kind === 'psd' ? ' g²/Hz' : ' g';
    for (const { axis, c, r } of chs) {
      const y = qty === 'tr' ? r?.tr : c.data; if (!y) continue;
      const st = { ...colStyle(sess, c), color: AXIS_COLORS[axis] || '#888' };
      traces.push({ ...traceFor(spec, c, sess, { y, name: axis, unit: yUnit }), line: { color: st.color, dash: st.dash, width: 1.4 }, showlegend: false });
      const pf = qty === 'tr' ? r?.tmaxF : r?.peakF, pv = qty === 'tr' ? r?.tmax : r?.peak;
      if (pf != null && pv != null) traces.push({ x: [pf], y: [pv], mode: 'markers', marker: { color: st.color, size: 8, symbol: 'diamond', line: { width: 1, color: plotTheme().bg } }, showlegend: false, hovertemplate: `${axis} peak %{y:.3g}${yUnit} @ %{x:.1f} Hz<extra></extra>` });
      // auto-notch (channel) limit set in the controller for this input, drawn where the response is plotted
      const lim = qty === 'spec' ? lims.find(l => l.ch === c.ch) : null;
      if (lim) { const x0 = lim.lo ?? spec.x[0], x1 = lim.hi ?? spec.x[spec.x.length - 1]; traces.push({ x: [x0, x1], y: [lim.max, lim.max], mode: 'lines', line: { color: st.color, width: 1.4, dash: 'longdash' }, showlegend: false, hovertemplate: `limit input ${c.ch}: %{y:.3g} g²/Hz, ${fmtF(x0)} to ${fmtF(x1)} Hz${lim.source === 'export' ? ' (from the controller export)' : ''}<extra></extra>`, name: `limit ${lim.max} g²/Hz` }); }
    }
    const sh = qty === 'tr' ? [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 1, y1: 1, line: { color: plotTheme().fg3, width: 1, dash: 'dot' } }] : [];
    const lay = baseLayout({ yTitle: unit, xType: xT, yType: yT, xRange: xr, shapes: sh, rev: 'grid' }); lay.margin = { l: 48, r: 8, t: 6, b: 30 }; lay.showlegend = false; lay.xaxis.title = { text: '', standoff: 0 }; lay.font.size = 10;
    drawPlot(pid, traces, lay);
  }
  if (!cells.length) host.innerHTML = '<div class="empty">No sensors mapped to this file.</div>';
}
function showTolOk() { return UI.showTol !== false; }
function renderMetricTables(t, m) {
  const el = $('#t-metrics'), pk = $('#t-peaks'), ps = $('#t-sensors'); if (!el) return;
  const bands = P.profiles.bands;
  const axisCell = r => r.isControl ? '' : (r.inAxis ? '<span class="pill good">drive</span>' : r.axis ? '<span class="pill">' + r.axis + ' cross</span>' : '');
  const sensCell = r => r.isControl ? '<span class="sw" style="background:' + r.style.color + '"></span>Control' : `<span class="sw" style="background:${r.style.color}"></span>${esc(r.sensorName || 'ch' + r.ch)}`;
  const rows = m.rows.slice().sort((a, b) => (a.isControl ? -1 : b.isControl ? 1 : 0) || ((a.sensor?.pos ?? 99) - (b.sensor?.pos ?? 99)) || (a.ch - b.ch));
  let h = '';
  if (m.kind === 'sine') {
    h = `<table class="tbl"><thead><tr><th>Sensor</th><th>Ch</th><th>Axis</th><th class="num">Peak (g)</th><th class="num">At (Hz)</th><th class="num">Max T (×)</th><th class="num">At (Hz)</th></tr></thead><tbody>` + rows.map(r => `<tr><td>${sensCell(r)}</td><td class="mono">${r.isControl ? '' : r.ch}</td><td>${r.isControl ? '' : (r.axis || '') + ' ' + axisCell(r)}</td><td class="num">${fmt(r.peak)}</td><td class="num">${fmtF(r.peakF)}</td><td class="num">${r.isControl ? '' : fmt(r.tmax, 3)}</td><td class="num">${r.isControl ? '' : fmtF(r.tmaxF)}</td></tr>`).join('') + '</tbody></table>';
  } else if (m.kind === 'psd') {
    h = `<table class="tbl"><thead><tr><th>Sensor</th><th>Ch</th><th>Axis</th><th class="num">gRMS</th><th class="num">÷ control</th>${bands.map(b => `<th class="num">${b[0]}–${b[1]} Hz</th>`).join('')}<th class="num">Peak PSD</th><th class="num">At (Hz)</th><th class="num">Max T (×)</th><th class="num">At (Hz)</th><th class="num">3σ (g)</th></tr></thead><tbody>` + rows.map(r => `<tr><td>${sensCell(r)}</td><td class="mono">${r.isControl ? '' : r.ch}</td><td>${r.isControl ? '' : (r.axis || '') + ' ' + axisCell(r)}</td><td class="num">${fmt(r.grms)}</td><td class="num">${r.isControl ? '' : fmt(r.grmsRatio, 3)}</td>${r.bands.map(b => `<td class="num">${fmt(b)}</td>`).join('')}<td class="num">${fmt(r.peak)}</td><td class="num">${fmtF(r.peakF)}</td><td class="num">${r.isControl ? '' : fmt(r.tmax, 3)}</td><td class="num">${r.isControl ? '' : fmtF(r.tmaxF)}</td><td class="num">${fmt(r.sigma3)}</td></tr>`).join('') + '</tbody></table>';
    if (m.profile) h += `<div class="small muted" style="margin-top:6px">Profile ${m.profile.grms.toFixed(2)} gRMS over the band. Band gRMS values use trapezoidal integration of the exported PSD lines (${fmtF(specFileOf(t).x[1] - specFileOf(t).x[0])} Hz resolution).</div>`;
  } else if (m.kind === 'srs') {
    const sm = shockMetrics(t); const smOf = r => sm ? sm.rows.find(q => r.isControl ? q.isControl : q.ch === r.ch) : null;
    h = `<table class="tbl"><thead><tr><th>Sensor</th><th>Ch</th><th>Axis</th>${sm ? '<th class="num">Time peak (g)</th>' : ''}<th class="num">SRS peak (g)</th><th class="num">At (Hz)</th><th class="num">Max ÷ control</th><th class="num">At (Hz)</th>${sm ? '<th class="num">Max PV (m/s)</th><th class="num">At (Hz)</th>' : ''}</tr></thead><tbody>` + rows.map(r => { const q = smOf(r); return `<tr><td>${sensCell(r)}</td><td class="mono">${r.isControl ? '' : r.ch}</td><td>${r.isControl ? '' : (r.axis || '') + ' ' + axisCell(r)}</td>${sm ? `<td class="num">${q ? fmt(q.tpeak) : ''}</td>` : ''}<td class="num">${fmt(r.peak)}</td><td class="num">${fmtF(r.peakF)}</td><td class="num">${r.isControl ? '' : fmt(r.tmax, 3)}</td><td class="num">${r.isControl ? '' : fmtF(r.tmaxF)}</td>${sm ? `<td class="num">${q ? fmt(q.pv, 3) : ''}</td><td class="num">${q ? fmtF(q.pvF) : ''}</td>` : ''}</tr>`; }).join('') + '</tbody></table>';
    if (sm) h += `<div class="small muted" style="margin-top:6px">SRS computed at Q = 10. Max ÷ control is the largest ratio of the channel's SRS to the control SRS at the same frequency. Pseudo velocity PV = SRS × g ÷ 2πf; the usual rules of thumb (about 1.3 m/s or 50 in/s for the onset of damage in typical equipment, 2.5 m/s or 100 in/s as severe) apply to the shock a component sees at its mount; a point on a resonating part naturally reads higher.</div>`;
    const tm = sm ? null : timeMetrics(t); if (tm) h += `<div class="small muted" style="margin:10px 0 4px">Time history peaks</div><table class="tbl"><thead><tr><th>Channel</th><th class="num">|peak| (g)</th><th class="num">At (ms)</th></tr></thead><tbody>` + tm.rows.map(r => `<tr><td><span class="sw" style="background:${r.style.color}"></span>${esc(r.label)}</td><td class="num">${fmt(r.peak)}</td><td class="num">${fmt(r.peakT * 1000, 3)}</td></tr>`).join('') + '</tbody></table>';
  }
  const hm = historyMetrics(t);
  if (hm) h += `<div class="small muted" style="margin:10px 0 4px">RMS history (final level)</div><table class="tbl"><thead><tr><th>Channel</th><th class="num">Final RMS (g)</th><th class="num">Max RMS (g)</th></tr></thead><tbody>` + hm.rows.map(r => `<tr><td><span class="sw" style="background:${r.style.color}"></span>${esc(r.label)}</td><td class="num">${fmt(r.final)}</td><td class="num">${fmt(r.max)}</td></tr>`).join('') + '</tbody></table>';
  el.innerHTML = h || '<div class="small muted">No spectrum file.</div>';
  if (ps) {
    const vkey = m.kind === 'psd' ? 'grms' : 'peak'; const unit = m.kind === 'psd' ? 'gRMS' : 'g';
    ps.innerHTML = m.perSensor?.length ? `<table class="tbl"><thead><tr><th>Sensor</th><th>Part</th><th>Brand · S/N</th><th>Inputs</th><th>Drive ch</th><th class="num">Max (${unit})</th><th>Axis</th><th class="num">At (Hz)</th><th class="num">Max T (×)</th><th>Axis</th><th class="num">At (Hz)</th><th class="num">LF ratio X / Y / Z</th><th>Check</th></tr></thead><tbody>` + m.perSensor.map(p => { const c = p.chk; const [cls, lbl] = LF_STATUS[c?.status || 'nodata']; const rr = c ? ['X', 'Y', 'Z'].map(a => c.ratio[a] != null ? fmt(c.ratio[a], 2) : '–').join(' / ') : ''; return `<tr><td><span class="sw" style="background:${p.sensor.color}"></span>${esc(sensorLabel(p.sensor))}</td><td class="small">${esc(p.sensor.part)}</td><td class="small">${esc([p.sensor.brand, p.sensor.serial].filter(Boolean).join(' '))}</td><td class="mono small">${['X', 'Y', 'Z'].map(a => p.sensor.ch?.[a] ?? '–').join(' ')}</td><td>${p.driveAxis ? '<span class="pill good">' + p.driveAxis + '</span>' : '<span class="muted">?</span>'}</td><td class="num">${p.best ? fmt(p.best[vkey]) : ''}</td><td>${p.best?.axis || ''}</td><td class="num">${p.best ? fmtF(p.best.peakF) : ''}</td><td class="num">${p.bestT ? fmt(p.bestT.tmax, 3) : ''}</td><td>${p.bestT?.axis || ''}</td><td class="num">${p.bestT ? fmtF(p.bestT.tmaxF) : ''}</td><td class="num small">${rr}</td><td><span class="pill ${cls}" title="${esc(c?.note || '')}">${lbl}</span></td></tr>`; }).join('') + `</tbody></table><div class="small muted" style="margin-top:6px">LF ratio = median response ÷ control between ${m.lf?.band ? fmtF(m.lf.band[0]) + ' and ' + fmtF(m.lf.band[1]) + ' Hz' : 'the low-frequency band'} for each channel (√ of the PSD ratio for random). Below the first mode this is the direction cosine between the sensor axis and the drive, so one axis near 1 and the others near 0 means the sensor is aligned; two mid values mean it sits at an angle; all three above 1 is not motion.</div>` : '<div class="small muted">No sensors mapped to this file. Set the input numbers in Sensors and 3D.</div>';
  }
  if (pk) {
    pk.innerHTML = m.peaks.length ? `<table class="tbl"><thead><tr><th>Sensor</th><th>Axis</th><th class="num">f (Hz)</th><th class="num">T (×)</th><th class="num">Q est.</th></tr></thead><tbody>` + m.peaks.slice(0, 30).map(p => `<tr><td><span class="sw" style="background:${p.color}"></span>${esc(p.sensor || p.col)}</td><td>${p.inAxis ? '<span class="pill good">' + (p.axis || '') + ' drive</span>' : '<span class="pill">' + (p.axis || '') + '</span>'}</td><td class="num">${fmtF(p.f)}</td><td class="num">${fmt(p.v, 3)}</td><td class="num">${p.q ? fmt(p.q, 2) : '–'}</td></tr>`).join('') + '</tbody></table><div class="small muted" style="margin-top:6px">Q from the half-power bandwidth of the transmissibility peak; indicative only at the controller resolution.</div>' : '<div class="small muted">No transmissibility peaks above threshold.</div>';
  }
  makeResizableTables(el.parentElement.parentElement);
}

function renderShockChecks(t, spec, m) {
  const sm = shockMetrics(t); const el = $('#t-shock'); if (!el) return;
  if (!sm) { el.innerHTML = '<div class="small muted">Needs a control channel in the time history.</div>'; return; }
  const sess = sessionOf(t); const P_ = sm.pulse; const ts = sm.tolStats; const tol = sm.tolDb;
  const pill = s => !s ? '' : s.pct >= 99.9 ? '<span class="pill good">all in</span>' : s.pct >= 90 ? '<span class="pill warn">' + fmt(s.pct, 3) + ' % in</span>' : '<span class="pill bad">' + fmt(s.pct, 3) + ' % in</span>';
  const stRow = (lab, s) => s ? `<tr><td>${lab}</td><td class="num">${s.inn} / ${s.n}</td><td>${pill(s)}</td><td class="num">${fmt(s.above, 3)} %</td><td class="num">${s.hi >= 0 ? '+' : ''}${fmt(s.hi, 2)} dB @ ${fmtF(s.hiF)} Hz</td><td class="num">${fmt(s.lo, 2)} dB @ ${fmtF(s.loF)} Hz</td></tr>` : '';
  let h = '';
  if (sm.prof) h += `<div class="small muted" style="margin-bottom:4px">Control SRS against ${esc(sm.prof.name)}, ${fmtF(sm.band[0])} to ${fmtF(sm.band[1])} Hz, ±${tol} dB, 1/12 octave points</div><table class="tbl"><thead><tr><th>SRS</th><th class="num">Points in</th><th></th><th class="num" title="Share of points at or above the nominal profile. GEVS asks for at least half.">At or above nominal</th><th class="num">Highest</th><th class="num">Lowest</th></tr></thead><tbody>${stRow('Maximax', ts.mm)}${stRow('Positive', ts.pos)}${stRow('Negative', ts.neg)}</tbody></table>`;
  else h += '<div class="small muted">No SRS profile set for this test (Edit test).</div>';
  h += `<div class="small muted" style="margin:10px 0 4px">Control pulse</div><table class="tbl"><tbody>
    <tr><td>Peak, positive / negative</td><td class="num">${fmt(P_.pos)} g at ${fmt(P_.posT * 1000, 3)} ms / ${fmt(P_.neg)} g at ${fmt(P_.negT * 1000, 3)} ms</td></tr>
    <tr><td title="NASA-STD-7003A: the shortest time that holds every point above one third of the absolute peak">Effective duration Te (|a| ≥ peak ÷ 3)</td><td class="num">${P_.te != null ? fmt(P_.te * 1000, 3) + ' ms' : '–'}</td></tr>
    <tr><td title="Time between 5 % and 95 % of the cumulative energy (sum of a²)">90 % energy duration</td><td class="num">${P_.t90 != null ? fmt(P_.t90 * 1000, 3) + ' ms' : '–'}</td></tr>
    <tr><td title="Integral of the control acceleration over the frame. A good shaker shock ends near zero.">Velocity at end of frame / peak</td><td class="num">${fmt(P_.dv, 3)} m/s / ${fmt(P_.vMax, 3)} m/s</td></tr>
    <tr><td title="Double integral of the control acceleration, no filtering. Indicates the shaker stroke the pulse needs.">Displacement at end / peak</td><td class="num">${fmt(P_.dEnd * 1000, 3)} mm / ${fmt(P_.dMax * 1000, 3)} mm</td></tr>
    <tr><td>Frame, sample rate</td><td class="num">${fmt(P_.frame * 1000, 3)} ms, ${fmt(P_.fs / 1000, 4)} kHz</td></tr></tbody></table>`;
  const trail = sm.rows.filter(r => !r.isControl && r.tpeakT > (P_.frame - 0.004)).length; if (trail) h += `<div class="small muted" style="margin-top:6px">${trail} channel(s) still at their peak in the last 4 ms of the frame: those responses ring longer than the frame, so their SRS at low frequency may be understated.</div>`;
  const pulses = pulsesOf(t); let pms = null;
  if (pulses.length > 1) {
    pms = pulses.map(pf => ({ f: pf, sm: shockMetrics(t, pf) })).filter(q => q.sm);
    h += `<div class="small muted" style="margin:10px 0 4px">Pulses (${pulses.length} time histories in this test; the buttons above the spectrum pick which one is shown)</div><table class="tbl"><thead><tr><th>Pulse</th><th class="num">Control peak + / −</th><th class="num">Points in ±${tol} dB</th><th class="num">Highest</th><th class="num">Lowest</th><th class="num">Te</th></tr></thead><tbody>` + pms.map((q, i) => { const s = q.sm.tolStats?.mm; return `<tr><td title="${esc(q.f.name)}">${i + 1}</td><td class="num">${fmt(q.sm.pulse.pos)} / ${fmt(q.sm.pulse.neg)} g</td><td class="num">${s ? s.inn + ' / ' + s.n : '–'}</td><td class="num">${s ? (s.hi >= 0 ? '+' : '') + fmt(s.hi, 2) + ' dB @ ' + fmtF(s.hiF) + ' Hz' : ''}</td><td class="num">${s ? fmt(s.lo, 2) + ' dB @ ' + fmtF(s.loF) + ' Hz' : ''}</td><td class="num">${q.sm.pulse.te != null ? fmt(q.sm.pulse.te * 1000, 3) + ' ms' : ''}</td></tr>`; }).join('') + '</tbody></table>';
    // pulse to pulse repeatability of every channel's SRS, pulse 2..n against pulse 1
    const d0 = derivedSrsOf(pulses[0]);
    for (let k = 1; k < pulses.length; k++) {
      const dk = derivedSrsOf(pulses[k]); const ch = []; for (const c of d0.cols) { const ck = dk.cols.find(q => q.ch === c.ch && q.role === c.role); if (!ck) continue; const r = c.data.map((v, i) => v > 0 && ck.data[i] > 0 ? 20 * Math.log10(ck.data[i] / v) : null).filter(v => v != null).sort((a, b) => a - b); if (!r.length) continue; ch.push({ c, med: r[Math.floor(r.length / 2)], max: Math.max(...r.map(Math.abs)) }); }
      if (!ch.length) continue; const all = ch.map(q => q.med).sort((a, b) => a - b); const worst = ch.slice().sort((a, b) => Math.abs(b.med) - Math.abs(a.med))[0];
      h += `<div class="small" style="margin-top:6px">Pulse ${k + 1} against pulse 1: median SRS change over all channels ${fmt(all[Math.floor(all.length / 2)], 2)} dB, largest channel median ${fmt(worst.med, 2)} dB (${esc(colLabel(sess, worst.c))}). ${Math.abs(worst.med) < 1 ? 'The structure responded the same to both pulses.' : 'Some channels responded differently; worth a look.'}</div>`;
    }
  }
  const top = sm.rows.filter(r => !r.isControl).sort((a, b) => b.pv - a.pv).slice(0, 5);
  if (top.length) h += `<div class="small muted" style="margin:10px 0 4px">Highest pseudo velocity (input PV: ${fmt(sm.rows.find(r => r.isControl)?.pv, 3)} m/s)</div><table class="tbl"><tbody>${top.map(r => `<tr><td><span class="sw" style="background:${r.style.color}"></span>${esc(r.label)}</td><td class="num">${fmt(r.pv, 3)} m/s @ ${fmtF(r.pvF)} Hz</td><td>${r.pv >= 2.54 ? '<span class="pill warn">above 100 in/s</span>' : r.pv >= 1.27 ? '<span class="pill">above 50 in/s</span>' : '<span class="pill good">below 50 in/s</span>'}</td></tr>`).join('')}</tbody></table>`;
  el.innerHTML = h;
  if (sm.dev) {
    const th = plotTheme(); const tr = [{ x: sm.dev.x, y: sm.dev.mm, name: 'Maximax', mode: 'lines', line: { color: th.fg, width: 2 }, hovertemplate: '%{y:+.2f} dB<extra>Maximax</extra>' }];
    if (sm.dev.pos) tr.push({ x: sm.dev.x, y: sm.dev.pos, name: 'Positive', mode: 'lines', line: { color: '#2b8a3e', width: 1.3 }, hovertemplate: '%{y:+.2f} dB<extra>Positive</extra>' }, { x: sm.dev.x, y: sm.dev.neg, name: 'Negative', mode: 'lines', line: { color: '#1c7ed6', width: 1.3, dash: 'dash' }, hovertemplate: '%{y:+.2f} dB<extra>Negative</extra>' });
    const sh = [tol, -tol].map(y => ({ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: y, y1: y, line: { color: '#d6336c', width: 1, dash: 'dash' } })).concat([{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 0, y1: 0, line: { color: th.fg3, width: 1, dash: 'dot' } }]);
    if (pms) pms.forEach((q, i) => { if (q.f === timeFileOf(t) || !q.sm.dev) return; tr.push({ x: q.sm.dev.x, y: q.sm.dev.mm, name: 'Maximax, pulse ' + (i + 1), mode: 'lines', line: { color: '#e8590c', width: 1.3, dash: 'dot' }, hovertemplate: '%{y:+.2f} dB<extra>Pulse ' + (i + 1) + '</extra>' }); });
    drawPlot('p-srsdev', tr, baseLayout({ yTitle: 'Control SRS ÷ profile (dB)', xType: 'log', yType: 'linear', shapes: sh, title: 'Control SRS deviation from the profile' }));
  }
  const cols = visibleCols(spec, t); const ctl = controlCol(spec); const tr = []; const ann = []; const labelled = cols.filter(c => c.role !== 'control').length <= 12;
  for (const c of cols) { if (c.role === 'control') continue; const y = c.data.map((v, i) => ctl.data[i] > 0 ? v / ctl.data[i] : null); tr.push(traceFor(spec, c, sess, { y, unit: '×' })); if (labelled) { const pk = findPeaks(spec.x, y, P.profiles.peakThreshold, 2, spec.x[0]); const r = m.rows.find(q => q.ch === c.ch); pk.forEach(p => ann.push({ x: Math.log10(p.f), y: Math.log10(p.v), text: `${r ? shortLabel(r) : 'ch' + c.ch} · ${fmtF(p.f)} Hz · ${fmt(p.v, 2)}×`, showarrow: true, arrowhead: 0, ax: 0, ay: -22, font: { size: 9.5, color: colStyle(sess, c).color } })); } }
  drawPlot('p-srsamp', tr, baseLayout({ yTitle: 'SRS ratio (×)', xType: 'log', yType: 'log', xRange: plotRange(spec), annotations: ann, shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 1, y1: 1, line: { color: plotTheme().fg3, width: 1, dash: 'dot' } }], legendRows: Math.ceil(tr.length / 6) }));
}
/* ---------- Compare ---------- */
function renderCompare(v) {
  const sel = UI.compare; const all = P.tests.filter(t => testFiles(t).length && (UI.showHidden || !t.hidden || sel.tests.includes(t.id)));
  const sessions = P.sessions.filter(s => UI.showHidden || !s.hidden || all.some(t => t.sessionId === s.id && sel.tests.includes(t.id)));
  let html = `<div class="section-h"><h2>Compare tests</h2><span class="sub">Overlay channels across tests, levels, axes or sessions</span></div><div class="grid2" style="grid-template-columns:320px 1fr">`;
  html += `<div class="card"><div class="card-h"><h3>Tests</h3><button class="btn ghost small" id="c-clear">Clear</button></div><div class="card-b" style="max-height:520px;overflow:auto">`;
  if (inCampaignMode()) { const camp = campaignTests(activeCampaign(), UI.showHidden).filter(t => testFiles(t).length); html += `<div class="small muted" style="margin-bottom:6px">Runs of ${esc(activeCampaign().name)}. Switch the left panel to By date to pick from every session.</div>`; for (const ax of ['X', 'Y', 'Z', ...new Set(camp.map(t => t.axis))].filter((a, i, arr) => arr.indexOf(a) === i)) { const ts = camp.filter(t => t.axis === ax); if (!ts.length) continue; html += `<div class="sb-name" style="margin:6px 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--fg3);font-weight:600">${esc(ax)} axis</div>` + ts.map(t => `<label class="chk small" style="display:flex;padding:2px 0"><input type="checkbox" data-ct="${t.id}" ${sel.tests.includes(t.id) ? 'checked' : ''}> ${t.run != null ? '#' + t.run + ' ' : ''}${esc(treeLabel(t))}${isSigTest(t) && sigContext(t) ? ' <span class="muted">· ' + esc(sigContext(t)) + '</span>' : ''}</label>`).join(''); } }
  else   for (const s of sessions) { const ts = all.filter(t => t.sessionId === s.id).sort((a, b) => AXES.indexOf(a.axis) - AXES.indexOf(b.axis) || byRun(a, b)); if (!ts.length) continue; html += `<div class="sb-name" style="margin:6px 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--fg3);font-weight:600">${esc(s.name)}</div>` + ts.map(t => `<label class="chk small" style="display:flex;padding:2px 0"><input type="checkbox" data-ct="${t.id}" ${sel.tests.includes(t.id) ? 'checked' : ''}> <span class="pill axis">${t.axis}</span> ${esc(t.name)}${t.run != null ? ' <span class="muted">#' + t.run + '</span>' : ''}</label>`).join(''); }
  html += `</div></div><div class="stack"><div class="card"><div class="card-b"><div class="row"><span class="small muted">Plot</span><div class="seg"><button data-cm="inaxis" class="${sel.mode === 'inaxis' ? 'active' : ''}">Drive-axis channels</button><button data-cm="cross" class="${sel.mode === 'cross' ? 'active' : ''}">Cross-axis channels</button><button data-cm="control" class="${sel.mode === 'control' ? 'active' : ''}">Control only</button><button data-cm="all" class="${sel.mode === 'all' ? 'active' : ''}">All channels</button></div><label class="chk small"><input type="checkbox" id="c-norm" ${sel.norm ? 'checked' : ''}> normalise to control (transmissibility)</label><span class="small muted">Sensor filter</span><select class="input small" id="c-sensor"><option value="">all</option>${[...new Set(sessions.flatMap(s => sensorsOf(s).map(x => sensorLabel(x))))].map(n => `<option ${sel.sensor === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div></div></div>`;
  html += `<div class="card"><div class="card-h"><h3>Overlay</h3><span class="hint">Only tests of the same data kind are overlaid (sine with sine, random with random).</span></div><div class="plotbox tall"><div class="plot" id="p-cmp"></div></div></div>`;
  html += `<div class="card"><div class="card-h"><h3>Linearity and level table</h3><button class="btn small" id="c-copy">Copy TSV</button></div><div class="card-b tbl-wrap" id="c-table"></div></div></div></div>`;
  v.innerHTML = html;
  $$('[data-ct]', v).forEach(c => c.onchange = () => { sel.tests = $$('[data-ct]:checked', v).map(x => x.dataset.ct); renderComparePlot(); });
  $$('[data-cm]', v).forEach(b => b.onclick = () => { sel.mode = b.dataset.cm; $$('[data-cm]', v).forEach(q => q.classList.toggle('active', q === b)); renderComparePlot(); });
  $('#c-norm').onchange = e => { sel.norm = e.target.checked; renderComparePlot(); };
  $('#c-sensor').onchange = e => { sel.sensor = e.target.value; renderComparePlot(); };
  $('#c-clear').onclick = () => { sel.tests = []; render(); };
  $('#c-copy').onclick = () => copyTable($('#c-table table'));
  renderComparePlot();
}
function renderComparePlot() {
  const sel = UI.compare; const tests = sel.tests.map(id => P.tests.find(t => t.id === id)).filter(Boolean);
  const traces = []; const palette = ['#1f56d6', '#d9480f', '#2b8a3e', '#9b59b6', '#e0a100', '#0b7285', '#c2255c', '#5c940d', '#845ef7', '#f76707'];
  let kind = null; const dashes = ['solid', 'dash', 'dot', 'dashdot', 'longdash'];
  let rows = [];
  tests.forEach((t, ti) => withAxis(t.axis, () => {
    const f = specFileOf(t); if (!f) return; if (!kind) kind = f.kind; if (f.kind !== kind) return;
    const sess = sessionOf(t); const ctl = controlCol(f); const m = computeMetrics(t);
    const cols = f.cols.filter(c => { if (c.role === 'control-dup') return false; const r = m.rows.find(q => q.ch === c.ch && (c.role === 'control') === !!q.isControl); const sName = r?.sensorName; if (sel.sensor && c.role !== 'control' && sName !== sel.sensor) return false; if (sel.mode === 'control') return c.role === 'control'; if (sel.mode === 'inaxis') return c.role !== 'control' && !!r?.inAxis; if (sel.mode === 'cross') return c.role !== 'control' && r && !r.inAxis && r.axis; return true; });
    cols.forEach((c, ci) => {
      let y = c.data; if (sel.norm && ctl && c.role !== 'control') y = ratioSeries(f.x, c.data, ctl.data, f.kind === 'psd');
      const st = colStyle(sess, c);
      traces.push({ x: f.x, y, name: `${testTitle(t)} · ${colLabel(sess, c)}`, mode: 'lines', line: { color: palette[ti % palette.length], dash: dashes[ci % dashes.length], width: 1.4 }, hovertemplate: '%{y:.4g}' + (sel.norm && c.role !== 'control' ? '×' : fileUnit(f)) + '<extra>' + esc(testTitle(t)) + ' ' + esc(colLabel(sess, c)) + '</extra>' });
      const r = m.rows.find(r => r.ch === c.ch && (c.role === 'control') === !!r.isControl);
      if (r) rows.push({ test: testTitle(t), chan: colLabel(sess, c), axis: r.inAxis ? 'drive' : r.isControl ? 'control' : (r.axis || '') + ' cross', ctl: m.control, r, kind });
    });
  }));
  const unit = kind === 'psd' ? (sel.norm ? 'Transmissibility √(PSD ratio) (×)' : 'PSD (g²/Hz)') : kind === 'srs' ? (sel.norm ? 'SRS ratio (×)' : 'SRS (g)') : (sel.norm ? 'Transmissibility (×)' : 'Acceleration (g)');
  drawPlot('p-cmp', traces, baseLayout({ yTitle: unit, xType: 'log', yType: 'log', xRange: kind === 'psd' ? [P.profiles.random.bp[0][0] * 0.9, P.profiles.random.bp[P.profiles.random.bp.length - 1][0] * 1.05] : null }));
  const tb = $('#c-table'); if (!tb) return;
  if (!rows.length) { tb.innerHTML = '<div class="small muted">Select two or more tests on the left.</div>'; return; }
  if (kind === 'psd') tb.innerHTML = `<table class="tbl"><thead><tr><th>Test</th><th>Channel</th><th>Axis</th><th class="num">Control gRMS</th><th class="num">Channel gRMS</th><th class="num">Ratio</th><th class="num">Max T</th><th class="num">At (Hz)</th></tr></thead><tbody>` + rows.map(r => `<tr><td>${esc(r.test)}</td><td>${esc(r.chan)}</td><td>${r.axis}</td><td class="num">${fmt(r.ctl?.grms)}</td><td class="num">${fmt(r.r.grms)}</td><td class="num">${r.r.isControl ? '' : fmt(r.r.grmsRatio, 3)}</td><td class="num">${r.r.isControl ? '' : fmt(r.r.tmax, 3)}</td><td class="num">${r.r.isControl ? '' : fmtF(r.r.tmaxF)}</td></tr>`).join('') + '</tbody></table><div class="small muted" style="margin-top:6px">For a linear structure the ratio and the max transmissibility stay the same from -6 dB to full level. A ratio that changes with level points to a joint that slips or gaps.</div>';
  else tb.innerHTML = `<table class="tbl"><thead><tr><th>Test</th><th>Channel</th><th>Axis</th><th class="num">Control peak (g)</th><th class="num">Channel peak (g)</th><th class="num">At (Hz)</th><th class="num">Max T</th><th class="num">At (Hz)</th></tr></thead><tbody>` + rows.map(r => `<tr><td>${esc(r.test)}</td><td>${esc(r.chan)}</td><td>${r.axis}</td><td class="num">${fmt(r.ctl?.peak)}</td><td class="num">${fmt(r.r.peak)}</td><td class="num">${fmtF(r.r.peakF)}</td><td class="num">${r.r.isControl ? '' : fmt(r.r.tmax, 3)}</td><td class="num">${r.r.isControl ? '' : fmtF(r.r.tmaxF)}</td></tr>`).join('') + '</tbody></table>';
  makeResizableTables(tb);
}

/* ---------- Files ---------- */
function renderFiles(v) {
  const files = P.files.slice().sort((a, b) => (a.detected.run ?? 9999) - (b.detected.run ?? 9999) || a.name.localeCompare(b.name));
  let html = `<div class="section-h"><h2>Files</h2><span class="sub">${files.length} imported · ${files.filter(f => !f.testId).length} unassigned</span><span style="flex:1"></span><button class="btn small" id="f-review" title="Choose files and check how each one is read before it is imported">Import with review…</button><button class="btn small" id="f-auto">Auto-assign unassigned</button><button class="btn small" id="f-redetect">Re-detect names</button><button class="btn small" id="f-dedupe" title="Remove files whose name matches another file in the same session apart from spaces and underscores">Remove duplicates</button></div>
  <div class="dropzone" id="dz" style="margin-bottom:14px"><strong>Drop controller export files here</strong> or <button class="btn small" onclick="$('#file-input').click()">choose files</button><span class="small muted"> · files go to the active session (${esc(activeSession()?.name || 'none')})</span></div>`;
  html += `<div class="card"><div class="card-b tbl-wrap"><table class="tbl" id="f-table"><thead><tr><th></th><th>File</th><th>Data</th><th>Run</th><th>Axis</th><th>Type</th><th>Level</th><th>Detected as</th><th>Session</th><th>Assigned test</th><th></th></tr></thead><tbody>`;
  for (const f of files) {
    const d = f.detected; const t = P.tests.find(t => t.id === f.testId); const sess = P.sessions.find(s => s.id === f.sessionId);
    const conf = d.confidence >= 0.8 ? 'good' : d.confidence >= 0.5 ? 'warn' : 'bad';
    const lvl = [d.level != null ? d.level + ' g' : null, d.db != null ? d.db + ' dB' : null, d.f1 != null ? `${d.f1}–${d.f2} Hz` : null, d.dur ? d.dur + ' s' : null, d.pulses ? d.pulses + ' pulse' : null].filter(Boolean).join(' · ');
    const testOpts = `<option value="">— unassigned —</option>` + P.sessions.map(s => `<optgroup label="${esc(s.name)}">` + testsOfSession(s.id).sort((a, b) => AXES.indexOf(a.axis) - AXES.indexOf(b.axis) || byRun(a, b)).map(x => `<option value="${x.id}" ${x.id === f.testId ? 'selected' : ''}>${x.axis} · ${esc(x.name)}${x.run != null ? ' #' + x.run : ''}</option>`).join('') + '</optgroup>').join('');
    html += `<tr draggable="true" data-file="${f.id}" class="${!f.testId ? '' : ''}"><td title="Drag onto a test in the left panel">⠿</td><td class="mono small" title="${esc(f.name)}">${esc(f.name)}</td><td><span class="pill ${['sine', 'psd', 'srs'].includes(f.kind) ? 'accent' : f.kind === 'report' ? 'warn' : ''}">${fileLabelKind(f.kind)}</span></td><td class="mono">${d.run ?? ''}</td><td>${d.axis ? '<span class="pill axis">' + d.axis + '</span>' : '<span class="pill bad">?</span>'}</td><td>${esc(d.type || '?')}</td><td class="small">${esc(lvl)}</td><td><span class="pill ${conf}" title="${esc(d.reasons.join('; '))}">${d.kindId ? esc(kindById(d.kindId).short) : 'unknown'} · ${Math.round(d.confidence * 100)}%</span></td><td><select class="input small" data-fsess="${f.id}">${P.sessions.map(s => `<option value="${s.id}" ${s.id === f.sessionId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></td><td><select class="input small" data-ftest="${f.id}">${testOpts}</select></td><td style="white-space:nowrap">${f.cols ? `<button class="btn ghost small" data-fcols="${f.id}" title="Columns: names, input numbers, control, data type">Columns</button>` : ''}<button class="btn ghost small danger" data-fdel="${f.id}" title="Remove file">✕</button></td></tr>`;
  }
  html += `</tbody></table>${files.length ? '' : '<div class="empty">No files yet.</div>'}</div></div>
  <p class="hint" style="margin-top:10px">Detection reads the file name: run number prefix, article, axis letter, test type, band, level in g or dB, duration and the History or Time suffix. Files from the same run number are grouped into one test. Anything below 50% confidence is left for you to place.</p>`;
  v.innerHTML = html; bindDropzone(v);
  $$('[data-ftest]', v).forEach(s => s.onchange = () => { const f = P.files.find(f => f.id === s.dataset.ftest); if (!s.value) { if (f.testId) { const t = P.tests.find(t => t.id === f.testId); if (t) t.fileIds = t.fileIds.filter(x => x !== f.id); } f.testId = null; } else assignFileToTest(f.id, s.value); persist(); renderTree(); });
  $$('[data-fsess]', v).forEach(s => s.onchange = () => { const f = P.files.find(f => f.id === s.dataset.fsess); f.sessionId = s.value; if (f.testId) { const t = P.tests.find(t => t.id === f.testId); if (t && t.sessionId !== s.value) { t.fileIds = t.fileIds.filter(x => x !== f.id); f.testId = null; } } persist(); render(); });
  $$('[data-fcols]', v).forEach(b => b.onclick = () => columnsDialog(P.files.find(f => f.id === b.dataset.fcols)));
  $('#f-review') && ($('#f-review').onclick = () => { const inp = $('#file-input'); inp.dataset.review = '1'; inp.click(); });
  $$('[data-fdel]', v).forEach(b => b.onclick = () => { const f = P.files.find(f => f.id === b.dataset.fdel); confirmDialog(`Remove ${f.name} from the project?`, () => { if (f.testId) { const t = P.tests.find(t => t.id === f.testId); if (t) t.fileIds = t.fileIds.filter(x => x !== f.id); } P.files = P.files.filter(x => x.id !== f.id); persist(); render(); }); });
  $$('tr[data-file]', v).forEach(tr => tr.ondragstart = e => { const sel = $$('tr.sel[data-file]', v).map(x => x.dataset.file); const ids = sel.includes(tr.dataset.file) ? sel : [tr.dataset.file]; e.dataTransfer.setData('text/file-ids', ids.join(',')); e.dataTransfer.effectAllowed = 'move'; });
  $$('tr[data-file]', v).forEach(tr => tr.onclick = e => { if (e.target.closest('select,button')) return; if (!e.ctrlKey && !e.metaKey && !e.shiftKey) $$('tr.sel', v).forEach(x => x.classList.remove('sel')); tr.classList.toggle('sel'); });
  $('#f-auto').onclick = () => { let n = 0; for (const f of P.files) { if (f.testId) continue; const sess = P.sessions.find(s => s.id === f.sessionId) || activeSession(); if (sess && autoAssign(f, sess)) n++; } persist(); render(); toast(`${n} file(s) assigned`); };
  $('#f-redetect').onclick = () => { for (const f of P.files) f.detected = detectFromName(f.name, f.kind); persist(); render(); };
  $('#f-dedupe').onclick = () => { const norm = n => n.toLowerCase().replace(/[\s_]+/g, '_'); const seen = new Map(); const drop = []; for (const f of P.files) { const k = f.sessionId + '|' + norm(f.name); if (seen.has(k)) drop.push(f); else seen.set(k, f); } if (!drop.length) { toast('No duplicates found'); return; } confirmDialog(`Remove ${drop.length} duplicate file(s)? The first copy of each is kept.`, () => { for (const f of drop) { if (f.testId) { const t = P.tests.find(t => t.id === f.testId); if (t) t.fileIds = t.fileIds.filter(x => x !== f.id); } } P.files = P.files.filter(f => !drop.includes(f)); persist(); render(); }); };
  makeResizableTables(v);
}

/* ---------- Settings ---------- */
function renderSettings(v) {
  const pr = P.profiles;
  const segTable = (id, p) => `<table class="tbl" data-seg="${id}"><thead><tr><th>f1 (Hz)</th><th>f2 (Hz)</th><th>Type</th><th>Value</th><th></th></tr></thead><tbody>` + p.segs.map((s, i) => `<tr><td><input class="input small" type="number" step="any" value="${s[0]}" data-i="${i}" data-k="0"></td><td><input class="input small" type="number" step="any" value="${s[1]}" data-i="${i}" data-k="1"></td><td><select class="input small" data-i="${i}" data-k="2"><option value="g" ${s[2] === 'g' ? 'selected' : ''}>g peak</option><option value="disp" ${s[2] === 'disp' ? 'selected' : ''}>mm pk-pk</option></select></td><td><input class="input small" type="number" step="any" value="${s[3]}" data-i="${i}" data-k="3"></td><td><button class="btn ghost small danger" data-del="${i}">✕</button></td></tr>`).join('') + `</tbody></table><button class="btn small" data-add="${id}" style="margin-top:6px">+ segment</button>`;
  const bpTable = (id, p) => `<table class="tbl" data-bp="${id}"><thead><tr><th>f (Hz)</th><th>Value</th><th></th></tr></thead><tbody>` + p.bp.map((b, i) => `<tr><td><input class="input small" type="number" step="any" value="${b[0]}" data-i="${i}" data-k="0"></td><td><input class="input small" type="number" step="any" value="${+b[1].toPrecision(4)}" data-i="${i}" data-k="1"></td><td><button class="btn ghost small danger" data-del="${i}">✕</button></td></tr>`).join('') + `</tbody></table><button class="btn small" data-addbp="${id}" style="margin-top:6px">+ breakpoint</button>`;
  v.innerHTML = `<div class="section-h"><h2>Profiles and settings</h2><span class="sub">Requirement curves, profile library, tolerances and analysis bands</span></div>
  <div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Profile library</h3><span class="hint">Every random PSD and SRS a test can be run against, with the controller's channel (auto-notch) limits. Pick one per test in Edit test, or for many tests at once with Plan runs (right-click a session). Units: g²/Hz for random, g for SRS, Hz for frequency.</span><button class="btn small" id="s-libnew">+ profile</button></div><div class="card-b tbl-wrap">${libraryTable()}</div></div>
  <div class="grid2">
    <div class="card"><div class="card-h"><h3>Sine, out of plane (Z)</h3><span class="hint">2 oct/min</span></div><div class="card-b">${segTable('sine_oop', pr.sine_oop)}</div></div>
    <div class="card"><div class="card-h"><h3>Sine, in plane (X, Y)</h3><span class="hint">2 oct/min</span></div><div class="card-b">${segTable('sine_ip', pr.sine_ip)}</div></div>
    <div class="card"><div class="card-h"><h3>Random PSD (full level)</h3><span class="hint">${psdGrms(pr.random.bp).toFixed(2)} gRMS · g²/Hz</span></div><div class="card-b">${bpTable('random', pr.random)}<div class="field" style="margin-top:8px"><label>Low level random</label><div class="row"><input class="input small" type="number" step="any" id="s-lowrand" value="${pr.lowrand.grms}" style="width:90px"> gRMS</div></div></div></div>
    <div class="card"><div class="card-h"><h3>Low level sine, tolerances, bands</h3></div><div class="card-b stack" style="gap:8px">
      <div class="field"><label>Low level sine</label><div class="row"><input class="input small" type="number" step="any" id="s-ll-g" value="${pr.lowsine.g}" style="width:80px"> g, <input class="input small" type="number" id="s-ll-f1" value="${pr.lowsine.f1}" style="width:80px"> to <input class="input small" type="number" id="s-ll-f2" value="${pr.lowsine.f2}" style="width:80px"> Hz</div></div>
      <div class="field"><label>Sine alarm / abort</label><div class="row">±<input class="input small" type="number" id="s-tol-sa" value="${pr.tol.sineAlarmPct}" style="width:70px">% / ±<input class="input small" type="number" id="s-tol-sb" value="${pr.tol.sineAbortPct}" style="width:70px">%</div></div>
      <div class="field"><label>Random alarm / abort</label><div class="row">±<input class="input small" type="number" id="s-tol-ra" value="${pr.tol.randAlarmDb}" style="width:70px"> dB / ±<input class="input small" type="number" id="s-tol-rb" value="${pr.tol.randAbortDb}" style="width:70px"> dB</div></div>
      <div class="field"><label>SRS tolerance</label><div class="row">±<input class="input small" type="number" id="s-tol-srs" value="${pr.tol.srsTolDb}" style="width:70px"> dB</div></div>
      <div class="field"><label>SRS requirement</label><select class="input small" id="s-srsreq">${libFor('srs').map(p => `<option value="${p.id}" ${p.id === pr.srsRequirementId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>gRMS bands</label><input class="input small" id="s-bands" value="${pr.bands.map(b => b.join('-')).join(', ')}" placeholder="20-100, 100-700, 700-2000"></div>
      <div class="field"><label>Peak threshold</label><div class="row"><input class="input small" type="number" step="any" id="s-thr" value="${pr.peakThreshold}" style="width:80px"> × transmissibility</div></div>
      <div class="row" style="margin-top:6px"><button class="btn primary small" id="s-apply">Apply</button><button class="btn small" id="s-reset">Reset profiles to defaults</button></div>
    </div></div>
    <div class="card"><div class="card-h"><h3>Project</h3></div><div class="card-b stack" style="gap:8px">
      <div class="field"><label>Project name</label><input class="input" id="s-pname" value="${esc(P.name)}"></div>
      <p class="small muted">The project (tests, data, sensor maps) is saved in this browser automatically. To share it, use <strong>Save project</strong> in the top bar and send the JSON file; the team loads it with <strong>Load project</strong>. ${typeof EMBEDDED_FILES !== 'undefined' ? 'This build carries bundled sessions (controller exports; report files travel in the project file).' : ''}</p>
      <div class="row"><button class="btn small" id="s-sample">Reload bundled sessions</button><button class="btn small danger" id="s-clear">Clear everything</button></div>
    </div></div>
  </div>`;
  const readSeg = (id) => { const p = pr[id]; $$(`[data-seg="${id}"] input, [data-seg="${id}"] select`, v).forEach(el => { const i = +el.dataset.i, k = +el.dataset.k; p.segs[i][k] = k === 2 ? el.value : parseFloat(el.value); }); };
  const prof = id => pr[id];
  const readBp = (id) => { const p = prof(id); $$(`[data-bp="${id}"] input`, v).forEach(el => { const i = +el.dataset.i, k = +el.dataset.k; p.bp[i][k] = parseFloat(el.value); }); p.bp.sort((a, b) => a[0] - b[0]); };
  const readAll = () => { readSeg('sine_oop'); readSeg('sine_ip'); readBp('random'); pr.lowrand.grms = parseFloat($('#s-lowrand').value) || 1; pr.lowsine.g = parseFloat($('#s-ll-g').value) || .25; pr.lowsine.f1 = parseFloat($('#s-ll-f1').value) || 5; pr.lowsine.f2 = parseFloat($('#s-ll-f2').value) || 2000; pr.tol.sineAlarmPct = +$('#s-tol-sa').value; pr.tol.sineAbortPct = +$('#s-tol-sb').value; pr.tol.randAlarmDb = +$('#s-tol-ra').value; pr.tol.randAbortDb = +$('#s-tol-rb').value; pr.tol.srsTolDb = +$('#s-tol-srs').value; const bands = $('#s-bands').value.split(',').map(s => s.split('-').map(Number)).filter(b => b.length === 2 && b.every(isFinite)); if (bands.length) pr.bands = bands; pr.peakThreshold = parseFloat($('#s-thr').value) || 2; P.name = $('#s-pname').value; };
  $('#s-apply').onclick = () => { readAll(); M_CACHE.clear(); persist(); render(); toast('Profiles updated'); };
  $('#s-reset').onclick = () => confirmDialog('Reset all profiles and tolerances to the built-in defaults?', () => { P.profiles = defaultProfiles(); persist(); render(); });
  $$('[data-add]', v).forEach(b => b.onclick = () => { readAll(); const p = pr[b.dataset.add]; const last = p.segs[p.segs.length - 1]; p.segs.push([last ? last[1] : 10, (last ? last[1] : 10) * 2, 'g', last ? last[3] : 1]); render(); });
  $$('[data-addbp]', v).forEach(b => b.onclick = () => { readAll(); const p = prof(b.dataset.addbp); const last = p.bp[p.bp.length - 1]; p.bp.push([last[0] * 2, last[1]]); render(); });
  $$('[data-seg] [data-del], [data-bp] [data-del]', v).forEach(b => b.onclick = () => { readAll(); const tbl = b.closest('table'); const id = tbl.dataset.seg || tbl.dataset.bp; const p = prof(id); (p.segs || p.bp).splice(+b.dataset.del, 1); render(); });
  $('#s-sample').onclick = () => { if (typeof EMBEDDED_FILES === 'undefined') { toast('No bundled data in this build', true); return; } confirmDialog('Add the bundled sessions again as fresh copies (existing sessions are kept)?', () => { P.bundled = []; loadEmbedded(); persist(); render(); }); };
  $('#s-libnew').onclick = () => editProfileDialog(null);
  $$('[data-libedit]', v).forEach(b => b.onclick = () => editProfileDialog(libProfile(b.dataset.libedit)));
  $$('[data-libdup]', v).forEach(b => b.onclick = () => { const p = libProfile(b.dataset.libdup); const c = JSON.parse(JSON.stringify(p)); c.id = uid(); c.name = p.name + ' (copy)'; pr.library.push(c); persist(); render(); });
  $$('[data-libdel]', v).forEach(b => b.onclick = () => { const p = libProfile(b.dataset.libdel); const used = P.tests.filter(t => t.profile === p.id).length; confirmDialog(`Delete profile "${p.name}"?${used ? ` ${used} test(s) use it and will fall back to the default.` : ''}`, () => { pr.library = pr.library.filter(q => q !== p); P.tests.forEach(t => { if (t.profile === p.id) t.profile = 'full'; }); M_CACHE.clear(); persist(); render(); }); });
  $('#s-srsreq').onchange = e => { pr.srsRequirementId = e.target.value; persist(); };
  $('#s-clear').onclick = () => confirmDialog('Delete all sessions, tests and files from this browser?', () => { P = newProject(); UI.sessionId = null; UI.testId = null; UI.compare.tests = []; persist(); render(); });
}

/* ---------- Profile library ---------- */
function profileSummary(p) {
  if (p.type === 'random') return `${psdGrms(p.bp).toFixed(2)} gRMS · ${fmtF(p.bp[0][0])} to ${fmtF(p.bp[p.bp.length - 1][0])} Hz`;
  if (p.type === 'srs') { const pk = Math.max(...p.bp.map(b => b[1])); return `${fmt(pk)} g peak · ${fmtF(p.bp[0][0])} to ${fmtF(p.bp[p.bp.length - 1][0])} Hz${p.pulses ? ' · ' + p.pulses + ' pulses' : ''}`; }
  return '';
}
function libraryTable() {
  const lib = P.profiles.library || [];
  if (!lib.length) return '<div class="small muted">No profiles yet.</div>';
  return `<table class="tbl"><thead><tr><th>Name</th><th>Type</th><th>Axis</th><th>Level</th><th>Channel limits</th><th class="num">Used by</th><th>Notes</th><th></th></tr></thead><tbody>` + lib.map(p => `<tr><td>${esc(p.name)}${p.id === P.profiles.srsRequirementId ? ' <span class="pill">requirement</span>' : ''}</td><td>${p.type === 'srs' ? 'SRS' : 'Random'}</td><td>${p.axis || 'any'}</td><td class="mono small">${profileSummary(p)}</td><td class="small">${(p.limits || []).map(l => `in ${l.ch}: ${l.max}${l.lo != null ? ` (${fmtF(l.lo)} to ${fmtF(l.hi)} Hz)` : ''}`).join('<br>') || '<span class="muted">none</span>'}</td><td class="num">${P.tests.filter(t => t.profile === p.id).length}</td><td class="small muted" style="max-width:320px">${esc(p.notes || '')}</td><td style="white-space:nowrap"><button class="btn small" data-libedit="${p.id}">Edit</button> <button class="btn ghost small" data-libdup="${p.id}" title="Duplicate">⧉</button> <button class="btn ghost small danger" data-libdel="${p.id}" title="Delete">✕</button></td></tr>`).join('') + '</tbody></table>';
}
/* Breakpoints and limits are edited as text so a table can be pasted straight from a spreadsheet: one "frequency value" pair per line. */
function parsePairs(txt) { return txt.split(/\r?\n/).map(l => l.trim().split(/[\s,;\t]+/).map(Number)).filter(a => a.length >= 2 && a.slice(0, 2).every(isFinite)).map(a => [a[0], a[1]]).sort((a, b) => a[0] - b[0]); }
function parseLimits(txt) { return txt.split(/\r?\n/).map(l => l.trim().split(/[\s,;\t]+/).map(Number)).filter(a => a.length >= 2 && a.slice(0, 2).every(isFinite)).map(a => ({ ch: a[0], max: a[1], ...(a.length >= 4 && isFinite(a[2]) && isFinite(a[3]) ? { lo: a[2], hi: a[3] } : {}) })); }
function editProfileDialog(p) {
  const isNew = !p; const d = p ? JSON.parse(JSON.stringify(p)) : { id: uid(), name: 'New profile', short: '', type: 'random', axis: '', bp: [[20, 0.02], [100, 0.1], [700, 0.1], [2000, 0.035]], limits: [], notes: '' };
  modal(isNew ? 'New profile' : 'Edit profile', `
    <div class="field"><label>Name</label><input class="input" id="m-pn" value="${esc(d.name)}"></div>
    <div class="field"><label>Short label</label><input class="input" id="m-ps" value="${esc(d.short || '')}" placeholder="shown in the left panel, e.g. notched"></div>
    <div class="field"><label>Type</label><select class="input" id="m-pt"><option value="random" ${d.type === 'random' ? 'selected' : ''}>Random PSD (g²/Hz)</option><option value="srs" ${d.type === 'srs' ? 'selected' : ''}>Shock SRS (g)</option></select></div>
    <div class="field"><label>Axis</label><select class="input" id="m-pa">${['', 'X', 'Y', 'Z'].map(a => `<option value="${a}" ${d.axis === a ? 'selected' : ''}>${a || 'any axis'}</option>`).join('')}</select></div>
    <div class="field"><label>Breakpoints</label><textarea class="input notes" id="m-pbp" style="min-height:150px;font-family:var(--mono);font-size:12px" placeholder="20 0.02">${d.bp.map(b => b[0] + '\t' + b[1]).join('\n')}</textarea></div>
    <div class="field"><label>Value</label><span class="small" id="m-pv"></span></div>
    <div class="field"><label>Channel limits</label><textarea class="input notes" id="m-plim" style="min-height:70px;font-family:var(--mono);font-size:12px" placeholder="input  limit  from Hz  to Hz">${(d.limits || []).map(l => [l.ch, l.max, l.lo ?? '', l.hi ?? ''].join('\t').trim()).join('\n')}</textarea></div>
    <div class="field"><label>SRS pulses</label><input class="input" id="m-ppu" type="number" value="${d.pulses ?? ''}" style="width:90px"></div>
    <div class="field"><label>Notes</label><textarea class="input notes" id="m-pno">${esc(d.notes || '')}</textarea></div>
    <p class="hint">Breakpoints: one "frequency value" pair per line (Hz and g²/Hz, or Hz and g for SRS), straight from a spreadsheet. Between breakpoints the level is interpolated on log-log axes, so a +3 dB/oct ramp from 20 to 100 Hz is just the two end points (0.02 at 20 Hz, 0.1 at 100 Hz). Limits: input number, limit, and optionally the band it applies to.</p>`,
    [{ label: 'Cancel' }, { label: isNew ? 'Add' : 'Save', primary: true, onClick: () => {
      const bp = parsePairs($('#m-pbp').value); if (bp.length < 2) { toast('Enter at least two breakpoints', true); return false; }
      Object.assign(d, { name: $('#m-pn').value.trim() || d.name, short: $('#m-ps').value.trim(), type: $('#m-pt').value, axis: $('#m-pa').value, bp, limits: parseLimits($('#m-plim').value), notes: $('#m-pno').value });
      const pu = parseInt($('#m-ppu').value, 10); if (isFinite(pu)) d.pulses = pu; else delete d.pulses;
      const lib = P.profiles.library; const i = lib.findIndex(q => q.id === d.id); if (i >= 0) lib[i] = d; else lib.push(d);
      M_CACHE.clear(); persist(); render(); } }],
    body => { const upd = () => { const bp = parsePairs(body.querySelector('#m-pbp').value); const t = body.querySelector('#m-pt').value; body.querySelector('#m-pv').textContent = bp.length >= 2 ? (t === 'random' ? psdGrms(bp).toFixed(2) + ' gRMS' : fmt(Math.max(...bp.map(b => b[1]))) + ' g peak') : '–'; }; body.querySelector('#m-pbp').oninput = upd; body.querySelector('#m-pt').onchange = upd; upd(); });
}
